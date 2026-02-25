import { Brain, Search, Database, FileText, Trash2, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useAgentMetrics } from "../../hooks/useAgentMetrics";
import { Agent } from "../AgentsView";

interface AgentMemoryProps {
  agent: Agent;
}

export function AgentMemory({ agent }: AgentMemoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"working" | "longterm">("working");
  const [isClearing, setIsClearing] = useState(false);
  const { metrics, loading, refresh } = useAgentMetrics(agent?.id);

  const contextPct = metrics?.contextPct ?? 0;
  const tokensIn = metrics?.tokensIn ?? 0;
  const tokensOut = metrics?.tokensOut ?? 0;
  const totalTokens = metrics?.totalTokens ?? 0;
  const messageCount = metrics?.messageCount ?? 0;
  const contextMax = metrics?.contextMaxTokens ?? 128_000;
  const lastUpdated = metrics?.lastUpdated
    ? new Date(metrics.lastUpdated).toLocaleTimeString()
    : "Never";

  const handleClearAll = async () => {
    if (
      !confirm(`Clear all memory for ${agent.name}? This will reset the agent's session context.`)
    ) {
      return;
    }
    setIsClearing(true);
    try {
      const { getGatewayClient } = await import("../../gateway-client");
      const client = getGatewayClient();
      await client.resetSession(`agent:${agent.id}:main`);
      // Invalidate metrics cache after clearing
      const { observabilityStore } = await import("../../stores/observability-store");
      observabilityStore.invalidate(agent.id);
    } catch (err) {
      console.error("Failed to clear memory:", err);
      alert("Failed to clear memory. The agent may need to be restarted.");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-foreground">Memory Inspector</h3>
            <p className="text-xs text-muted-foreground">Explore agent's knowledge and context</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
          <button
            onClick={handleClearAll}
            disabled={isClearing}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50 disabled:opacity-50"
          >
            {isClearing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {isClearing ? "Clearing..." : "Clear All"}
          </button>
        </div>
      </div>

      {/* Memory Type Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab("working")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
            activeTab === "working"
              ? "bg-primary/20 border border-primary/50 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="h-4 w-4" />
          Working Memory
        </button>
        <button
          onClick={() => setActiveTab("longterm")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
            activeTab === "longterm"
              ? "bg-primary/20 border border-primary/50 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Database className="h-4 w-4" />
          Long-Term Memory
        </button>
      </div>

      {/* Working Memory */}
      {activeTab === "working" && (
        <div className="space-y-4">
          {/* Context Window Usage */}
          <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm text-muted-foreground">Context Window</h4>
              <span className="text-sm text-foreground">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin inline" />
                ) : (
                  `${contextPct.toFixed(1)}% used`
                )}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  contextPct > 80 ? "bg-gradient-to-r from-destructive to-orange-500" : "bg-primary"
                }`}
                style={{ width: `${Math.min(contextPct, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {contextPct > 80 && "⚠️ High memory usage. Consider clearing old context. "}
              {totalTokens.toLocaleString()} / {contextMax.toLocaleString()} tokens · {messageCount}{" "}
              messages
            </p>
          </div>

          {/* Current Prompt Stack */}
          <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
            <h4 className="text-foreground mb-3">Current Prompt Stack</h4>
            <div className="rounded-xl border border-border bg-black p-4">
              {messageCount > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-400 font-mono">SYSTEM</span>
                    <span className="text-muted-foreground">~base instructions</span>
                  </div>
                  <div className="h-px bg-border/50" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-blue-400 font-mono">USER + ASSISTANT</span>
                    <span className="text-muted-foreground">{messageCount} exchanges</span>
                  </div>
                  <div className="h-px bg-border/50" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-yellow-400 font-mono">CONTEXT</span>
                    <span className="text-muted-foreground">
                      {totalTokens.toLocaleString()} tokens total
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground mb-3 opacity-30" />
                  <p className="text-muted-foreground text-sm">No active context</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Agent prompt stack will appear here when active
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">Input Tokens</p>
              <p className="text-xl text-foreground">
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                ) : (
                  tokensIn.toLocaleString()
                )}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">Output Tokens</p>
              <p className="text-xl text-foreground">
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                ) : (
                  tokensOut.toLocaleString()
                )}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Tokens</p>
              <p className="text-xl text-foreground">
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                ) : (
                  totalTokens.toLocaleString()
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Long-Term Memory */}
      {activeTab === "longterm" && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search vector database..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted py-3 pl-12 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Memory Entries - Empty State */}
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-border bg-card/50">
            <Database className="h-12 w-12 text-muted-foreground mb-4 opacity-30" />
            <p className="text-muted-foreground text-sm">No memories stored</p>
            <p className="text-muted-foreground text-xs mt-1">
              Long-term memories will be indexed here
            </p>
          </div>

          {/* Memory Stats */}
          <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
            <h4 className="text-foreground mb-4">Session Statistics</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total Messages</p>
                <p className="text-2xl text-foreground">
                  {loading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : messageCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total Tokens</p>
                <p className="text-2xl text-foreground">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin inline" />
                  ) : (
                    totalTokens.toLocaleString()
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Context Usage</p>
                <p className="text-2xl text-foreground">
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin inline" />
                  ) : (
                    `${contextPct.toFixed(1)}%`
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Last Updated</p>
                <p className="text-2xl text-foreground">{lastUpdated}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
