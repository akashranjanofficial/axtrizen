// Session commands - Browse, configure, reset, and delete conversations

use serde_json::{json, Value};
use crate::gateway_client::GatewayClient;

/// List all sessions
#[tauri::command]
pub async fn sessions_list(
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("sessions.list", json!({})).await
}

/// Preview messages for specific sessions
#[tauri::command]
pub async fn sessions_preview(
    keys: Vec<String>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("sessions.preview", json!({ "keys": keys })).await
}

/// Patch a session (change model, thinking level, etc.)
#[tauri::command]
pub async fn sessions_patch(
    key: String,
    patch: Value,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("sessions.patch", json!({
        "key": key,
        "patch": patch
    })).await
}

/// Reset a session (clear history, start fresh)
#[tauri::command]
pub async fn sessions_reset(
    key: String,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("sessions.reset", json!({ "key": key })).await
}

/// Delete a session permanently
#[tauri::command]
pub async fn sessions_delete(
    key: String,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("sessions.delete", json!({ "key": key })).await
}
