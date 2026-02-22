// Skills commands - Manage agent capabilities

use serde_json::{json, Value};
use crate::gateway_client::GatewayClient;

/// Get skill status for an agent
#[tauri::command]
pub async fn skills_status(
    agent_id: Option<String>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    let mut params = json!({});
    if let Some(id) = agent_id {
        params["agentId"] = json!(id);
    }
    state.call("skills.status", params).await
}

/// Update a skill (enable/disable, set API key)
#[tauri::command]
pub async fn skills_update(
    skill_key: String,
    enabled: Option<bool>,
    api_key: Option<String>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    let mut params = json!({ "skillKey": skill_key });
    if let Some(e) = enabled {
        params["enabled"] = json!(e);
    }
    if let Some(k) = api_key {
        params["apiKey"] = json!(k);
    }
    state.call("skills.update", params).await
}

/// Install a new skill
#[tauri::command]
pub async fn skills_install(
    name: String,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    let install_id = uuid::Uuid::new_v4().to_string();
    state.call("skills.install", json!({
        "name": name,
        "installId": install_id
    })).await
}
