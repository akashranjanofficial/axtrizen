// Chat commands - Interactive conversation with agents
// Sends messages, retrieves history, aborts runs, injects messages
// + Local SQLite persistence for conversations and messages

use serde_json::{json, Value};
use crate::gateway_client::GatewayClient;
use crate::db;

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

// ==================== Local SQLite Chat Persistence ====================

/// Save a chat message to the local SQLite database
#[tauri::command]
pub fn save_chat_message(
    session_key: String,
    role: String,
    content: String,
    sender_agent_id: Option<String>,
    sender_agent_name: Option<String>,
    label: Option<String>,
    conversation_type: Option<String>,
    agent_id: Option<String>,
    team_id: Option<String>,
    title: Option<String>,
) -> Result<Value, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;

    // Get or create the conversation
    let conv_type = conversation_type.as_deref().unwrap_or("direct");
    let conv_id = db::get_or_create_conversation(
        &conn,
        &session_key,
        conv_type,
        agent_id.as_deref(),
        team_id.as_deref(),
        title.as_deref(),
    )
    .map_err(|e| format!("DB error: {}", e))?;

    // Create and insert the message
    let msg_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let msg = db::DbChatMessage {
        id: msg_id.clone(),
        conversation_id: conv_id.clone(),
        role,
        content,
        sender_agent_id,
        sender_agent_name,
        label,
        metadata: None,
        created_at: now,
    };
    db::insert_chat_message(&conn, &msg).map_err(|e| format!("DB error: {}", e))?;

    Ok(json!({
        "ok": true,
        "messageId": msg_id,
        "conversationId": conv_id
    }))
}

/// Get all conversations, sorted by most recent activity
#[tauri::command]
pub fn get_all_conversations() -> Result<Value, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    let conversations = db::get_all_conversations(&conn)
        .map_err(|e| format!("DB error: {}", e))?;
    Ok(json!({ "conversations": conversations }))
}

/// Get chat messages for a conversation (by session key)
#[tauri::command]
pub fn get_conversation_history(
    session_key: String,
    limit: Option<u32>,
) -> Result<Value, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    let messages = db::get_chat_messages_by_session(&conn, &session_key, limit)
        .map_err(|e| format!("DB error: {}", e))?;
    Ok(json!({ "messages": messages }))
}

/// Search chat messages across all conversations
#[tauri::command]
pub fn search_chat(
    query: String,
    limit: Option<u32>,
) -> Result<Value, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    let messages = db::search_chat_messages(&conn, &query, limit)
        .map_err(|e| format!("DB error: {}", e))?;
    Ok(json!({ "messages": messages }))
}

/// Delete a conversation and all its messages
#[tauri::command]
pub fn delete_conversation(
    conversation_id: String,
) -> Result<Value, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    db::delete_conversation(&conn, &conversation_id)
        .map_err(|e| format!("DB error: {}", e))?;
    Ok(json!({ "ok": true }))
}
