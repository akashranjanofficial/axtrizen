// Device commands - Manage paired devices and tokens

use serde_json::{json, Value};
use crate::gateway_client::GatewayClient;

/// List all paired devices
#[tauri::command]
pub async fn device_list(
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("device.pair.list", json!({})).await
}

/// Approve a device pairing request
#[tauri::command]
pub async fn device_approve(
    request_id: String,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("device.pair.approve", json!({ "requestId": request_id })).await
}

/// Reject a device pairing request
#[tauri::command]
pub async fn device_reject(
    request_id: String,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("device.pair.reject", json!({ "requestId": request_id })).await
}

/// Revoke a device token
#[tauri::command]
pub async fn device_revoke(
    device_id: String,
    role: String,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("device.token.revoke", json!({
        "deviceId": device_id,
        "role": role
    })).await
}
