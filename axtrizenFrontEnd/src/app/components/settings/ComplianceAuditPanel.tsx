import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  RefreshCw,
  CheckCircle,
  XCircle,
  Archive,
  Clock,
  LinkIcon,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import {
  getRetentionPolicy,
  getSoc2Checklist,
  verifyAuditChain,
  getAuditLogEntries,
  type AuditLogEntry,
  type RetentionPolicy,
  type Soc2Evidence,
} from "../../tauri-api";

export function ComplianceAuditPanel() {
  const [retention, setRetention] = useState<RetentionPolicy | null>(null);
  const [soc2Items, setSoc2Items] = useState<Soc2Evidence[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [verifying, setVerifying] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [retentionData, soc2Data, entriesData] = await Promise.all([
        getRetentionPolicy(),
        getSoc2Checklist(),
        getAuditLogEntries(),
      ]);
      setRetention(retentionData);
      setSoc2Items(soc2Data);
      setAuditEntries(entriesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load compliance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleVerifyChain = useCallback(async () => {
    setVerifying(true);
    setChainValid(null);
    try {
      const result = await verifyAuditChain(auditEntries);
      setChainValid(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chain verification failed");
      setChainValid(false);
    } finally {
      setVerifying(false);
    }
  }, []);

  const collectedCount = soc2Items.filter((i) => i.collected).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="compliance-loading">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading compliance data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="mx-auto max-w-2xl rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center"
        data-testid="compliance-error"
      >
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-400" />
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 rounded-md bg-primary/10 px-4 py-1.5 text-xs font-medium text-foreground hover:bg-primary/20"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="compliance-audit-panel">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Compliance &amp; Audit</h2>
      </div>

      {/* Retention Policy Card */}
      <div className="rounded-lg border border-border bg-card p-5" data-testid="retention-policy-card">
        <div className="mb-4 flex items-center gap-2">
          <Archive className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Retention Policy</h3>
        </div>
        {retention ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-primary/10 p-3" data-testid="retention-days">
              <p className="text-xs text-muted-foreground">Retention Days</p>
              <p className="mt-1 text-xl font-bold text-foreground">{retention.retention_days}</p>
            </div>
            <div className="rounded-md border border-border bg-primary/10 p-3" data-testid="archive-enabled">
              <p className="text-xs text-muted-foreground">Archive Enabled</p>
              <div className="mt-1 flex items-center gap-2">
                {retention.archive_enabled ? (
                  <CheckCircle className="h-5 w-5 text-green-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-400" />
                )}
                <span className="text-sm font-medium text-foreground">
                  {retention.archive_enabled ? "Yes" : "No"}
                </span>
              </div>
            </div>
            <div className="rounded-md border border-border bg-primary/10 p-3" data-testid="archive-location">
              <p className="text-xs text-muted-foreground">Archive Location</p>
              <p className="mt-1 truncate text-sm font-medium text-foreground" title={retention.archive_location}>
                {retention.archive_location || "—"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No retention policy configured.</p>
        )}
      </div>

      {/* SOC2 Checklist Card */}
      <div className="rounded-lg border border-border bg-card p-5" data-testid="soc2-checklist-card">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">SOC2 Evidence Checklist</h3>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-foreground" data-testid="soc2-progress">
            {collectedCount} of {soc2Items.length} collected
          </span>
        </div>
        {soc2Items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="soc2-table">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Category</th>
                  <th className="pb-2 pr-4 font-medium">Control</th>
                  <th className="pb-2 pr-4 font-medium">Evidence Type</th>
                  <th className="pb-2 font-medium text-center">Collected</th>
                </tr>
              </thead>
              <tbody>
                {soc2Items.map((item, idx) => (
                  <tr
                    key={`${item.category}-${item.control}-${idx}`}
                    className="border-b border-border/50 last:border-0"
                    data-testid={`soc2-row-${idx}`}
                  >
                    <td className="py-2 pr-4 text-foreground">{item.category}</td>
                    <td className="py-2 pr-4 text-foreground">{item.control}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{item.evidence_type}</td>
                    <td className="py-2 text-center">
                      {item.collected ? (
                        <CheckCircle className="mx-auto h-4 w-4 text-green-400" data-testid={`soc2-collected-${idx}`} />
                      ) : (
                        <XCircle className="mx-auto h-4 w-4 text-red-400" data-testid={`soc2-missing-${idx}`} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No SOC2 evidence items found.</p>
        )}
      </div>

      {/* Audit Chain Verification Card */}
      <div className="rounded-lg border border-border bg-card p-5" data-testid="audit-chain-card">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Audit Chain Verification</h3>
          </div>
          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/20 disabled:opacity-50"
            data-testid="verify-chain-btn"
          >
            {verifying ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Shield className="h-3.5 w-3.5" />
            )}
            Verify Chain Integrity
          </button>
        </div>

        {chainValid !== null && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-md p-3 text-sm font-medium ${
              chainValid
                ? "bg-green-500/10 text-green-400"
                : "bg-red-500/10 text-red-400"
            }`}
            data-testid="chain-result"
          >
            {chainValid ? (
              <>
                <CheckCircle className="h-4 w-4" />
                Audit chain integrity verified — all hashes valid.
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" />
                Audit chain integrity check failed — hash mismatch detected.
              </>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="audit-log-table">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">
                  <Clock className="mr-1 inline h-3 w-3" />Timestamp
                </th>
                <th className="pb-2 pr-4 font-medium">Actor</th>
                <th className="pb-2 pr-4 font-medium">Action</th>
                <th className="pb-2 pr-4 font-medium">Target</th>
                <th className="pb-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-border/50 last:border-0"
                  data-testid={`audit-row-${entry.id}`}
                >
                  <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-foreground">{entry.actor}</td>
                  <td className="py-2 pr-4">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-foreground">
                      {entry.action}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-foreground">{entry.target}</td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        entry.result === "success"
                          ? "bg-green-500/15 text-green-400"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {entry.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
