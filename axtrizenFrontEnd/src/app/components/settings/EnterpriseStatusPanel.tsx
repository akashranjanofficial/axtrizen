import { useState, useEffect } from "react";
import {
  getEnterpriseLoadTestConfig,
  getUptimeSlaConfig,
  getDemoEnvironment,
  getDocumentationStatus,
  getGatewayHealthReport,
} from "../../tauri-api";
import type {
  EnterpriseLoadTestConfig,
  UptimeSlaConfig,
  DemoEnvironmentConfig,
  DocumentationStatusInfo,
  GatewayHealthReport,
} from "../../tauri-api";
import {
  Users,
  FolderKanban,
  Timer,
  Clock,
  ShieldCheck,
  ArrowDownCircle,
  HeartPulse,
  Globe,
  Layers,
  Bot,
  Database,
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";

export function EnterpriseStatusPanel() {
  const [loadTest, setLoadTest] = useState<EnterpriseLoadTestConfig | null>(null);
  const [sla, setSla] = useState<UptimeSlaConfig | null>(null);
  const [demo, setDemo] = useState<DemoEnvironmentConfig | null>(null);
  const [docs, setDocs] = useState<DocumentationStatusInfo | null>(null);
  const [gatewayHealth, setGatewayHealth] = useState<GatewayHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      try {
        setLoading(true);
        setError(null);
        const [lt, sl, dm, dc] = await Promise.all([
          getEnterpriseLoadTestConfig(),
          getUptimeSlaConfig(),
          getDemoEnvironment(),
          getDocumentationStatus(),
        ]);
        if (cancelled) return;
        setLoadTest(lt);
        setSla(sl);
        setDemo(dm);
        setDocs(dc);
        // Non-blocking gateway health fetch
        getGatewayHealthReport().then(setGatewayHealth).catch(() => {/* offline */});
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load enterprise status");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div data-testid="enterprise-status-loading" className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading enterprise status…
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="enterprise-status-error" className="flex items-center justify-center gap-2 py-16 text-destructive">
        <AlertTriangle className="h-5 w-5" />
        <span>{error}</span>
      </div>
    );
  }

  const docEntries: { key: keyof DocumentationStatusInfo; label: string }[] = [
    { key: "admin_guide", label: "Admin Guide" },
    { key: "api_docs", label: "API Docs" },
    { key: "security_whitepaper", label: "Security Whitepaper" },
    { key: "user_guide", label: "User Guide" },
    { key: "migration_guide", label: "Migration Guide" },
  ];
  const completedCount = docs ? docEntries.filter((d) => docs[d.key]).length : 0;

  return (
    <div data-testid="enterprise-status-panel" className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Load Test Config */}
      <div data-testid="load-test-card" className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Timer className="h-4 w-4 text-primary" />
          Load Test Config
        </h3>
        {loadTest && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" /> Concurrent Users
              </span>
              <span data-testid="load-test-users" className="text-sm font-medium text-foreground">
                {loadTest.concurrent_users.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <FolderKanban className="h-4 w-4" /> Concurrent Projects
              </span>
              <span data-testid="load-test-projects" className="text-sm font-medium text-foreground">
                {loadTest.concurrent_projects.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" /> Target P95 Latency
              </span>
              <span data-testid="load-test-p95" className="text-sm font-medium text-foreground">
                {loadTest.target_p95_ms} ms
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Timer className="h-4 w-4" /> Test Duration
              </span>
              <span data-testid="load-test-duration" className="text-sm font-medium text-foreground">
                {loadTest.duration_seconds} s
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Uptime SLA */}
      <div data-testid="uptime-sla-card" className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Uptime SLA
        </h3>
        {sla && (
          <div className="space-y-3">
            <div className="flex flex-col items-center rounded-md bg-primary/10 py-3">
              <span className="text-3xl font-bold text-foreground" data-testid="sla-uptime-pct">
                {sla.target_uptime_pct}%
              </span>
              <span className="text-xs text-muted-foreground">Target Uptime</span>
              {/* visual gauge */}
              <div className="mt-2 h-2 w-3/4 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(sla.target_uptime_pct, 100)}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowDownCircle className="h-4 w-4" /> Max Downtime / Month
              </span>
              <span data-testid="sla-max-downtime" className="text-sm font-medium text-foreground">
                {sla.max_downtime_minutes_per_month} min
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <HeartPulse className="h-4 w-4" /> Health Check Interval
              </span>
              <span data-testid="sla-health-interval" className="text-sm font-medium text-foreground">
                {sla.health_check_interval_seconds} s
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Demo Environment */}
      <div data-testid="demo-env-card" className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Globe className="h-4 w-4 text-primary" />
          Demo Environment
        </h3>
        {demo && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <ExternalLink className="h-4 w-4" /> URL
              </span>
              <a
                href={demo.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="demo-env-url"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {demo.url}
              </a>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Layers className="h-4 w-4" /> Sample Projects
              </span>
              <span data-testid="demo-env-projects" className="text-sm font-medium text-foreground">
                {demo.sample_projects}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4" /> Sample Agents
              </span>
              <span data-testid="demo-env-agents" className="text-sm font-medium text-foreground">
                {demo.sample_agents}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Database className="h-4 w-4" /> Pre-loaded Data
              </span>
              <span
                data-testid="demo-env-preloaded"
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  demo.pre_loaded_data
                    ? "bg-green-500/10 text-green-500"
                    : "bg-orange-500/10 text-orange-500"
                }`}
              >
                {demo.pre_loaded_data ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Documentation Status */}
      <div data-testid="docs-status-card" className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-primary" />
          Documentation Status
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {completedCount}/{docEntries.length} complete
          </span>
        </h3>
        {docs && (
          <ul className="space-y-2">
            {docEntries.map(({ key, label }) => (
              <li key={key} data-testid={`doc-${key}`} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{label}</span>
                {docs[key] ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <Circle className="h-4 w-4 text-orange-400" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Gateway Health (live) */}
      {gatewayHealth && (
        <div data-testid="gateway-health-card" className="rounded-lg border border-border bg-card p-5 md:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <HeartPulse className="h-4 w-4 text-primary" />
            Gateway Health
            <span className={`ml-2 inline-block h-2 w-2 rounded-full ${gatewayHealth.connected ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {gatewayHealth.connected ? "Connected" : "Offline"}
            </span>
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Version</p>
              <p data-testid="gw-version" className="text-sm font-medium text-foreground">{gatewayHealth.gateway_version ?? "—"}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Uptime</p>
              <p data-testid="gw-uptime" className="text-sm font-medium text-foreground">
                {gatewayHealth.uptime_seconds != null ? `${Math.floor(gatewayHealth.uptime_seconds / 3600)}h ${Math.floor((gatewayHealth.uptime_seconds % 3600) / 60)}m` : "—"}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Memory</p>
              <p data-testid="gw-memory" className="text-sm font-medium text-foreground">{gatewayHealth.memory_mb != null ? `${gatewayHealth.memory_mb.toFixed(1)} MB` : "—"}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Agents</p>
              <p data-testid="gw-agents" className="text-sm font-medium text-foreground">{gatewayHealth.active_agents ?? "—"}</p>
            </div>
          </div>
          {gatewayHealth.last_error && (
            <p className="mt-3 text-xs text-muted-foreground">Last error: {gatewayHealth.last_error}</p>
          )}
        </div>
      )}
    </div>
  );
}
