// Orchestrator commands — Tauri commands exposed to the frontend

use std::sync::Arc;
use serde_json::{json, Value};

use crate::db;
use crate::gateway_client::GatewayClient;
use crate::orchestrator::{self, OrchestratorState, AgentInfo, ExecutionLogEntry};

/// Start project execution — validates project has a team + manager,
/// resolves agent names, and kicks off the orchestration loop.
#[tauri::command]
pub async fn start_project_execution(
    project_id: String,
    app: tauri::AppHandle,
    gateway: tauri::State<'_, GatewayClient>,
    orchestrator_state: tauri::State<'_, Arc<OrchestratorState>>,
) -> Result<Value, String> {
    // Check if already running
    {
        let running = orchestrator_state.running.read().await;
        if let Some(state) = running.get(&project_id) {
            let s = state.lock().await;
            if s.status == "running" {
                return Err("Project execution is already running".to_string());
            }
        }
    }

    // Fetch project from DB
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let projects = db::get_all_projects(&conn).map_err(|e| e.to_string())?;
    let project = projects.iter().find(|p| p.id == project_id)
        .ok_or_else(|| "Project not found".to_string())?;
    
    let team_id = project.team_id.as_ref()
        .ok_or_else(|| "No team assigned to this project. Please assign a team first.".to_string())?;
    
    // Fetch team and manager
    let teams = db::get_all_teams(&conn).map_err(|e| e.to_string())?;
    let team = teams.iter().find(|t| t.id == *team_id)
        .ok_or_else(|| "Team not found".to_string())?;
    
    let manager_id = team.manager_id.as_ref()
        .ok_or_else(|| "No manager assigned to the team. Please set a team manager first.".to_string())?;
    
    // Fetch team members
    let members = db::get_team_members(&conn, team_id).map_err(|e| e.to_string())?;
    if members.is_empty() {
        return Err("Team has no members. Please add agents to the team first.".to_string());
    }

    // Resolve agent names from Gateway
    let agents_result = gateway.call("agents.list", json!({})).await?;
    let gateway_agents = agents_result.get("agents")
        .and_then(|a| a.as_array())
        .cloned()
        .unwrap_or_default();

    // Build a map: agent_id -> name
    let mut agent_name_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for agent in &gateway_agents {
        let id = agent.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
        let identity = agent.get("identity");
        let name = agent.get("name")
            .and_then(|v| v.as_str())
            .or_else(|| identity.and_then(|i| i.get("name")).and_then(|v| v.as_str()))
            .unwrap_or(id);
        agent_name_map.insert(id.to_string(), name.to_string());
    }

    // Resolve manager name
    let manager_name = agent_name_map.get(manager_id)
        .cloned()
        .unwrap_or_else(|| manager_id.clone());

    // Build agent list (exclude manager from workers)
    let agents: Vec<AgentInfo> = members.iter()
        .filter(|m| m.agent_id != *manager_id)
        .map(|m| AgentInfo {
            id: m.agent_id.clone(),
            name: agent_name_map.get(&m.agent_id)
                .cloned()
                .unwrap_or_else(|| m.agent_id.clone()),
        })
        .collect();

    if agents.is_empty() {
        return Err("Team has no worker agents (only a manager). Add at least one more agent.".to_string());
    }

    // Clone the gateway for the background task
    let gateway_clone = gateway.clone_for_task();

    // Start execution
    orchestrator::start_execution(
        app,
        gateway_clone,
        Arc::clone(&orchestrator_state),
        project_id.clone(),
        project.name.clone(),
        project.description.clone(),
        team_id.clone(),
        manager_id.clone(),
        manager_name,
        agents,
    ).await;

    Ok(json!({
        "status": "started",
        "projectId": project_id,
    }))
}

/// Stop a running project execution
#[tauri::command]
pub async fn stop_project_execution(
    project_id: String,
    orchestrator_state: tauri::State<'_, Arc<OrchestratorState>>,
) -> Result<Value, String> {
    let flags = orchestrator_state.cancel_flags.read().await;
    if let Some(flag) = flags.get(&project_id) {
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
        Ok(json!({ "status": "stopping", "projectId": project_id }))
    } else {
        Err("No running execution found for this project".to_string())
    }
}

/// Get the current execution status and logs for a project
#[tauri::command]
pub async fn get_execution_status(
    project_id: String,
    orchestrator_state: tauri::State<'_, Arc<OrchestratorState>>,
) -> Result<Value, String> {
    // Check in-memory state first
    let running = orchestrator_state.running.read().await;
    if let Some(state) = running.get(&project_id) {
        let s = state.lock().await;
        return Ok(json!({
            "status": s.status,
            "phase": s.current_phase,
            "logs": s.logs,
        }));
    }

    // Fall back to DB logs
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let db_logs = db::get_execution_logs(&conn, &project_id, Some(100))
        .map_err(|e| e.to_string())?;
    
    let logs: Vec<ExecutionLogEntry> = db_logs.into_iter().map(|l| ExecutionLogEntry {
        id: l.id,
        phase: l.phase,
        agent_id: l.agent_id,
        agent_name: l.agent_name,
        event_type: l.event_type,
        content: l.content,
        created_at: l.created_at,
    }).collect();

    Ok(json!({
        "status": "unknown",
        "phase": "unknown",
        "logs": logs,
    }))
}

/// Resume a paused project execution by sending user feedback
#[tauri::command]
pub async fn resume_project_execution(
    project_id: String,
    feedback: String,
    orchestrator_state: tauri::State<'_, Arc<OrchestratorState>>,
) -> Result<Value, String> {
    let channels = orchestrator_state.feedback_channels.read().await;
    if let Some(tx) = channels.get(&project_id) {
        tx.send(feedback).await
            .map_err(|e| format!("Failed to send feedback: {}", e))?;
        Ok(json!({ "status": "resumed", "projectId": project_id }))
    } else {
        Err("No waiting execution found for this project. It may have already completed or not be in a feedback-waiting state.".to_string())
    }
}
