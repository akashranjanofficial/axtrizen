/// Gateway Bridge — Enriches S11-S20 local data with live gateway metrics
///
/// Provides gateway-aware versions of key commands that merge:
/// - Local SQLite configuration/settings (S11-S20 modules)
/// - Live runtime data from the OpenClaw Gateway (usage, health, metrics)
///
/// When the gateway is offline, gracefully falls back to local-only data.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db;
use crate::gateway_client::GatewayClient;

// ─── Response Types ─────────────────────────────────────────────

/// Combined gateway health + local enterprise config
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayHealthReport {
    pub connected: bool,
    pub gateway_version: Option<String>,
    pub uptime_seconds: Option<u64>,
    pub memory_mb: Option<f64>,
    pub cpu_pct: Option<f64>,
    pub active_agents: Option<u32>,
    pub active_sessions: Option<u32>,
    pub last_error: Option<String>,
}

impl Default for GatewayHealthReport {
    fn default() -> Self {
        Self {
            connected: false,
            gateway_version: None,
            uptime_seconds: None,
            memory_mb: None,
            cpu_pct: None,
            active_agents: None,
            active_sessions: None,
            last_error: Some("Gateway not connected".into()),
        }
    }
}

/// Live usage data from gateway merged with local DB summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveUsageData {
    /// Whether the live data came from the gateway or is local-only
    pub source: UsageDataSource,
    /// Total cost in USD (from gateway if available, else local DB)
    pub total_cost_usd: f64,
    /// Total tokens used
    pub total_tokens: u64,
    /// Total API calls
    pub total_api_calls: u64,
    /// Per-model breakdown from gateway (if available)
    pub models: Vec<GatewayModelUsage>,
    /// Budget status against configured limits
    pub budget_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UsageDataSource {
    Gateway,
    LocalDb,
    Fallback,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayModelUsage {
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub cost_usd: f64,
    pub request_count: u64,
}

/// Agent metrics enriched with gateway runtime data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrichedAgentMetrics {
    pub agent_id: String,
    pub agent_name: String,
    /// From gateway: live token usage
    pub tokens_in: i64,
    pub tokens_out: i64,
    pub total_tokens: i64,
    pub cost_usd: f64,
    /// From gateway: session info
    pub message_count: i64,
    pub context_pct: f64,
    /// From local DB: computed score
    pub composite_score: Option<f64>,
    pub star_rating: Option<u8>,
    /// Source indicators
    pub gateway_connected: bool,
}

/// System-wide status combining gateway + local state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemOverview {
    pub gateway: GatewayHealthReport,
    pub db_status: DbStatus,
    pub total_projects: u32,
    pub total_agents: u32,
    pub orchestrator_running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbStatus {
    pub accessible: bool,
    pub path: String,
    pub tables_count: u32,
}

// ─── Helper Functions ───────────────────────────────────────────

/// Parse gateway health response into structured report
fn parse_health_response(val: &Value) -> GatewayHealthReport {
    GatewayHealthReport {
        connected: true,
        gateway_version: val.get("version")
            .or_else(|| val.get("server").and_then(|s| s.get("version")))
            .and_then(|v| v.as_str())
            .map(String::from),
        uptime_seconds: val.get("uptime")
            .or_else(|| val.get("uptimeSeconds"))
            .and_then(|v| v.as_u64()),
        memory_mb: val.get("memory")
            .and_then(|m| m.get("heapUsedMB").or_else(|| m.get("rss")))
            .and_then(|v| v.as_f64()),
        cpu_pct: val.get("cpu")
            .and_then(|c| c.get("percent").or_else(|| c.get("pct")))
            .and_then(|v| v.as_f64()),
        active_agents: val.get("agents")
            .and_then(|a| a.get("count").or_else(|| a.get("active")))
            .and_then(|v| v.as_u64())
            .map(|v| v as u32),
        active_sessions: val.get("sessions")
            .and_then(|s| s.get("count").or_else(|| s.get("active")))
            .and_then(|v| v.as_u64())
            .map(|v| v as u32),
        last_error: None,
    }
}

