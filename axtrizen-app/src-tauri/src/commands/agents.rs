// Agent commands - Real OpenClaw Gateway integration
// Replaces mock data with live WebSocket JSON-RPC calls

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use crate::gateway_client::GatewayClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub status: String,
    pub model: Option<String>,
    pub workspace: Option<String>,
    pub emoji: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentFile {
    pub name: String,
    pub exists: bool,
    pub size: Option<u64>,
}

/// Get list of all agents from OpenClaw Gateway
#[tauri::command]
pub async fn get_agents(
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    let result = state.call("agents.list", json!({})).await?;
    
    // Gateway returns { defaultId, mainKey, scope, agents: [{id, name, identity?}] }
    // Frontend expects: [{id, name, status, model, workspace}]
    let agents = result.get("agents")
        .and_then(|a| a.as_array())
        .cloned()
        .unwrap_or_default();
    
    // Reshape each agent to match frontend Agent interface
    let mapped: Vec<Value> = agents.iter().map(|agent| {
        let id = agent.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
        let identity = agent.get("identity");
        let name = agent.get("name")
            .and_then(|v| v.as_str())
            .or_else(|| identity.and_then(|i| i.get("name")).and_then(|v| v.as_str()))
            .unwrap_or(id);
        let model = agent.get("model").and_then(|v| v.as_str());
        let workspace = agent.get("workspace").and_then(|v| v.as_str());
        let emoji = identity.and_then(|i| i.get("emoji")).and_then(|v| v.as_str());
        let agent_type = identity.and_then(|i| i.get("type")).and_then(|v| v.as_str()).unwrap_or("worker");
        
        json!({
            "id": id,
            "name": name,
            "status": "idle",
            "model": model,
            "workspace": workspace,
            "emoji": emoji,
            "type": agent_type
        })
    }).collect();
    
    Ok(json!(mapped))
}

/// Get status of a specific agent
#[tauri::command]
pub async fn get_agent_status(
    agent_id: String,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("agents.list", json!({})).await.map(|result| {
        // Filter to specific agent from the list
        if let Some(agents) = result.get("agents").and_then(|a| a.as_array()) {
            for agent in agents {
                if agent.get("id").and_then(|v| v.as_str()) == Some(&agent_id) {
                    return agent.clone();
                }
            }
        }
        Value::Null
    })
}

/// Create a new agent
#[tauri::command]
pub async fn create_agent(
    name: String,
    role: Option<String>,
    working_dir: Option<String>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    println!("create_agent called with name: {}, role: {:?}, working_dir: {:?}", name, role, working_dir);
    
    let mut params = json!({ "name": name });
    
    // Gateway requires 'workspace' — use provided value or default to ~/.axtrizen/workspaces/<name>
    let workspace = match &working_dir {
        Some(wd) if !wd.trim().is_empty() => wd.clone(),
        _ => {
            let fallback = dirs::home_dir()
                .map(|h| h.join(".axtrizen").join("workspaces").join(&name))
                .unwrap_or_else(|| std::path::PathBuf::from("/tmp").join(&name));
            fallback.to_string_lossy().to_string()
        }
    };
    params["workspace"] = json!(workspace);

    if let Some(r) = &role {
        if !r.trim().is_empty() {
            params["role"] = json!(r);
        }
    }
    
    println!("Calling Gateway with params: {}", params);
    match state.call("agents.create", params).await {
        Ok(v) => {
            println!("Gateway create success: {:?}", v);
            // Return the created agent in the same shape as getAgents returns
            let agent_id = v.get("agentId").and_then(|v| v.as_str()).unwrap_or("unknown");
            let agent_name = v.get("name").and_then(|v| v.as_str()).unwrap_or(&name);
            let workspace = v.get("workspace").and_then(|v| v.as_str()).or(working_dir.as_deref());
            Ok(json!({
                "id": agent_id,
                "name": agent_name,
                "status": "idle",
                "workspace": workspace
            }))
        },
        Err(e) => {
            println!("Gateway create failed: {}", e);
            Err(e)
        }
    }
}

/// Update an existing agent
#[tauri::command]
pub async fn update_agent(
    agent_id: String,
    name: Option<String>,
    model: Option<String>,
    emoji: Option<String>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    let mut params = json!({ "agentId": agent_id });
    if let Some(n) = name {
        params["name"] = json!(n);
    }
    if let Some(m) = model {
        params["model"] = json!(m);
    }
    if let Some(e) = emoji {
        params["emoji"] = json!(e);
    }
    state.call("agents.update", params).await
}

/// Delete an agent
#[tauri::command]
pub async fn delete_agent(
    agent_id: String,
    delete_files: Option<bool>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("agents.delete", json!({
        "agentId": agent_id,
        "deleteFiles": delete_files.unwrap_or(true)
    })).await
}

/// List agent files (SOUL.md, MEMORY.md, TOOLS.md, etc.)
#[tauri::command]
pub async fn get_agent_files(
    agent_id: String,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("agents.files.list", json!({ "agentId": agent_id })).await
}

/// Get content of a specific agent file
#[tauri::command]
pub async fn get_agent_file(
    agent_id: String,
    filename: String,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("agents.files.get", json!({
        "agentId": agent_id,
        "file": filename
    })).await
}

/// Set content of a specific agent file (e.g., update SOUL.md)
#[tauri::command]
pub async fn set_agent_file(
    agent_id: String,
    filename: String,
    content: String,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("agents.files.set", json!({
        "agentId": agent_id,
        "file": filename,
        "content": content
    })).await
}
