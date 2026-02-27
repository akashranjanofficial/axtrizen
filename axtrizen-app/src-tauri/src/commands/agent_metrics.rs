// Agent metrics commands - Usage, activity, and tool call observability

use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::db;
use crate::gateway_client::GatewayClient;

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentUsageResponse {
    pub tokens_in: i64,
    pub tokens_out: i64,
    pub total_tokens: i64,
    pub cost_usd: f64,
    pub model: Option<String>,
    pub last_updated: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentSessionStats {
    pub message_count: i64,
    pub context_pct: f64,
    pub context_max_tokens: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActivityEntry {
    pub id: i64,
    pub action_type: String,
    pub description: Option<String>,
    pub metadata: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolCallEntry {
    pub id: i64,
    pub tool_name: String,
    pub arguments: Option<String>,
    pub result_summary: Option<String>,
    pub duration_ms: Option<i64>,
    pub status: String,
    pub created_at: Option<String>,
}

/// Get agent usage metrics (tokens + cost). Reads from SQLite cache,
/// refreshes from Gateway if stale (>30s).
#[tauri::command]
pub async fn get_agent_usage(
    agent_id: String,
    state: tauri::State<'_, GatewayClient>,
) -> Result<AgentUsageResponse, String> {
    // First, try to get cached data from SQLite
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let cached = db::get_latest_usage_snapshot(&conn, &agent_id)
        .map_err(|e| e.to_string())?;

    // Check if cached data is fresh enough (within 30 seconds)
    let is_stale = cached.as_ref().is_none_or(|snap| {
        snap.snapshot_at.as_ref().is_none_or(|ts| {
            // Simple staleness check: if snapshot_at is older than 30s
            chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S")
                .map_or(true, |parsed| {
                    let now = chrono::Utc::now().naive_utc();
                    (now - parsed).num_seconds() > 30
                })
        })
    });

    if is_stale {
        // Fetch fresh data from Gateway
        match state.call("usage.cost", json!({ "days": 1 })).await {
            Ok(gw_data) => {
                // Extract usage data — the Gateway returns global usage,
                // we store it as-is for the requesting agent
                let tokens_in = gw_data.get("totalInputTokens")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                let tokens_out = gw_data.get("totalOutputTokens")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                let cost = gw_data.get("totalCostUsd")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0);

                // Cache the snapshot
                let snap = db::DbUsageSnapshot {
                    id: None,
                    agent_id: agent_id.clone(),
                    tokens_in,
                    tokens_out,
                    cost_usd: cost,
                    model: None,
                    snapshot_at: None,
                };
                let _ = db::insert_usage_snapshot(&conn, &snap);

                return Ok(AgentUsageResponse {
                    tokens_in,
                    tokens_out,
                    total_tokens: tokens_in + tokens_out,
                    cost_usd: cost,
                    model: None,
                    last_updated: Some(chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()),
                });
            }
            Err(e) => {
                eprintln!("Failed to fetch usage from Gateway: {}", e);
                // Fall through to cached data
            }
        }
    }

    // Return cached data
    match cached {
        Some(snap) => Ok(AgentUsageResponse {
            tokens_in: snap.tokens_in,
            tokens_out: snap.tokens_out,
            total_tokens: snap.tokens_in + snap.tokens_out,
            cost_usd: snap.cost_usd,
            model: snap.model,
            last_updated: snap.snapshot_at,
        }),
        None => Ok(AgentUsageResponse {
            tokens_in: 0,
            tokens_out: 0,
            total_tokens: 0,
            cost_usd: 0.0,
            model: None,
            last_updated: None,
        }),
    }
}

/// Get agent session stats (message count + context window usage)
#[tauri::command]
pub async fn get_agent_session_stats(
    agent_id: String,
    state: tauri::State<'_, GatewayClient>,
) -> Result<AgentSessionStats, String> {
    // Try to get session info from Gateway
    let session_key = format!("agent:{}:main", agent_id);
    match state.call("sessions.preview", json!({ "keys": [session_key] })).await {
        Ok(data) => {
            let sessions = data.get("sessions")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            
            if let Some(session) = sessions.first() {
                let msg_count = session.get("messageCount")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                let tokens = session.get("tokenCount")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                
                // Default context window of 128K tokens
                let max_tokens: i64 = 128_000;
                let pct = if max_tokens > 0 {
                    ((tokens as f64 / max_tokens as f64) * 100.0).min(100.0)
                } else {
                    0.0
                };

                Ok(AgentSessionStats {
                    message_count: msg_count,
                    context_pct: pct,
                    context_max_tokens: max_tokens,
                })
            } else {
                Ok(AgentSessionStats {
                    message_count: 0,
                    context_pct: 0.0,
                    context_max_tokens: 128_000,
                })
            }
        }
        Err(_) => {
            // Fallback: count messages from SQLite
            let conn = db::init_db().map_err(|e| e.to_string())?;
            let session_key = format!("agent:{}:main", agent_id);
            let msgs = db::get_chat_messages_by_session(&conn, &session_key, None)
                .map_err(|e| e.to_string())?;
            
            Ok(AgentSessionStats {
                message_count: msgs.len() as i64,
                context_pct: 0.0,
                context_max_tokens: 128_000,
            })
        }
    }
}

/// Get recent agent activity
#[tauri::command]
pub async fn get_agent_activity(
    agent_id: String,
    limit: Option<u32>,
) -> Result<Vec<ActivityEntry>, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let rows = db::get_recent_activity(&conn, &agent_id, limit.unwrap_or(20))
        .map_err(|e| e.to_string())?;
    
    Ok(rows.into_iter().map(|(id, _agent_id, action_type, description, metadata, created_at)| {
        ActivityEntry {
            id,
            action_type,
            description,
            metadata,
            created_at,
        }
    }).collect())
}

/// Get recent tool calls for an agent
#[tauri::command]
pub async fn get_agent_tool_calls(
    agent_id: String,
    limit: Option<u32>,
) -> Result<Vec<ToolCallEntry>, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let rows = db::get_recent_tool_calls(&conn, &agent_id, limit.unwrap_or(10))
        .map_err(|e| e.to_string())?;
    
    Ok(rows.into_iter().map(|tc| ToolCallEntry {
        id: tc.id.unwrap_or(0),
        tool_name: tc.tool_name,
        arguments: tc.arguments,
        result_summary: tc.result_summary,
        duration_ms: tc.duration_ms,
        status: tc.status,
        created_at: tc.created_at,
    }).collect())
}

/// Log an agent activity entry
#[tauri::command]
pub async fn log_agent_activity(
    agent_id: String,
    action_type: String,
    description: Option<String>,
    metadata: Option<String>,
) -> Result<(), String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    db::insert_agent_activity(
        &conn,
        &agent_id,
        &action_type,
        description.as_deref(),
        metadata.as_deref(),
    ).map_err(|e| e.to_string())
}

/// Log a tool call for an agent
#[tauri::command]
pub async fn log_agent_tool_call(
    agent_id: String,
    tool_name: String,
    arguments: Option<String>,
    result_summary: Option<String>,
    duration_ms: Option<i64>,
    status: Option<String>,
) -> Result<(), String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    db::insert_tool_call(&conn, &db::DbToolCall {
        id: None,
        agent_id,
        tool_name,
        arguments,
        result_summary,
        duration_ms,
        status: status.unwrap_or_else(|| "success".to_string()),
        created_at: None,
    }).map_err(|e| e.to_string())
}
