// Configuration commands
// Reads OpenClaw config and gateway token

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenClawConfig {
    pub gateway: Option<GatewayConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayConfig {
    pub auth: Option<AuthConfig>,
    pub port: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub mode: Option<String>,
    pub token: Option<String>,
}

/// Get the gateway token from ~/.openclaw/openclaw.json
/// 
/// This is automatically read from the OpenClaw config file
/// Created during the onboarding process via spawn-agent.sh
#[tauri::command]
pub async fn get_gateway_token() -> Result<Option<String>, String> {
    let config = read_openclaw_config()?;
    
    Ok(config
        .and_then(|c| c.gateway)
        .and_then(|g| g.auth)
        .and_then(|a| a.token))
}

/// Get the full OpenClaw configuration
#[tauri::command]
pub async fn get_openclaw_config() -> Result<Option<OpenClawConfig>, String> {
    read_openclaw_config()
}

/// Read and parse ~/.openclaw/openclaw.json
fn read_openclaw_config() -> Result<Option<OpenClawConfig>, String> {
    let config_path = get_openclaw_config_path()?;
    
    if !config_path.exists() {
        return Ok(None);
    }
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;
    
    let config: OpenClawConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config file: {}", e))?;
    
    Ok(Some(config))
}

/// Get path to ~/.openclaw/openclaw.json
fn get_openclaw_config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir()
        .ok_or("Could not find home directory")?;
    
    Ok(home.join(".openclaw").join("openclaw.json"))
}

/// Check if OpenClaw is configured (has been onboarded)
#[tauri::command]
pub async fn is_openclaw_configured() -> Result<bool, String> {
    let config_path = get_openclaw_config_path()?;
    Ok(config_path.exists())
}
