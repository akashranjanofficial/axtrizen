// Slack & Discord integration commands
//
// Sprint 6, Epic 7: Webhook-based messaging for agent notifications.
// Uses reqwest for HTTP, stores config in SQLite.

use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::State;

// ── State ─────────────────────────────────────────────────────────────

pub struct IntegrationState {
    pub db: Mutex<Option<Connection>>,
}

impl Default for IntegrationState {
    fn default() -> Self {
        Self {
            db: Mutex::new(None),
        }
    }
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS integration_config (
            platform TEXT PRIMARY KEY,
            webhook_url TEXT NOT NULL,
            bot_token TEXT,
            default_channel TEXT
        );
        CREATE TABLE IF NOT EXISTS integration_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            channel TEXT NOT NULL,
            content TEXT NOT NULL,
            direction TEXT NOT NULL DEFAULT 'outgoing',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )
    .map_err(|e| format!("Integration schema failed: {}", e))
}

fn get_or_init_db(state: &IntegrationState) -> Result<std::sync::MutexGuard<'_, Option<Connection>>, String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    if db.is_none() {
        let dir = dirs::data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("axtrizen");
        std::fs::create_dir_all(&dir).ok();
        let path = dir.join("integrations.db");
        let conn = Connection::open(&path)
            .map_err(|e| format!("Failed to open integrations DB: {}", e))?;
        ensure_schema(&conn)?;
        *db = Some(conn);
    }
    Ok(db)
}

// ── Slack Commands ────────────────────────────────────────────────────

/// Configure Slack webhook + optional bot token
#[tauri::command]
pub async fn slack_configure(
    state: State<'_, IntegrationState>,
    config: Value,
) -> Result<Value, String> {
    let db = get_or_init_db(&state)?;
    let conn = db.as_ref().ok_or("DB not initialized")?;

    let webhook = config["webhookUrl"]
        .as_str()
        .ok_or("webhookUrl is required")?;
    let bot_token = config["botToken"].as_str().unwrap_or("");
    let channel = config["defaultChannel"].as_str().unwrap_or("#general");

    conn.execute(
        "INSERT OR REPLACE INTO integration_config (platform, webhook_url, bot_token, default_channel) VALUES ('slack', ?1, ?2, ?3)",
        params![webhook, bot_token, channel],
    )
    .map_err(|e| format!("Save config failed: {}", e))?;

    Ok(json!({ "status": "ok", "platform": "slack" }))
}

/// Send a message to Slack via webhook
#[tauri::command]
pub async fn slack_send(
    state: State<'_, IntegrationState>,
    channel: String,
    text: String,
    blocks: Option<String>,
    thread_ts: Option<String>,
) -> Result<Value, String> {
    // Extract webhook from DB in a scoped block so MutexGuard is dropped before .await
    let webhook = {
        let db = get_or_init_db(&state)?;
        let conn = db.as_ref().ok_or("DB not initialized")?;
        conn.query_row(
            "SELECT webhook_url FROM integration_config WHERE platform = 'slack'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| "Slack not configured. Call slack_configure first.".to_string())?
    };

    // Build payload
    let mut payload = json!({
        "channel": channel,
        "text": text,
    });

    if let Some(blocks_str) = &blocks {
        if let Ok(parsed) = serde_json::from_str::<Value>(blocks_str) {
            payload["blocks"] = parsed;
        }
    }
    if let Some(ts) = &thread_ts {
        payload["thread_ts"] = json!(ts);
    }

    // Send via webhook (no MutexGuard held here)
    let client = reqwest::Client::new();
    let resp = client
        .post(&webhook)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Slack send failed: {}", e))?;

    let status = resp.status();
    let body = if !status.is_success() {
        resp.text().await.unwrap_or_default()
    } else {
        String::new()
    };

    // Log the message (re-acquire lock)
    {
        let db = get_or_init_db(&state)?;
        let conn = db.as_ref().ok_or("DB not initialized")?;
        conn.execute(
            "INSERT INTO integration_messages (platform, channel, content, direction) VALUES ('slack', ?1, ?2, 'outgoing')",
            params![channel, text],
        ).ok();
    }

    if status.is_success() {
        Ok(json!({ "status": "ok" }))
    } else {
        Err(format!("Slack webhook error ({}): {}", status, body))
    }
}

/// Get Slack connection status
#[tauri::command]
pub async fn slack_status(
    state: State<'_, IntegrationState>,
) -> Result<Value, String> {
    let db = get_or_init_db(&state)?;
    let conn = db.as_ref().ok_or("DB not initialized")?;

    let configured = conn
        .query_row(
            "SELECT COUNT(*) FROM integration_config WHERE platform = 'slack'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    Ok(json!({
        "connected": configured,
        "platform": "slack",
    }))
}

