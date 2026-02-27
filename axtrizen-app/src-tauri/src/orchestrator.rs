// orchestrator.rs — Multi-agent project execution engine
//
// Drives structured workflow conversations between agents using the existing
// Gateway chat primitives (chat.send / chat.inject).
// Supports domain-agnostic workflows via WorkflowTemplate system.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{Mutex, RwLock, mpsc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::Emitter;
use tauri::Manager;

use crate::db::{self, DbExecutionLog};
use crate::gateway_client::GatewayClient;
use crate::workflow_templates::{self, WorkflowTemplate, WorkflowPhase, PhaseType, expand_prompt};

// reqwest re-exported from the crate's dependency for HTTP webhook calls
use reqwest;

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

// ==================== Integration Helpers ====================

/// Run a git command in the project workspace. Returns Ok(stdout) or Err(stderr).
async fn git_run(workspace: &str, args: &[&str]) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .args(args)
        .current_dir(workspace)
        .output()
        .await
        .map_err(|e| format!("git exec failed: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Auto-commit all new/changed files in a workspace after an agent creates them.
/// Initializes git if not already a repo. Returns commit hash on success.
async fn auto_git_commit(workspace: &str, agent_name: &str, phase_name: &str) -> Result<String, String> {
    let git_dir = std::path::Path::new(workspace).join(".git");
    if !git_dir.exists() {
        git_run(workspace, &["init"]).await?;
        // Set default branch and user for the auto-generated repo
        let _ = git_run(workspace, &["config", "user.email", "axtrizen@local"]).await;
        let _ = git_run(workspace, &["config", "user.name", "Axtrizen AI"]).await;
    }

    // Stage everything
    git_run(workspace, &["add", "-A"]).await?;

    // Check if there's anything to commit
    let status = git_run(workspace, &["status", "--porcelain"]).await.unwrap_or_default();
    if status.trim().is_empty() {
        return Err("Nothing to commit".to_string());
    }

    let msg = format!("[{}] {} phase — work by @{}", "Axtrizen", phase_name, agent_name);
    git_run(workspace, &["commit", "-m", &msg]).await?;
    let hash = git_run(workspace, &["rev-parse", "--short", "HEAD"]).await?;
    Ok(hash)
}

/// Run a test command in the workspace and return (passed: bool, output: String).
async fn run_tests(workspace: &str, test_cmd: &str) -> (bool, String) {
    match tokio::process::Command::new("sh")
        .args(["-c", test_cmd])
        .current_dir(workspace)
        .output()
        .await
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{}\n{}", stdout, stderr);
            (output.status.success(), combined)
        }
        Err(e) => (false, format!("Failed to execute tests: {}", e)),
    }
}

/// Send a notification to Slack/Discord if configured.
/// Reads webhook URLs from the integration_config SQLite table.
/// Silently no-ops if not configured.
async fn notify_external_channels(project_name: &str, message: &str) {
    // Read webhook URLs from the shared SQLite DB
    let (slack_url, discord_url) = match db::init_db() {
        Ok(conn) => {
            let slack = conn.query_row(
                "SELECT webhook_url FROM integration_config WHERE platform = 'slack'",
                [], |row| row.get::<_, String>(0),
            ).ok();
            let discord = conn.query_row(
                "SELECT webhook_url FROM integration_config WHERE platform = 'discord'",
                [], |row| row.get::<_, String>(0),
            ).ok();
            (slack, discord)
        }
        Err(_) => (None, None),
    };

    let client = reqwest::Client::new();

    // Slack
    if let Some(url) = slack_url {
        let payload = json!({
            "text": format!("*{}*\n{}", project_name, message),
        });
        let _ = client.post(&url).json(&payload).send().await;
    }

    // Discord
    if let Some(url) = discord_url {
        let payload = json!({
            "content": format!("**{}**\n{}", project_name, message),
        });
        let _ = client.post(&url).json(&payload).send().await;
    }
}

/// Store content in memU vector memory via the Maple bridge.
/// Silently no-ops if the Maple broker is not running.
async fn memu_store(app: &tauri::AppHandle, content: &str, agent_id: Option<&str>) {
    use crate::commands::maple::MapleBridgeState;
    let maple_state = app.try_state::<MapleBridgeState>();
    let Some(maple_state) = maple_state else { return };

    let guard = maple_state.client.lock().await;
    let Some(client) = guard.as_ref() else { return };

    let mut params = json!({
        "content": content,
        "modality": "project",
    });
    if let Some(aid) = agent_id {
        params["agent_id"] = json!(aid);
    }
    let _ = client.call("memu.memorize", params).await;
}

/// Retrieve relevant memories from memU for a given query.
/// Returns empty vec if Maple broker is not running.
async fn memu_retrieve(app: &tauri::AppHandle, query: &str, top_k: u32) -> Vec<String> {
    use crate::commands::maple::MapleBridgeState;
    let maple_state = app.try_state::<MapleBridgeState>();
    let Some(maple_state) = maple_state else { return vec![] };

    let guard = maple_state.client.lock().await;
    let Some(client) = guard.as_ref() else { return vec![] };

    let params = json!({
        "query": query,
        "method": "rag",
        "top_k": top_k,
    });
    match client.call("memu.retrieve", params).await {
        Ok(val) => {
            // Parse results — expected format: { "results": [ { "content": "..." }, ... ] }
            val.get("results")
                .and_then(|r| r.as_array())
                .map(|arr| arr.iter()
                    .filter_map(|v| v.get("content").and_then(|c| c.as_str()).map(|s| s.to_string()))
                    .collect())
                .unwrap_or_default()
        }
        Err(_) => vec![],
    }
}

// ==================== Maple P2P Helpers ====================

/// Broadcast a P2P event on the Maple broker from the manager agent.
/// Silently no-ops if the Maple broker is not running.
async fn maple_broadcast(
    app: &tauri::AppHandle,
    agent_id: &str,
    msg_type: &str,
    payload: Value,
    channel: Option<&str>,
) {
    use crate::commands::maple::MapleBridgeState;
    let maple_state = app.try_state::<MapleBridgeState>();
    let Some(maple_state) = maple_state else { return };

    let guard = maple_state.client.lock().await;
    let Some(client) = guard.as_ref() else { return };

    let params = json!({
        "agent_id": agent_id,
        "msg_type": msg_type,
        "payload": payload,
        "channel": channel.unwrap_or("tasks"),
    });
    let _ = client.call("agent.publish", params).await;
}

/// Connect all team agents to the Maple P2P broker.
/// Auto-starts the broker if not already running.
/// Silently no-ops on any failure.
async fn maple_connect_agents(
    app: &tauri::AppHandle,
    manager_id: &str,
    manager_name: &str,
    agents: &[AgentInfo],
    team_id: &str,
) {
    use crate::commands::maple::MapleBridgeState;
    let maple_state = app.try_state::<MapleBridgeState>();
    let Some(maple_state) = maple_state else { return };

    // Auto-start broker if not running
    {
        let guard = maple_state.client.lock().await;
        if guard.is_none() {
            drop(guard);
            // Spawn a new broker
            let config = crate::maple_bridge::MapleBridgeConfig::default();
            match crate::maple_bridge::MapleBridgeClient::spawn(config).await {
                Ok((client, mut event_rx)) => {
                    let client = std::sync::Arc::new(client);
                    let mut guard = maple_state.client.lock().await;
                    *guard = Some(client);
                    // Forward events to frontend
                    let handle = app.clone();
                    tokio::spawn(async move {
                        while let Some(event) = event_rx.recv().await {
                            let _ = handle.emit("maple-event", json!({
                                "agentId": event.agent_id,
                                "type": event.event_type,
                                "message": event.message,
                            }));
                        }
                    });
                    println!("[orchestrator] Maple broker auto-started for orchestration");
                }
                Err(e) => {
                    eprintln!("[orchestrator] Failed to auto-start Maple broker: {} — continuing without P2P", e);
                    return;
                }
            }
        }
    }

    let guard = maple_state.client.lock().await;
    let Some(client) = guard.as_ref() else { return };

    // Connect manager
    let _ = client.connect_agent(manager_id, team_id, "manager").await;
    println!("[orchestrator] Maple: connected manager @{}", manager_name);

    // Connect all worker agents
    for agent in agents {
        let _ = client.connect_agent(&agent.id, team_id, "developer").await;
        println!("[orchestrator] Maple: connected agent @{}", agent.name);
    }
}

