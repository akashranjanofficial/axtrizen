import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Coins,
  PhoneCall,
  CalendarDays,
  Download,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import {
  getUsageSummary,
  getBudgetConfig,
  checkBudgetStatus,
  exportUsageCsv,
  getLiveUsage,
  type UsageSummary,
  type BudgetConfig,
  type BudgetStatus,
  type LiveUsageData,
} from "../tauri-api";

export function UsageDashboard() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [budget, setBudget] = useState<BudgetConfig | null>(null);
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus>("Normal");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [csvNotice, setCsvNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [liveData, setLiveData] = useState<LiveUsageData | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [usageData, budgetData] = await Promise.all([getUsageSummary(), getBudgetConfig()]);
      setSummary(usageData);
      setBudget(budgetData);
      const status = await checkBudgetStatus(usageData.total_cost_usd);
      setBudgetStatus(status);
      // Try to get live gateway data (non-blocking)
      getLiveUsage().then(setLiveData).catch(() => {/* gateway offline — use local only */});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load usage data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleExportCsv = useCallback(async () => {
    try {
      const path = await exportUsageCsv();
      setCsvNotice({ ok: true, msg: `Exported to ${path}` });
    } catch {
      setCsvNotice({ ok: false, msg: "CSV export failed" });
    } finally {
      setTimeout(() => setCsvNotice(null), 4000);
    }
  }, []);

  /* ---- Status helpers ---- */
  const statusColor: Record<BudgetStatus, string> = {
    Normal: "bg-green-500/20 text-green-400 border-green-500/30",
    Warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    Blocked: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const StatusIcon = budgetStatus === "Normal" ? ShieldCheck : budgetStatus === "Warning" ? AlertTriangle : ShieldAlert;

  /* ---- Loading / Error ---- */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" data-testid="usage-loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !summary || !budget) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" data-testid="usage-error">
        <AlertTriangle className="h-10 w-10 text-destructive mb-4" />
        <p className="text-sm text-muted-foreground">{error ?? "Unknown error"}</p>
        <button
          onClick={load}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const spentPct = budget.monthly_budget_usd > 0
    ? Math.min((summary.total_cost_usd / budget.monthly_budget_usd) * 100, 100)
    : 0;

  const maxTeamCost = Math.max(...summary.breakdown_by_team.map((t) => t.cost_usd), 1);

  return (
    <div className="space-y-6" data-testid="usage-dashboard">
      {/* ---- Data source indicator ---- */}
      {liveData && (
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
          liveData.source === "Gateway"
            ? "border-green-500/30 bg-green-500/10 text-green-400"
            : "border-blue-500/30 bg-blue-500/10 text-blue-400"
        }`} data-testid="data-source-badge">
          <span className={`inline-block h-2 w-2 rounded-full ${
            liveData.source === "Gateway" ? "bg-green-400 animate-pulse" : "bg-blue-400"
          }`} />
          {liveData.source === "Gateway" ? "Live from Gateway" : `Local data (${liveData.source})`}
          {liveData.source === "Gateway" && liveData.models.length > 0 && (
            <span className="ml-auto text-muted-foreground">
              {liveData.models.length} model{liveData.models.length !== 1 ? "s" : ""} active
            </span>
          )}
        </div>
      )}

      {/* ---- CSV notification ---- */}
      {csvNotice && (
        <div
          data-testid="csv-notice"
          className={`rounded-lg border px-4 py-2 text-sm ${
            csvNotice.ok
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {csvNotice.msg}
        </div>
      )}

      {/* ---- Summary Cards ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="summary-cards">
        <SummaryCard icon={CalendarDays} label="Month" value={summary.month} />
        <SummaryCard icon={DollarSign} label="Total Cost" value={`$${summary.total_cost_usd.toFixed(2)}`} />
        <SummaryCard icon={Coins} label="Total Tokens" value={summary.total_tokens.toLocaleString()} />
        <SummaryCard icon={PhoneCall} label="API Calls" value={summary.total_api_calls.toLocaleString()} />
      </div>

      {/* ---- Budget Gauge ---- */}
      <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6" data-testid="budget-gauge">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg text-foreground">Budget</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium ${statusColor[budgetStatus]}`}
            data-testid="budget-status"
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {budgetStatus}
          </span>
        </div>

        {/* Progress bar */}
        <div className="relative h-4 w-full rounded-full bg-muted overflow-hidden" data-testid="budget-bar">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
              budgetStatus === "Blocked" ? "bg-red-500" : budgetStatus === "Warning" ? "bg-yellow-500" : "bg-primary"
            }`}
            style={{ width: `${spentPct}%` }}
          />
          {/* Soft limit marker */}
          <div
            className="absolute top-0 bottom-0 w-px bg-yellow-400/70"
            style={{ left: `${budget.soft_limit_pct}%` }}
            title={`Soft limit ${budget.soft_limit_pct}%`}
          />
          {/* Hard limit marker */}
          <div
            className="absolute top-0 bottom-0 w-px bg-red-400/70"
            style={{ left: `${budget.hard_limit_pct}%` }}
            title={`Hard limit ${budget.hard_limit_pct}%`}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>${summary.total_cost_usd.toFixed(2)} spent</span>
          <span>${budget.monthly_budget_usd.toFixed(2)} budget</span>
        </div>
      </div>

      {/* ---- Tables grid ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team usage */}
        <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6" data-testid="team-usage">
          <h2 className="text-lg text-foreground mb-4">Usage by Team</h2>
          {summary.breakdown_by_team.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team data</p>
          ) : (
            <div className="space-y-3">
              {summary.breakdown_by_team.map((team) => (
                <div key={team.team_id} className="space-y-1" data-testid={`team-row-${team.team_id}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground font-medium">{team.team_name}</span>
                    <span className="text-muted-foreground">${team.cost_usd.toFixed(2)} · {team.tokens.toLocaleString()} tok</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all duration-300"
                      style={{ width: `${(team.cost_usd / maxTeamCost) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Model usage */}
        <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6" data-testid="model-usage">
          <h2 className="text-lg text-foreground mb-4">Usage by Model</h2>
          {summary.breakdown_by_model.length === 0 ? (
            <p className="text-sm text-muted-foreground">No model data</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Model</th>
                  <th className="pb-2 font-medium text-right">Cost</th>
                  <th className="pb-2 font-medium text-right">Tokens</th>
                  <th className="pb-2 font-medium text-right">Calls</th>
                </tr>
              </thead>
              <tbody>
                {summary.breakdown_by_model.map((model) => (
                  <tr
                    key={model.model_name}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors"
                    data-testid={`model-row-${model.model_name}`}
                  >
                    <td className="py-2 text-foreground font-medium">{model.model_name}</td>
                    <td className="py-2 text-right text-muted-foreground">${model.cost_usd.toFixed(2)}</td>
                    <td className="py-2 text-right text-muted-foreground">{model.tokens.toLocaleString()}</td>
                    <td className="py-2 text-right text-muted-foreground">{model.call_count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ---- Export ---- */}
      <div className="flex justify-end">
        <button
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted hover:border-primary/50"
          data-testid="export-csv-btn"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>
    </div>
  );
}

/* ---- Small internal helper ---- */

interface SummaryCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

function SummaryCard({ icon: Icon, label, value }: SummaryCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card backdrop-blur-xl p-5 transition-all duration-300 hover:bg-muted hover:border-primary/50">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}
