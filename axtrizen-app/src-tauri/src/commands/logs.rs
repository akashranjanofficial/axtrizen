// Log commands - Tail gateway log file

use serde_json::{json, Value};
use crate::gateway_client::GatewayClient;

/// Tail the gateway log file
#[tauri::command]
pub async fn logs_tail(
    cursor: Option<u64>,
    limit: Option<u32>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    let mut params = json!({});
    if let Some(c) = cursor {
        params["cursor"] = json!(c);
    }
    if let Some(l) = limit {
        params["limit"] = json!(l);
    }
    state.call("logs.tail", params).await
}
