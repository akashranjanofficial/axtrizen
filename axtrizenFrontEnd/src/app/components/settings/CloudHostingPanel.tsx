import { useState, useEffect } from "react";
import { Cloud, Server, Settings, Shield, CheckCircle, XCircle, Loader2 } from "lucide-react";
import {
  getCloudConfig,
  verifyTenantIsolation,
  type CloudDeploymentConfig,
  type TenantIsolationResult,
  type DeploymentTarget,
  type DataRegion,
} from "../../tauri-api";

const targetIcons: Record<DeploymentTarget, React.ReactNode> = {
  FlyIo: <Cloud className="h-5 w-5" />,
  Render: <Server className="h-5 w-5" />,
  Custom: <Settings className="h-5 w-5" />,
};

const regionColors: Record<DataRegion, string> = {
  US: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  EU: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  APAC: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

function Gauge({ label, value, testId }: { label: string; value: number; testId: string }) {
  const clamp = Math.min(100, Math.max(0, value));
  return (
    <div data-testid={testId} className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-medium">{clamp}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-primary/10">
        <div
          className="h-2 rounded-full bg-primary transition-all"
          style={{ width: `${clamp}%` }}
        />
      </div>
    </div>
  );
}

export function CloudHostingPanel() {
  const [config, setConfig] = useState<CloudDeploymentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [orgId, setOrgId] = useState("");
  const [isolationResult, setIsolationResult] = useState<TenantIsolationResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCloudConfig()
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function handleVerify() {
    if (!orgId.trim()) return;
    setVerifying(true);
    setVerifyError(null);
    setIsolationResult(null);
    try {
      const result = await verifyTenantIsolation(orgId.trim());
      setIsolationResult(result);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <div data-testid="cloud-hosting-loading" className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading cloud configuration…
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="cloud-hosting-error" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400">
        Failed to load cloud config: {error}
      </div>
    );
  }

  if (!config) return null;

  const IsolationRow = ({ label, passed, testId }: { label: string; passed: boolean; testId: string }) => (
    <div data-testid={testId} className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {passed ? (
        <CheckCircle className="h-4 w-4 text-emerald-400" />
      ) : (
        <XCircle className="h-4 w-4 text-red-400" />
      )}
    </div>
  );

  return (
    <div data-testid="cloud-hosting-panel" className="space-y-4">
      {/* Deployment Target */}
      <div data-testid="deployment-target" className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          {targetIcons[config.target]}
          <h3 className="text-foreground font-semibold text-sm">Deployment Target</h3>
          <span className="ml-auto rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-foreground">
            {config.target}
          </span>
        </div>

        {/* Regions */}
        <div data-testid="regions-list" className="flex flex-wrap gap-2">
          {config.regions.map((region) => (
            <span
              key={region}
              data-testid={`region-badge-${region}`}
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${regionColors[region]}`}
            >
              {region}
            </span>
          ))}
        </div>
      </div>

      {/* Pod Scaling */}
      <div data-testid="pod-scaling" className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-foreground font-semibold text-sm">Pod Scaling</h3>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Min Pods</span>
            <p data-testid="min-pods" className="text-foreground font-medium">{config.min_pods}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Max Pods</span>
            <p data-testid="max-pods" className="text-foreground font-medium">{config.max_pods}</p>
          </div>
        </div>

        <div data-testid="auto-scale-toggle" className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Auto-scale</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              config.auto_scale_enabled
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-red-500/20 text-red-400"
            }`}
          >
            {config.auto_scale_enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        <Gauge label="CPU Threshold" value={config.cpu_threshold_pct} testId="cpu-gauge" />
        <Gauge label="Memory Threshold" value={config.memory_threshold_pct} testId="memory-gauge" />
      </div>

      {/* Tenant Isolation */}
      <div data-testid="tenant-isolation" className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-foreground font-semibold text-sm">Verify Tenant Isolation</h3>
        </div>

        <div className="flex gap-2">
          <input
            data-testid="org-id-input"
            type="text"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            placeholder="Organization ID"
            className="flex-1 rounded-md border border-border bg-primary/10 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            data-testid="verify-btn"
            onClick={handleVerify}
            disabled={verifying || !orgId.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50 flex items-center gap-1.5"
          >
            {verifying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Verify
          </button>
        </div>

        {verifyError && (
          <p data-testid="verify-error" className="text-sm text-red-400">
            {verifyError}
          </p>
        )}

        {isolationResult && (
          <div data-testid="isolation-results" className="rounded-md border border-border bg-primary/10 p-3 space-y-1">
            <p className="text-xs text-muted-foreground mb-2">Org: {isolationResult.org_id}</p>
            <IsolationRow label="Data Isolation" passed={isolationResult.data_isolated} testId="check-data" />
            <IsolationRow label="Network Isolation" passed={isolationResult.network_isolated} testId="check-network" />
            <IsolationRow label="Storage Isolation" passed={isolationResult.storage_isolated} testId="check-storage" />
            <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Overall</span>
              <span
                data-testid="overall-status"
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  isolationResult.all_passed
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {isolationResult.all_passed ? "PASSED" : "FAILED"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
