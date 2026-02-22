// System commands - Health, heartbeat, presence

use serde_json::{json, Value};
use crate::gateway_client::GatewayClient;

/// Get gateway health (memory, CPU, version)
#[tauri::command]
pub async fn gateway_health(
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("health", json!({})).await
}

/// Get gateway status summary
#[tauri::command]
pub async fn gateway_status(
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("status", json!({})).await
}

/// Get last heartbeat timestamp
#[tauri::command]
pub async fn last_heartbeat(
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("last-heartbeat", json!({})).await
}

/// Get system presence (which nodes/devices are online)
#[tauri::command]
pub async fn system_presence(
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("system-presence", json!({})).await
}
