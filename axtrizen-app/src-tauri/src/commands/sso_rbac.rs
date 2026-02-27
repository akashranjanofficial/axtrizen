/// Sprint S18: SSO & RBAC
///
/// Covers:
/// - SAML 2.0 + OIDC SSO (Okta, Azure AD)
/// - JIT provisioning from IdP attributes
/// - 4 roles: Admin, Manager, Operator, Viewer
/// - Permission matrix: role × actions
/// - Privilege escalation prevention

use serde::{Deserialize, Serialize};

use crate::db;

// ─── SSO ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SsoProtocol {
    Saml2,
    Oidc,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SsoProvider {
    Okta,
    AzureAd,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SsoConfig {
    pub protocol: SsoProtocol,
    pub provider: SsoProvider,
    pub entity_id: String,
    pub sso_url: String,
    pub jit_provisioning: bool,
    pub default_role: Role,
}

impl Default for SsoConfig {
    fn default() -> Self {
        Self {
            protocol: SsoProtocol::Saml2,
            provider: SsoProvider::Okta,
            entity_id: String::new(),
            sso_url: String::new(),
            jit_provisioning: true,
            default_role: Role::Viewer,
        }
    }
}

// ─── RBAC ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Role {
    Admin,
    Manager,
    Operator,
    Viewer,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Action {
    CreateProject,
    DeleteProject,
    ManageAgents,
    ViewDashboard,
    ManageTeam,
    ManageBudget,
    ManageSkillPolicies,
    ViewAuditLogs,
    ManageSso,
    ExportData,
}

/// Check if a role has permission for an action
pub fn has_permission(role: &Role, action: &Action) -> bool {
    match role {
        Role::Admin => true, // Admin can do everything
        Role::Manager => !matches!(action, Action::ManageSso | Action::ManageSkillPolicies),
        Role::Operator => matches!(
            action,
            Action::CreateProject | Action::ManageAgents | Action::ViewDashboard | Action::ExportData
        ),
        Role::Viewer => matches!(action, Action::ViewDashboard | Action::ViewAuditLogs),
    }
}

/// Get the full permission matrix
pub fn get_permission_matrix() -> Vec<(Role, Action, bool)> {
    let roles = vec![Role::Admin, Role::Manager, Role::Operator, Role::Viewer];
    let actions = vec![
        Action::CreateProject, Action::DeleteProject, Action::ManageAgents,
        Action::ViewDashboard, Action::ManageTeam, Action::ManageBudget,
        Action::ManageSkillPolicies, Action::ViewAuditLogs, Action::ManageSso,
        Action::ExportData,
    ];
    let mut matrix = Vec::new();
    for role in &roles {
        for action in &actions {
            let allowed = has_permission(role, action);
            matrix.push((role.clone(), action.clone(), allowed));
        }
    }
    matrix
}

/// Privilege escalation check: can user with role A assign role B?
pub fn can_assign_role(assigner_role: &Role, target_role: &Role) -> bool {
    match assigner_role {
        Role::Admin => true,
        Role::Manager => matches!(target_role, Role::Operator | Role::Viewer),
        _ => false,
    }
}


// ─── Tauri Commands ─────────────────────────────────────────────

#[tauri::command]
pub fn get_sso_config() -> SsoConfig {
    if let Ok(conn) = db::init_db() {
        if let Ok((protocol_str, provider_str, entity_id, sso_url, jit, default_role_str)) = db::get_sso_config_db(&conn) {
            let protocol = match protocol_str.as_str() { "oidc" => SsoProtocol::Oidc, _ => SsoProtocol::Saml2 };
            let provider = match provider_str.as_str() { "azure_ad" => SsoProvider::AzureAd, "custom" => SsoProvider::Custom, _ => SsoProvider::Okta };
            let default_role = match default_role_str.as_str() { "admin" => Role::Admin, "manager" => Role::Manager, "operator" => Role::Operator, _ => Role::Viewer };
            return SsoConfig { protocol, provider, entity_id, sso_url, jit_provisioning: jit, default_role };
        }
    }
    SsoConfig::default()
}

#[tauri::command]
pub fn check_permission(role: Role, action: Action) -> bool {
    has_permission(&role, &action)
}

#[tauri::command]
pub fn can_assign_role_cmd(assigner: Role, target: Role) -> bool {
    can_assign_role(&assigner, &target)
}


// ─── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_admin_can_do_everything() {
        let actions = vec![
            Action::CreateProject, Action::DeleteProject, Action::ManageAgents,
            Action::ViewDashboard, Action::ManageTeam, Action::ManageBudget,
            Action::ManageSkillPolicies, Action::ViewAuditLogs, Action::ManageSso,
        ];
        for action in actions {
            assert!(has_permission(&Role::Admin, &action));
        }
    }

    #[test]
    fn test_viewer_restricted() {
        assert!(has_permission(&Role::Viewer, &Action::ViewDashboard));
        assert!(!has_permission(&Role::Viewer, &Action::CreateProject));
        assert!(!has_permission(&Role::Viewer, &Action::ManageAgents));
    }

    #[test]
    fn test_operator_permissions() {
        assert!(has_permission(&Role::Operator, &Action::CreateProject));
        assert!(has_permission(&Role::Operator, &Action::ManageAgents));
        assert!(!has_permission(&Role::Operator, &Action::DeleteProject));
        assert!(!has_permission(&Role::Operator, &Action::ManageSso));
    }

    #[test]
    fn test_manager_cannot_manage_sso() {
        assert!(!has_permission(&Role::Manager, &Action::ManageSso));
    }

    #[test]
    fn test_privilege_escalation_blocked() {
        assert!(!can_assign_role(&Role::Operator, &Role::Admin));
        assert!(!can_assign_role(&Role::Viewer, &Role::Manager));
    }

    #[test]
    fn test_admin_can_assign_any_role() {
        assert!(can_assign_role(&Role::Admin, &Role::Admin));
        assert!(can_assign_role(&Role::Admin, &Role::Viewer));
    }

    #[test]
    fn test_manager_can_assign_operator() {
        assert!(can_assign_role(&Role::Manager, &Role::Operator));
        assert!(can_assign_role(&Role::Manager, &Role::Viewer));
        assert!(!can_assign_role(&Role::Manager, &Role::Admin));
    }

    #[test]
    fn test_permission_matrix_size() {
        let matrix = get_permission_matrix();
        assert_eq!(matrix.len(), 4 * 10); // 4 roles × 10 actions
    }

    #[test]
    fn test_sso_config_defaults() {
        let config = SsoConfig::default();
        assert_eq!(config.protocol, SsoProtocol::Saml2);
        assert!(config.jit_provisioning);
    }
}