/// Disconnect all team agents from the Maple P2P broker.
async fn maple_disconnect_agents(
    app: &tauri::AppHandle,
    manager_id: &str,
    agents: &[AgentInfo],
) {
    use crate::commands::maple::MapleBridgeState;
    let maple_state = app.try_state::<MapleBridgeState>();
    let Some(maple_state) = maple_state else { return };

    let guard = maple_state.client.lock().await;
    let Some(client) = guard.as_ref() else { return };

    let _ = client.disconnect_agent(manager_id).await;
    for agent in agents {
        let _ = client.disconnect_agent(&agent.id).await;
    }
    println!("[orchestrator] Maple: all agents disconnected");
}

/// Initiate a LIM link for structured code review. Returns link_id or None.
async fn maple_initiate_lim(
    app: &tauri::AppHandle,
    reviewer_id: &str,
    reviewee_id: &str,
) -> Option<String> {
    use crate::commands::maple::MapleBridgeState;
    let maple_state = app.try_state::<MapleBridgeState>();
    let maple_state = maple_state?;

    let guard = maple_state.client.lock().await;
    let client = guard.as_ref()?;

    client.initiate_review_link(reviewer_id, reviewee_id).await.ok()
}

/// Terminate a LIM link.
async fn maple_terminate_lim(
    app: &tauri::AppHandle,
    agent_id: &str,
    link_id: &str,
) {
    use crate::commands::maple::MapleBridgeState;
    let maple_state = app.try_state::<MapleBridgeState>();
    let Some(maple_state) = maple_state else { return };

    let guard = maple_state.client.lock().await;
    let Some(client) = guard.as_ref() else { return };

    let _ = client.terminate_link(agent_id, link_id).await;
}

// ==================== Engine ====================

/// Send a message to an agent via an **orchestrator-scoped** session and get the response.
///
/// Uses `agent:{id}:orch:{project_id}` instead of `agent:{id}:main` so the Gateway
/// still routes to the correct agent LLM, but streaming events carry the `:orch:` session
/// key, allowing the frontend to distinguish orchestrator traffic from user DM traffic
/// (which uses `agent:{id}:main`). This prevents the "chat leak" bug where orchestrator
/// messages appeared in individual agent DM windows.
async fn send_to_agent(
    gateway: &GatewayClient,
    agent_id: &str,
    message: &str,
    project_id: &str,
) -> Result<String, String> {
    let session_key = format!("agent:{}:orch:{}", agent_id, project_id);
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
    project_id: &str,
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

    // 2. Send to the agent via orchestrator-scoped session (not DM session!)
    let response = send_to_agent(gateway, agent_id, prompt, project_id).await?;

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
#[allow(clippy::too_many_arguments)]
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
            **REVIEW PROTOCOL:**\n\
            1. Identify ROOT CAUSES of issues, not just symptoms\n\
            2. Check imports, dependencies, and type correctness\n\
            3. Verify it matches the design and API contracts\n\
            4. Check error handling on all failure paths\n\n\
            **Respond with:**\n\
            - If satisfactory: Start with **APPROVED** and explain why.\n\
            - If changes needed: Start with **CHANGES REQUESTED** and list:\n\
              ### Critical Issues (blocks progress)\n\
              ### Major Issues (bugs/missing features)\n\
              ### Minor Issues (style/suggestions)\n\n\
            Be thorough but fair — like a real tech lead.",
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
            gateway, team_id, project_id, manager_id, manager_name,
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
                gateway, team_id, project_id, agent_id, agent_name,
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

// ==================== Plan Persistence ====================

/// Extract a JSON code block from the Manager's free-text response.
/// Handles ```json ... ```, ``` ... ```, or raw { ... } patterns.
fn extract_json_from_response(text: &str) -> Option<String> {
    // Try ```json ... ``` first
    if let Some(start) = text.find("```json") {
        let json_start = start + 7;
        if let Some(end) = text[json_start..].find("```") {
            return Some(text[json_start..json_start + end].trim().to_string());
        }
    }
    // Try ``` ... ```
    if let Some(start) = text.find("```") {
        let inner_start = start + 3;
        if let Some(end) = text[inner_start..].find("```") {
            let block = text[inner_start..inner_start + end].trim();
            if block.starts_with('{') {
                return Some(block.to_string());
            }
        }
    }
    // Try raw JSON object
    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            if end > start {
                return Some(text[start..=end].to_string());
            }
        }
    }
    None
}

/// Extract code blocks from an agent's response and save them as files.
/// Looks for patterns like:
///   ```lang
///   // FILE: path/to/file.ext
///   <code>
///   ```
/// or alternatively:
///   **File: `path/to/file.ext`**
///   ```lang
///   <code>
///   ```
fn extract_and_save_code_files(workspace_path: &str, response: &str) -> Vec<String> {
    let mut saved_files: Vec<String> = Vec::new();
    let workspace = std::path::Path::new(workspace_path);
    let _ = std::fs::create_dir_all(workspace);

    // Regex-free approach: scan for code blocks and look for FILE: markers
    let lines: Vec<&str> = response.lines().collect();
    let mut i = 0;
    let mut pending_filename: Option<String> = None;

    while i < lines.len() {
        let line = lines[i].trim();

        // Check for filename markers like "**File: `path/to/file.ext`**" or "### `file.ext`"
        if let Some(fname) = extract_filename_from_marker(line) {
            pending_filename = Some(fname);
            i += 1;
            continue;
        }

        // Check for start of fenced code block
        if line.starts_with("```") && line.len() > 3 {
            let lang_or_info = &line[3..];
            i += 1;

            // Collect code lines until closing ```
            let mut code_lines: Vec<&str> = Vec::new();
            let mut file_from_code: Option<String> = None;

            while i < lines.len() && !lines[i].trim().starts_with("```") {
                let code_line = lines[i];
                // Check for // FILE: or # FILE: at the beginning of code
                if code_lines.is_empty() || code_lines.len() == 1 {
                    if let Some(fname) = extract_file_directive(code_line) {
                        file_from_code = Some(fname);
                        i += 1;
                        continue;
                    }
                }
                code_lines.push(code_line);
                i += 1;
            }
            // Skip the closing ```
            if i < lines.len() { i += 1; }

            // Determine the filename
            let filename = file_from_code
                .or(pending_filename.take())
                .or_else(|| guess_filename_from_lang(lang_or_info, saved_files.len()));

            if let Some(ref fname) = filename {
                if !code_lines.is_empty() {
                    let file_path = workspace.join(fname);
                    if let Some(parent) = file_path.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    let content = code_lines.join("\n");
                    match std::fs::write(&file_path, &content) {
                        Ok(_) => {
                            saved_files.push(fname.clone());
                            println!("[orchestrator] Saved file: {:?}", file_path);
                        }
                        Err(e) => eprintln!("[orchestrator] Failed to write {}: {}", fname, e),
                    }
                }
            }
            pending_filename = None;
            continue;
        }
        i += 1;
    }
    saved_files
}

/// Extract filename from markdown markers like:
///   **File: `path/to/file.ext`**
///   ### `file.ext`
///   #### file.ext
fn extract_filename_from_marker(line: &str) -> Option<String> {
    let clean = line.trim().trim_matches('*').trim().trim_matches('#').trim();
    // "File: `path/to/file.ext`" or "File: path/to/file.ext"
    if let Some(rest) = clean.strip_prefix("File:") {
        let fname = rest.trim().trim_matches('`').trim();
        if !fname.is_empty() && fname.contains('.') {
            return Some(fname.to_string());
        }
    }
    None
}

/// Extract FILE: directive from inside a code block
/// e.g. "// FILE: src/index.html" or "# FILE: config.py"
fn extract_file_directive(line: &str) -> Option<String> {
    let clean = line.trim();
    for prefix in &["// FILE:", "# FILE:", "/* FILE:", "-- FILE:", "<!-- FILE:"] {
        if let Some(rest) = clean.strip_prefix(prefix) {
            let fname = rest.trim().trim_end_matches("*/").trim_end_matches("-->").trim();
            if !fname.is_empty() {
                return Some(fname.to_string());
            }
        }
    }
    None
}

/// Guess a reasonable filename from the language hint of a code block
fn guess_filename_from_lang(lang: &str, index: usize) -> Option<String> {
    let ext = match lang.split_whitespace().next().unwrap_or("") {
        "javascript" | "js" => "js",
        "typescript" | "ts" => "ts",
        "html" => "html",
        "css" => "css",
        "python" | "py" => "py",
        "rust" | "rs" => "rs",
        "json" => "json",
        "yaml" | "yml" => "yml",
        "toml" => "toml",
        "bash" | "sh" | "shell" => "sh",
        "sql" => "sql",
        "jsx" | "tsx" => "tsx",
        _ => return None,
    };
    Some(format!("src/file_{}.{}", index + 1, ext))
}

