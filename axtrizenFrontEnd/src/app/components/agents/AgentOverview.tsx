import {
  TrendingUp,
  DollarSign,
  Database,
  Wrench,
  Activity,
  RefreshCw,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useAgentMetrics } from "../../hooks/useAgentMetrics";
import { Agent } from "../AgentsView";

interface AgentOverviewProps {
  agent: Agent;
}

export function AgentOverview({ agent }: AgentOverviewProps) {
  const { metrics, loading, refresh } = useAgentMetrics(agent?.id);

  const totalTokens = metrics?.totalTokens ?? 0;
  const costUsd = metrics?.costUsd ?? 0;
  const contextPct = metrics?.contextPct ?? 0;
  const recentTools = metrics?.recentTools ?? [];
  const recentActivity = metrics?.recentActivity ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Current Task */}
      <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm text-muted-foreground">Current Task</h3>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </div>
        <div className="rounded-xl border border-border bg-muted p-4">
          <p className="text-foreground text-sm leading-relaxed">
            {agent.status === "active"
              ? `Working on: ${agent.currentTask || "Processing..."}`
              : agent.status === "idle"
                ? agent.currentTask
                  ? `Last task: ${agent.currentTask}. Agent is idle.`
                  : "No tasks assigned yet."
                : `Error encountered. Check terminal for details.`}
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Token Usage */}
        <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm text-muted-foreground">Token Usage</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          <p className="text-3xl text-foreground mb-1">
            {loading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground inline" />
            ) : (
              totalTokens.toLocaleString()
            )}
          </p>
          <p className="text-xs text-muted-foreground">tokens this session</p>
          {metrics && metrics.tokensIn > 0 && (
            <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
              <span>↑ {metrics.tokensIn.toLocaleString()} in</span>
              <span>↓ {metrics.tokensOut.toLocaleString()} out</span>
            </div>
          )}
        </div>

        {/* Cost */}
        <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm text-muted-foreground">Session Cost</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <DollarSign className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          <p className="text-3xl text-foreground mb-1">
            {loading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground inline" />
            ) : (
              `$${costUsd.toFixed(4)}`
            )}
          </p>
          <p className="text-xs text-muted-foreground">estimated total</p>
        </div>

        {/* Memory Load */}
        <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm text-muted-foreground">Memory Load</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Database className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          <p className="text-3xl text-foreground mb-1">
            {loading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground inline" />
            ) : (
              `${contextPct.toFixed(1)}%`
            )}
          </p>
          <p className="text-xs text-muted-foreground">context window used</p>
          <div className="mt-4">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  contextPct > 80 ? "bg-gradient-to-r from-destructive to-orange-500" : "bg-primary"
                }`}
                style={{ width: `${Math.min(contextPct, 100)}%` }}
              />
            </div>
          </div>
          {metrics && metrics.messageCount > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {metrics.messageCount} messages · {metrics.contextMaxTokens.toLocaleString()} max
              tokens
            </p>
          )}
        </div>
      </div>

      {/* Recent Tools */}
      <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Wrench className="h-5 w-5 text-primary-foreground" />
          </div>
          <h3 className="text-foreground">Recent Tools Used</h3>
        </div>

        {recentTools.length > 0 ? (
          <div className="space-y-2">
            {recentTools.map((tool) => (
              <div
                key={tool.id}
                className="flex items-center justify-between rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  {tool.status === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  )}
                  <span className="text-foreground font-medium">{tool.tool_name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {tool.duration_ms != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {tool.duration_ms}ms
                    </span>
                  )}
                  {tool.created_at && <span>{new Date(tool.created_at).toLocaleTimeString()}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Wrench className="h-10 w-10 text-muted-foreground mb-3 opacity-30" />
            <p className="text-muted-foreground text-sm">No tools used yet</p>
            <p className="text-muted-foreground text-xs mt-1">
              Tool execution history will appear here
            </p>
          </div>
        )}
      </div>

      {/* Activity Timeline */}
      <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
        <h3 className="text-foreground mb-4">Activity Timeline</h3>

        {recentActivity.length > 0 ? (
          <div className="space-y-3">
            {recentActivity.map((entry) => (
              <div key={entry.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-2 w-2 rounded-full bg-primary mt-2" />
                  <div className="w-px flex-1 bg-border" />
                </div>
                <div className="pb-3">
                  <p className="text-sm text-foreground font-medium">{entry.action_type}</p>
                  {entry.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(entry.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Activity className="h-10 w-10 text-muted-foreground mb-3 opacity-30" />
            <p className="text-muted-foreground text-sm">No activity recorded</p>
            <p className="text-muted-foreground text-xs mt-1">Agent actions will be logged here</p>
          </div>
        )}
      </div>
    </div>
  );
}
