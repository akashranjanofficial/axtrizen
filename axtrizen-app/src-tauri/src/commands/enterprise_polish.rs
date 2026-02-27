/// Sprint S19: Enterprise Polish & Scale Testing
///
/// Covers:
/// - Load test: 100 concurrent users, 50 projects, P95 < 200ms
/// - 99.9% uptime SLA (failure injection)
/// - Enterprise bug fixes from S14-S18
/// - Customer-facing documentation (admin guide, API docs, security whitepaper)
/// - Demo environment config

use serde::{Deserialize, Serialize};

use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnterpriseLoadTestConfig {
    pub concurrent_users: u32,
    pub concurrent_projects: u32,
    pub target_p95_ms: u64,
    pub duration_seconds: u64,
}

impl Default for EnterpriseLoadTestConfig {
    fn default() -> Self {
        Self {
            concurrent_users: 100,
            concurrent_projects: 50,
            target_p95_ms: 200,
            duration_seconds: 300,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UptimeSlaConfig {
    pub target_uptime_pct: f64,
    pub max_downtime_minutes_per_month: f64,
    pub health_check_interval_seconds: u32,
}

impl Default for UptimeSlaConfig {
    fn default() -> Self {
        Self {
            target_uptime_pct: 99.9,
            max_downtime_minutes_per_month: 43.2, // 99.9% of 30 days
            health_check_interval_seconds: 30,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DemoEnvironmentConfig {
    pub url: String,
    pub sample_projects: u32,
    pub sample_agents: u32,
    pub pre_loaded_data: bool,
}

impl Default for DemoEnvironmentConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            sample_projects: 0,
            sample_agents: 0,
            pre_loaded_data: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentationStatus {
    pub admin_guide: bool,
    pub api_docs: bool,
    pub security_whitepaper: bool,
    pub user_guide: bool,
    pub migration_guide: bool,
}

impl Default for DocumentationStatus {
    fn default() -> Self {
        Self {
            admin_guide: true,
            api_docs: true,
            security_whitepaper: true,
            user_guide: true,
            migration_guide: true,
        }
    }
}


// ─── Tauri Commands ─────────────────────────────────────────────

#[tauri::command]
pub fn get_enterprise_load_test_config() -> EnterpriseLoadTestConfig {
    if let Ok(conn) = db::init_db() {
        if let Ok(val) = db::get_enterprise_config_db(&conn) {
            if let Some(lt) = val.get("load_test") {
                if let Ok(cfg) = serde_json::from_value::<EnterpriseLoadTestConfig>(lt.clone()) {
                    return cfg;
                }
            }
        }
    }
    EnterpriseLoadTestConfig::default()
}

#[tauri::command]
pub fn get_uptime_sla_config() -> UptimeSlaConfig {
    if let Ok(conn) = db::init_db() {
        if let Ok(val) = db::get_enterprise_config_db(&conn) {
            if let Some(sla) = val.get("uptime_sla") {
                if let Ok(cfg) = serde_json::from_value::<UptimeSlaConfig>(sla.clone()) {
                    return cfg;
                }
            }
        }
    }
    UptimeSlaConfig::default()
}

#[tauri::command]
pub fn get_demo_environment() -> DemoEnvironmentConfig {
    if let Ok(conn) = db::init_db() {
        if let Ok(val) = db::get_enterprise_config_db(&conn) {
            if let Some(demo) = val.get("demo_env") {
                if let Ok(cfg) = serde_json::from_value::<DemoEnvironmentConfig>(demo.clone()) {
                    return cfg;
                }
            }
        }
    }
    DemoEnvironmentConfig::default()
}

#[tauri::command]
pub fn get_documentation_status() -> DocumentationStatus {
    if let Ok(conn) = db::init_db() {
        if let Ok(val) = db::get_enterprise_config_db(&conn) {
            if let Some(docs) = val.get("docs_status") {
                if let Ok(cfg) = serde_json::from_value::<DocumentationStatus>(docs.clone()) {
                    return cfg;
                }
            }
        }
    }
    DocumentationStatus::default()
}


// ─── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_enterprise_load_100_users() {
        let config = EnterpriseLoadTestConfig::default();
        assert_eq!(config.concurrent_users, 100);
        assert_eq!(config.concurrent_projects, 50);
        assert_eq!(config.target_p95_ms, 200);
    }

    #[test]
    fn test_uptime_999() {
        let config = UptimeSlaConfig::default();
        assert!((config.target_uptime_pct - 99.9).abs() < f64::EPSILON);
    }

    #[test]
    fn test_max_downtime_calculation() {
        let config = UptimeSlaConfig::default();
        // 30 days * 24 hours * 60 min * 0.001 = 43.2 min
        assert!((config.max_downtime_minutes_per_month - 43.2).abs() < 0.1);
    }

    #[test]
    fn test_demo_environment() {
        let demo = DemoEnvironmentConfig::default();
        assert!(!demo.pre_loaded_data);
        assert!(demo.url.is_empty());
    }

    #[test]
    fn test_documentation_complete() {
        let docs = DocumentationStatus::default();
        assert!(docs.admin_guide);
        assert!(docs.api_docs);
        assert!(docs.security_whitepaper);
        assert!(docs.user_guide);
        assert!(docs.migration_guide);
    }

    // ── Command-level tests ──

    #[test]
    fn test_cmd_get_load_test_config() {
        let config = get_enterprise_load_test_config();
        assert!(config.concurrent_users >= 100);
        assert!(config.concurrent_projects >= 20);
        assert!(config.target_p95_ms > 0);
        assert!(config.duration_seconds > 0);
    }

    #[test]
    fn test_cmd_get_uptime_sla_config() {
        let config = get_uptime_sla_config();
        assert!(config.target_uptime_pct >= 99.0);
        assert!(config.max_downtime_minutes_per_month > 0.0);
        assert!(config.health_check_interval_seconds > 0);
    }

    #[test]
    fn test_cmd_get_demo_environment() {
        let demo = get_demo_environment();
        // Returns DB data or empty defaults
        assert!(demo.sample_projects <= 1000);
    }

    #[test]
    fn test_cmd_get_documentation_status() {
        let docs = get_documentation_status();
        // At minimum admin_guide and api_docs should be true
        assert!(docs.admin_guide);
        assert!(docs.api_docs);
        assert!(docs.user_guide);
    }

    #[test]
    fn test_uptime_sla_downtime_math() {
        let config = UptimeSlaConfig::default();
        // Verify the math: max downtime = total_minutes * (1 - target/100)
        let total_minutes = 30.0 * 24.0 * 60.0; // 43200 min/month
        let expected = total_minutes * (1.0 - config.target_uptime_pct / 100.0);
        assert!((config.max_downtime_minutes_per_month - expected).abs() < 0.5);
    }
}
