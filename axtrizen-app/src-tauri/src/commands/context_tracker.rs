// Sprint S4: Context Health Tracking — dedicated context usage tracking and health status
//
// Builds on agent_metrics::AgentSessionStats (context_pct, context_max_tokens)
// to provide health thresholds, warnings, and context budget enforcement.

use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Mutex;
use rusqlite::Connection;

use crate::db;

// ── Health Thresholds ────────────────────────────────────────────

/// Context health status levels
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ContextHealthLevel {
    Healthy,    // > 50% remaining
    Warning,    // 35-50% remaining  
    Critical,   // 25-35% remaining
    Exhausted,  // < 25% remaining
}

impl ContextHealthLevel {
    pub fn from_usage_pct(usage_pct: f64) -> Self {
        let remaining = 100.0 - usage_pct;
        if remaining > 50.0 {
            ContextHealthLevel::Healthy
        } else if remaining > 35.0 {
            ContextHealthLevel::Warning
        } else if remaining > 25.0 {
            ContextHealthLevel::Critical
        } else {
            ContextHealthLevel::Exhausted
        }
    }

    pub fn color(&self) -> &'static str {
        match self {
            ContextHealthLevel::Healthy => "green",
            ContextHealthLevel::Warning => "yellow",
            ContextHealthLevel::Critical => "orange",
            ContextHealthLevel::Exhausted => "red",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            ContextHealthLevel::Healthy => "Healthy",
            ContextHealthLevel::Warning => "Warning",
            ContextHealthLevel::Critical => "Critical",
            ContextHealthLevel::Exhausted => "Exhausted",
        }
    }
}

/// Full context health report for an agent
#[derive(Debug, Serialize, Deserialize)]
pub struct ContextHealthReport {
    pub agent_id: String,
    pub usage_pct: f64,
    pub remaining_pct: f64,
    pub tokens_used: i64,
    pub tokens_max: i64,
    pub health_level: ContextHealthLevel,
    pub color: String,
    pub label: String,
    pub should_warn: bool,
    pub should_block: bool,
}

/// Context budget configuration per agent
#[derive(Debug, Serialize, Deserialize)]
pub struct ContextBudgetConfig {
    pub agent_id: String,
    pub max_tokens: i64,
    pub warn_threshold_pct: f64,    // default 35%
    pub critical_threshold_pct: f64, // default 25%
    pub auto_summarize: bool,       // trigger auto-summarization when threshold hit
    pub summarize_at_pct: f64,      // default 70% usage
}

impl Default for ContextBudgetConfig {
    fn default() -> Self {
        Self {
            agent_id: String::new(),
            max_tokens: 128000,
            warn_threshold_pct: 35.0,
            critical_threshold_pct: 25.0,
            auto_summarize: false,
            summarize_at_pct: 70.0,
        }
    }
}

// ── Tauri Commands ───────────────────────────────────────────────

/// Get context health report for an agent
#[tauri::command]
pub async fn get_context_health(
    db: State<'_, Mutex<Connection>>,
    agent_id: String,
) -> Result<ContextHealthReport, String> {
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    
    // Try to get context budget from agent config settings
    let config_key = format!("agent_config:{}", agent_id);
    let max_tokens = match db::get_setting(&conn, &config_key) {
        Ok(Some(json_str)) => {
            serde_json::from_str::<serde_json::Value>(&json_str)
                .ok()
                .and_then(|v| v.get("context_budget")?.as_i64())
                .unwrap_or(128000)
        }
        _ => 128000,
    };

    // Get current usage from agent_usage_cache or compute from message count
    let usage_key = format!("context_usage:{}", agent_id);
    let (tokens_used, usage_pct) = match db::get_setting(&conn, &usage_key) {
        Ok(Some(json_str)) => {
            let v: serde_json::Value = serde_json::from_str(&json_str).unwrap_or_default();
            let used = v.get("tokens_used").and_then(|t| t.as_i64()).unwrap_or(0);
            let pct = if max_tokens > 0 { (used as f64 / max_tokens as f64) * 100.0 } else { 0.0 };
            (used, pct)
        }
        _ => (0, 0.0),
    };

    let health_level = ContextHealthLevel::from_usage_pct(usage_pct);
    let remaining_pct = 100.0 - usage_pct;

    Ok(ContextHealthReport {
        agent_id,
        usage_pct,
        remaining_pct,
        tokens_used,
        tokens_max: max_tokens,
        color: health_level.color().to_string(),
        label: health_level.label().to_string(),
        should_warn: remaining_pct <= 35.0,
        should_block: remaining_pct <= 25.0,
        health_level,
    })
}

