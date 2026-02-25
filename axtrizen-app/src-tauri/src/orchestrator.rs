// orchestrator.rs — Multi-agent project execution engine
//
// Drives structured SDLC conversations between agents using the existing
// Gateway chat primitives (chat.send / chat.inject).

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{Mutex, RwLock, mpsc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::Emitter;

use crate::db::{self, DbExecutionLog};
use crate::gateway_client::GatewayClient;

// ==================== Types ====================

/// Current state of a running orchestration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionState {
    pub project_id: String,
    pub project_name: String,
    pub requirements: Option<String>,
    pub team_id: String,
    pub manager_id: String,
    pub manager_name: String,
    pub agents: Vec<AgentInfo>,
    pub current_phase: String,
    pub status: String, // "running", "paused", "completed", "error"
    pub logs: Vec<ExecutionLogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionLogEntry {
    pub id: String,
    pub phase: String,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub event_type: String,
    pub content: Option<String>,
    pub created_at: String,
}

/// Manages all running orchestrations
pub struct OrchestratorState {
    pub running: RwLock<HashMap<String, Arc<Mutex<ExecutionState>>>>,
    pub cancel_flags: RwLock<HashMap<String, Arc<AtomicBool>>>,
    /// Channels for user feedback between phases: project_id -> sender
    pub feedback_channels: RwLock<HashMap<String, mpsc::Sender<String>>>,
}

impl Default for OrchestratorState {
    fn default() -> Self {
        Self {
            running: RwLock::new(HashMap::new()),
            cancel_flags: RwLock::new(HashMap::new()),
            feedback_channels: RwLock::new(HashMap::new()),
        }
    }
}

// ==================== Engine ====================

/// Send a message to an agent via their individual session and get the response.
/// The Gateway routes based on sessionKey — agent:{id}:main goes to that agent.
/// Uses send_chat_and_wait to collect the full streaming LLM response.
async fn send_to_agent(
    gateway: &GatewayClient,
    agent_id: &str,
    message: &str,
) -> Result<String, String> {
    let session_key = format!("agent:{}:main", agent_id);
    let idempotency_key = uuid::Uuid::new_v4().to_string();
    
    let params = json!({
        "sessionKey": session_key,
        "message": message,
        "idempotencyKey": idempotency_key
    });
    
    gateway.send_chat_and_wait(params).await
}

/// Send a message to an agent and inject BOTH the prompt and response into the
/// team group chat so the full conversation is visible to the user.
async fn send_to_agent_in_group(
    gateway: &GatewayClient,
    team_id: &str,
    agent_id: &str,
    agent_name: &str,
    prompt: &str,
    prompt_label: &str,
) -> Result<String, String> {
    // 1. Inject the prompt into group chat so user sees what was asked
    let prompt_msg = format!("**📨 To @{}:** {}\n\n{}", agent_name, prompt_label, 
        if prompt.len() > 300 {
            let truncate_at = prompt.char_indices()
                .take_while(|(i, _)| *i <= 300)
                .last()
                .map(|(i, c)| i + c.len_utf8())
                .unwrap_or(300.min(prompt.len()));
            format!("{}...", &prompt[..truncate_at])
        } else {
            prompt.to_string()
        }
    );
    let _ = inject_to_group(gateway, team_id, &prompt_msg, Some("system")).await;

    // 2. Send to the agent via their individual session (required for Gateway routing)
    let response = send_to_agent(gateway, agent_id, prompt).await?;

    // 3. Inject the agent's response into group chat
    let response_msg = format!("**💬 @{}:**\n\n{}", agent_name, response);
    let _ = inject_to_group(gateway, team_id, &response_msg, Some("assistant")).await;

    Ok(response)
}

/// Maximum revision rounds per agent per phase before auto-accepting
const MAX_REVISIONS: u32 = 3;

/// Manager reviews an agent's work output. If not satisfied, the agent revises.
/// Returns the final approved output after the manager signs off (or max rounds).
///
/// Flow: agent submits → manager reviews → if "APPROVED" → done
///       else → agent revises with manager feedback → manager reviews again → (loop)
async fn manager_review_loop(
    app: &tauri::AppHandle,
    gateway: &GatewayClient,
    team_id: &str,
    project_id: &str,
    phase: &str,
    agent_id: &str,
    agent_name: &str,
    manager_id: &str,
    manager_name: &str,
    initial_output: &str,
    cancel: &AtomicBool,
    state: &Mutex<ExecutionState>,
) -> Result<String, String> {
    let mut current_output = initial_output.to_string();

    for revision in 0..MAX_REVISIONS {
        if cancel.load(Ordering::Relaxed) {
            return Err("Execution cancelled".to_string());
        }

        // Manager reviews the agent's work
        let review_prompt = format!(
            "You are reviewing @{}'s work for the {} phase.\n\n\
            Here is their submission:\n---\n{}\n---\n\n\
            Please review this carefully:\n\
            - If the work is satisfactory, start your response with **APPROVED** and explain why.\n\
            - If changes are needed, start your response with **CHANGES REQUESTED** and list:\n\
              1. What needs to be fixed\n\
              2. What's missing\n\
              3. Specific improvements required\n\n\
            Be thorough but fair — like a real team lead.",
            agent_name, phase, 
            if current_output.len() > 2000 {
                let trunc = current_output.char_indices()
                    .take_while(|(i, _)| *i <= 2000)
                    .last()
                    .map(|(i, c)| i + c.len_utf8())
                    .unwrap_or(2000.min(current_output.len()));
                format!("{}...\n\n_(truncated for review)_", &current_output[..trunc])
            } else {
                current_output.clone()
            }
        );

        let entry = log_event(
            app, project_id, phase,
            Some(manager_id), Some(manager_name),
            "reviewing", Some(&format!("🔍 {} is reviewing {}'s work{}...", 
                manager_name, agent_name,
                if revision > 0 { format!(" (revision {})", revision) } else { String::new() }
            )),
        );
        state.lock().await.logs.push(entry);

        let review_response = send_to_agent_in_group(
            gateway, team_id, manager_id, manager_name,
            &review_prompt, &format!("Review @{}'s submission", agent_name),
        ).await?;

        let review_upper = review_response.to_uppercase();

        // Check if manager approved
        if review_upper.contains("APPROVED") && !review_upper.contains("CHANGES REQUESTED") {
            let entry = log_event(
                app, project_id, phase,
                Some(manager_id), Some(manager_name),
                "approved", Some(&format!("✅ {} approved {}'s work", manager_name, agent_name)),
            );
            state.lock().await.logs.push(entry);

            // Announce approval in group chat
            let approval_msg = format!("✅ **@{}'s work APPROVED by @{}**", agent_name, manager_name);
            let _ = inject_to_group(gateway, team_id, &approval_msg, Some("system")).await;

            return Ok(current_output);
        }

        // Changes requested — send back to agent for revision
        if revision < MAX_REVISIONS - 1 {
            let entry = log_event(
                app, project_id, phase,
                Some(manager_id), Some(manager_name),
                "changes_requested", Some(&format!("🔄 {} requested changes from {}", manager_name, agent_name)),
            );
            state.lock().await.logs.push(entry);

            let revision_prompt = format!(
                "Your manager @{} has reviewed your work and requested changes:\n\n\
                ---\n{}\n---\n\n\
                Please revise your work based on this feedback. \
                Address each point raised and resubmit your improved output.",
                manager_name, review_response
            );

            let entry = log_event(
                app, project_id, phase,
                Some(agent_id), Some(agent_name),
                "revising", Some(&format!("🔧 {} is revising their work (round {})...", agent_name, revision + 1)),
            );
            state.lock().await.logs.push(entry);

            match send_to_agent_in_group(
                gateway, team_id, agent_id, agent_name,
                &revision_prompt, &format!("Revise based on @{}'s feedback", manager_name),
            ).await {
                Ok(revised) => {
                    current_output = revised;
                    let entry = log_event(
                        app, project_id, phase,
                        Some(agent_id), Some(agent_name),
                        "revision_submitted", Some(&format!("📝 {} resubmitted their work", agent_name)),
                    );
                    state.lock().await.logs.push(entry);
                }
                Err(e) => {
                    let entry = log_event(
                        app, project_id, phase,
                        Some(agent_id), Some(agent_name),
                        "error", Some(&format!("❌ Revision error: {}", e)),
                    );
                    state.lock().await.logs.push(entry);
                    break; // Accept current output on error
                }
            }
        }
    }

    // Max revisions reached — auto-accept with a note
    let entry = log_event(
        app, project_id, phase,
        Some(manager_id), Some(manager_name),
        "auto_accepted", Some(&format!("⚠️ Max review rounds reached — {}'s work auto-accepted", agent_name)),
    );
    state.lock().await.logs.push(entry);

    let auto_msg = format!("⚠️ **Max review rounds reached — @{}'s work auto-accepted by @{}**", agent_name, manager_name);
    let _ = inject_to_group(gateway, team_id, &auto_msg, Some("system")).await;

    Ok(current_output)
}

/// Wait for user feedback between phases. Pauses execution and emits a Tauri event.
/// Returns the user's feedback string, or an error if cancelled.
#[allow(dead_code)]
async fn wait_for_feedback(
    app: &tauri::AppHandle,
    project_id: &str,
    phase: &str,
    summary: &str,
    feedback_rx: &mut mpsc::Receiver<String>,
    cancel: &AtomicBool,
) -> Result<String, String> {
    // Emit event so the frontend shows a feedback input
    let _ = app.emit("project-feedback-requested", json!({
        "projectId": project_id,
        "phase": phase,
        "summary": summary,
    }));

    // Wait for feedback or cancellation
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("Execution cancelled".to_string());
        }
        // Check for feedback with a timeout so we can poll cancellation
        match tokio::time::timeout(std::time::Duration::from_secs(2), feedback_rx.recv()).await {
            Ok(Some(feedback)) => return Ok(feedback),
            Ok(None) => return Err("Feedback channel closed".to_string()),
            Err(_) => continue, // Timeout — loop back and check cancel
        }
    }
}

