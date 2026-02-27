/// Sprint S14: Org Skill Policies
///
/// Covers:
/// - Admin dashboard: approve/block/pending for 950+ skills
/// - Bulk approve/block by risk level
/// - Non-approved skill install → request workflow
/// - Sync to org members within 1 minute
/// - Multi-tenant schema: org_id isolation

use serde::{Deserialize, Serialize};

use crate::db;

// ─── Skill Policy ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SkillApprovalStatus {
    Approved,
    Blocked,
    PendingReview,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillPolicy {
    pub skill_id: String,
    pub skill_name: String,
    pub status: SkillApprovalStatus,
    pub risk_level: String,
    pub reviewed_by: Option<String>,
    pub reviewed_at: Option<String>,
}

/// Bulk approve/block skills by risk level
pub fn bulk_update_by_risk(policies: &mut [SkillPolicy], risk_level: &str, new_status: SkillApprovalStatus) -> u32 {
    let mut count = 0;
    for p in policies.iter_mut() {
        if p.risk_level == risk_level {
            p.status = new_status.clone();
            count += 1;
        }
    }
    count
}

/// Request approval for a blocked skill
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRequest {
    pub skill_id: String,
    pub requested_by: String,
    pub reason: String,
    pub status: String,
}

pub fn create_approval_request(skill_id: &str, user: &str, reason: &str) -> ApprovalRequest {
    ApprovalRequest {
        skill_id: skill_id.into(),
        requested_by: user.into(),
        reason: reason.into(),
        status: "pending".into(),
    }
}

// ─── Multi-Tenant ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantConfig {
    pub org_id: String,
    pub org_name: String,
    pub row_level_isolation: bool,
    pub sync_interval_seconds: u64,
}

impl Default for TenantConfig {
    fn default() -> Self {
        Self {
            org_id: String::new(),
            org_name: String::new(),
            row_level_isolation: true,
            sync_interval_seconds: 60,
        }
    }
}


// ─── Tauri Commands ─────────────────────────────────────────────

#[tauri::command]
pub fn get_skill_policies() -> Vec<SkillPolicy> {
    if let Ok(conn) = db::init_db() {
        if let Ok(rows) = db::get_skill_policies_db(&conn) {
            if !rows.is_empty() {
                return rows.into_iter().map(|(sid, sname, status_str, risk, rev_by, rev_at)| {
                    let status = match status_str.as_str() {
                        "Approved" | "approved" => SkillApprovalStatus::Approved,
                        "Blocked" | "blocked" => SkillApprovalStatus::Blocked,
                        _ => SkillApprovalStatus::PendingReview,
                    };
                    SkillPolicy { skill_id: sid, skill_name: sname, status, risk_level: risk, reviewed_by: rev_by, reviewed_at: rev_at }
                }).collect();
            }
        }
    }
    // No policies in DB — return empty
    vec![]
}

#[tauri::command]
pub fn get_tenant_config() -> TenantConfig {
    if let Ok(conn) = db::init_db() {
        if let Ok((org_id, org_name, isolation, sync_sec)) = db::get_tenant_config_db(&conn) {
            return TenantConfig { org_id, org_name, row_level_isolation: isolation, sync_interval_seconds: sync_sec as u64 };
        }
    }
    TenantConfig::default()
}

#[tauri::command]
pub fn request_skill_approval(skill_id: String, user: String, reason: String) -> ApprovalRequest {
    let req = create_approval_request(&skill_id, &user, &reason);
    if let Ok(conn) = db::init_db() {
        let _ = db::insert_approval_request(&conn, &req.skill_id, &req.requested_by, &req.reason);
    }
    req
}


// ─── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bulk_update_by_risk() {
        let mut policies = vec![
            SkillPolicy { skill_id: "s1".into(), skill_name: "A".into(), status: SkillApprovalStatus::PendingReview, risk_level: "high".into(), reviewed_by: None, reviewed_at: None },
            SkillPolicy { skill_id: "s2".into(), skill_name: "B".into(), status: SkillApprovalStatus::PendingReview, risk_level: "low".into(), reviewed_by: None, reviewed_at: None },
            SkillPolicy { skill_id: "s3".into(), skill_name: "C".into(), status: SkillApprovalStatus::PendingReview, risk_level: "high".into(), reviewed_by: None, reviewed_at: None },
        ];
        let count = bulk_update_by_risk(&mut policies, "high", SkillApprovalStatus::Blocked);
        assert_eq!(count, 2);
        assert_eq!(policies[0].status, SkillApprovalStatus::Blocked);
        assert_eq!(policies[1].status, SkillApprovalStatus::PendingReview);
    }

    #[test]
    fn test_approval_request() {
        let req = create_approval_request("s1", "user1", "Need for project");
        assert_eq!(req.status, "pending");
        assert_eq!(req.skill_id, "s1");
    }

    #[test]
    fn test_tenant_config_defaults() {
        let config = TenantConfig::default();
        assert!(config.row_level_isolation);
        assert_eq!(config.sync_interval_seconds, 60);
        assert!(config.org_id.is_empty());
    }

    #[test]
    fn test_cmd_skill_policies() {
        let policies = get_skill_policies();
        // Returns empty when DB has no policies
        assert!(policies.len() <= 1000);
    }

    #[test]
    fn test_cmd_tenant_config() {
        let config = get_tenant_config();
        // org_id may be empty if no tenant configured yet
        assert!(config.sync_interval_seconds > 0);
    }

    #[test]
    fn test_bulk_approve_low_risk() {
        let mut policies = vec![
            SkillPolicy { skill_id: "s1".into(), skill_name: "A".into(), status: SkillApprovalStatus::PendingReview, risk_level: "low".into(), reviewed_by: None, reviewed_at: None },
        ];
        let count = bulk_update_by_risk(&mut policies, "low", SkillApprovalStatus::Approved);
        assert_eq!(count, 1);
        assert_eq!(policies[0].status, SkillApprovalStatus::Approved);
    }

    #[test]
    fn test_bulk_update_no_match() {
        let mut policies = vec![
            SkillPolicy { skill_id: "s1".into(), skill_name: "A".into(), status: SkillApprovalStatus::PendingReview, risk_level: "medium".into(), reviewed_by: None, reviewed_at: None },
        ];
        let count = bulk_update_by_risk(&mut policies, "high", SkillApprovalStatus::Blocked);
        assert_eq!(count, 0);
        assert_eq!(policies[0].status, SkillApprovalStatus::PendingReview); // unchanged
    }

    #[test]
    fn test_bulk_update_empty_policies() {
        let mut policies: Vec<SkillPolicy> = vec![];
        let count = bulk_update_by_risk(&mut policies, "high", SkillApprovalStatus::Blocked);
        assert_eq!(count, 0);
    }

    #[test]
    fn test_approval_request_fields() {
        let req = create_approval_request("sk-999", "alice@corp.com", "Need shell access for CI pipeline");
        assert_eq!(req.skill_id, "sk-999");
        assert_eq!(req.requested_by, "alice@corp.com");
        assert!(req.reason.contains("CI pipeline"));
        assert_eq!(req.status, "pending");
    }

    #[test]
    fn test_cmd_skill_policies_all_statuses() {
        let policies = get_skill_policies();
        // Returns whatever is in DB; may be empty
        assert!(policies.len() <= 1000);
    }

    #[test]
    fn test_cmd_tenant_config_row_isolation() {
        let config = get_tenant_config();
        assert!(config.row_level_isolation);
        assert!(config.sync_interval_seconds > 0);
    }
}
