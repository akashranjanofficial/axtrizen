import { Bot } from "lucide-react";
import { useState, useEffect } from "react";
import { agentStore, type Agent } from "../stores/agent-store";

const statusStyles: Record<string, string> = {
  active: "bg-green-500/20 text-green-500 border-green-500/50",
  idle: "bg-yellow-500/20 text-yellow-500 border-yellow-500/50",
  error: "bg-red-500/20 text-red-500 border-red-500/50",
  dormant: "bg-gray-500/20 text-gray-500 border-gray-500/50",
};

export function AgentStatusList() {
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>(agentStore.getAgents());

  useEffect(() => {
    const unsub = agentStore.subscribe(() => {
      setAgents(agentStore.getAgents());
    });
    return unsub;
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl text-foreground">Agent Watch</h2>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Bot className="h-4 w-4 text-primary-foreground" />
        </div>
      </div>

      {/* Agent List */}
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
            <Bot className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">No agents running</p>
          <p className="text-muted-foreground text-xs mt-1">Create an agent to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="group relative flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-all duration-200 hover:border-primary/50 hover:bg-muted"
              onMouseEnter={() => setHoveredAgent(agent.id)}
              onMouseLeave={() => setHoveredAgent(null)}
            >
              {/* Avatar */}
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-lg">
                {agent.avatar}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-foreground truncate">{agent.name}</p>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${statusStyles[agent.status]}`}
                  >
                    {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
              </div>

              {/* Connect Button - Shows on hover */}
              {hoveredAgent === agent.id && (
                <button className="absolute right-3 flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground transition-all hover:bg-primary/80 shadow-lg">
                  Connect
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