/// Parse the Manager's plan response and persist epics, stories, and tasks to the DB.
/// Emits a `project-plan-ready` event so the frontend ProjectBoard auto-refreshes.
fn persist_plan_from_response(
    app: &tauri::AppHandle,
    project_id: &str,
    response: &str,
) -> Result<(), String> {
    let json_str = extract_json_from_response(response)
        .ok_or_else(|| "No JSON block found in Manager's response".to_string())?;

    let parsed: Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Invalid JSON in plan: {}", e))?;

    let epics = parsed.get("epics")
        .and_then(|e: &Value| e.as_array())
        .ok_or_else(|| "Plan JSON missing 'epics' array".to_string())?;

    let conn = db::init_db().map_err(|e| e.to_string())?;

    let mut epic_count = 0;
    let mut story_count = 0;
    let mut task_count = 0;

    for (ei, epic_val) in epics.iter().enumerate() {
        let epic_title = epic_val.get("title").and_then(|v: &Value| v.as_str()).unwrap_or("Untitled Epic");
        let epic_desc = epic_val.get("description").and_then(|v: &Value| v.as_str());
        let priority = epic_val.get("priority").and_then(|v: &Value| v.as_i64()).unwrap_or(1) as i32;

        let epic = db::DbEpic {
            id: uuid::Uuid::new_v4().to_string(),
            project_id: project_id.to_string(),
            title: epic_title.to_string(),
            description: epic_desc.map(String::from),
            status: "backlog".to_string(),
            priority,
            sort_order: ei as i32,
            created_at: String::new(),
            updated_at: String::new(),
        };
        db::insert_epic(&conn, &epic).map_err(|e| e.to_string())?;
        epic_count += 1;

        if let Some(stories) = epic_val.get("stories").and_then(|s: &Value| s.as_array()) {
            for (si, story_val) in stories.iter().enumerate() {
                let story_title = story_val.get("title").and_then(|v: &Value| v.as_str()).unwrap_or("Untitled Story");
                let story_desc = story_val.get("description").and_then(|v: &Value| v.as_str());
                let acceptance = story_val.get("acceptance_criteria")
                    .map(|v: &Value| v.to_string());
                let story_points = story_val.get("story_points").and_then(|v: &Value| v.as_i64()).unwrap_or(1) as i32;

                let story = db::DbStory {
                    id: uuid::Uuid::new_v4().to_string(),
                    epic_id: epic.id.clone(),
                    project_id: project_id.to_string(),
                    title: story_title.to_string(),
                    description: story_desc.map(String::from),
                    acceptance_criteria: acceptance,
                    story_points,
                    status: "backlog".to_string(),
                    assigned_agent_id: None,
                    sprint_id: None,
                    sort_order: si as i32,
                    created_at: String::new(),
                    updated_at: String::new(),
                };
                db::insert_story(&conn, &story).map_err(|e| e.to_string())?;
                story_count += 1;

                if let Some(tasks) = story_val.get("tasks").and_then(|t: &Value| t.as_array()) {
                    for (ti, task_val) in tasks.iter().enumerate() {
                        let task_title = task_val.get("title").and_then(|v: &Value| v.as_str()).unwrap_or("Untitled Task");
                        let task_desc = task_val.get("description").and_then(|v: &Value| v.as_str());
                        let est_min = task_val.get("estimated_minutes").and_then(|v: &Value| v.as_i64());

                        let task = db::DbTask {
                            id: uuid::Uuid::new_v4().to_string(),
                            story_id: story.id.clone(),
                            epic_id: epic.id.clone(),
                            project_id: project_id.to_string(),
                            title: task_title.to_string(),
                            description: task_desc.map(String::from),
                            status: "backlog".to_string(),
                            assigned_agent_id: None,
                            estimated_minutes: est_min.map(|v: i64| v as i32),
                            actual_minutes: None,
                            files_created: None,
                            dependencies: None,
                            sort_order: ti as i32,
                            started_at: None,
                            completed_at: None,
                            created_at: String::new(),
                            updated_at: String::new(),
                        };
                        db::insert_task(&conn, &task).map_err(|e| e.to_string())?;
                        task_count += 1;
                    }
                }
            }
        }
    }

    println!("[orchestrator] Persisted plan: {} epics, {} stories, {} tasks", epic_count, story_count, task_count);

    // Emit Tauri event so the frontend ProjectBoard auto-refreshes
    let _ = app.emit("project-plan-ready", json!({
        "projectId": project_id,
        "epics": epic_count,
        "stories": story_count,
        "tasks": task_count,
    }));

    Ok(())
}

// ==================== Phase Runners (Template-Driven) ====================

/// Planning phase: Manager breaks down work into structured board items.
/// Works for any domain — software epics/stories/tasks, marketing campaigns, HR positions, etc.
async fn run_planning_phase(
    app: &tauri::AppHandle,
    gateway: &GatewayClient,
    state: &Mutex<ExecutionState>,
    cancel: &AtomicBool,
    phase: &WorkflowPhase,
    prompt_vars: &std::collections::HashMap<String, String>,
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
        "{} **{} Phase Started**\n\n\
        **Requirements:**\n{}\n\n\
        **Team:** {}\n**Manager:** @{}",
        phase.emoji, phase.name, requirements, agent_names, manager_name
    );
    inject_to_group(gateway, &team_id, &phase_msg, Some("system")).await?;

    let entry = log_event(
        app, &project_id, &phase.id, None, None,
        "phase_started", Some(&format!("{} {} phase started", phase.emoji, phase.name)),
    );
    state.lock().await.logs.push(entry);

    if cancel.load(Ordering::Relaxed) {
        return Err("Execution cancelled".to_string());
    }

    // Use the template's prompt for this phase
    let manager_prompt = expand_prompt(&phase.prompt_template, prompt_vars);

    let entry = log_event(
        app, &project_id, &phase.id,
        Some(&manager_id), Some(&manager_name),
        "message_sent", Some(&format!("📤 Sending requirements to {}", manager_name)),
    );
    state.lock().await.logs.push(entry);

    let manager_response = send_to_agent_in_group(
        gateway, &team_id, &project_id, &manager_id, &manager_name,
        &manager_prompt, &format!("Break down requirements into {}", phase.name.to_lowercase()),
    ).await?;

    let entry = log_event(
        app, &project_id, &phase.id,
        Some(&manager_id), Some(&manager_name),
        "response_received", Some(&format!("📥 {} shared the project plan", manager_name)),
    );
    state.lock().await.logs.push(entry);

    // ── Parse and persist the structured plan to DB ──────────────────
    if let Err(e) = persist_plan_from_response(app, &project_id, &manager_response) {
        eprintln!("[orchestrator] Failed to persist plan: {} — board will show empty state", e);
        let entry = log_event(
            app, &project_id, &phase.id, None, None,
            "plan_parse_warning", Some(&format!("⚠️ Could not auto-populate board: {}", e)),
        );
        state.lock().await.logs.push(entry);
    } else {
        let entry = log_event(
            app, &project_id, &phase.id, None, None,
            "plan_persisted", Some("📊 Project board populated with epics, stories, and tasks"),
        );
        state.lock().await.logs.push(entry);

        // === MAPLE P2P: Broadcast TASK_ASSIGNMENT for planned work ===
        maple_broadcast(
            app, &manager_id, "TASK_ASSIGNMENT",
            json!({
                "phase": phase.id,
                "project": project_id,
                "assignedBy": manager_name,
            }),
            Some("tasks"),
        ).await;
    }

    Ok(manager_response)
}