/// Inject a message into a group chat transcript AND persist to SQLite
async fn inject_to_group(
    gateway: &GatewayClient,
    team_id: &str,
    message: &str,
    label: Option<&str>,
) -> Result<(), String> {
    let session_key = format!("team:{}:group", team_id);
    let mut params = json!({
        "sessionKey": session_key,
        "message": message
    });
    if let Some(l) = label {
        params["label"] = json!(l);
    }
    match gateway.call("chat.inject", params).await {
        Ok(_) => {},
        Err(e) => {
            eprintln!("[orchestrator] inject_to_group failed (session=team:{}:group): {}", team_id, e);
        }
    }

    // Persist to SQLite
    if let Ok(conn) = db::init_db() {
        let conv_id = db::get_or_create_conversation(
            &conn,
            &session_key,
            "group",
            None,
            Some(team_id),
            None,
        );
        if let Ok(cid) = conv_id {
            let msg = db::DbChatMessage {
                id: uuid::Uuid::new_v4().to_string(),
                conversation_id: cid,
                role: label.unwrap_or("system").to_string(),
                content: message.to_string(),
                sender_agent_id: None,
                sender_agent_name: None,
                label: label.map(String::from),
                metadata: None,
                created_at: chrono::Utc::now().to_rfc3339(),
            };
            if let Err(e) = db::insert_chat_message(&conn, &msg) {
                eprintln!("[orchestrator] Failed to persist chat message: {}", e);
            }
        }
    }

    Ok(())
}

