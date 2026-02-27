import { Bot, DollarSign, Cpu, FolderOpen, Activity } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { getGatewayClient } from "../gateway-client";
import { agentStore } from "../stores/agent-store";
import { ActivityFeed } from "./ActivityFeed";
import { AgentStatusList } from "./AgentStatusList";
import { MetricsCard } from "./MetricsCard";

export function Dashboard() {
  const [agentCount, setAgentCount] = useState(agentStore.getAgentCount());
  const [sessionCost, setSessionCost] = useState("$0.00");
  const [systemMemory, setSystemMemory] = useState("0 MB");
  const [memoryPercent, setMemoryPercent] = useState(0);
  const [uptimeStr, setUptimeStr] = useState("—");
  const [gatewayVersion, setGatewayVersion] = useState("—");
  const [gatewayConnected, setGatewayConnected] = useState(false);

  useEffect(() => {
    const unsub = agentStore.subscribe(() => {
      setAgentCount(agentStore.getAgentCount());
    });
    return unsub;
  }, []);

  const fetchMetrics = useCallback(async () => {
    const client = getGatewayClient();
    setGatewayConnected(client.status === "connected");
    if (client.status !== "connected") {
      return;
    }

    // Fetch usage cost
    try {
      const usage = (await client.getUsageCost(1)) as Record<string, any>;
      const cost = usage?.totalCostUsd ?? usage?.costUsd ?? usage?.total?.costUsd ?? 0;
      const costNum = typeof cost === "number" ? cost : parseFloat(String(cost)) || 0;
      setSessionCost(`$${costNum.toFixed(4)}`);
    } catch {
      // usage.cost may not be implemented
    }

    // Fetch health for memory, uptime, version
    try {
      const health = (await client.getHealth()) as Record<string, any>;

      // Memory
      const mem = health?.memory ?? health?.rss ?? health?.heapUsed;
      if (typeof mem === "number") {
        const mb = Math.round(mem / 1024 / 1024);
        setSystemMemory(`${mb} MB`);
        // Estimate % (assume 512MB budget for gateway)
        setMemoryPercent(Math.min(100, Math.round((mb / 512) * 100)));
      }

      // Uptime
      const uptime = health?.uptimeMs ?? health?.uptime;
      if (typeof uptime === "number") {
        const hours = Math.floor(uptime / 3600000);
        const mins = Math.floor((uptime % 3600000) / 60000);
        setUptimeStr(hours > 0 ? `${hours}h ${mins}m` : `${mins}m`);
      }

      // Version
      const ver = health?.version ?? health?.serverVersion;
      if (typeof ver === "string") {
        setGatewayVersion(ver);
      }
    } catch {
      // health may not be implemented
    }
  }, []);

  // Fetch on mount and every 10 seconds
  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10_000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  return (
    <div className="px-6 py-8">
      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricsCard title="Active Agents" value={String(agentCount)} icon={Bot} />
        <MetricsCard title="Session Cost" value={sessionCost} icon={DollarSign} />
        <MetricsCard title="System Memory" value={systemMemory} icon={Cpu} />
        <MetricsCard
          title="Active Projects"
          value={String(agentCount > 0 ? 1 : 0)}
          icon={FolderOpen}
        />
      </div>

      {/* Main Grid - Activity Feed and Agent Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed - Takes up 2 columns */}
        <div className="lg:col-span-2">
          <ActivityFeed />
        </div>

        {/* Agent Status List - Takes up 1 column */}
        <div className="lg:col-span-1">
          <AgentStatusList />
        </div>
      </div>

      {/* Additional Info Section */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* System Status */}
        <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            System Status
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Gateway Memory</span>
                <span>{systemMemory}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${memoryPercent}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Agent Load</span>
                <span>{agentCount} active</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-500 transition-all duration-500"
                  style={{ width: `${agentCount > 0 ? Math.min(100, agentCount * 20) : 0}%` }}
                />
              </div>
            </div>
            <div className="pt-2 border-t border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Gateway</span>
                <span
                  className={`flex items-center gap-1.5 ${gatewayConnected ? "text-green-400" : "text-red-400"}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${gatewayConnected ? "bg-green-500" : "bg-red-500"}`}
                  />
                  {gatewayConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Uptime</span>
                <span>{uptimeStr}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono text-xs">{gatewayVersion}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Session Info */}
        <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Cost Breakdown
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Today's Cost</span>
              <span className="font-medium">{sessionCost}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Active Sessions</span>
              <span>{agentCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Avg Cost/Agent</span>
              <span>
                {agentCount > 0
                  ? `$${(parseFloat(sessionCost.replace("$", "")) / agentCount).toFixed(4)}`
                  : "$0.00"}
              </span>
            </div>
            <div className="pt-3 border-t border-border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground font-medium">Total</span>
                <span className="font-bold text-foreground">{sessionCost}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