// ── Discord Commands ──────────────────────────────────────────────────

/// Configure Discord webhook
#[tauri::command]
pub async fn discord_configure(
    state: State<'_, IntegrationState>,
    config: Value,
) -> Result<Value, String> {
    let db = get_or_init_db(&state)?;
    let conn = db.as_ref().ok_or("DB not initialized")?;

    let webhook = config["webhookUrl"]
        .as_str()
        .ok_or("webhookUrl is required")?;
    let bot_token = config["botToken"].as_str().unwrap_or("");
    let channel = config["defaultChannel"].as_str().unwrap_or("general");

    conn.execute(
        "INSERT OR REPLACE INTO integration_config (platform, webhook_url, bot_token, default_channel) VALUES ('discord', ?1, ?2, ?3)",
        params![webhook, bot_token, channel],
    )
    .map_err(|e| format!("Save config failed: {}", e))?;

    Ok(json!({ "status": "ok", "platform": "discord" }))
}

/// Send a message to Discord via webhook
#[tauri::command]
pub async fn discord_send(
    state: State<'_, IntegrationState>,
    channel: String,
    text: String,
    blocks: Option<String>,
) -> Result<Value, String> {
    // Extract webhook from DB in scoped block so MutexGuard is dropped before .await
    let webhook = {
        let db = get_or_init_db(&state)?;
        let conn = db.as_ref().ok_or("DB not initialized")?;
        conn.query_row(
            "SELECT webhook_url FROM integration_config WHERE platform = 'discord'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| "Discord not configured. Call discord_configure first.".to_string())?
    };

    // Discord webhook payload
    let mut payload = json!({ "content": text });

    // If blocks are provided, treat them as embeds
    if let Some(blocks_str) = &blocks {
        if let Ok(parsed) = serde_json::from_str::<Value>(blocks_str) {
            if parsed.is_array() {
                payload["embeds"] = parsed;
            }
        }
    }

    let client = reqwest::Client::new();
    let resp = client
        .post(&webhook)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Discord send failed: {}", e))?;

    let status = resp.status();
    let body = if !status.is_success() && status.as_u16() != 204 {
        resp.text().await.unwrap_or_default()
    } else {
        String::new()
    };

    // Log the message (re-acquire lock)
    {
        let db = get_or_init_db(&state)?;
        let conn = db.as_ref().ok_or("DB not initialized")?;
        conn.execute(
            "INSERT INTO integration_messages (platform, channel, content, direction) VALUES ('discord', ?1, ?2, 'outgoing')",
            params![channel, text],
        ).ok();
    }

    if status.is_success() || status.as_u16() == 204 {
        Ok(json!({ "status": "ok" }))
    } else {
        Err(format!("Discord webhook error ({}): {}", status, body))
    }
}

/// Get Discord connection status
#[tauri::command]
pub async fn discord_status(
    state: State<'_, IntegrationState>,
) -> Result<Value, String> {
    let db = get_or_init_db(&state)?;
    let conn = db.as_ref().ok_or("DB not initialized")?;

    let configured = conn
        .query_row(
            "SELECT COUNT(*) FROM integration_config WHERE platform = 'discord'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    Ok(json!({
        "connected": configured,
        "platform": "discord",
    }))
}

/// Handle an incoming mention from Slack or Discord
#[tauri::command]
pub async fn integration_handle_mention(
    platform: String,
    channel: String,
    user: String,
    text: String,
    _timestamp: String,
    _thread_ts: Option<String>,
) -> Result<Value, String> {
    // For now, log the mention and return a default acknowledgement.
    // In production this would route to the appropriate agent.
    Ok(json!({
        "acknowledged": true,
        "platform": platform,
        "from": user,
        "channel": channel,
        "text": text,
        "response": format!("Received mention from {} in {}: '{}'", user, channel, text.chars().take(100).collect::<String>()),
    }))
}
