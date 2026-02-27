import { useState, useEffect, useCallback } from "react";
import { Shield, RefreshCw, Clock, Send, AlertTriangle, CheckCircle, XCircle, Upload } from "lucide-react";
import {
  getSkillPolicies,
  getTenantConfig,
  requestSkillApproval,
  syncSkillPoliciesToGateway,
  type SkillPolicy,
  type TenantConfig,
  type ApprovalRequest,
  type SkillApprovalStatus,
} from "../../tauri-api";

const statusConfig: Record<SkillApprovalStatus, { color: string; icon: typeof CheckCircle }> = {
  Approved: { color: "bg-green-500/15 text-green-400", icon: CheckCircle },
  Blocked: { color: "bg-red-500/15 text-red-400", icon: XCircle },
  PendingReview: { color: "bg-yellow-500/15 text-yellow-400", icon: Clock },
};

export function OrgPoliciesPanel() {
  const [policies, setPolicies] = useState<SkillPolicy[]>([]);
  const [tenant, setTenant] = useState<TenantConfig | null>(null);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [skillId, setSkillId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSyncToGateway = useCallback(async () => {
    try {
      const count = await syncSkillPoliciesToGateway();
      setSyncResult({ ok: true, msg: `Synced ${count} skill${count !== 1 ? "s" : ""} to Gateway` });
    } catch {
      setSyncResult({ ok: false, msg: "Sync failed — Gateway may be offline" });
    } finally {
      setTimeout(() => setSyncResult(null), 4000);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [policiesData, tenantData] = await Promise.all([
        getSkillPolicies(),
        getTenantConfig(),
      ]);
      setPolicies(policiesData);
      setTenant(tenantData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load org policies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmitRequest = useCallback(async () => {
    if (!skillId.trim() || !reason.trim()) return;
    setSubmitting(true);
    try {
      const result = await requestSkillApproval(skillId.trim(), "current-user", reason.trim());
      setRequests((prev) => [result, ...prev]);
      setSkillId("");
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit approval request");
    } finally {
      setSubmitting(false);
    }
  }, [skillId, reason]);

  if (loading) {
    return (
      <div data-testid="org-policies-loading" className="flex items-center justify-center py-16">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading org policies…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="org-policies-error" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          <span>{error}</span>
        </div>
        <button onClick={fetchData} className="mt-3 text-sm underline hover:text-red-300">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div data-testid="org-policies-panel" className="space-y-6">
      {/* Tenant Config Card */}
      {tenant && (
        <div data-testid="tenant-config-card" className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-3 text-lg font-semibold text-foreground">{tenant.org_name}</h3>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <span className="text-muted-foreground">Org ID</span>
              <p className="mt-1 font-mono text-foreground">{tenant.org_id}</p>
            </div>
            <div className="flex items-start gap-2">
              <Shield className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Row Isolation</span>
                <p className="mt-1 text-foreground">{tenant.row_level_isolation ? "Enabled" : "Disabled"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <RefreshCw className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Sync Interval</span>
                <p className="mt-1 text-foreground">{tenant.sync_interval_seconds}s</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Skill Policies Table */}
      <div data-testid="skill-policies-table" className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold text-foreground">Skill Policies</h3>
          <button
            data-testid="sync-gateway-btn"
            onClick={handleSyncToGateway}
            className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            Sync to Gateway
          </button>
        </div>
        {syncResult && (
          <div className={`mx-5 mt-3 rounded-md px-3 py-1.5 text-xs ${syncResult.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`} data-testid="sync-result">
            {syncResult.msg}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-5 py-2 font-medium">Skill Name</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium">Risk Level</th>
                <th className="px-5 py-2 font-medium">Reviewed By</th>
                <th className="px-5 py-2 font-medium">Reviewed At</th>
              </tr>
            </thead>
            <tbody>
              {policies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">
                    No skill policies configured
                  </td>
                </tr>
              ) : (
                policies.map((policy) => {
                  const cfg = statusConfig[policy.status];
                  const Icon = cfg.icon;
                  return (
                    <tr key={policy.skill_id} data-testid={`policy-row-${policy.skill_id}`} className="border-b border-border last:border-0">
                      <td className="px-5 py-3 text-foreground">{policy.skill_name}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}>
                          <Icon className="h-3 w-3" />
                          {policy.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-foreground">{policy.risk_level}</td>
                      <td className="px-5 py-3 text-muted-foreground">{policy.reviewed_by ?? "—"}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {policy.reviewed_at ? new Date(policy.reviewed_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Request Approval Form */}
      <div data-testid="request-approval-form" className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 text-base font-semibold text-foreground">Request Skill Approval</h3>
        <div className="space-y-3">
          <div>
            <label htmlFor="skill-id-input" className="mb-1 block text-sm text-muted-foreground">
              Skill ID
            </label>
            <input
              id="skill-id-input"
              data-testid="skill-id-input"
              type="text"
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
              placeholder="e.g. skill-web-search"
              className="w-full rounded-md border border-border bg-primary/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border"
            />
          </div>
          <div>
            <label htmlFor="reason-input" className="mb-1 block text-sm text-muted-foreground">
              Reason
            </label>
            <textarea
              id="reason-input"
              data-testid="reason-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this skill should be approved…"
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-primary/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border"
            />
          </div>
          <button
            data-testid="submit-approval-btn"
            onClick={handleSubmitRequest}
            disabled={submitting || !skillId.trim() || !reason.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {submitting ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      </div>

      {/* Recent Approval Requests */}
      {requests.length > 0 && (
        <div data-testid="recent-requests" className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-3 text-base font-semibold text-foreground">Recent Approval Requests</h3>
          <ul className="space-y-2">
            {requests.map((req, idx) => (
              <li
                key={`${req.skill_id}-${idx}`}
                data-testid={`request-item-${idx}`}
                className="flex items-center justify-between rounded-md border border-border px-4 py-2 text-sm"
              >
                <div>
                  <span className="font-medium text-foreground">{req.skill_id}</span>
                  <span className="ml-2 text-muted-foreground">— {req.reason}</span>
                </div>
                <span className="rounded-full bg-yellow-500/15 px-2.5 py-0.5 text-xs font-medium text-yellow-400">
                  {req.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
