// Settings commands for Tauri IPC
// Manages application preferences and configuration

use serde::{Deserialize, Serialize};
use super::super::db;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub theme: String,
    pub gateway_url: String,
    pub openclaw_path: String,
    pub debug_mode: bool,
    pub auto_reconnect: bool,
    pub window_width: Option<i32>,
    pub window_height: Option<i32>,
}

impl Default for AppSettings {
    fn default() -> Self {
        let default_openclaw = dirs::home_dir()
            .map(|h| h.join("Desktop").join("openclaw").to_string_lossy().to_string())
            .unwrap_or_else(|| "~/Desktop/openclaw".to_string());
        Self {
            theme: "dark".to_string(),
            gateway_url: "ws://127.0.0.1:18789".to_string(),
            openclaw_path: default_openclaw,
            debug_mode: false,
            auto_reconnect: true,
            window_width: None,
            window_height: None,
        }
    }
}

/// Get all application settings
#[tauri::command]
pub async fn get_settings() -> Result<AppSettings, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let settings_map = db::get_all_settings(&conn).map_err(|e| e.to_string())?;
    
    let default_settings = AppSettings::default();
    Ok(AppSettings {
        theme: settings_map.get("theme").cloned().unwrap_or_else(|| "dark".to_string()),
        gateway_url: settings_map.get("gateway_url").cloned().unwrap_or_else(|| "ws://127.0.0.1:18789".to_string()),
        openclaw_path: settings_map.get("openclaw_path").cloned().unwrap_or(default_settings.openclaw_path),
        debug_mode: settings_map.get("debug_mode").map(|v| v == "true").unwrap_or(false),
        auto_reconnect: settings_map.get("auto_reconnect").map(|v| v == "true").unwrap_or(true),
        window_width: settings_map.get("window_width").and_then(|v| v.parse().ok()),
        window_height: settings_map.get("window_height").and_then(|v| v.parse().ok()),
    })
}

/// Update a single setting
#[tauri::command]
pub async fn set_setting(key: String, value: String) -> Result<(), String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

/// Update multiple settings at once
#[tauri::command]
pub async fn update_settings(settings: AppSettings) -> Result<(), String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    
    db::set_setting(&conn, "theme", &settings.theme).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "gateway_url", &settings.gateway_url).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "openclaw_path", &settings.openclaw_path).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "debug_mode", &settings.debug_mode.to_string()).map_err(|e| e.to_string())?;
    db::set_setting(&conn, "auto_reconnect", &settings.auto_reconnect.to_string()).map_err(|e| e.to_string())?;
    
    if let Some(width) = settings.window_width {
        db::set_setting(&conn, "window_width", &width.to_string()).map_err(|e| e.to_string())?;
    }
    if let Some(height) = settings.window_height {
        db::set_setting(&conn, "window_height", &height.to_string()).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// Toggle debug mode
#[tauri::command]
pub async fn toggle_debug_mode() -> Result<bool, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let current = db::get_setting(&conn, "debug_mode")
        .map_err(|e| e.to_string())?
        .map(|v| v == "true")
        .unwrap_or(false);
    
    let new_value = !current;
    db::set_setting(&conn, "debug_mode", &new_value.to_string()).map_err(|e| e.to_string())?;
    
    Ok(new_value)
}

/// Check if debug mode is enabled
#[tauri::command]
pub async fn is_debug_mode() -> Result<bool, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let debug = db::get_setting(&conn, "debug_mode")
        .map_err(|e| e.to_string())?
        .map(|v| v == "true")
        .unwrap_or(false);
    
    Ok(debug)
}
