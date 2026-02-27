// Agent Groups commands — Phase 3: Smart Group Communication
// CRUD for agent groups (sub-teams/channels) within teams.

use serde_json::json;
use crate::db;

/// Create a new agent group within a team
#[tauri::command]
pub async fn create_agent_group(
    team_id: String,
    name: String,
    description: Option<String>,
) -> Result<serde_json::Value, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let maple_topic = format!("team:{}:group:{}", team_id, name.to_lowercase().replace(' ', "-"));

    db::create_agent_group(
        &conn, &id, &team_id, &name,
        description.as_deref(),
        &maple_topic,
    ).map_err(|e| e.to_string())?;

    Ok(json!({
        "id": id,
        "teamId": team_id,
        "name": name,
        "mapleTopic": maple_topic,
    }))
}

/// Get all groups for a team
#[tauri::command]
pub async fn get_agent_groups(team_id: String) -> Result<serde_json::Value, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let groups = db::get_agent_groups(&conn, &team_id).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(groups).unwrap_or_default())
}

/// Add an agent to a group
#[tauri::command]
pub async fn add_agent_to_group(group_id: String, agent_id: String) -> Result<String, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    db::add_agent_to_group(&conn, &group_id, &agent_id).map_err(|e| e.to_string())?;
    Ok("ok".to_string())
}

/// Remove an agent from a group
#[tauri::command]
pub async fn remove_agent_from_group(group_id: String, agent_id: String) -> Result<String, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    db::remove_agent_from_group(&conn, &group_id, &agent_id).map_err(|e| e.to_string())?;
    Ok("ok".to_string())
}

/// Get members of a group
#[tauri::command]
pub async fn get_group_members(group_id: String) -> Result<Vec<String>, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    db::get_group_members(&conn, &group_id).map_err(|e| e.to_string())
}

/// Send a message to a group channel
#[tauri::command]
pub async fn send_group_message(
    group_id: String,
    sender_id: String,
    sender_type: String,
    content: String,
    message_type: Option<String>,
) -> Result<String, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let msg_id = uuid::Uuid::new_v4().to_string();
    let msg_type = message_type.as_deref().unwrap_or("chat");

    db::insert_group_message(&conn, &msg_id, &group_id, &sender_id, &sender_type, &content, msg_type)
        .map_err(|e| e.to_string())?;

    Ok(msg_id)
}

/// Get messages from a group channel
#[tauri::command]
pub async fn get_group_messages(group_id: String, limit: Option<i32>) -> Result<Vec<serde_json::Value>, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    db::get_group_messages(&conn, &group_id, limit).map_err(|e| e.to_string())
}

/// Delete a group
#[tauri::command]
pub async fn delete_agent_group(group_id: String) -> Result<String, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    db::delete_agent_group(&conn, &group_id).map_err(|e| e.to_string())?;
    Ok("ok".to_string())
}
