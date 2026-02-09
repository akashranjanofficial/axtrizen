import { TrendingUp, DollarSign, Database, Wrench, Activity } from "lucide-react";
import { Agent } from "../AgentsView";

interface AgentOverviewProps {
  agent: Agent;
}

export function AgentOverview({ agent }: AgentOverviewProps) {
  return (
    <div className="p-6 space-y-6">
      {/* Current Task */}
      <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
        <h3 className="text-sm text-muted-foreground mb-3">Current Task</h3>
        <div className="rounded-xl border border-border bg-muted p-4">
          <p className="text-foreground text-sm leading-relaxed">
            {agent.status === "active"
              ? `Working on: ${agent.currentTask}`
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
          <p className="text-3xl text-foreground mb-1">{agent.tokenUsage.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">tokens this session</p>
        </div>

        {/* Cost */}
        <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm text-muted-foreground">Session Cost</h3>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <DollarSign className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          <p className="text-3xl text-foreground mb-1">${agent.cost.toFixed(2)}</p>
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
          <p className="text-3xl text-foreground mb-1">{agent.memoryLoad}%</p>
          <p className="text-xs text-muted-foreground">context window used</p>
          <div className="mt-4">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  agent.memoryLoad > 80
                    ? "bg-gradient-to-r from-destructive to-orange-500"
                    : "bg-primary"
                }`}
                style={{ width: `${agent.memoryLoad}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Tools - Empty State */}
      <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Wrench className="h-5 w-5 text-primary-foreground" />
          </div>
          <h3 className="text-foreground">Recent Tools Used</h3>
        </div>

        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Wrench className="h-10 w-10 text-muted-foreground mb-3 opacity-30" />
          <p className="text-muted-foreground text-sm">No tools used yet</p>
          <p className="text-muted-foreground text-xs mt-1">
            Tool execution history will appear here
          </p>
        </div>
      </div>

      {/* Activity Timeline - Empty State */}
      <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
        <h3 className="text-foreground mb-4">Activity Timeline</h3>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Activity className="h-10 w-10 text-muted-foreground mb-3 opacity-30" />
          <p className="text-muted-foreground text-sm">No activity recorded</p>
          <p className="text-muted-foreground text-xs mt-1">Agent actions will be logged here</p>
        </div>
      </div>
    </div>
  );
}
