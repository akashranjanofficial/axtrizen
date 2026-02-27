import { Brain, Search, Database, FileText, Trash2, Loader2, RefreshCw, Tag } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAgentMetrics } from "../../hooks/useAgentMetrics";
import { Agent } from "../AgentsView";
import vectorMemory from "../../services/vector-memory";
import type { MemUListResult, MemUStatsResult } from "../../tauri-api";

interface AgentMemoryProps {
  agent: Agent;
}

export function AgentMemory({ agent }: AgentMemoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"working" | "longterm">("working");
  const [isClearing, setIsClearing] = useState(false);
  const { metrics, loading, refresh } = useAgentMetrics(agent?.id);

  // Long-term memory state
  const [memories, setMemories] = useState<MemUListResult>({ items: [], categories: [] });
  const [memuStats, setMemuStats] = useState<MemUStatsResult | null>(null);
  const [searchResults, setSearchResults] = useState<Record<string, unknown>[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const contextPct = metrics?.contextPct ?? 0;
  const tokensIn = metrics?.tokensIn ?? 0;
  const tokensOut = metrics?.tokensOut ?? 0;
  const totalTokens = metrics?.totalTokens ?? 0;
  const messageCount = metrics?.messageCount ?? 0;
  const contextMax = metrics?.contextMaxTokens ?? 128_000;
  const lastUpdated = metrics?.lastUpdated
    ? new Date(metrics.lastUpdated).toLocaleTimeString()
    : "Never";

  // Load memories when switching to long-term tab
  const loadMemories = useCallback(async () => {
    setLoadingMemories(true);
    try {
      const [list, stats] = await Promise.all([
        vectorMemory.listMemories(agent.id),
        vectorMemory.getMemUStats(),
      ]);
      setMemories(list);
      setMemuStats(stats);
    } catch (err) {
      console.warn("Failed to load memories:", err);
    } finally {
      setLoadingMemories(false);
    }
  }, [agent.id]);

  useEffect(() => {
    if (activeTab === "longterm") {
      loadMemories();
    }
  }, [activeTab, loadMemories]);

  // Search memories
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const result = await vectorMemory.searchWithMemU(searchQuery, {
        userId: agent.id,
        topK: 10,
      });
      setSearchResults(result.items ?? []);
    } catch (err) {
      console.warn("Memory search failed:", err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, agent.id]);

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
      // Also clear memU memories
      await vectorMemory.clearMemU(agent.id);
      // Invalidate metrics cache after clearing
      const { observabilityStore } = await import("../../stores/observability-store");
      observabilityStore.invalidate(agent.id);
      // Reload memories
      setMemories({ items: [], categories: [] });
      setMemuStats(null);
    } catch (err) {
      console.error("Failed to clear memory:", err);
      alert("Failed to clear memory. The agent may need to be restarted.");
    } finally {
      setIsClearing(false);
    }
  };

  const itemCount = memuStats?.item_count ?? memories.items?.length ?? 0;
  const categoryCount = memuStats?.category_count ?? memories.categories?.length ?? 0;

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
            onClick={() => {
              refresh();
              if (activeTab === "longterm") loadMemories();
            }}
            disabled={loading || loadingMemories}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {loading || loadingMemories ? (
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
          {itemCount > 0 && (
            <span className="ml-1 rounded-full bg-primary/30 px-2 py-0.5 text-xs text-foreground">
              {itemCount}
            </span>
          )}
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

      {/* Long-Term Memory (powered by memU) */}
      {activeTab === "longterm" && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search memories with real embeddings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full rounded-xl border border-border bg-muted py-3 pl-12 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {isSearching && (
              <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Memory Stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">Memory Items</p>
              <p className="text-2xl text-foreground">
                {loadingMemories ? <Loader2 className="h-5 w-5 animate-spin inline" /> : itemCount}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">Categories</p>
              <p className="text-2xl text-foreground">
                {loadingMemories ? (
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                ) : (
                  categoryCount
                )}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Messages</p>
              <p className="text-2xl text-foreground">
                {loading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : messageCount}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">Last Updated</p>
              <p className="text-sm text-foreground mt-1">{lastUpdated}</p>
            </div>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm text-muted-foreground">
                Search Results ({searchResults.length})
              </h4>
              {searchResults.map((item, i) => (
                <div key={i} className="rounded-xl border border-border bg-card/50 p-4">
                  <div className="flex items-start gap-3">
                    <Brain className="h-4 w-4 text-primary mt-1 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground line-clamp-3">
                        {String(
                          item.content ??
                            item.text ??
                            item.key ??
                            JSON.stringify(item).slice(0, 200),
                        )}
                      </p>
                      {Boolean(item.category) && (
                        <div className="flex items-center gap-1 mt-2">
                          <Tag className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {String(item.category)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Memory Categories */}
          {(memories.categories?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm text-muted-foreground">Categories</h4>
              <div className="flex flex-wrap gap-2">
                {memories.categories!.map((cat, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs text-foreground"
                  >
                    <Tag className="h-3 w-3" />
                    {String(
                      (cat as Record<string, unknown>).name ??
                        (cat as Record<string, unknown>).title ??
                        (cat as Record<string, unknown>).category ??
                        `Category ${i + 1}`,
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Memory Items List */}
          {(memories.items?.length ?? 0) > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm text-muted-foreground">Stored Memories</h4>
              {memories.items!.slice(0, 20).map((item, i) => (
                <div key={i} className="rounded-xl border border-border bg-card/50 p-4">
                  <div className="flex items-start gap-3">
                    <Brain className="h-4 w-4 text-primary mt-1 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground line-clamp-2">
                        {String(
                          item.content ??
                            item.text ??
                            item.key ??
                            JSON.stringify(item).slice(0, 200),
                        )}
                      </p>
                      {Boolean(item.category) && (
                        <div className="flex items-center gap-1 mt-2">
                          <Tag className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {String(item.category)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {(memories.items?.length ?? 0) > 20 && (
                <p className="text-xs text-muted-foreground text-center">
                  Showing 20 of {memories.items!.length} items
                </p>
              )}
            </div>
          ) : !loadingMemories && searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-border bg-card/50">
              <Database className="h-12 w-12 text-muted-foreground mb-4 opacity-30" />
              <p className="text-muted-foreground text-sm">No memories stored yet</p>
              <p className="text-muted-foreground text-xs mt-1">
                Conversations will be automatically memorized here via memU
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