/// Log an execution event to the database and emit a Tauri event
fn log_event(
    app: &tauri::AppHandle,
    project_id: &str,
    phase: &str,
    agent_id: Option<&str>,
    agent_name: Option<&str>,
    event_type: &str,
    content: Option<&str>,
) -> ExecutionLogEntry {
    let entry = ExecutionLogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        phase: phase.to_string(),
        agent_id: agent_id.map(String::from),
        agent_name: agent_name.map(String::from),
        event_type: event_type.to_string(),
        content: content.map(String::from),
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    // Persist to DB
    if let Ok(conn) = db::init_db() {
        let db_log = DbExecutionLog {
            id: entry.id.clone(),
            project_id: project_id.to_string(),
            phase: entry.phase.clone(),
            agent_id: entry.agent_id.clone(),
            agent_name: entry.agent_name.clone(),
            event_type: entry.event_type.clone(),
            content: entry.content.clone(),
            created_at: entry.created_at.clone(),
        };
        let _ = db::insert_execution_log(&conn, &db_log);
    }

    // Emit Tauri event to frontend
    let _ = app.emit("project-execution-log", json!({
        "projectId": project_id,
        "log": entry
    }));

    entry
}

/// Update the project phase in the database
fn update_project_phase(project_id: &str, phase: &str, status: &str) -> Result<(), String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    // Fetch current project to preserve other fields
    let projects = db::get_all_projects(&conn).map_err(|e| e.to_string())?;
    let project = projects.iter().find(|p| p.id == project_id)
        .ok_or_else(|| "Project not found".to_string())?;
    
    db::update_project(
        &conn,
        project_id,
        &project.name,
        project.description.as_deref(),
        project.team_id.as_deref(),
        status,
        phase,
        project.workspace_path.as_deref(),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== SDLC Phase Runners ====================

/// Phase 1: Requirements → Planning
/// Manager receives requirements and breaks work into tasks.
/// All communication is injected into the team group chat.
async fn run_planning_phase(
    app: &tauri::AppHandle,
    gateway: &GatewayClient,
    state: &Mutex<ExecutionState>,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let (project_id, team_id, manager_id, manager_name, requirements, agent_names) = {
        let s = state.lock().await;
        (
            s.project_id.clone(),
            s.team_id.clone(),
            s.manager_id.clone(),
            s.manager_name.clone(),
            s.requirements.clone().unwrap_or_default(),
            s.agents.iter().map(|a| a.name.clone()).collect::<Vec<_>>().join(", "),
        )
    };

    // Announce phase in group chat
    let phase_msg = format!(
        "📋 **Planning Phase Started**\n\n\
        **Requirements:**\n{}\n\n\
        **Team:** {}\n**Manager:** @{}",
        requirements, agent_names, manager_name
    );
    inject_to_group(gateway, &team_id, &phase_msg, Some("system")).await?;

    let entry = log_event(
        app, &project_id, "planning", None, None,
        "phase_started", Some("📋 Planning phase started"),
    );
    state.lock().await.logs.push(entry);

    if cancel.load(Ordering::Relaxed) {
        return Err("Execution cancelled".to_string());
    }

    let manager_prompt = format!(
        "You are the project manager. A new project has been created with the following requirements:\n\n\
        ---\n{}\n---\n\n\
        Your team members are: {}\n\n\
        Please:\n\
        1. Analyze these requirements\n\
        2. Break the work into specific tasks\n\
        3. Assign each task to a team member\n\
        4. Provide a brief plan with milestones\n\n\
        Format your response clearly with task assignments.",
        requirements, agent_names
    );

    let entry = log_event(
        app, &project_id, "planning",
        Some(&manager_id), Some(&manager_name),
        "message_sent", Some(&format!("📤 Sending requirements to {}", manager_name)),
    );
    state.lock().await.logs.push(entry);

    let manager_response = send_to_agent_in_group(
        gateway, &team_id, &manager_id, &manager_name,
        &manager_prompt, "Break down requirements into tasks",
    ).await?;

    let entry = log_event(
        app, &project_id, "planning",
        Some(&manager_id), Some(&manager_name),
        "response_received", Some(&format!("📥 {} shared the project plan", manager_name)),
    );
    state.lock().await.logs.push(entry);

    Ok(manager_response)
}

/// Phase 2: Design — Agents discuss approach
/// Each agent proposes, others give feedback, manager finalizes.
async fn run_design_phase(
    app: &tauri::AppHandle,
    gateway: &GatewayClient,
    state: &Mutex<ExecutionState>,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let (project_id, team_id, agents, manager_id, manager_name, requirements) = {
        let s = state.lock().await;
        (
            s.project_id.clone(),
            s.team_id.clone(),
            s.agents.clone(),
            s.manager_id.clone(),
            s.manager_name.clone(),
            s.requirements.clone().unwrap_or_default(),
        )
    };

    inject_to_group(gateway, &team_id,
        "🎨 **Design Phase Started** — agents will discuss their approach",
        Some("system"),
    ).await?;

    let entry = log_event(
        app, &project_id, "design", None, None,
        "phase_started", Some("🎨 Design phase started"),
    );
    state.lock().await.logs.push(entry);

    // Round 1: Each agent proposes their approach
    let mut proposals: Vec<(String, String, String)> = Vec::new();

    for agent in &agents {
        if cancel.load(Ordering::Relaxed) {
            return Err("Execution cancelled".to_string());
        }

        let entry = log_event(
            app, &project_id, "design",
            Some(&agent.id), Some(&agent.name),
            "message_sent", Some(&format!("💬 Asking {} for their approach...", agent.name)),
        );
        state.lock().await.logs.push(entry);

        let prompt = format!(
            "The project requirements are:\n{}\n\n\
            You've been assigned to work on this project. \
            What's your proposed approach? How would you design and implement your part? \
            Be specific about technologies, architecture, and implementation steps.",
            requirements
        );

        match send_to_agent_in_group(
            gateway, &team_id, &agent.id, &agent.name,
            &prompt, "Share your design proposal",
        ).await {
            Ok(response) => {
                let entry = log_event(
                    app, &project_id, "design",
                    Some(&agent.id), Some(&agent.name),
                    "response_received", Some(&format!("📝 {} submitted their design proposal", agent.name)),
                );
                state.lock().await.logs.push(entry);

                // Manager reviews the proposal — may request revisions
                let approved_proposal = manager_review_loop(
                    app, gateway, &team_id, &project_id, "design",
                    &agent.id, &agent.name, &manager_id, &manager_name,
                    &response, cancel, state,
                ).await.unwrap_or(response);

                proposals.push((agent.id.clone(), agent.name.clone(), approved_proposal));
            }
            Err(e) => {
                let entry = log_event(
                    app, &project_id, "design",
                    Some(&agent.id), Some(&agent.name),
                    "error", Some(&format!("❌ Error from {}: {}", agent.name, e)),
                );
                state.lock().await.logs.push(entry);
            }
        }
    }

    // Round 2: Cross-review
    if proposals.len() > 1 {
        inject_to_group(gateway, &team_id,
            "🔄 **Cross-Review Round** — agents reviewing each other's proposals",
            Some("system"),
        ).await?;

        let entry = log_event(
            app, &project_id, "design", None, None,
            "discussion_round", Some("🔄 Cross-review round started"),
        );
        state.lock().await.logs.push(entry);

        for agent in agents.iter() {
            if cancel.load(Ordering::Relaxed) {
                return Err("Execution cancelled".to_string());
            }

            let others: Vec<String> = proposals.iter()
                .filter(|(id, _, _)| id != &agent.id)
                .map(|(_, name, proposal)| format!("@{}'s proposal:\n{}", name, proposal))
                .collect();

            if others.is_empty() { continue; }

            let review_prompt = format!(
                "Your teammates have shared their design proposals:\n\n{}\n\n\
                Please review and provide:\n\
                1. What you agree with\n\
                2. Any concerns or suggestions\n\
                3. How your work integrates with theirs\n\n\
                Be constructive and collaborative.",
                others.join("\n\n---\n\n")
            );

            match send_to_agent_in_group(
                gateway, &team_id, &agent.id, &agent.name,
                &review_prompt, "Review teammates' proposals",
            ).await {
                Ok(_) => {
                    let entry = log_event(
                        app, &project_id, "design",
                        Some(&agent.id), Some(&agent.name),
                        "feedback_given", Some(&format!("💬 {} provided design feedback", agent.name)),
                    );
                    state.lock().await.logs.push(entry);
                }
                Err(e) => {
                    let entry = log_event(
                        app, &project_id, "design",
                        Some(&agent.id), Some(&agent.name),
                        "error", Some(&format!("❌ Error from {}: {}", agent.name, e)),
                    );
                    state.lock().await.logs.push(entry);
                }
            }
        }
    }

    // Round 3: Manager finalizes
    let all_proposals = proposals.iter()
        .map(|(_, name, p)| format!("@{}: {}", name, p))
        .collect::<Vec<_>>()
        .join("\n\n---\n\n");

    let finalize_prompt = format!(
        "Your team has discussed the design. Here are all proposals:\n\n{}\n\n\
        Please finalize the design plan:\n\
        1. Resolve any disagreements\n\
        2. Assign specific tasks to each agent\n\
        3. Define the implementation order\n\
        4. Set expectations for deliverables\n\n\
        This will be the final plan the team follows.",
        all_proposals
    );

    let entry = log_event(
        app, &project_id, "design",
        Some(&manager_id), Some(&manager_name),
        "message_sent", Some(&format!("📋 {} is finalizing the design plan...", manager_name)),
    );
    state.lock().await.logs.push(entry);

    let final_plan = match send_to_agent_in_group(
        gateway, &team_id, &manager_id, &manager_name,
        &finalize_prompt, "Finalize the design plan",
    ).await {
        Ok(plan) => {
            let entry = log_event(
                app, &project_id, "design",
                Some(&manager_id), Some(&manager_name),
                "plan_finalized", Some(&format!("✅ {} finalized the design plan", manager_name)),
            );
            state.lock().await.logs.push(entry);
            plan
        }
        Err(e) => {
            let entry = log_event(
                app, &project_id, "design",
                Some(&manager_id), Some(&manager_name),
                "error", Some(&format!("❌ Error: {}", e)),
            );
            state.lock().await.logs.push(entry);
            format!("Design phase completed with errors: {}", e)
        }
    };

    Ok(final_plan)
}

/// Phase 3: Development — Agents work on their tasks, manager reviews each submission
async fn run_development_phase(
    app: &tauri::AppHandle,
    gateway: &GatewayClient,
    state: &Mutex<ExecutionState>,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let (project_id, team_id, agents, manager_id, manager_name, requirements) = {
        let s = state.lock().await;
        (
            s.project_id.clone(), s.team_id.clone(), s.agents.clone(),
            s.manager_id.clone(), s.manager_name.clone(),
            s.requirements.clone().unwrap_or_default(),
        )
    };

    inject_to_group(gateway, &team_id,
        "⚡ **Development Phase Started** — agents are implementing their tasks",
        Some("system"),
    ).await?;

    let entry = log_event(
        app, &project_id, "development", None, None,
        "phase_started", Some("⚡ Development phase started"),
    );
    state.lock().await.logs.push(entry);

    let mut work_summaries: Vec<String> = Vec::new();

    for agent in &agents {
        if cancel.load(Ordering::Relaxed) {
            return Err("Execution cancelled".to_string());
        }

        let entry = log_event(
            app, &project_id, "development",
            Some(&agent.id), Some(&agent.name),
            "work_started", Some(&format!("🔨 {} is working on their tasks...", agent.name)),
        );
        state.lock().await.logs.push(entry);

        let dev_prompt = format!(
            "Based on the project requirements and the agreed design plan, \
            please implement your assigned tasks now. \
            Write the actual code, create files, and build your part of the project.\n\n\
            Requirements:\n{}\n\n\
            Focus on quality, follow best practices, and document your work.",
            requirements
        );

        match send_to_agent_in_group(
            gateway, &team_id, &agent.id, &agent.name,
            &dev_prompt, "Implement your assigned tasks",
        ).await {
            Ok(work_output) => {
                let entry = log_event(
                    app, &project_id, "development",
                    Some(&agent.id), Some(&agent.name),
                    "work_submitted", Some(&format!("📝 {} submitted their implementation", agent.name)),
                );
                state.lock().await.logs.push(entry);

                // Manager reviews the implementation — may request revisions
                match manager_review_loop(
                    app, gateway, &team_id, &project_id, "development",
                    &agent.id, &agent.name, &manager_id, &manager_name,
                    &work_output, cancel, state,
                ).await {
                    Ok(_) => {
                        work_summaries.push(format!("@{}: ✅ Implementation approved", agent.name));
                    }
                    Err(e) if e == "Execution cancelled" => {
                        return Err(e);
                    }
                    Err(e) => {
                        work_summaries.push(format!("@{}: ⚠️ Review incomplete — {}", agent.name, e));
                    }
                }
            }
            Err(e) => {
                work_summaries.push(format!("@{}: ❌ Error — {}", agent.name, e));
                let entry = log_event(
                    app, &project_id, "development",
                    Some(&agent.id), Some(&agent.name),
                    "error", Some(&format!("❌ Error from {}: {}", agent.name, e)),
                );
                state.lock().await.logs.push(entry);
            }
        }
    }

    Ok(work_summaries.join("\n"))
}

/// Phase 4: Code Review — Agents review each other's work, manager gives final verdict
async fn run_review_phase(
    app: &tauri::AppHandle,
    gateway: &GatewayClient,
    state: &Mutex<ExecutionState>,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let (project_id, team_id, agents, manager_id, manager_name) = {
        let s = state.lock().await;
        (s.project_id.clone(), s.team_id.clone(), s.agents.clone(), s.manager_id.clone(), s.manager_name.clone())
    };

    inject_to_group(gateway, &team_id,
        "🔍 **Code Review Phase Started** — agents reviewing each other's work",
        Some("system"),
    ).await?;

    let entry = log_event(
        app, &project_id, "testing", None, None,
        "phase_started", Some("🔍 Code review phase started"),
    );
    state.lock().await.logs.push(entry);

    // Circular review: each agent reviews the next agent's work
    if agents.len() >= 2 {
        for i in 0..agents.len() {
            if cancel.load(Ordering::Relaxed) {
                return Err("Execution cancelled".to_string());
            }

            let reviewer = &agents[i];
            let reviewee = &agents[(i + 1) % agents.len()];

            let entry = log_event(
                app, &project_id, "testing",
                Some(&reviewer.id), Some(&reviewer.name),
                "review_started", Some(&format!("🔍 {} is reviewing {}'s work...", reviewer.name, reviewee.name)),
            );
            state.lock().await.logs.push(entry);

            let review_prompt = format!(
                "Please review @{}'s implementation for the project. \
                Check their recent work and provide:\n\
                1. Code quality assessment\n\
                2. Potential bugs or issues\n\
                3. Suggestions for improvement\n\
                4. Overall approval status (Approved / Changes Requested)\n\n\
                Be thorough but constructive.",
                reviewee.name
            );

            match send_to_agent_in_group(
                gateway, &team_id, &reviewer.id, &reviewer.name,
                &review_prompt, &format!("Review @{}'s work", reviewee.name),
            ).await {
                Ok(_) => {
                    let entry = log_event(
                        app, &project_id, "testing",
                        Some(&reviewer.id), Some(&reviewer.name),
                        "review_completed", Some(&format!("✅ {} completed review of {}'s work", reviewer.name, reviewee.name)),
                    );
                    state.lock().await.logs.push(entry);
                }
                Err(e) => {
                    let entry = log_event(
                        app, &project_id, "testing",
                        Some(&reviewer.id), Some(&reviewer.name),
                        "error", Some(&format!("❌ Error: {}", e)),
                    );
                    state.lock().await.logs.push(entry);
                }
            }
        }
    }

    // Manager final review
    let entry = log_event(
        app, &project_id, "testing",
        Some(&manager_id), Some(&manager_name),
        "final_review", Some(&format!("📋 {} is doing the final review...", manager_name)),
    );
    state.lock().await.logs.push(entry);

    let final_review_prompt = "As the project manager, please do a final review of all the work done by the team. \
        Summarize:\n\
        1. What was accomplished\n\
        2. Overall quality assessment\n\
        3. Any remaining issues to address\n\
        4. Whether the project is ready for deployment";

    let summary = match send_to_agent_in_group(
        gateway, &team_id, &manager_id, &manager_name,
        final_review_prompt, "Final project review",
    ).await {
        Ok(summary) => {
            let entry = log_event(
                app, &project_id, "testing",
                Some(&manager_id), Some(&manager_name),
                "final_review_completed", Some(&format!("✅ {} completed the final review", manager_name)),
            );
            state.lock().await.logs.push(entry);
            summary
        }
        Err(e) => {
            let entry = log_event(
                app, &project_id, "testing",
                Some(&manager_id), Some(&manager_name),
                "error", Some(&format!("❌ Error: {}", e)),
            );
            state.lock().await.logs.push(entry);
            format!("Review completed with errors: {}", e)
        }
    };

    Ok(summary)
}

// ==================== Main Orchestration Loop ====================

/// Start the orchestration for a project.
/// This spawns a background async task that drives all SDLC phases
/// with inter-phase user feedback checkpoints.
pub async fn start_execution(
    app: tauri::AppHandle,
    gateway: GatewayClient,
    orchestrator: Arc<OrchestratorState>,
    project_id: String,
    project_name: String,
    requirements: Option<String>,
    team_id: String,
    manager_id: String,
    manager_name: String,
    agents: Vec<AgentInfo>,
) {
    let cancel = Arc::new(AtomicBool::new(false));
    let cancel_clone = cancel.clone();

    let initial_state = ExecutionState {
        project_id: project_id.clone(),
        project_name: project_name.clone(),
        requirements: requirements.clone(),
        team_id: team_id.clone(),
        manager_id: manager_id.clone(),
        manager_name: manager_name.clone(),
        agents: agents.clone(),
        current_phase: "planning".to_string(),
        status: "running".to_string(),
        logs: Vec::new(),
    };

    let state = Arc::new(Mutex::new(initial_state));

    // Create feedback channel for this project
    let (feedback_tx, _feedback_rx) = mpsc::channel::<String>(1);

    // Store the state, cancel flag, and feedback channel
    let state_for_insert = state.clone();
    let cancel_for_insert = cancel.clone();
    let project_id_for_insert = project_id.clone();
    let orchestrator_for_cleanup = orchestrator.clone();
    {
        let mut running = orchestrator.running.write().await;
        running.insert(project_id_for_insert.clone(), state_for_insert);
        let mut flags = orchestrator.cancel_flags.write().await;
        flags.insert(project_id_for_insert.clone(), cancel_for_insert);
        let mut channels = orchestrator.feedback_channels.write().await;
        channels.insert(project_id_for_insert, feedback_tx);
    }

    // Spawn the background task
    tokio::spawn(async move {
        let phases = vec![
            ("planning", "design"),
            ("design", "development"),
            ("development", "testing"),
            ("testing", "deployment"),
        ];

        // Bootstrap the team group chat session via a chat.send to the manager.
        // chat.inject requires an existing session — if the team group chat
        // has never been used, it won't exist. We create it by sending a chat.send
        // with the group session key. The Gateway auto-creates sessions on chat.send.
        let group_session_key = format!("team:{}:group", team_id);
        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let init_result = gateway.call("chat.send", json!({
            "sessionKey": group_session_key,
            "message": format!(
                "You are the project manager for '{}'. This is the team group chat where all project discussions will happen. \
                You'll coordinate the team through Planning → Design → Development → Review phases.",
                project_name
            ),
            "idempotencyKey": idempotency_key
        })).await;
        match &init_result {
            Ok(v) => println!("[orchestrator] Group chat session initialized: {:?}", v.get("ok")),
            Err(e) => eprintln!("[orchestrator] WARNING: failed to initialize group chat session: {}", e),
        }

        // Notify group chat of project start
        let start_msg = format!(
            "🚀 **Project Execution Started**\n\n\
            **Project:** {}\n\
            **Manager:** @{}\n\
            **Team:** {}\n\n\
            The orchestration engine will guide the team through Planning → Design → Development → Review.\n\
            The team will work autonomously. You'll be notified when the project is ready.",
            project_name,
            manager_name,
            agents.iter().map(|a| format!("@{}", a.name)).collect::<Vec<_>>().join(", ")
        );
        let _ = inject_to_group(&gateway, &team_id, &start_msg, Some("system")).await;

        for (current_phase, next_phase) in &phases {
            // Update state
            {
                let mut s = state.lock().await;
                s.current_phase = current_phase.to_string();
                s.status = "running".to_string();
            }

            // Update project phase in DB
            let _ = update_project_phase(&project_id, current_phase, "active");

            // Emit phase change event
            let _ = app.emit("project-phase-changed", json!({
                "projectId": project_id,
                "phase": current_phase,
                "nextPhase": next_phase,
            }));

            // Run the phase — all phases now return Result<String> with a summary
            let result = match *current_phase {
                "planning" => run_planning_phase(&app, &gateway, &state, &cancel_clone).await,
                "design" => run_design_phase(&app, &gateway, &state, &cancel_clone).await,
                "development" => run_development_phase(&app, &gateway, &state, &cancel_clone).await,
                "testing" => run_review_phase(&app, &gateway, &state, &cancel_clone).await,
                _ => Ok("Phase completed".to_string()),
            };

            match result {
                Ok(_phase_summary) => {
                    let entry = log_event(
                        &app, &project_id, current_phase, None, None,
                        "phase_completed", Some(&format!("✅ {} phase completed", current_phase)),
                    );
                    state.lock().await.logs.push(entry);

                    // Transition message in group chat
                    if *next_phase != "deployment" {
                        let transition_msg = format!(
                            "✅ **{} phase complete** — moving to **{}** phase",
                            current_phase, next_phase
                        );
                        let _ = inject_to_group(&gateway, &team_id, &transition_msg, Some("system")).await;
                    }
                }
                Err(e) if e == "Execution cancelled" => {
                    let entry = log_event(
                        &app, &project_id, current_phase, None, None,
                        "cancelled", Some("⏸️ Execution was cancelled by user"),
                    );
                    {
                        let mut s = state.lock().await;
                        s.logs.push(entry);
                        s.status = "paused".to_string();
                    }
                    let _ = update_project_phase(&project_id, current_phase, "paused");
                    // Cleanup
                    {
                        let mut running = orchestrator_for_cleanup.running.write().await;
                        running.remove(&project_id);
                        let mut flags = orchestrator_for_cleanup.cancel_flags.write().await;
                        flags.remove(&project_id);
                        let mut channels = orchestrator_for_cleanup.feedback_channels.write().await;
                        channels.remove(&project_id);
                    }
                    return;
                }
                Err(e) => {
                    let entry = log_event(
                        &app, &project_id, current_phase, None, None,
                        "error", Some(&format!("❌ Phase error: {}", e)),
                    );
                    state.lock().await.logs.push(entry);
                    // Continue to next phase despite errors
                }
            }

            // Small delay between phases for readability
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }

        // === PROJECT COMPLETE — Ask manager for final summary ===
        let _ = update_project_phase(&project_id, "deployment", "completed");

        // Ask the manager to create a final project summary with deployment instructions
        let (mgr_id, mgr_name) = {
            let s = state.lock().await;
            (s.manager_id.clone(), s.manager_name.clone())
        };
        let final_summary_prompt = format!(
            "The project '{}' is now complete! All phases (Planning, Design, Development, and Review) have been finished.\n\n\
            Please provide a final project summary for the user. Include:\n\
            1. What was built (key features and components)\n\
            2. Technology stack used\n\
            3. How to install dependencies and run the project\n\
            4. Any important notes or next steps\n\n\
            Format this as a clear, user-friendly message that the user can follow to get the project running.",
            project_name
        );
        let _ = send_to_agent_in_group(
            &gateway, &team_id, &mgr_id, &mgr_name,
            &final_summary_prompt, "Final project summary",
        ).await;

        let completion_msg = "🎉 **Project Complete!** The team has finished all phases. \
            Please review the manager's summary above for details on how to run your project. \
            You can reply in this group chat if you have any questions or need changes.";
        let _ = inject_to_group(&gateway, &team_id, completion_msg, Some("system")).await;

        let entry = log_event(
            &app, &project_id, "deployment", None, None,
            "execution_completed", Some("🎉 Project execution completed successfully!"),
        );
        {
            let mut s = state.lock().await;
            s.logs.push(entry);
            s.status = "completed".to_string();
            s.current_phase = "deployment".to_string();
        }

        // Cleanup state maps to free memory and allow restarts
        {
            let mut running = orchestrator_for_cleanup.running.write().await;
            running.remove(&project_id);
            let mut flags = orchestrator_for_cleanup.cancel_flags.write().await;
            flags.remove(&project_id);
            let mut channels = orchestrator_for_cleanup.feedback_channels.write().await;
            channels.remove(&project_id);
        }

        // Emit completion event
        let _ = app.emit("project-execution-completed", json!({
            "projectId": project_id,
        }));
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execution_state_serialization() {
        let state = ExecutionState {
            project_id: "proj-1".to_string(),
            project_name: "Test Project".to_string(),
            requirements: Some("Build a REST API".to_string()),
            team_id: "team-1".to_string(),
            manager_id: "mgr-1".to_string(),
            manager_name: "Manager Bot".to_string(),
            agents: vec![
                AgentInfo { id: "a1".to_string(), name: "Dev 1".to_string() },
                AgentInfo { id: "a2".to_string(), name: "Dev 2".to_string() },
            ],
            current_phase: "planning".to_string(),
            status: "running".to_string(),
            logs: vec![],
        };

        // Serialize and deserialize
        let json = serde_json::to_string(&state).unwrap();
        let deserialized: ExecutionState = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.project_id, "proj-1");
        assert_eq!(deserialized.project_name, "Test Project");
        assert_eq!(deserialized.requirements, Some("Build a REST API".to_string()));
        assert_eq!(deserialized.agents.len(), 2);
        assert_eq!(deserialized.agents[0].name, "Dev 1");
        assert_eq!(deserialized.current_phase, "planning");
        assert_eq!(deserialized.status, "running");
    }

    #[test]
    fn test_execution_log_entry_serialization() {
        let entry = ExecutionLogEntry {
            id: "log-1".to_string(),
            phase: "design".to_string(),
            agent_id: Some("agent-1".to_string()),
            agent_name: Some("Dev Bot".to_string()),
            event_type: "response_received".to_string(),
            content: Some("✅ Dev Bot shared their design proposal".to_string()),
            created_at: "2026-02-24T22:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("design"));
        assert!(json.contains("Dev Bot"));

        let deserialized: ExecutionLogEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.phase, "design");
        assert_eq!(deserialized.agent_name, Some("Dev Bot".to_string()));
    }

    #[test]
    fn test_orchestrator_state_default() {
        let state = OrchestratorState::default();

        // Should start empty
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let running = state.running.read().await;
            assert!(running.is_empty());

            let flags = state.cancel_flags.read().await;
            assert!(flags.is_empty());
        });
    }

    #[test]
    fn test_cancel_flag_mechanics() {
        let flag = Arc::new(AtomicBool::new(false));

        // Initially not cancelled
        assert!(!flag.load(Ordering::Relaxed));

        // Set cancellation
        flag.store(true, Ordering::Relaxed);
        assert!(flag.load(Ordering::Relaxed));

        // Clone shares state
        let clone = flag.clone();
        assert!(clone.load(Ordering::Relaxed));
    }

    #[test]
    fn test_agent_info_clone() {
        let agent = AgentInfo {
            id: "agent-1".to_string(),
            name: "Developer".to_string(),
        };

        let cloned = agent.clone();
        assert_eq!(cloned.id, "agent-1");
        assert_eq!(cloned.name, "Developer");
    }

    #[tokio::test]
    async fn test_orchestrator_state_insert_and_retrieve() {
        let orchestrator = OrchestratorState::default();

        let state = ExecutionState {
            project_id: "proj-test".to_string(),
            project_name: "Test".to_string(),
            requirements: None,
            team_id: "team-1".to_string(),
            manager_id: "mgr-1".to_string(),
            manager_name: "Manager".to_string(),
            agents: vec![],
            current_phase: "planning".to_string(),
            status: "running".to_string(),
            logs: vec![],
        };

        let state_arc = Arc::new(Mutex::new(state));

        // Insert
        {
            let mut running = orchestrator.running.write().await;
            running.insert("proj-test".to_string(), state_arc.clone());
        }

        // Retrieve
        {
            let running = orchestrator.running.read().await;
            assert!(running.contains_key("proj-test"));
            let retrieved = running.get("proj-test").unwrap().lock().await;
            assert_eq!(retrieved.project_name, "Test");
            assert_eq!(retrieved.status, "running");
        }
    }

    #[tokio::test]
    async fn test_orchestrator_state_cancel_flow() {
        let orchestrator = OrchestratorState::default();

        // Register a cancel flag
        let flag = Arc::new(AtomicBool::new(false));
        {
            let mut flags = orchestrator.cancel_flags.write().await;
            flags.insert("proj-cancel".to_string(), flag.clone());
        }

        // Simulate cancellation from commands layer
        {
            let flags = orchestrator.cancel_flags.read().await;
            let f = flags.get("proj-cancel").unwrap();
            f.store(true, Ordering::Relaxed);
        }

        // Verify the original flag was affected
        assert!(flag.load(Ordering::Relaxed));
    }
}
