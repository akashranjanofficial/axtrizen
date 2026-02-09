// Agent commands - Interface with OpenClaw Gateway
// These will be replaced with actual WebSocket calls in Phase 3

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub status: String,
    pub model: Option<String>,
    pub workspace: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub id: String,
    pub status: String,
    pub current_task: Option<String>,
    pub memory_mb: Option<f32>,
}

/// Get list of all agents from OpenClaw Gateway
/// 
/// TODO: Replace with actual WebSocket JSON-RPC call to agents.list
#[tauri::command]
pub async fn get_agents() -> Result<Vec<Agent>, String> {
    // For now, return mock data
    // This will be replaced with OpenClaw Gateway WebSocket call
    Ok(vec![
        Agent {
            id: "agent-1".to_string(),
            name: "Project Manager".to_string(),
            status: "active".to_string(),
            model: Some("claude-4-sonnet".to_string()),
            workspace: Some("/Users/akashranjan/projects".to_string()),
        },
        Agent {
            id: "agent-2".to_string(),
            name: "Senior Developer".to_string(),
            status: "idle".to_string(),
            model: Some("claude-4-sonnet".to_string()),
            workspace: Some("/Users/akashranjan/projects".to_string()),
        },
        Agent {
            id: "agent-3".to_string(),
            name: "QA Engineer".to_string(),
            status: "dormant".to_string(),
            model: Some("claude-4-haiku".to_string()),
            workspace: None,
        },
    ])
}

/// Get status of a specific agent
#[tauri::command]
pub async fn get_agent_status(agent_id: String) -> Result<AgentStatus, String> {
    // Mock implementation
    Ok(AgentStatus {
        id: agent_id,
        status: "active".to_string(),
        current_task: Some("Implementing authentication module".to_string()),
        memory_mb: Some(2.3),
    })
}
