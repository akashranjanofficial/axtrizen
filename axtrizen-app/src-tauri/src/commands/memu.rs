// memU Memory commands — Tauri IPC wrappers for the memU proactive memory system.
//
// These commands let the frontend initialize, memorize, retrieve, list,
// clear, and query stats from the memU memory service — all routed
// through the existing Maple Python sidecar bridge.

use serde_json::{json, Value};
use tauri::State;

use crate::commands::maple::MapleBridgeState;

/// Initialize the memU memory service.
/// Reads LLM config from ~/.openclaw/openclaw.json.
#[tauri::command]
pub async fn memu_init(
    api_key: Option<String>,
    embed_model: Option<String>,
    db_provider: Option<String>,
    state: State<'_, MapleBridgeState>,
) -> Result<Value, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or("Maple broker not started — start it first")?;

    let mut params = json!({});
    if let Some(k) = api_key {
        params["api_key"] = json!(k);
    }
    if let Some(m) = embed_model {
        params["embed_model"] = json!(m);
    }
    if let Some(db) = db_provider {
        params["db_provider"] = json!(db);
    }

    client.call("memu.init", params).await
}

/// Memorize content (conversation, document, code) into memU.
#[tauri::command]
pub async fn memu_memorize(
    content: Option<String>,
    resource_url: Option<String>,
    modality: Option<String>,
    user_id: Option<String>,
    agent_id: Option<String>,
    state: State<'_, MapleBridgeState>,
) -> Result<Value, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or("Maple broker not started")?;

    let mut params = json!({});
    if let Some(c) = content {
        params["content"] = json!(c);
    }
    if let Some(url) = resource_url {
        params["resource_url"] = json!(url);
    }
    params["modality"] = json!(modality.unwrap_or_else(|| "conversation".into()));
    if let Some(uid) = user_id {
        params["user_id"] = json!(uid);
    }
    if let Some(aid) = agent_id {
        params["agent_id"] = json!(aid);
    }

    client.call("memu.memorize", params).await
}

/// Search memU memory using RAG or LLM retrieval.
#[tauri::command]
pub async fn memu_retrieve(
    query: Option<String>,
    queries: Option<Value>,
    method: Option<String>,
    user_id: Option<String>,
    top_k: Option<u32>,
    state: State<'_, MapleBridgeState>,
) -> Result<Value, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or("Maple broker not started")?;

    let mut params = json!({});
    if let Some(q) = query {
        params["query"] = json!(q);
    }
    if let Some(qs) = queries {
        params["queries"] = qs;
    }
    params["method"] = json!(method.unwrap_or_else(|| "rag".into()));
    if let Some(uid) = user_id {
        params["user_id"] = json!(uid);
    }
    if let Some(k) = top_k {
        params["top_k"] = json!(k);
    }

    client.call("memu.retrieve", params).await
}

/// List stored memories and categories.
#[tauri::command]
pub async fn memu_list(
    user_id: Option<String>,
    category: Option<String>,
    state: State<'_, MapleBridgeState>,
) -> Result<Value, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or("Maple broker not started")?;

    let mut params = json!({});
    if let Some(uid) = user_id {
        params["user_id"] = json!(uid);
    }
    if let Some(cat) = category {
        params["category"] = json!(cat);
    }

    client.call("memu.list", params).await
}

/// Clear all memU memories (optionally scoped to a user/agent).
#[tauri::command]
pub async fn memu_clear(
    user_id: Option<String>,
    state: State<'_, MapleBridgeState>,
) -> Result<Value, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or("Maple broker not started")?;

    let mut params = json!({});
    if let Some(uid) = user_id {
        params["user_id"] = json!(uid);
    }

    client.call("memu.clear", params).await
}

/// Get memU memory statistics.
#[tauri::command]
pub async fn memu_stats(
    state: State<'_, MapleBridgeState>,
) -> Result<Value, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or("Maple broker not started")?;
    client.call("memu.stats", json!({})).await
}
