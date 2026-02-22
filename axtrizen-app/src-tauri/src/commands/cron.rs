// Cron commands - Scheduled task management

use serde_json::{json, Value};
use crate::gateway_client::GatewayClient;

/// List all cron jobs
#[tauri::command]
pub async fn cron_list(
    include_disabled: Option<bool>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    let mut params = json!({});
    if let Some(d) = include_disabled {
        params["includeDisabled"] = json!(d);
    }
    state.call("cron.list", params).await
}

/// Add a new cron job
#[tauri::command]
pub async fn cron_add(
    schedule: Value,
    message: String,
    session_key: Option<String>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    let mut params = json!({
        "schedule": schedule,
        "message": message
    });
    if let Some(sk) = session_key {
        params["sessionKey"] = json!(sk);
    }
    state.call("cron.add", params).await
}

/// Update an existing cron job
#[tauri::command]
pub async fn cron_update(
    id: String,
    patch: Value,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("cron.update", json!({
        "id": id,
        "patch": patch
    })).await
}

/// Remove a cron job
#[tauri::command]
pub async fn cron_remove(
    id: String,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("cron.remove", json!({ "id": id })).await
}

/// Manually trigger a cron job
#[tauri::command]
pub async fn cron_run(
    id: String,
    mode: Option<String>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("cron.run", json!({
        "id": id,
        "mode": mode.unwrap_or_else(|| "force".to_string())
    })).await
}

/// Get run history for a cron job
#[tauri::command]
pub async fn cron_runs(
    id: String,
    limit: Option<u32>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    let mut params = json!({ "id": id });
    if let Some(l) = limit {
        params["limit"] = json!(l);
    }
    state.call("cron.runs", params).await
}