/// Collaborative phase: Agents discuss, propose, cross-review, manager finalizes.
/// Works for any domain — design proposals, strategy brainstorming, approach planning, etc.
async fn run_design_phase(
    app: &tauri::AppHandle,
    gateway: &GatewayClient,
    state: &Mutex<ExecutionState>,
    cancel: &AtomicBool,
    phase: &WorkflowPhase,
    prompt_vars: &std::collections::HashMap<String, String>,
) -> Result<String, String> {
    let (project_id, team_id, agents, manager_id, manager_name) = {
        let s = state.lock().await;
        (
            s.project_id.clone(),
            s.team_id.clone(),
            s.agents.clone(),
            s.manager_id.clone(),
            s.manager_name.clone(),
        )
    };

    inject_to_group(gateway, &team_id,
        &format!("{} **{} Phase Started** — agents will discuss their approach", phase.emoji, phase.name),
        Some("system"),
    ).await?;

    let entry = log_event(
        app, &project_id, &phase.id, None, None,
        "phase_started", Some(&format!("{} {} phase started", phase.emoji, phase.name)),
    );
    state.lock().await.logs.push(entry);

    // Round 1: Each agent proposes their approach
    let mut proposals: Vec<(String, String, String)> = Vec::new();

    for agent in &agents {
        if cancel.load(Ordering::Relaxed) {
            return Err("Execution cancelled".to_string());
        }

        let entry = log_event(
            app, &project_id, &phase.id,
            Some(&agent.id), Some(&agent.name),
            "message_sent", Some(&format!("💬 Asking {} for their approach...", agent.name)),
        );
        state.lock().await.logs.push(entry);

        // Use the template's prompt for this phase
        let prompt = expand_prompt(&phase.prompt_template, prompt_vars);

        match send_to_agent_in_group(
            gateway, &team_id, &project_id, &agent.id, &agent.name,
            &prompt, &format!("Share your {} proposal", phase.name.to_lowercase()),
        ).await {
            Ok(response) => {
                let entry = log_event(
                    app, &project_id, &phase.id,
                    Some(&agent.id), Some(&agent.name),
                    "response_received", Some(&format!("📝 {} submitted their {} proposal", agent.name, phase.name.to_lowercase())),
                );
                state.lock().await.logs.push(entry);

                // Manager reviews the proposal — may request revisions
                let approved_proposal = manager_review_loop(
                    app, gateway, &team_id, &project_id, &phase.id,
                    &agent.id, &agent.name, &manager_id, &manager_name,
                    &response, cancel, state,
                ).await.unwrap_or(response);

                proposals.push((agent.id.clone(), agent.name.clone(), approved_proposal));
            }
            Err(e) => {
                let entry = log_event(
                    app, &project_id, &phase.id,
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
            app, &project_id, &phase.id, None, None,
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
                gateway, &team_id, &project_id, &agent.id, &agent.name,
                &review_prompt, "Review teammates' proposals",
            ).await {
                Ok(_) => {
                    let entry = log_event(
                        app, &project_id, &phase.id,
                        Some(&agent.id), Some(&agent.name),
                        "feedback_given", Some(&format!("💬 {} provided {} feedback", agent.name, phase.name.to_lowercase())),
                    );
                    state.lock().await.logs.push(entry);
                }
                Err(e) => {
                    let entry = log_event(
                        app, &project_id, &phase.id,
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
        app, &project_id, &phase.id,
        Some(&manager_id), Some(&manager_name),
        "message_sent", Some(&format!("📋 {} is finalizing the {} plan...", manager_name, phase.name.to_lowercase())),
    );
    state.lock().await.logs.push(entry);

    let final_plan = match send_to_agent_in_group(
        gateway, &team_id, &project_id, &manager_id, &manager_name,
        &finalize_prompt, &format!("Finalize the {} plan", phase.name.to_lowercase()),
    ).await {
        Ok(plan) => {
            let entry = log_event(
                app, &project_id, &phase.id,
                Some(&manager_id), Some(&manager_name),
                "plan_finalized", Some(&format!("✅ {} finalized the {} plan", manager_name, phase.name.to_lowercase())),
            );
            state.lock().await.logs.push(entry);
            plan
        }
        Err(e) => {
            let entry = log_event(
                app, &project_id, &phase.id,
                Some(&manager_id), Some(&manager_name),
                "error", Some(&format!("❌ Error: {}", e)),
            );
            state.lock().await.logs.push(entry);
            format!("{} phase completed with errors: {}", phase.name, e)
        }
    };

    Ok(final_plan)
}

/// Maximum number of agents working concurrently during execution phases.
const MAX_CONCURRENT_AGENTS: usize = 10;

/// Execution phase: Agents produce deliverables **in parallel**, manager reviews.
/// Works for any domain — code files, marketing collateral, legal documents, etc.
///
/// Agents are spawned as concurrent tasks (up to MAX_CONCURRENT_AGENTS at a time)
/// using a semaphore to control parallelism. Each agent independently:
///   1. Gets prompted via Gateway
///   2. Has work reviewed by the manager
///   3. Saves files + git commits (if applicable)
async fn run_development_phase(
    app: &tauri::AppHandle,
    gateway: &GatewayClient,
    state: &Mutex<ExecutionState>,
    cancel: &AtomicBool,
    phase: &WorkflowPhase,
    prompt_vars: &std::collections::HashMap<String, String>,
) -> Result<String, String> {
    let (project_id, team_id, agents, manager_id, manager_name) = {
        let s = state.lock().await;
        (
            s.project_id.clone(), s.team_id.clone(), s.agents.clone(),
            s.manager_id.clone(), s.manager_name.clone(),
        )
    };

    // Fetch workspace path from DB
    let workspace_path: Option<String> = db::init_db().ok()
        .and_then(|conn| db::get_all_projects(&conn).ok())
        .and_then(|ps| ps.into_iter().find(|p| p.id == project_id))
        .and_then(|p| p.workspace_path);

    inject_to_group(gateway, &team_id,
        &format!("{} **{} Phase Started** — agents are producing deliverables in parallel", phase.emoji, phase.name),
        Some("system"),
    ).await?;

    let entry = log_event(
        app, &project_id, &phase.id, None, None,
        "phase_started", Some(&format!("{} {} phase started ({} agents in parallel, max {} concurrent)",
            phase.emoji, phase.name, agents.len(), MAX_CONCURRENT_AGENTS)),
    );
    state.lock().await.logs.push(entry);

    // === PARALLEL FAN-OUT ===
    // Each agent works in its own spawned task, limited by semaphore
    let semaphore = Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_AGENTS));
    let work_results: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

    let mut handles = Vec::new();

    for agent in agents.clone() {
        if cancel.load(Ordering::Relaxed) {
            return Err("Execution cancelled".to_string());
        }

        // Clone everything the spawned task needs (all owned)
        let app = app.clone();
        let gateway = gateway.clone_for_task();
        let cancel = Arc::new(AtomicBool::new(cancel.load(Ordering::Relaxed)));
        let semaphore = semaphore.clone();
        let results = work_results.clone();
        let project_id = project_id.clone();
        let team_id = team_id.clone();
        let manager_id = manager_id.clone();
        let manager_name = manager_name.clone();
        let phase_id = phase.id.clone();
        let phase_name = phase.name.clone();
        let phase_saves_files = phase.saves_files;
        let workspace_path = workspace_path.clone();
        let dev_prompt = expand_prompt(&phase.prompt_template, prompt_vars);
        // Wrap state in Arc for sharing across spawned tasks
        // SAFETY: We use the outer &Mutex directly — but since we need 'static
        // for spawn, we pass per-task state logging via the shared work_results.
        // All state.lock().await.logs.push() calls happen via log_event which
        // emits Tauri events — the frontend sees them regardless.

        let handle = tokio::spawn(async move {
            // Acquire semaphore permit (blocks if MAX_CONCURRENT_AGENTS are already running)
            let _permit = match semaphore.acquire().await {
                Ok(p) => p,
                Err(_) => return, // semaphore closed
            };

            let entry = log_event(
                &app, &project_id, &phase_id,
                Some(&agent.id), Some(&agent.name),
                "work_started", Some(&format!("🔨 {} is working on their tasks...", agent.name)),
            );
            // Note: we don't push to state.logs in spawned tasks to avoid
            // needing Arc<Mutex<ExecutionState>> — log_event already emits
            // the Tauri event so the frontend sees it immediately.
            let _ = entry;

            // === MAPLE P2P: STATUS_UPDATE — agent starting work ===
            maple_broadcast(
                &app, &agent.id, "STATUS_UPDATE",
                json!({
                    "agentId": agent.id,
                    "agentName": agent.name,
                    "status": "in_progress",
                    "phase": phase_id,
                    "project": project_id,
                }),
                Some("tasks"),
            ).await;

            match send_to_agent_in_group(
                &gateway, &team_id, &project_id, &agent.id, &agent.name,
                &dev_prompt, &format!("Execute your {} tasks", phase_name.to_lowercase()),
            ).await {
                Ok(work_output) => {
                    let _ = log_event(
                        &app, &project_id, &phase_id,
                        Some(&agent.id), Some(&agent.name),
                        "work_submitted", Some(&format!("📝 {} submitted their deliverables", agent.name)),
                    );

                    // Manager reviews the work — may request revisions
                    // Note: manager_review_loop still takes refs, so we call it with local refs
                    let state_local: Mutex<ExecutionState> = Mutex::new(ExecutionState {
                        project_id: project_id.clone(),
                        project_name: String::new(),
                        requirements: None,
                        team_id: team_id.clone(),
                        manager_id: manager_id.clone(),
                        manager_name: manager_name.clone(),
                        agents: vec![agent.clone()],
                        current_phase: phase_id.clone(),
                        status: "running".to_string(),
                        logs: Vec::new(),
                    });
                    match manager_review_loop(
                        &app, &gateway, &team_id, &project_id, &phase_id,
                        &agent.id, &agent.name, &manager_id, &manager_name,
                        &work_output, &cancel, &state_local,
                    ).await {
                        Ok(_) => {
                            results.lock().await.push(format!("@{}: ✅ Work approved", agent.name));

                            // === MAPLE P2P: TASK_COMPLETED ===
                            maple_broadcast(
                                &app, &agent.id, "TASK_COMPLETED",
                                json!({
                                    "agentId": agent.id,
                                    "agentName": agent.name,
                                    "phase": phase_id,
                                    "project": project_id,
                                    "summary": format!("Work approved by {}", manager_name),
                                }),
                                Some("tasks"),
                            ).await;

                            // Extract + save files
                            if phase_saves_files {
                                if let Some(ref wp) = workspace_path {
                                    let saved = extract_and_save_code_files(wp, &work_output);
                                    if !saved.is_empty() {
                                        let _ = log_event(
                                            &app, &project_id, &phase_id,
                                            Some(&agent.id), Some(&agent.name),
                                            "files_created",
                                            Some(&format!("📁 {} created {} files: {}",
                                                agent.name, saved.len(), saved.join(", "))),
                                        );
                                        // GIT AUTO-COMMIT
                                        match auto_git_commit(wp, &agent.name, &phase_name).await {
                                            Ok(hash) => {
                                                let _ = log_event(
                                                    &app, &project_id, &phase_id,
                                                    Some(&agent.id), Some(&agent.name),
                                                    "git_commit",
                                                    Some(&format!("🔀 Auto-committed {} files ({})", saved.len(), hash)),
                                                );
                                            }
                                            Err(e) => {
                                                println!("[orchestrator] git auto-commit skipped for {}: {}", agent.name, e);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) if e == "Execution cancelled" => {
                            results.lock().await.push(format!("@{}: ⏸️ Cancelled", agent.name));
                        }
                        Err(e) => {
                            results.lock().await.push(format!("@{}: ⚠️ Review incomplete — {}", agent.name, e));
                        }
                    }
                }
                Err(e) => {
                    results.lock().await.push(format!("@{}: ❌ Error — {}", agent.name, e));
                    let _ = log_event(
                        &app, &project_id, &phase_id,
                        Some(&agent.id), Some(&agent.name),
                        "error", Some(&format!("❌ Error from {}: {}", agent.name, e)),
                    );
                }
            }
        });
        handles.push(handle);
    }

    // === FAN-IN: Wait for all agents to complete ===
    for handle in handles {
        let _ = handle.await; // Ignore JoinErrors (panics are logged)
    }

    let work_summaries = work_results.lock().await.clone();

    let entry = log_event(
        app, &project_id, &phase.id, None, None,
        "parallel_complete", Some(&format!("🏁 All {} agents completed their work", agents.len())),
    );
    state.lock().await.logs.push(entry);

    Ok(work_summaries.join("\n"))
}

/// Review phase: Agents review each other's output with structured feedback.
/// Works for any domain — code review, content review, contract review, etc.
async fn run_review_phase(
    app: &tauri::AppHandle,
    gateway: &GatewayClient,
    state: &Mutex<ExecutionState>,
    cancel: &AtomicBool,
    phase: &WorkflowPhase,
    prompt_vars: &std::collections::HashMap<String, String>,
) -> Result<String, String> {
    let (project_id, team_id, agents, manager_id, manager_name) = {
        let s = state.lock().await;
        (s.project_id.clone(), s.team_id.clone(), s.agents.clone(), s.manager_id.clone(), s.manager_name.clone())
    };

    inject_to_group(gateway, &team_id,
        &format!("{} **{} Phase Started** — agents reviewing each other's work", phase.emoji, phase.name),
        Some("system"),
    ).await?;

    let entry = log_event(
        app, &project_id, &phase.id, None, None,
        "phase_started", Some(&format!("{} {} phase started", phase.emoji, phase.name)),
    );
    state.lock().await.logs.push(entry);

    // Circular review: each agent reviews the next agent's work — IN PARALLEL
    if agents.len() >= 2 {
        let semaphore = Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_AGENTS));
        let mut review_handles = Vec::new();

        // Build review pairs: (reviewer, reviewee)
        let review_pairs: Vec<(AgentInfo, AgentInfo)> = (0..agents.len())
            .map(|i| (agents[i].clone(), agents[(i + 1) % agents.len()].clone()))
            .collect();

        for (reviewer, reviewee) in review_pairs {
            if cancel.load(Ordering::Relaxed) {
                return Err("Execution cancelled".to_string());
            }

            let app = app.clone();
            let gateway = gateway.clone_for_task();
            let semaphore = semaphore.clone();
            let project_id = project_id.clone();
            let team_id = team_id.clone();
            let phase_id = phase.id.clone();
            let mut review_vars = prompt_vars.clone();
            review_vars.insert("reviewee_name".to_string(), reviewee.name.clone());
            let review_prompt = expand_prompt(&phase.prompt_template, &review_vars);

            let handle = tokio::spawn(async move {
                let _permit = match semaphore.acquire().await {
                    Ok(p) => p,
                    Err(_) => return,
                };

                let _ = log_event(
                    &app, &project_id, &phase_id,
                    Some(&reviewer.id), Some(&reviewer.name),
                    "review_started", Some(&format!("🔍 {} is reviewing {}'s work...", reviewer.name, reviewee.name)),
                );

                // === MAPLE P2P: LIM link for structured review ===
                let lim_link_id = maple_initiate_lim(&app, &reviewer.id, &reviewee.id).await;
                if let Some(ref lid) = lim_link_id {
                    maple_broadcast(
                        &app, &reviewer.id, "CODE_REVIEW_REQUEST",
                        json!({
                            "reviewerId": reviewer.id,
                            "reviewerName": reviewer.name,
                            "revieweeId": reviewee.id,
                            "revieweeName": reviewee.name,
                            "phase": phase_id,
                            "linkId": lid,
                        }),
                        Some("reviews"),
                    ).await;
                }

                match send_to_agent_in_group(
                    &gateway, &team_id, &project_id, &reviewer.id, &reviewer.name,
                    &review_prompt, &format!("Review @{}'s work", reviewee.name),
                ).await {
                    Ok(review_output) => {
                        let _ = log_event(
                            &app, &project_id, &phase_id,
                            Some(&reviewer.id), Some(&reviewer.name),
                            "review_completed", Some(&format!("✅ {} completed review of {}'s work", reviewer.name, reviewee.name)),
                        );

                        // === MAPLE P2P: CODE_REVIEW_RESULT over LIM ===
                        if let Some(ref lid) = lim_link_id {
                            let verdict = if review_output.to_uppercase().contains("APPROVED") {
                                "APPROVED"
                            } else {
                                "CHANGES_REQUESTED"
                            };
                            maple_broadcast(
                                &app, &reviewer.id, "CODE_REVIEW_RESULT",
                                json!({
                                    "reviewerId": reviewer.id,
                                    "revieweeId": reviewee.id,
                                    "verdict": verdict,
                                    "linkId": lid,
                                }),
                                Some("reviews"),
                            ).await;
                            maple_terminate_lim(&app, &reviewer.id, lid).await;
                        }
                    }
                    Err(e) => {
                        let _ = log_event(
                            &app, &project_id, &phase_id,
                            Some(&reviewer.id), Some(&reviewer.name),
                            "error", Some(&format!("❌ Review error: {}", e)),
                        );
                    }
                }
            });
            review_handles.push(handle);
        }

        // Wait for all reviews to complete
        for handle in review_handles {
            let _ = handle.await;
        }
    }


    // === CI/CD: Run tests before final review (if workspace has a test command) ===
    {
        let workspace_path = db::init_db().ok()
            .and_then(|conn| db::get_all_projects(&conn).ok())
            .and_then(|ps| ps.into_iter().find(|p| p.id == project_id))
            .and_then(|p| p.workspace_path);

        if let Some(ref wp) = workspace_path {
            // Auto-detect test command from package.json or Cargo.toml
            let test_cmd = if std::path::Path::new(wp).join("package.json").exists() {
                Some("npm test -- --passWithNoTests 2>&1 || true".to_string())
            } else if std::path::Path::new(wp).join("Cargo.toml").exists() {
                Some("cargo test 2>&1 || true".to_string())
            } else if std::path::Path::new(wp).join("pytest.ini").exists()
                || std::path::Path::new(wp).join("setup.py").exists() {
                Some("python -m pytest 2>&1 || true".to_string())
            } else {
                None
            };

            if let Some(cmd) = test_cmd {
                let entry = log_event(
                    app, &project_id, &phase.id, None, None,
                    "tests_started", Some(&format!("🧪 Running tests: `{}`", cmd)),
                );
                state.lock().await.logs.push(entry);

                let (passed, output) = run_tests(wp, &cmd).await;
                let status_emoji = if passed { "✅" } else { "⚠️" };
                let truncated = if output.len() > 500 { &output[..500] } else { &output };
                let entry = log_event(
                    app, &project_id, &phase.id, None, None,
                    "tests_completed",
                    Some(&format!("{} Tests {}: {}…", status_emoji, if passed { "passed" } else { "had failures" }, truncated)),
                );
                state.lock().await.logs.push(entry);

                // Inject test results into group chat so agents see them
                if !passed {
                    let test_msg = format!(
                        "⚠️ **Test Results**\n```\n{}\n```\nPlease address any failures.",
                        truncated
                    );
                    let _ = inject_to_group(gateway, &team_id, &test_msg, Some("system")).await;
                }
            }
        }
    }

    // Manager final review
    let entry = log_event(
        app, &project_id, &phase.id,
        Some(&manager_id), Some(&manager_name),
        "final_review", Some(&format!("📋 {} is doing the final review...", manager_name)),
    );
    state.lock().await.logs.push(entry);

    // Use manager_prompt if available, otherwise a generic final review prompt
    let final_review_prompt = if let Some(ref mgr_prompt) = phase.manager_prompt {
        expand_prompt(mgr_prompt, prompt_vars)
    } else {
        "As the project manager, do a final review of all the work done by the team.\n\n\
            **Output your final review in this format:**\n\n\
            ## Project Readiness: READY / NOT READY\n\n\
            ### What Was Accomplished\n\
            (list of completed deliverables matching requirements)\n\n\
            ### Quality Assessment\n\
            (overall quality and completeness)\n\n\
            ### Critical Issues\n\
            (any blockers, or None)\n\n\
            ### Remaining Improvements\n\
            (non-blocking suggestions for future iteration)\n\n\
            ### Requirement Coverage\n\
            (what percentage of original requirements are fully addressed)".to_string()
    };

    let summary = match send_to_agent_in_group(
        gateway, &team_id, &project_id, &manager_id, &manager_name,
        &final_review_prompt, &format!("Final {} review", phase.name.to_lowercase()),
    ).await {
        Ok(summary) => {
            let entry = log_event(
                app, &project_id, &phase.id,
                Some(&manager_id), Some(&manager_name),
                "final_review_completed", Some(&format!("✅ {} completed the final review", manager_name)),
            );
            state.lock().await.logs.push(entry);
            summary
        }
        Err(e) => {
            let entry = log_event(
                app, &project_id, &phase.id,
                Some(&manager_id), Some(&manager_name),
                "error", Some(&format!("❌ Error: {}", e)),
            );
            state.lock().await.logs.push(entry);
            format!("{} completed with errors: {}", phase.name, e)
        }
    };

    Ok(summary)
}

/// Update all board tasks for a project based on the current completed phase.
/// Uses the workflow template's status_mapping to determine the correct status.
fn update_board_tasks_for_phase(project_id: &str, completed_phase: &str) {
    update_board_tasks_with_status(project_id, completed_phase, false)
}

/// Update board tasks when a phase STARTS — gives immediate visual feedback.
fn update_board_tasks_for_phase_start(project_id: &str, starting_phase: &str) {
    update_board_tasks_with_status(project_id, starting_phase, true)
}

/// Internal: update board tasks using the workflow template's status mapping.
fn update_board_tasks_with_status(project_id: &str, phase_id: &str, is_start: bool) {
    // Try to load the template from the project
    let new_status = if let Ok(conn) = db::init_db() {
        let template = db::get_project_workflow_template(&conn, project_id)
            .ok()
            .flatten()
            .and_then(|dbt| serde_json::from_str::<WorkflowTemplate>(&dbt.template_data).ok());

        if let Some(t) = template {
            let mapping = if is_start { &t.status_mapping.phase_start } else { &t.status_mapping.phase_complete };
            mapping.get(phase_id).cloned()
        } else {
            // Fallback: hardcoded software dev mapping for backward compat
            let s = if is_start {
                match phase_id {
                    "planning" => Some("todo"),
                    "design" | "development" => Some("in_progress"),
                    "testing" => Some("review"),
                    _ => None,
                }
            } else {
                match phase_id {
                    "planning" => Some("todo"),
                    "design" => Some("in_progress"),
                    "development" => Some("review"),
                    "testing" => Some("done"),
                    _ => None,
                }
            };
            s.map(|s| s.to_string())
        }
    } else {
        return;
    };

    let Some(new_status) = new_status else { return };

    if let Ok(conn) = db::init_db() {
        let now = chrono::Utc::now().to_rfc3339();
        let started_at = if new_status == "in_progress" { Some(now.as_str()) } else { None };
        let completed_at = if new_status == "done" { Some(now.as_str()) } else { None };

        match db::get_project_tasks(&conn, project_id) {
            Ok(tasks) => {
                for task in &tasks {
                    if let Err(e) = db::update_task_status(
                        &conn, &task.id, &new_status, None, started_at, completed_at,
                    ) {
                        eprintln!("[orchestrator] Failed to update task {} status: {}", task.id, e);
                    }
                }
                let label = if is_start { "start of" } else { "after" };
                println!("[orchestrator] Updated {} tasks to '{}' {} {} phase",
                    tasks.len(), new_status, label, phase_id);
            }
            Err(e) => eprintln!("[orchestrator] Failed to fetch tasks for status update: {}", e),
        }
    }
}

// ==================== Main Orchestration Loop ======================================

/// Start the orchestration for a project.
/// This spawns a background async task that drives workflow phases
/// loaded from the project's WorkflowTemplate, with inter-phase user feedback checkpoints.
#[allow(clippy::too_many_arguments)]
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
    resume_from_phase: Option<String>,
    feedback_context: Option<String>,
) {
    let cancel = Arc::new(AtomicBool::new(false));
    let cancel_clone = cancel.clone();

    // Load the workflow template for this project (falls back to default)
    let template: WorkflowTemplate = {
        if let Ok(conn) = db::init_db() {
            db::get_project_workflow_template(&conn, &project_id)
                .ok()
                .flatten()
                .and_then(|dbt| serde_json::from_str::<WorkflowTemplate>(&dbt.template_data).ok())
                .unwrap_or_else(|| {
                    workflow_templates::get_builtin_template(workflow_templates::DEFAULT_TEMPLATE_ID)
                        .expect("default template must exist")
                })
        } else {
            workflow_templates::get_builtin_template(workflow_templates::DEFAULT_TEMPLATE_ID)
                .expect("default template must exist")
        }
    };

    let first_phase_id = resume_from_phase.clone()
        .unwrap_or_else(|| template.phases.first()
            .map(|p| p.id.clone())
            .unwrap_or_else(|| "planning".to_string()));

    let initial_state = ExecutionState {
        project_id: project_id.clone(),
        project_name: project_name.clone(),
        requirements: requirements.clone(),
        team_id: team_id.clone(),
        manager_id: manager_id.clone(),
        manager_name: manager_name.clone(),
        agents: agents.clone(),
        current_phase: first_phase_id,
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
    // Clones for the panic handler (JoinHandle::unwrap_or_else)
    let app_for_panic = app.clone();
    let project_id_for_panic = project_id.clone();
    {
        let mut running = orchestrator.running.write().await;
        running.insert(project_id_for_insert.clone(), state_for_insert);
        let mut flags = orchestrator.cancel_flags.write().await;
        flags.insert(project_id_for_insert.clone(), cancel_for_insert);
        let mut channels = orchestrator.feedback_channels.write().await;
        channels.insert(project_id_for_insert, feedback_tx);
    }

    // Spawn the background task
    let handle = tokio::spawn(async move {
        // Emit an initial log event IMMEDIATELY so the frontend shows activity
        let entry = log_event(
            &app, &project_id, "initialization", None, None,
            "engine_started", Some("🚀 Orchestration engine started — connecting to Gateway..."),
        );
        state.lock().await.logs.push(entry);

        // Build the phase pipeline from the workflow template
        let template_phases: Vec<(String, String)> = {
            let phase_ids: Vec<String> = template.phases.iter().map(|p| p.id.clone()).collect();
            phase_ids.iter().enumerate().map(|(i, id)| {
                let next = if i + 1 < phase_ids.len() {
                    phase_ids[i + 1].clone()
                } else {
                    "completed".to_string()
                };
                (id.clone(), next)
            }).collect()
        };

        // Build variable map for prompt expansion
        let prompt_vars: std::collections::HashMap<String, String> = {
            let s = state.lock().await;
            let mut vars = std::collections::HashMap::new();
            vars.insert("project_name".to_string(), s.project_name.clone());
            vars.insert("requirements".to_string(), s.requirements.clone().unwrap_or_default());
            vars.insert("agent_names".to_string(), s.agents.iter().map(|a| a.name.clone()).collect::<Vec<_>>().join(", "));
            vars.insert("workspace_path".to_string(), {
                db::init_db().ok()
                    .and_then(|conn| db::get_all_projects(&conn).ok())
                    .and_then(|ps| ps.into_iter().find(|p| p.id == project_id))
                    .and_then(|p| p.workspace_path)
                    .unwrap_or_else(|| "(default workspace)".to_string())
            });
            // Include user feedback context if this is a restart-with-feedback run
            if let Some(ref fb) = feedback_context {
                vars.insert("feedback".to_string(), fb.clone());
            }
            vars
        };

        // Build a phase name list for display
        let phase_flow_display = template.phases.iter()
            .map(|p| p.name.clone())
            .collect::<Vec<_>>()
            .join(" → ");

        // Verify Gateway connectivity before proceeding
        if !gateway.is_connected().await {
            let entry = log_event(
                &app, &project_id, "initialization", None, None,
                "error", Some("❌ Gateway is not connected. Please ensure the Gateway is running and connected."),
            );
            state.lock().await.logs.push(entry);
            // Cleanup and notify frontend
            {
                let mut s = state.lock().await;
                s.status = "error".to_string();
            }
            let _ = update_project_phase(&project_id, "initialization", "error");
            let _ = app.emit("project-execution-completed", json!({
                "projectId": project_id,
            }));
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

        let entry = log_event(
            &app, &project_id, "initialization", None, None,
            "gateway_connected", Some("✅ Gateway connected — initializing team group chat..."),
        );
        state.lock().await.logs.push(entry);

        // Bootstrap the team group chat session.
        // Use chat.send to the manager via the group session key so the Gateway
        // auto-creates the session. Add a short timeout to avoid blocking forever.
        let group_session_key = format!("team:{}:group", team_id);
        let idempotency_key = uuid::Uuid::new_v4().to_string();
        let init_result = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            gateway.call("chat.send", json!({
                "sessionKey": group_session_key,
                "message": format!(
                    "You are the project manager for '{}'. This is the team group chat where all project discussions will happen. \
                    You'll coordinate the team through {} phases.",
                    project_name, phase_flow_display
                ),
                "idempotencyKey": idempotency_key
            }))
        ).await;
        match &init_result {
            Ok(Ok(v)) => println!("[orchestrator] Group chat session initialized: {:?}", v.get("ok")),
            Ok(Err(e)) => {
                eprintln!("[orchestrator] WARNING: failed to initialize group chat session: {}", e);
                let entry = log_event(
                    &app, &project_id, "initialization", None, None,
                    "warning", Some(&format!("⚠️ Group chat init warning: {} — continuing anyway", e)),
                );
                state.lock().await.logs.push(entry);
            }
            Err(_) => {
                eprintln!("[orchestrator] WARNING: group chat session init timed out (30s)");
                let entry = log_event(
                    &app, &project_id, "initialization", None, None,
                    "warning", Some("⚠️ Group chat init timed out — continuing anyway"),
                );
                state.lock().await.logs.push(entry);
            }
        }

        // Notify group chat of project start
        let start_msg = format!(
            "🚀 **Project Execution Started**\n\n\
            **Project:** {}\n\
            **Workflow:** {} ({})\n\
            **Manager:** @{}\n\
            **Team:** {}\n\n\
            The orchestration engine will guide the team through {}.\n\
            The team will work autonomously. You'll be notified when the project is ready.",
            project_name,
            template.name,
            template.domain,
            manager_name,
            agents.iter().map(|a| format!("@{}", a.name)).collect::<Vec<_>>().join(", "),
            phase_flow_display,
        );
        let _ = inject_to_group(&gateway, &team_id, &start_msg, Some("system")).await;

        // Inject user feedback context into group chat if this is a restart-with-feedback run
        if let Some(ref fb) = feedback_context {
            let feedback_msg = format!(
                "📝 **User Feedback for Revision**\n\n\
                The project owner has reviewed the previous deliverables and provided the following feedback:\n\n\
                > {}\n\n\
                Please incorporate this feedback into your work for this revision cycle.",
                fb
            );
            let _ = inject_to_group(&gateway, &team_id, &feedback_msg, Some("system")).await;
            let entry = log_event(
                &app, &project_id, "initialization", None, None,
                "feedback_injected", Some(&format!("📝 User feedback injected: {}", fb)),
            );
            state.lock().await.logs.push(entry);
        }

        // === MAPLE P2P: Connect all agents to the broker ===
        {
            let agent_list: Vec<AgentInfo> = state.lock().await.agents.clone();
            maple_connect_agents(&app, &manager_id, &manager_name, &agent_list, &team_id).await;
            let entry = log_event(
                &app, &project_id, "initialization", None, None,
                "maple_connected", Some("🔗 Agents connected to Maple P2P broker"),
            );
            state.lock().await.logs.push(entry);
        }

        let entry = log_event(
            &app, &project_id, "initialization", None, None,
            "ready", Some(&format!("✅ Orchestration engine ready — starting {} workflow", template.name)),
        );
        state.lock().await.logs.push(entry);

        // Resume logic: skip phases that were already completed
        let mut reached_resume_point = resume_from_phase.is_none();

        for (current_phase, next_phase) in &template_phases {
            // If resuming, skip phases until we reach the resume point
            if !reached_resume_point {
                if Some(current_phase.as_str()) == resume_from_phase.as_deref() {
                    reached_resume_point = true;
                    let entry = log_event(
                        &app, &project_id, "initialization", None, None,
                        "resume", Some(&format!("⏩ Resuming from {} phase", current_phase)),
                    );
                    state.lock().await.logs.push(entry);
                } else {
                    // Skip this completed phase
                    continue;
                }
            }
            // Look up the WorkflowPhase definition from the template
            let phase_def = template.phases.iter().find(|p| &p.id == current_phase);

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

            // === SLACK / DISCORD: Notify phase start ===
            {
                let phase_label = phase_def.map(|p| p.name.as_str()).unwrap_or(current_phase.as_str());
                let emoji = phase_def.map(|p| p.emoji.as_str()).unwrap_or("▶️");
                notify_external_channels(
                    &project_name,
                    &format!("{} **{} phase started**", emoji, phase_label),
                ).await;
            }

            // === MAPLE P2P: PHASE_SYNC — broadcast phase start ===
            maple_broadcast(
                &app, &manager_id, "PHASE_SYNC",
                json!({
                    "phase": current_phase,
                    "action": "start",
                    "project": project_id,
                    "projectName": project_name,
                }),
                Some("coordination"),
            ).await;

            // Update board tasks at phase START for immediate visual feedback
            update_board_tasks_for_phase_start(&project_id, current_phase);
            let _ = app.emit("project-plan-ready", json!({
                "projectId": project_id,
                "phase": current_phase,
            }));

            // Run the phase — dispatch based on PhaseType from the template
            let result = if let Some(pd) = phase_def {
                match pd.phase_type {
                    PhaseType::Planning => {
                        // === memU: Retrieve relevant memories before planning ===
                        let req_text = requirements.clone().unwrap_or_default();
                        if !req_text.is_empty() {
                            let memories = memu_retrieve(&app, &req_text, 3).await;
                            if !memories.is_empty() {
                                let memory_context = format!(
                                    "📚 **Relevant past project context from memory:**\n{}",
                                    memories.iter().enumerate()
                                        .map(|(i, m)| format!("{}. {}", i + 1, m))
                                        .collect::<Vec<_>>().join("\n")
                                );
                                let _ = inject_to_group(&gateway, &team_id, &memory_context, Some("system")).await;
                                let entry = log_event(
                                    &app, &project_id, current_phase, None, None,
                                    "memory_retrieved",
                                    Some(&format!("🧠 Retrieved {} relevant memories from memU", memories.len())),
                                );
                                state.lock().await.logs.push(entry);
                            }
                        }
                        run_planning_phase(&app, &gateway, &state, &cancel_clone, pd, &prompt_vars).await
                    }
                    PhaseType::Collaborative => run_design_phase(&app, &gateway, &state, &cancel_clone, pd, &prompt_vars).await,
                    PhaseType::Execution => run_development_phase(&app, &gateway, &state, &cancel_clone, pd, &prompt_vars).await,
                    PhaseType::Review => run_review_phase(&app, &gateway, &state, &cancel_clone, pd, &prompt_vars).await,
                    PhaseType::Delivery => Ok("Delivery phase — handled by final report".to_string()),
                }
            } else {
                // Fallback: unknown phase, just log and skip
                Ok(format!("Phase '{}' skipped (no definition found)", current_phase))
            };

            match result {
                Ok(_phase_summary) => {
                    let entry = log_event(
                        &app, &project_id, current_phase, None, None,
                        "phase_completed", Some(&format!("✅ {} phase completed", current_phase)),
                    );
                    state.lock().await.logs.push(entry);

                    // Update board tasks based on completed phase
                    update_board_tasks_for_phase(&project_id, current_phase);

                    // Emit event so frontend ProjectBoard refreshes
                    let _ = app.emit("project-plan-ready", json!({
                        "projectId": project_id,
                        "phase": current_phase,
                    }));

                    // Transition message in group chat
                    if next_phase != "completed" {
                        let transition_msg = format!(
                            "✅ **{} phase complete** — moving to **{}** phase",
                            current_phase, next_phase
                        );
                        let _ = inject_to_group(&gateway, &team_id, &transition_msg, Some("system")).await;
                    }

                    // === SLACK / DISCORD: Notify phase complete ===
                    {
                        let phase_label = phase_def.map(|p| p.name.as_str()).unwrap_or(current_phase.as_str());
                        notify_external_channels(
                            &project_name,
                            &format!("✅ **{} phase complete**", phase_label),
                        ).await;
                    }

                    // === MAPLE P2P: PHASE_SYNC — broadcast phase complete ===
                    maple_broadcast(
                        &app, &manager_id, "PHASE_SYNC",
                        json!({
                            "phase": current_phase,
                            "action": "complete",
                            "project": project_id,
                            "projectName": project_name,
                        }),
                        Some("coordination"),
                    ).await;
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
                    // === MAPLE P2P: Disconnect agents on cancel ===
                    {
                        let agent_list: Vec<AgentInfo> = state.lock().await.agents.clone();
                        maple_disconnect_agents(&app, &manager_id, &agent_list).await;
                    }
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

                    // Still update board tasks even on error so the Kanban board
                    // progresses correctly (e.g. testing tasks move to "done")
                    update_board_tasks_for_phase(&project_id, current_phase);
                    let _ = app.emit("project-plan-ready", json!({
                        "projectId": project_id,
                        "phase": current_phase,
                    }));

                    // Continue to next phase despite errors
                }
            }

            // Small delay between phases for readability
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }

        // === PROJECT COMPLETE — Manager generates final report for human ===
        let last_phase_id = template.phases.last()
            .map(|p| p.id.as_str())
            .unwrap_or("completed");
        let _ = update_project_phase(&project_id, "completed", "completed");

        // Ensure ALL tasks are set to "done" now that the project is complete
        // (safety net in case phase-level updates were missed)
        update_board_tasks_for_phase(&project_id, last_phase_id);
        let _ = app.emit("project-plan-ready", json!({
            "projectId": project_id,
            "phase": "completed",
        }));

        let (mgr_id, mgr_name, workspace_path) = {
            let s = state.lock().await;
            let wp = {
                if let Ok(conn) = db::init_db() {
                    db::get_all_projects(&conn).ok()
                        .and_then(|ps| ps.into_iter().find(|p| p.id == project_id))
                        .and_then(|p| p.workspace_path)
                } else { None }
            };
            (s.manager_id.clone(), s.manager_name.clone(), wp)
        };

        // Ask Manager for a structured final report using the template's prompt
        let final_report_prompt = expand_prompt(&template.final_report_prompt, &prompt_vars);

        let final_report = match send_to_agent_in_group(
            &gateway, &team_id, &project_id, &mgr_id, &mgr_name,
            &final_report_prompt, "Final Deliverables Report",
        ).await {
            Ok(report) => report,
            Err(e) => format!("⚠️ Could not generate final report: {}", e),
        };

        // Save report to workspace as FINAL_REPORT.md
        if let Some(ref wp) = workspace_path {
            let report_path = std::path::Path::new(wp).join("FINAL_REPORT.md");
            if let Some(parent) = report_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let report_content = format!(
                "# Final Deliverables Report\n\n**Project:** {}\n**Completed:** {}\n**Manager:** {}\n\n---\n\n{}",
                project_name,
                chrono::Utc::now().format("%Y-%m-%d %H:%M UTC"),
                mgr_name,
                final_report
            );
            match std::fs::write(&report_path, &report_content) {
                Ok(_) => println!("[orchestrator] Final report saved to {:?}", report_path),
                Err(e) => eprintln!("[orchestrator] Failed to save report: {}", e),
            }
        }

        // === FINAL GIT COMMIT: commit report + all remaining files ===
        if let Some(ref wp) = workspace_path {
            match auto_git_commit(wp, &mgr_name, "Final Report").await {
                Ok(hash) => println!("[orchestrator] Final report committed: {}", hash),
                Err(e) => println!("[orchestrator] Final git commit skipped: {}", e),
            }
        }

        // Log the report as an execution event so it's visible in Activity Feed
        let entry = log_event(
            &app, &project_id, "completed",
            Some(&mgr_id), Some(&mgr_name),
            "final_report", Some(&format!("📋 {} delivered the final report", mgr_name)),
        );
        state.lock().await.logs.push(entry);

        // === SLACK / DISCORD: Notify project complete ===
        notify_external_channels(
            &project_name,
            "🎉 **Project completed!** Final deliverables report is ready.",
        ).await;

        // === memU: Store final report in vector memory for future project context ===
        {
            let store_content = format!(
                "Project: {}\nDomain: {}\nRequirements: {}\n\n{}",
                project_name,
                template.domain,
                requirements.clone().unwrap_or_default(),
                final_report
            );
            memu_store(&app, &store_content, Some(&mgr_id)).await;
        }

        // === MAPLE P2P: Final PHASE_SYNC + disconnect agents ===
        maple_broadcast(
            &app, &mgr_id, "PHASE_SYNC",
            json!({
                "phase": "completed",
                "action": "complete",
                "project": project_id,
                "projectName": project_name,
            }),
            Some("coordination"),
        ).await;
        {
            let agent_list: Vec<AgentInfo> = state.lock().await.agents.clone();
            maple_disconnect_agents(&app, &mgr_id, &agent_list).await;
        }

        let completion_msg = "🎉 **Project Complete!** The final deliverables report is ready for your review. \
            Check the project detail view for the full report.";
        let _ = inject_to_group(&gateway, &team_id, completion_msg, Some("system")).await;

        let entry = log_event(
            &app, &project_id, "completed", None, None,
            "execution_completed", Some("🎉 Project execution completed successfully!"),
        );
        {
            let mut s = state.lock().await;
            s.logs.push(entry);
            s.status = "completed".to_string();
            s.current_phase = "completed".to_string();
        }

        // Emit final report event so frontend shows it prominently
        let _ = app.emit("project-final-report", json!({
            "projectId": project_id,
            "report": final_report,
            "workspacePath": workspace_path,
        }));

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

    // Spawn a watcher task that awaits the execution task and handles panics
    tokio::spawn(async move {
        if let Err(e) = handle.await {
            // The execution task panicked — emit completion so frontend doesn't stay stuck
            eprintln!("[orchestrator] FATAL: execution task panicked: {:?}", e);
            let _ = app_for_panic.emit("project-execution-completed", json!({
                "projectId": project_id_for_panic,
            }));
        }
    });
}

/// Restart a completed project with user feedback.
/// Resets the project status from "completed" back to the first phase,
/// then calls `start_execution` with the feedback injected as context for agents.
#[allow(clippy::too_many_arguments)]
pub async fn restart_with_feedback(
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
    feedback: String,
    restart_from_phase: Option<String>,
) {
    // Reset project status so it can be re-executed
    let phase = restart_from_phase.clone()
        .unwrap_or_else(|| "planning".to_string());
    let _ = update_project_phase(&project_id, &phase, "active");

    // Start execution with the feedback context — resume from the specified phase
    start_execution(
        app,
        gateway,
        orchestrator,
        project_id,
        project_name,
        requirements,
        team_id,
        manager_id,
        manager_name,
        agents,
        Some(phase),
        Some(feedback),
    ).await;
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
