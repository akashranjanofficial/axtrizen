import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  RefreshCw,
  Key,
  Globe,
  UserCheck,
  CheckCircle,
  XCircle,
  ToggleLeft,
  ToggleRight,
  Users,
  Lock,
  AlertTriangle,
} from "lucide-react";
import {
  getSsoConfig,
  checkPermission,
  canAssignRole,
  type SsoConfig,
  type SsoProtocol,
  type SsoProvider,
  type Role,
  type RbacAction,
} from "../../tauri-api";

const ALL_ROLES: Role[] = ["Admin", "Manager", "Operator", "Viewer"];

const ALL_ACTIONS: RbacAction[] = [
  "CreateProject",
  "DeleteProject",
  "ManageAgents",
  "ViewDashboard",
  "ManageTeam",
  "ManageBudget",
  "ManageSkillPolicies",
  "ViewAuditLogs",
  "ManageSso",
  "ExportData",
];

const ACTION_LABELS: Record<RbacAction, string> = {
  CreateProject: "Create Project",
  DeleteProject: "Delete Project",
  ManageAgents: "Manage Agents",
  ViewDashboard: "View Dashboard",
  ManageTeam: "Manage Team",
  ManageBudget: "Manage Budget",
  ManageSkillPolicies: "Manage Skill Policies",
  ViewAuditLogs: "View Audit Logs",
  ManageSso: "Manage SSO",
  ExportData: "Export Data",
};

const providerConfig: Record<SsoProvider, { label: string; color: string }> = {
  Okta: { label: "Okta", color: "bg-blue-500/15 text-blue-400" },
  AzureAd: { label: "Azure AD", color: "bg-sky-500/15 text-sky-400" },
  Custom: { label: "Custom", color: "bg-purple-500/15 text-purple-400" },
};

const protocolLabel: Record<SsoProtocol, string> = {
  Saml2: "SAML 2.0",
  Oidc: "OIDC",
};

type PermissionMatrix = Record<Role, Record<RbacAction, boolean>>;
type AssignmentMatrix = Record<Role, Record<Role, boolean>>;

