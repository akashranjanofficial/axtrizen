// Usage commands - Token costs and provider status

use serde_json::{json, Value};
use crate::gateway_client::GatewayClient;

/// Get usage cost summary (token counts and USD costs)
#[tauri::command]
pub async fn usage_cost(
    days: Option<u32>,
    start_date: Option<String>,
    end_date: Option<String>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    let mut params = json!({});
    if let Some(d) = days {
        params["days"] = json!(d);
    }
    if let Some(s) = start_date {
        params["startDate"] = json!(s);
    }
    if let Some(e) = end_date {
        params["endDate"] = json!(e);
    }
    state.call("usage.cost", params).await
}

/// Get provider usage status (balances, rate limits)
#[tauri::command]
pub async fn usage_status(
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("usage.status", json!({})).await
}
