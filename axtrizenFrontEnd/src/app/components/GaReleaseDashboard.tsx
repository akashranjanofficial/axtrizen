import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Shield,
  Activity,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Rocket,
  Clock,
  Bug,
  Megaphone,
} from "lucide-react";
import {
  getRegressionSuiteResult,
  getSecurityAuditReport,
  getMonitoringAlertConfig,
  getRunbook,
  getGaReleaseMetadata,
  type RegressionSuiteResult,
  type SecurityAuditReport,
  type MonitoringAlertConfig,
  type RunbookEntry,
  type GaReleaseMetadata,
  type AuditFindingSeverity,
} from "../tauri-api";

const severityColor: Record<AuditFindingSeverity, string> = {
  Critical: "bg-red-600 text-white",
  High: "bg-orange-500 text-white",
  Medium: "bg-yellow-500 text-black",
  Low: "bg-blue-500 text-white",
  Informational: "bg-gray-400 text-black",
};

function SeverityBadge({ severity }: { severity: AuditFindingSeverity }) {
  return (
    <span
      data-testid={`severity-badge-${severity.toLowerCase()}`}
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${severityColor[severity]}`}
    >
      {severity}
    </span>
  );
}

function StatCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | number;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center rounded-lg border border-border bg-primary/10 px-4 py-3"
    >
      <span className="text-2xl font-bold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function CollapsibleRunbook({ entry, index }: { entry: RunbookEntry; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      data-testid={`runbook-entry-${index}`}
      className="rounded-lg border border-border bg-card"
    >
      <button
        data-testid={`runbook-toggle-${index}`}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-foreground hover:bg-primary/10 transition-colors rounded-lg"
      >
        <span className="font-medium">{entry.scenario}</span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span className="text-xs">{entry.estimated_resolution_minutes} min</span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <div>
            <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Symptoms</h5>
            <ul className="list-disc list-inside space-y-0.5 text-sm text-foreground">
              {entry.symptoms.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h5 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Resolution Steps</h5>
            <ol className="list-decimal list-inside space-y-0.5 text-sm text-foreground">
              {entry.resolution_steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export function GaReleaseDashboard() {
  const [metadata, setMetadata] = useState<GaReleaseMetadata | null>(null);
  const [regression, setRegression] = useState<RegressionSuiteResult | null>(null);
  const [security, setSecurity] = useState<SecurityAuditReport | null>(null);
  const [monitoring, setMonitoring] = useState<MonitoringAlertConfig | null>(null);
  const [runbook, setRunbook] = useState<RunbookEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meta, reg, sec, mon, rb] = await Promise.all([
        getGaReleaseMetadata(),
        getRegressionSuiteResult(),
        getSecurityAuditReport(),
        getMonitoringAlertConfig(),
        getRunbook(),
      ]);
      setMetadata(meta);
      setRegression(reg);
      setSecurity(sec);
      setMonitoring(mon);
      setRunbook(rb);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load GA release data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading) {
    return (
      <div data-testid="ga-dashboard-loading" className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading GA Release Dashboard…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="ga-dashboard-error" className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertTriangle className="h-8 w-8 text-red-500" />
        <p className="text-red-500 font-medium">{error}</p>
        <button
          data-testid="ga-dashboard-retry"
          onClick={fetchAll}
          className="rounded bg-primary/10 px-4 py-2 text-sm text-foreground hover:bg-primary/20 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const totalBar = regression ? regression.passed + regression.failed + regression.skipped : 0;

  return (
    <div data-testid="ga-release-dashboard" className="space-y-8 p-6">
      {/* ── Release Header ── */}
      {metadata && (
        <section data-testid="release-header" className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Rocket className="h-6 w-6 text-foreground" />
            <h2 className="text-xl font-bold text-foreground">GA Release</h2>
            <span
              data-testid="version-badge"
              className="rounded-full bg-primary/10 px-3 py-0.5 text-sm font-semibold text-foreground"
            >
              v{metadata.version}
            </span>
            <span className="text-sm text-muted-foreground">
              {metadata.release_date}
            </span>
            {metadata.marketing_ready ? (
              <span
                data-testid="marketing-ready-badge"
                className="ml-auto flex items-center gap-1 rounded-full bg-green-600/20 px-3 py-0.5 text-xs font-semibold text-green-400"
              >
                <Megaphone className="h-3.5 w-3.5" /> Marketing Ready
              </span>
            ) : (
              <span
                data-testid="marketing-not-ready-badge"
                className="ml-auto flex items-center gap-1 rounded-full bg-yellow-600/20 px-3 py-0.5 text-xs font-semibold text-yellow-400"
              >
                <Megaphone className="h-3.5 w-3.5" /> Marketing Not Ready
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-4">
            <StatCard label="Sprints" value={metadata.total_sprints} testId="stat-sprints" />
            <StatCard label="Features" value={metadata.total_features} testId="stat-features" />
            <StatCard label="Tests" value={metadata.total_tests} testId="stat-tests" />
          </div>

          {metadata.known_issues.length > 0 && (
            <div data-testid="known-issues" className="space-y-1">
              <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                <Bug className="h-4 w-4" /> Known Issues
              </h4>
              <ul className="list-disc list-inside text-sm text-foreground space-y-0.5">
                {metadata.known_issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Regression Suite ── */}
      {regression && (
        <section data-testid="regression-suite" className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            {regression.all_passing ? (
              <CheckCircle2 data-testid="regression-all-passing" className="h-7 w-7 text-green-500" />
            ) : (
              <XCircle data-testid="regression-has-failures" className="h-7 w-7 text-red-500" />
            )}
            <h3 className="text-lg font-bold text-foreground">Regression Suite</h3>
            <span className="text-sm text-muted-foreground ml-auto">
              {regression.duration_seconds.toFixed(1)}s
            </span>
          </div>

          <div className="flex flex-wrap gap-4">
            <StatCard label="Total" value={regression.total_tests} testId="reg-total" />
            <StatCard label="Passed" value={regression.passed} testId="reg-passed" />
            <StatCard label="Failed" value={regression.failed} testId="reg-failed" />
            <StatCard label="Skipped" value={regression.skipped} testId="reg-skipped" />
          </div>

          {totalBar > 0 && (
            <div data-testid="regression-bar" className="flex h-4 w-full overflow-hidden rounded-full">
              <div
                className="bg-green-500"
                style={{ width: `${(regression.passed / totalBar) * 100}%` }}
              />
              <div
                className="bg-red-500"
                style={{ width: `${(regression.failed / totalBar) * 100}%` }}
              />
              <div
                className="bg-yellow-500"
                style={{ width: `${(regression.skipped / totalBar) * 100}%` }}
              />
            </div>
          )}
        </section>
      )}

      {/* ── Security Audit ── */}
      {security && (
        <section data-testid="security-audit" className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Shield className="h-6 w-6 text-foreground" />
            <h3 className="text-lg font-bold text-foreground">Security Audit</h3>
            <span className="text-sm text-muted-foreground">
              {security.audit_firm} &middot; {security.audit_date}
            </span>
            {security.critical_resolved ? (
              <span
                data-testid="critical-resolved-badge"
                className="ml-auto flex items-center gap-1 rounded-full bg-green-600/20 px-3 py-0.5 text-xs font-semibold text-green-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Critical Resolved
              </span>
            ) : (
              <span
                data-testid="critical-unresolved-badge"
                className="ml-auto flex items-center gap-1 rounded-full bg-red-600/20 px-3 py-0.5 text-xs font-semibold text-red-400"
              >
                <XCircle className="h-3.5 w-3.5" /> Critical Unresolved
              </span>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {security.findings.length} finding{security.findings.length !== 1 ? "s" : ""}
          </p>

          {security.findings.length > 0 && (
            <div className="overflow-x-auto">
              <table data-testid="findings-table" className="w-full text-sm text-left">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Severity</th>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {security.findings.map((f) => (
                    <tr key={f.id} data-testid={`finding-${f.id}`} className="border-b border-border">
                      <td className="px-3 py-2">
                        <SeverityBadge severity={f.severity} />
                      </td>
                      <td className="px-3 py-2 text-foreground">{f.title}</td>
                      <td className="px-3 py-2 text-center">
                        {f.resolved ? (
                          <CheckCircle2 className="inline h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="inline h-4 w-4 text-red-500" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Monitoring Config ── */}
      {monitoring && (
        <section data-testid="monitoring-config" className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-foreground" />
            <h3 className="text-lg font-bold text-foreground">Monitoring &amp; Alerting</h3>
            <span
              data-testid="provider-badge"
              className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold text-foreground"
            >
              {monitoring.alerting_provider}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground mb-1">Health Check Endpoint</p>
              <code data-testid="health-endpoint" className="text-sm text-foreground break-all">
                {monitoring.health_check_endpoint}
              </code>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground mb-1">Metrics Endpoint</p>
              <code data-testid="metrics-endpoint" className="text-sm text-foreground break-all">
                {monitoring.metrics_endpoint}
              </code>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">Alert Channels</p>
            <div data-testid="alert-channels" className="flex flex-wrap gap-2">
              {monitoring.alert_channels.map((ch, i) => (
                <span
                  key={i}
                  className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-foreground"
                >
                  {ch}
                </span>
              ))}
            </div>
          </div>

          <p data-testid="escalation-timeout" className="text-sm text-muted-foreground">
            Escalation timeout:{" "}
            <span className="font-semibold text-foreground">
              {monitoring.escalation_timeout_minutes} min
            </span>
          </p>
        </section>
      )}

      {/* ── Runbook ── */}
      {runbook && runbook.length > 0 && (
        <section data-testid="runbook-section" className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-foreground" />
            <h3 className="text-lg font-bold text-foreground">Runbook</h3>
            <span className="text-sm text-muted-foreground">
              {runbook.length} scenario{runbook.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-2">
            {runbook.map((entry, i) => (
              <CollapsibleRunbook key={i} entry={entry} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
