// Chat commands - Interactive conversation with agents
// Sends messages, retrieves history, aborts runs, injects messages

use serde_json::{json, Value};
use crate::gateway_client::GatewayClient;

/// Send a chat message to an agent session
#[tauri::command]
pub async fn chat_send(
    session_key: String,
    message: String,
    thinking: Option<String>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    let idempotency_key = uuid::Uuid::new_v4().to_string();
    let mut params = json!({
        "sessionKey": session_key,
        "message": message,
        "idempotencyKey": idempotency_key
    });
    if let Some(t) = thinking {
        params["thinking"] = json!(t);
    }
    state.call("chat.send", params).await
}

/// Get chat history for a session
#[tauri::command]
pub async fn chat_history(
    session_key: String,
    limit: Option<u32>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    let mut params = json!({ "sessionKey": session_key });
    if let Some(l) = limit {
        params["limit"] = json!(l);
    }
    state.call("chat.history", params).await
}

/// Abort an active chat run
#[tauri::command]
pub async fn chat_abort(
    session_key: String,
    run_id: Option<String>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    let mut params = json!({ "sessionKey": session_key });
    if let Some(r) = run_id {
        params["runId"] = json!(r);
    }
    state.call("chat.abort", params).await
}

/// Inject a message into a session transcript (without triggering an agent run)
#[tauri::command]
pub async fn chat_inject(
    session_key: String,
    message: String,
    label: Option<String>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    let mut params = json!({
        "sessionKey": session_key,
        "message": message
    });
    if let Some(l) = label {
        params["label"] = json!(l);
    }
    state.call("chat.inject", params).await
}