/// Parse gateway usage.cost response into live usage data
fn parse_usage_response(val: &Value) -> (f64, u64, Vec<GatewayModelUsage>) {
    let total_cost = val.get("totalCost")
        .or_else(|| val.get("cost"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let total_tokens = val.get("totalTokens")
        .and_then(|v| v.as_u64())
        .unwrap_or_else(|| {
            let input = val.get("totalInputTokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let output = val.get("totalOutputTokens").and_then(|v| v.as_u64()).unwrap_or(0);
            input + output
        });

    let mut models = Vec::new();
    if let Some(by_model) = val.get("byModel").and_then(|v| v.as_object()) {
        for (model_name, model_data) in by_model {
            let input = model_data.get("inputTokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let output = model_data.get("outputTokens").and_then(|v| v.as_u64()).unwrap_or(0);
            models.push(GatewayModelUsage {
                model: model_name.clone(),
                input_tokens: input,
                output_tokens: output,
                total_tokens: input + output,
                cost_usd: model_data.get("cost").and_then(|v| v.as_f64()).unwrap_or(0.0),
                request_count: model_data.get("requests").and_then(|v| v.as_u64()).unwrap_or(0),
            });
        }
    }

    (total_cost, total_tokens, models)
}

// ─── Tauri Commands ─────────────────────────────────────────────

/// Get live gateway health report.
/// Returns structured health data if connected, or a default "disconnected" report.
#[tauri::command]
pub async fn get_gateway_health_report(
    state: tauri::State<'_, GatewayClient>,
) -> Result<GatewayHealthReport, String> {
    if !state.is_connected().await {
        return Ok(GatewayHealthReport::default());
    }

    match state.call("health", json!({})).await {
        Ok(val) => Ok(parse_health_response(&val)),
        Err(e) => Ok(GatewayHealthReport {
            connected: false,
            last_error: Some(e),
            ..Default::default()
        }),
    }
}

/// Get live usage data, merging gateway real-time metrics with local DB budget config.
/// Falls back gracefully to local DB data when gateway is offline.
#[tauri::command]
pub async fn get_live_usage(
    state: tauri::State<'_, GatewayClient>,
) -> Result<LiveUsageData, String> {
    // Always get local budget config for status calculation
    let budget = if let Ok(conn) = db::init_db() {
        db::get_budget_config_db(&conn)
            .map(|(tid, budget, soft, hard)| super::usage_dashboard::BudgetConfig {
                team_id: tid,
                monthly_budget_usd: budget,
                soft_limit_pct: soft,
                hard_limit_pct: hard,
            })
            .unwrap_or_default()
    } else {
        super::usage_dashboard::BudgetConfig::default()
    };

    // Try gateway first
    if state.is_connected().await {
        if let Ok(val) = state.call("usage.cost", json!({ "days": 30 })).await {
            let (total_cost, total_tokens, models) = parse_usage_response(&val);
            let total_calls = models.iter().map(|m| m.request_count).sum::<u64>();

            let status = super::usage_dashboard::check_budget_status(
                total_cost,
                &budget,
            );

            return Ok(LiveUsageData {
                source: UsageDataSource::Gateway,
                total_cost_usd: total_cost,
                total_tokens,
                total_api_calls: total_calls,
                models,
                budget_status: format!("{:?}", status),
            });
        }
    }

    // Fall back to local DB
    if let Ok(conn) = db::init_db() {
        if let Ok((total_cost, total_tokens, total_calls, _teams, db_models)) =
            db::get_usage_summary_db(&conn, "2025-01")
        {
            let models = db_models
                .into_iter()
                .map(|(name, cost, tokens, calls)| GatewayModelUsage {
                    model: name,
                    input_tokens: 0,
                    output_tokens: 0,
                    total_tokens: tokens as u64,
                    cost_usd: cost,
                    request_count: calls as u64,
                })
                .collect();

            let status = super::usage_dashboard::check_budget_status(total_cost, &budget);

            return Ok(LiveUsageData {
                source: UsageDataSource::LocalDb,
                total_cost_usd: total_cost,
                total_tokens: total_tokens as u64,
                total_api_calls: total_calls as u64,
                models,
                budget_status: format!("{:?}", status),
            });
        }
    }

    // Ultimate fallback
    Ok(LiveUsageData {
        source: UsageDataSource::Fallback,
        total_cost_usd: 0.0,
        total_tokens: 0,
        total_api_calls: 0,
        models: vec![],
        budget_status: "Normal".into(),
    })
}

/// Get enriched agent metrics combining gateway runtime data with local scores.
/// Falls back to local DB only when gateway is offline.
#[tauri::command]
pub async fn get_enriched_agent_metrics(
    agent_id: String,
    state: tauri::State<'_, GatewayClient>,
) -> Result<EnrichedAgentMetrics, String> {
    let gateway_connected = state.is_connected().await;

    // Try to get live data from gateway
    let (tokens_in, tokens_out, cost, msg_count, context_pct) = if gateway_connected {
        let usage = state
            .call("usage.cost", json!({ "days": 1 }))
            .await
            .unwrap_or(json!({}));

        let input = usage.get("totalInputTokens").and_then(|v| v.as_i64()).unwrap_or(0);
        let output = usage.get("totalOutputTokens").and_then(|v| v.as_i64()).unwrap_or(0);
        let cost = usage.get("totalCost").and_then(|v| v.as_f64()).unwrap_or(0.0);

        // Get session stats
        let sessions = state
            .call("sessions.list", json!({}))
            .await
            .unwrap_or(json!({}));
        let msg_count = sessions
            .get("sessions")
            .and_then(|s| s.as_array())
            .map(|arr| arr.len() as i64)
            .unwrap_or(0);

        (input, output, cost, msg_count, 0.0)
    } else {
        // Try local DB cache
        if let Ok(conn) = db::init_db() {
            let snap = db::get_latest_usage_snapshot(&conn, &agent_id)
                .unwrap_or(None);
            if let Some(s) = snap {
                (s.tokens_in, s.tokens_out, s.cost_usd, 0, 0.0)
            } else {
                (0, 0, 0.0, 0, 0.0)
            }
        } else {
            (0, 0, 0.0, 0, 0.0)
        }
    };

    // Get local score data
    let (composite_score, star_rating) = if let Ok(conn) = db::init_db() {
        let history = db::get_agent_score_history(&conn, &agent_id).unwrap_or_default();
        if let Some(latest) = history.first() {
            (Some(latest.2), Some(latest.3))
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    // Get agent name from gateway or use ID
    let agent_name = if gateway_connected {
        state
            .call("agents.list", json!({}))
            .await
            .ok()
            .and_then(|v| {
                v.get("agents")
                    .and_then(|a| a.as_array())
                    .and_then(|arr| {
                        arr.iter().find(|a| {
                            a.get("id").and_then(|id| id.as_str()) == Some(&agent_id)
                        })
                    })
                    .and_then(|a| a.get("name").and_then(|n| n.as_str()))
                    .map(String::from)
            })
            .unwrap_or_else(|| agent_id.clone())
    } else {
        agent_id.clone()
    };

    Ok(EnrichedAgentMetrics {
        agent_id,
        agent_name,
        tokens_in,
        tokens_out,
        total_tokens: tokens_in + tokens_out,
        cost_usd: cost,
        message_count: msg_count,
        context_pct,
        composite_score,
        star_rating,
        gateway_connected,
    })
}

/// Get a system-wide overview combining gateway health + local DB status.
#[tauri::command]
pub async fn get_system_overview(
    state: tauri::State<'_, GatewayClient>,
) -> Result<SystemOverview, String> {
    // Gateway health
    let gateway = if state.is_connected().await {
        match state.call("health", json!({})).await {
            Ok(val) => parse_health_response(&val),
            Err(e) => GatewayHealthReport {
                connected: false,
                last_error: Some(e),
                ..Default::default()
            },
        }
    } else {
        GatewayHealthReport::default()
    };

    // DB status
    let db_status = match db::init_db() {
        Ok(conn) => {
            let tables: u32 = conn
                .prepare("SELECT count(*) FROM sqlite_master WHERE type='table'")
                .and_then(|mut s| s.query_row([], |r| r.get(0)))
                .unwrap_or(0);

            let home = std::env::var("HOME").unwrap_or_default();
            DbStatus {
                accessible: true,
                path: format!("{}/.axtrizen/axtrizen.db", home),
                tables_count: tables,
            }
        }
        Err(_) => DbStatus {
            accessible: false,
            path: "unknown".into(),
            tables_count: 0,
        },
    };

    // Counts from DB
    let (total_projects, total_agents) = if let Ok(conn) = db::init_db() {
        let projects: u32 = conn
            .prepare("SELECT count(*) FROM projects")
            .and_then(|mut s| s.query_row([], |r| r.get(0)))
            .unwrap_or(0);
        let agents: u32 = conn
            .prepare("SELECT count(*) FROM agent_settings")
            .and_then(|mut s| s.query_row([], |r| r.get(0)))
            .unwrap_or(0);
        (projects, agents)
    } else {
        (0, 0)
    };

    Ok(SystemOverview {
        gateway,
        db_status,
        total_projects,
        total_agents,
        orchestrator_running: false, // Would check OrchestratorState
    })
}

/// Sync skill policies to gateway (push approved/blocked status).
/// Returns the number of skills synced.
#[tauri::command]
pub async fn sync_skill_policies_to_gateway(
    state: tauri::State<'_, GatewayClient>,
) -> Result<u32, String> {
    if !state.is_connected().await {
        return Err("Gateway not connected".into());
    }

    // Get local skill policies from DB
    let policies = if let Ok(conn) = db::init_db() {
        db::get_skill_policies_db(&conn).unwrap_or_default()
    } else {
        return Err("Cannot access local database".into());
    };

    let mut synced = 0u32;
    for (skill_id, skill_name, status, _risk, _by, _at) in &policies {
        let enabled = status == "Approved";
        // Attempt to set skill status on gateway
        // The gateway may or may not support this method — swallow errors per-skill
        match state
            .call(
                "skills.configure",
                json!({
                    "skillId": skill_id,
                    "skillName": skill_name,
                    "enabled": enabled,
                }),
            )
            .await
        {
            Ok(_) => synced += 1,
            Err(e) => {
                println!(
                    "[gateway_bridge] Could not sync skill {} to gateway: {}",
                    skill_id, e
                );
            }
        }
    }

    Ok(synced)
}


// ─── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_health_response_full() {
        let val = json!({
            "version": "1.8.0",
            "uptime": 3600,
            "memory": { "heapUsedMB": 128.5 },
            "cpu": { "percent": 12.3 },
            "agents": { "count": 5 },
            "sessions": { "count": 3 }
        });
        let report = parse_health_response(&val);
        assert!(report.connected);
        assert_eq!(report.gateway_version.as_deref(), Some("1.8.0"));
        assert_eq!(report.uptime_seconds, Some(3600));
        assert!((report.memory_mb.unwrap() - 128.5).abs() < 0.01);
        assert!((report.cpu_pct.unwrap() - 12.3).abs() < 0.01);
        assert_eq!(report.active_agents, Some(5));
        assert_eq!(report.active_sessions, Some(3));
        assert!(report.last_error.is_none());
    }

    #[test]
    fn test_parse_health_response_minimal() {
        let val = json!({});
        let report = parse_health_response(&val);
        assert!(report.connected);
        assert!(report.gateway_version.is_none());
        assert!(report.uptime_seconds.is_none());
        assert!(report.memory_mb.is_none());
        assert!(report.cpu_pct.is_none());
        assert!(report.active_agents.is_none());
        assert!(report.active_sessions.is_none());
    }

    #[test]
    fn test_parse_health_response_server_nested_version() {
        let val = json!({
            "server": { "version": "2.0.0" },
            "uptimeSeconds": 7200
        });
        let report = parse_health_response(&val);
        assert_eq!(report.gateway_version.as_deref(), Some("2.0.0"));
        assert_eq!(report.uptime_seconds, Some(7200));
    }

    #[test]
    fn test_parse_usage_response_full() {
        let val = json!({
            "totalCost": 42.50,
            "totalInputTokens": 500_000,
            "totalOutputTokens": 200_000,
            "byModel": {
                "gpt-4o": { "inputTokens": 400_000, "outputTokens": 150_000, "cost": 35.0, "requests": 100 },
                "claude-sonnet": { "inputTokens": 100_000, "outputTokens": 50_000, "cost": 7.5, "requests": 50 }
            }
        });
        let (cost, tokens, models) = parse_usage_response(&val);
        assert!((cost - 42.50).abs() < 0.01);
        assert_eq!(tokens, 700_000);
        assert_eq!(models.len(), 2);

        let gpt = models.iter().find(|m| m.model == "gpt-4o").unwrap();
        assert_eq!(gpt.input_tokens, 400_000);
        assert_eq!(gpt.output_tokens, 150_000);
        assert_eq!(gpt.total_tokens, 550_000);
        assert!((gpt.cost_usd - 35.0).abs() < 0.01);
        assert_eq!(gpt.request_count, 100);
    }

    #[test]
    fn test_parse_usage_response_empty() {
        let val = json!({});
        let (cost, tokens, models) = parse_usage_response(&val);
        assert!((cost - 0.0).abs() < 0.01);
        assert_eq!(tokens, 0);
        assert!(models.is_empty());
    }

    #[test]
    fn test_parse_usage_response_total_tokens_field() {
        let val = json!({
            "totalTokens": 1_000_000,
            "cost": 25.0
        });
        let (cost, tokens, _) = parse_usage_response(&val);
        assert_eq!(tokens, 1_000_000);
        assert!((cost - 25.0).abs() < 0.01);
    }

    #[test]
    fn test_gateway_health_report_default() {
        let report = GatewayHealthReport::default();
        assert!(!report.connected);
        assert!(report.gateway_version.is_none());
        assert_eq!(report.last_error.as_deref(), Some("Gateway not connected"));
    }

    #[test]
    fn test_usage_data_source_enum() {
        let gateway = UsageDataSource::Gateway;
        let local = UsageDataSource::LocalDb;
        let fallback = UsageDataSource::Fallback;
        assert_ne!(gateway, local);
        assert_ne!(local, fallback);
        assert_ne!(gateway, fallback);
    }

    #[test]
    fn test_live_usage_data_serialization() {
        let data = LiveUsageData {
            source: UsageDataSource::Gateway,
            total_cost_usd: 100.0,
            total_tokens: 1_000_000,
            total_api_calls: 500,
            models: vec![GatewayModelUsage {
                model: "gpt-4o".into(),
                input_tokens: 600_000,
                output_tokens: 400_000,
                total_tokens: 1_000_000,
                cost_usd: 100.0,
                request_count: 500,
            }],
            budget_status: "Normal".into(),
        };
        let json = serde_json::to_string(&data).unwrap();
        assert!(json.contains("\"source\":\"Gateway\""));
        assert!(json.contains("\"gpt-4o\""));
    }

    #[test]
    fn test_enriched_agent_metrics_default_values() {
        let metrics = EnrichedAgentMetrics {
            agent_id: "agent-1".into(),
            agent_name: "Test Agent".into(),
            tokens_in: 0,
            tokens_out: 0,
            total_tokens: 0,
            cost_usd: 0.0,
            message_count: 0,
            context_pct: 0.0,
            composite_score: None,
            star_rating: None,
            gateway_connected: false,
        };
        assert!(!metrics.gateway_connected);
        assert!(metrics.composite_score.is_none());
        assert_eq!(metrics.total_tokens, 0);
    }

    #[test]
    fn test_system_overview_serialization() {
        let overview = SystemOverview {
            gateway: GatewayHealthReport::default(),
            db_status: DbStatus {
                accessible: true,
                path: "/test/db.sqlite".into(),
                tables_count: 30,
            },
            total_projects: 5,
            total_agents: 12,
            orchestrator_running: false,
        };
        let json = serde_json::to_string(&overview).unwrap();
        assert!(json.contains("\"accessible\":true"));
        assert!(json.contains("\"total_projects\":5"));
    }

    #[test]
    fn test_db_status_struct() {
        let status = DbStatus {
            accessible: true,
            path: "/home/user/.axtrizen/axtrizen.db".into(),
            tables_count: 45,
        };
        assert!(status.accessible);
        assert_eq!(status.tables_count, 45);
    }
}
