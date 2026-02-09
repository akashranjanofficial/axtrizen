import { Brain, Search, Database, FileText, Trash2 } from "lucide-react";
import { useState } from "react";
import { Agent } from "../AgentsView";

interface AgentMemoryProps {
  agent: Agent;
}

export function AgentMemory({ agent }: AgentMemoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"working" | "longterm">("working");

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

        <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50">
          <Trash2 className="h-4 w-4" />
          Clear All
        </button>
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
              <span className="text-sm text-foreground">{agent.memoryLoad}% used</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
              <div
                className={`h-full rounded-full ${
                  agent.memoryLoad > 80
                    ? "bg-gradient-to-r from-destructive to-orange-500"
                    : "bg-primary"
                }`}
                style={{ width: `${agent.memoryLoad}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {agent.memoryLoad > 80 && "⚠️ High memory usage. Consider clearing old context."}
            </p>
          </div>

          {/* Current Prompt Stack - Empty State */}
          <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
            <h4 className="text-foreground mb-3">Current Prompt Stack</h4>
            <div className="rounded-xl border border-border bg-black p-4">
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mb-3 opacity-30" />
                <p className="text-muted-foreground text-sm">No active context</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Agent prompt stack will appear here when active
                </p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">System Tokens</p>
              <p className="text-xl text-foreground">0</p>
            </div>
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">User Tokens</p>
              <p className="text-xl text-foreground">0</p>
            </div>
            <div className="rounded-xl border border-border bg-card/50 p-4">
              <p className="text-xs text-muted-foreground mb-1">Assistant Tokens</p>
              <p className="text-xl text-foreground">0</p>
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
            <h4 className="text-foreground mb-4">Vector Database Stats</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total Embeddings</p>
                <p className="text-2xl text-foreground">0</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Storage Used</p>
                <p className="text-2xl text-foreground">0 MB</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Avg Query Time</p>
                <p className="text-2xl text-foreground">--</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Last Updated</p>
                <p className="text-2xl text-foreground">Never</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