export function SsoRbacPanel() {
  const [ssoConfig, setSsoConfig] = useState<SsoConfig | null>(null);
  const [permissions, setPermissions] = useState<PermissionMatrix | null>(null);
  const [assignments, setAssignments] = useState<AssignmentMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const config = await getSsoConfig();
      setSsoConfig(config);

      const permResults: PermissionMatrix = {} as PermissionMatrix;
      const permPromises = ALL_ROLES.flatMap((role) =>
        ALL_ACTIONS.map(async (action) => {
          const allowed = await checkPermission(role, action);
          return { role, action, allowed };
        }),
      );
      const permEntries = await Promise.all(permPromises);
      for (const { role, action, allowed } of permEntries) {
        if (!permResults[role]) permResults[role] = {} as Record<RbacAction, boolean>;
        permResults[role][action] = allowed;
      }
      setPermissions(permResults);

      const assignResults: AssignmentMatrix = {} as AssignmentMatrix;
      const assignPromises = ALL_ROLES.flatMap((assigner) =>
        ALL_ROLES.map(async (target) => {
          const can = await canAssignRole(assigner, target);
          return { assigner, target, can };
        }),
      );
      const assignEntries = await Promise.all(assignPromises);
      for (const { assigner, target, can } of assignEntries) {
        if (!assignResults[assigner]) assignResults[assigner] = {} as Record<Role, boolean>;
        assignResults[assigner][target] = can;
      }
      setAssignments(assignResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SSO & RBAC configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div data-testid="sso-rbac-loading" className="flex items-center justify-center py-16">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading SSO &amp; RBAC settings…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="sso-rbac-error" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">Error</span>
        </div>
        <p className="mt-1 text-sm text-red-300">{error}</p>
        <button
          data-testid="sso-rbac-retry"
          onClick={fetchData}
          className="mt-3 rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/30 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const providerInfo = ssoConfig ? providerConfig[ssoConfig.provider] : null;

  return (
    <div data-testid="sso-rbac-panel" className="space-y-6">
      {/* SSO Configuration Section */}
      <div data-testid="sso-config-section" className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Key className="h-5 w-5 text-foreground" />
          <h3 className="text-lg font-semibold text-foreground">SSO Configuration</h3>
        </div>

        {ssoConfig && providerInfo && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Provider */}
            <div data-testid="sso-provider" className="rounded-md border border-border bg-primary/10 p-3">
              <span className="text-xs font-medium text-muted-foreground">Provider</span>
              <div className="mt-1 flex items-center gap-2">
                <Globe className="h-4 w-4 text-foreground" />
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${providerInfo.color}`}>
                  {providerInfo.label}
                </span>
              </div>
            </div>

            {/* Protocol */}
            <div data-testid="sso-protocol" className="rounded-md border border-border bg-primary/10 p-3">
              <span className="text-xs font-medium text-muted-foreground">Protocol</span>
              <div className="mt-1 flex items-center gap-2">
                <Lock className="h-4 w-4 text-foreground" />
                <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-medium text-indigo-400">
                  {protocolLabel[ssoConfig.protocol]}
                </span>
              </div>
            </div>

            {/* Entity ID */}
            <div data-testid="sso-entity-id" className="rounded-md border border-border bg-primary/10 p-3">
              <span className="text-xs font-medium text-muted-foreground">Entity ID</span>
              <p className="mt-1 truncate text-sm font-mono text-foreground" title={ssoConfig.entity_id}>
                {ssoConfig.entity_id}
              </p>
            </div>

            {/* SSO URL */}
            <div data-testid="sso-url" className="rounded-md border border-border bg-primary/10 p-3 sm:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">SSO URL</span>
              <p className="mt-1 truncate text-sm font-mono text-foreground" title={ssoConfig.sso_url}>
                {ssoConfig.sso_url}
              </p>
            </div>

            {/* JIT Provisioning */}
            <div data-testid="sso-jit" className="rounded-md border border-border bg-primary/10 p-3">
              <span className="text-xs font-medium text-muted-foreground">JIT Provisioning</span>
              <div className="mt-1 flex items-center gap-2">
                {ssoConfig.jit_provisioning ? (
                  <>
                    <ToggleRight className="h-5 w-5 text-green-400" />
                    <span className="text-sm font-medium text-green-400">Enabled</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">Disabled</span>
                  </>
                )}
              </div>
            </div>

            {/* Default Role */}
            <div data-testid="sso-default-role" className="rounded-md border border-border bg-primary/10 p-3">
              <span className="text-xs font-medium text-muted-foreground">Default Role</span>
              <div className="mt-1 flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-foreground" />
                <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                  {ssoConfig.default_role}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RBAC Permission Matrix Section */}
      <div data-testid="rbac-permissions-section" className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-foreground" />
          <h3 className="text-lg font-semibold text-foreground">RBAC Permission Matrix</h3>
        </div>

        {permissions && (
          <div className="overflow-x-auto">
            <table data-testid="rbac-matrix-table" className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Action</th>
                  {ALL_ROLES.map((role) => (
                    <th key={role} className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_ACTIONS.map((action) => (
                  <tr key={action} className="border-b border-border/50 hover:bg-primary/5 transition-colors">
                    <td className="px-3 py-2 text-foreground">{ACTION_LABELS[action]}</td>
                    {ALL_ROLES.map((role) => (
                      <td key={role} className="px-3 py-2 text-center">
                        {permissions[role][action] ? (
                          <CheckCircle
                            data-testid={`perm-${role}-${action}-allowed`}
                            className="inline-block h-4 w-4 text-green-400"
                          />
                        ) : (
                          <XCircle
                            data-testid={`perm-${role}-${action}-denied`}
                            className="inline-block h-4 w-4 text-red-400"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Role Assignment Section */}
      <div data-testid="rbac-assignment-section" className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Role Assignment</h3>
          <span className="text-xs text-muted-foreground">(who can assign whom)</span>
        </div>

        {assignments && (
          <div className="overflow-x-auto">
            <table data-testid="rbac-assignment-table" className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Assigner ↓ / Target →
                  </th>
                  {ALL_ROLES.map((role) => (
                    <th key={role} className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_ROLES.map((assigner) => (
                  <tr key={assigner} className="border-b border-border/50 hover:bg-primary/5 transition-colors">
                    <td className="px-3 py-2 font-medium text-foreground">{assigner}</td>
                    {ALL_ROLES.map((target) => (
                      <td key={target} className="px-3 py-2 text-center">
                        {assignments[assigner][target] ? (
                          <CheckCircle
                            data-testid={`assign-${assigner}-${target}-allowed`}
                            className="inline-block h-4 w-4 text-green-400"
                          />
                        ) : (
                          <XCircle
                            data-testid={`assign-${assigner}-${target}-denied`}
                            className="inline-block h-4 w-4 text-red-400"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