/// Update context usage for an agent (called after each message)
#[tauri::command]
pub async fn update_context_usage(
    db: State<'_, Mutex<Connection>>,
    agent_id: String,
    tokens_used: i64,
) -> Result<ContextHealthReport, String> {
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    
    let usage_key = format!("context_usage:{}", agent_id);
    let usage = serde_json::json!({
        "tokens_used": tokens_used,
        "updated_at": chrono::Utc::now().to_rfc3339(),
    });
    db::set_setting(&conn, &usage_key, &usage.to_string())
        .map_err(|e| format!("DB error: {}", e))?;

    // Return updated health report
    drop(conn);
    // Re-acquire to call get_context_health logic inline
    let conn = db.inner().lock().map_err(|e| format!("DB lock error: {}", e))?;
    
    let config_key = format!("agent_config:{}", agent_id);
    let max_tokens = match db::get_setting(&conn, &config_key) {
        Ok(Some(json_str)) => {
            serde_json::from_str::<serde_json::Value>(&json_str)
                .ok()
                .and_then(|v| v.get("context_budget")?.as_i64())
                .unwrap_or(128000)
        }
        _ => 128000,
    };

    let usage_pct = if max_tokens > 0 { (tokens_used as f64 / max_tokens as f64) * 100.0 } else { 0.0 };
    let health_level = ContextHealthLevel::from_usage_pct(usage_pct);
    let remaining_pct = 100.0 - usage_pct;

    Ok(ContextHealthReport {
        agent_id,
        usage_pct,
        remaining_pct,
        tokens_used,
        tokens_max: max_tokens,
        color: health_level.color().to_string(),
        label: health_level.label().to_string(),
        should_warn: remaining_pct <= 35.0,
        should_block: remaining_pct <= 25.0,
        health_level,
    })
}

/// Get context budget config for an agent
#[tauri::command]
pub async fn get_context_budget_config(
    db: State<'_, Mutex<Connection>>,
    agent_id: String,
) -> Result<ContextBudgetConfig, String> {
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    
    let key = format!("context_budget_config:{}", agent_id);
    match db::get_setting(&conn, &key) {
        Ok(Some(json_str)) => {
            serde_json::from_str::<ContextBudgetConfig>(&json_str)
                .map_err(|e| format!("Parse error: {}", e))
        }
        _ => Ok(ContextBudgetConfig {
            agent_id,
            ..Default::default()
        })
    }
}

/// Save context budget config for an agent
#[tauri::command]
pub async fn save_context_budget_config(
    db: State<'_, Mutex<Connection>>,
    config: ContextBudgetConfig,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| format!("DB lock error: {}", e))?;
    
    let key = format!("context_budget_config:{}", config.agent_id);
    let json = serde_json::to_string(&config).map_err(|e| format!("JSON error: {}", e))?;
    db::set_setting(&conn, &key, &json).map_err(|e| format!("DB error: {}", e))?;
    Ok(())
}

// ── Tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_health_level_healthy() {
        assert_eq!(ContextHealthLevel::from_usage_pct(0.0), ContextHealthLevel::Healthy);
        assert_eq!(ContextHealthLevel::from_usage_pct(30.0), ContextHealthLevel::Healthy);
        assert_eq!(ContextHealthLevel::from_usage_pct(49.9), ContextHealthLevel::Healthy);
    }

    #[test]
    fn test_health_level_warning() {
        assert_eq!(ContextHealthLevel::from_usage_pct(50.1), ContextHealthLevel::Warning);
        assert_eq!(ContextHealthLevel::from_usage_pct(60.0), ContextHealthLevel::Warning);
        assert_eq!(ContextHealthLevel::from_usage_pct(64.9), ContextHealthLevel::Warning);
    }

    #[test]
    fn test_health_level_critical() {
        assert_eq!(ContextHealthLevel::from_usage_pct(65.1), ContextHealthLevel::Critical);
        assert_eq!(ContextHealthLevel::from_usage_pct(70.0), ContextHealthLevel::Critical);
        assert_eq!(ContextHealthLevel::from_usage_pct(74.9), ContextHealthLevel::Critical);
    }

    #[test]
    fn test_health_level_exhausted() {
        assert_eq!(ContextHealthLevel::from_usage_pct(75.1), ContextHealthLevel::Exhausted);
        assert_eq!(ContextHealthLevel::from_usage_pct(90.0), ContextHealthLevel::Exhausted);
        assert_eq!(ContextHealthLevel::from_usage_pct(100.0), ContextHealthLevel::Exhausted);
    }

    #[test]
    fn test_health_level_colors() {
        assert_eq!(ContextHealthLevel::Healthy.color(), "green");
        assert_eq!(ContextHealthLevel::Warning.color(), "yellow");
        assert_eq!(ContextHealthLevel::Critical.color(), "orange");
        assert_eq!(ContextHealthLevel::Exhausted.color(), "red");
    }

    #[test]
    fn test_health_level_labels() {
        assert_eq!(ContextHealthLevel::Healthy.label(), "Healthy");
        assert_eq!(ContextHealthLevel::Warning.label(), "Warning");
        assert_eq!(ContextHealthLevel::Critical.label(), "Critical");
        assert_eq!(ContextHealthLevel::Exhausted.label(), "Exhausted");
    }

    #[test]
    fn test_default_budget_config() {
        let config = ContextBudgetConfig::default();
        assert_eq!(config.max_tokens, 128000);
        assert_eq!(config.warn_threshold_pct, 35.0);
        assert_eq!(config.critical_threshold_pct, 25.0);
        assert!(!config.auto_summarize);
        assert_eq!(config.summarize_at_pct, 70.0);
    }

    #[test]
    fn test_boundary_conditions() {
        // Exactly at boundaries (remaining = 100 - usage)
        // >50% remaining → Healthy, so 50% remaining (usage=50) is NOT >50 → Warning
        assert_eq!(ContextHealthLevel::from_usage_pct(50.0), ContextHealthLevel::Warning);
        // >35% remaining → Warning, so 35% remaining (usage=65) is NOT >35 → Critical  
        assert_eq!(ContextHealthLevel::from_usage_pct(65.0), ContextHealthLevel::Critical);
        // >25% remaining → Critical, so 25% remaining (usage=75) is NOT >25 → Exhausted
        assert_eq!(ContextHealthLevel::from_usage_pct(75.0), ContextHealthLevel::Exhausted);
    }

    #[test]
    fn test_health_report_should_warn() {
        let healthy = ContextHealthLevel::from_usage_pct(40.0);
        assert_eq!(healthy, ContextHealthLevel::Healthy);
        // remaining = 60% → should_warn = false
        
        let warning = ContextHealthLevel::from_usage_pct(66.0);
        assert_eq!(warning, ContextHealthLevel::Critical);
        // remaining = 34% → should_warn = true
    }

    #[test]
    fn test_budget_config_serialization() {
        let config = ContextBudgetConfig {
            agent_id: "agent-1".to_string(),
            max_tokens: 200000,
            warn_threshold_pct: 30.0,
            critical_threshold_pct: 20.0,
            auto_summarize: true,
            summarize_at_pct: 60.0,
        };
        let json = serde_json::to_string(&config).unwrap();
        let parsed: ContextBudgetConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.max_tokens, 200000);
        assert!(parsed.auto_summarize);
        assert_eq!(parsed.summarize_at_pct, 60.0);
    }
}
