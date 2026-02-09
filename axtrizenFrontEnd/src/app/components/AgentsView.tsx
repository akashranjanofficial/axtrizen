import {
  Search,
  Plus,
  Play,
  Square,
  RotateCw,
  Trash2,
  Settings as SettingsIcon,
  Folder,
  X,
  Bot,
} from "lucide-react";
import { useState } from "react";
import { spawnAgent as tauriSpawnAgent, isTauri } from "../tauri-api";
import { AgentMemory } from "./agents/AgentMemory";
import { AgentOverview } from "./agents/AgentOverview";
import { AgentSettings } from "./agents/AgentSettings";
import { AgentTerminal } from "./agents/AgentTerminal";

export interface Agent {
  id: string;
  name: string;
  role: string;
  avatar: string;
  status: "active" | "idle" | "error";
  model: string;
  currentTask: string;
  tokenUsage: number;
  cost: number;
  memoryLoad: number;
}

// Start with empty agents - user will create them
const initialAgents: Agent[] = [];

const statusStyles = {
  active: {
    dot: "bg-green-500",
    badge: "bg-green-500/20 text-green-400 border-green-500/50",
  },
  idle: {
    dot: "bg-yellow-500",
    badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
  },
  error: {
    dot: "bg-red-500",
    badge: "bg-red-500/20 text-red-400 border-red-500/50",
  },
};

// Create Agent Modal
function CreateAgentModal({
  onClose,
  onInitialize,
}: {
  onClose: () => void;
  onInitialize: (name: string, role: string) => void;
}) {
  const [folderPath, setFolderPath] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);

  const handleInitialize = async () => {
    if (!name.trim()) {
      return;
    }
    setIsInitializing(true);
    await onInitialize(name, role);
    setIsInitializing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold text-foreground mb-4">Create New Agent</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Agent Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Code Reviewer"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Role</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. DevOps"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Working Directory</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/path/to/project"
                className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary"
              />
              <button className="px-3 py-2 bg-muted hover:bg-accent rounded-lg text-muted-foreground transition-colors">
                <Folder className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Select the folder where this agent will operate.
            </p>
          </div>

          <button
            onClick={handleInitialize}
            disabled={isInitializing || !name.trim()}
            className="w-full py-3 bg-primary rounded-xl text-primary-foreground font-medium hover:opacity-90 transition-opacity mt-4 disabled:opacity-50"
          >
            {isInitializing ? "Opening Terminal..." : "Initialize Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentsView() {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "terminal" | "memory" | "settings">(
    "overview",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateAgent, setShowCreateAgent] = useState(false);

  const filteredAgents = agents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.role.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleInitialize = async (name: string, role: string) => {
    // Create new agent entry locally
    const newAgent: Agent = {
      id: Date.now().toString(),
      name: name,
      role: role || "AI Agent",
      avatar: "🤖",
      status: "active", // Mark as active immediately to show terminal
      model: "Claude 3.5 Sonnet",
      currentTask: "Initializing environment...",
      tokenUsage: 0,
      cost: 0,
      memoryLoad: 0,
    };

    setAgents((prev) => [...prev, newAgent]);
    setSelectedAgent(newAgent);
    setActiveTab("terminal"); // Switch to terminal tab
    setShowCreateAgent(false);
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "terminal", label: "Terminal" },
    { id: "memory", label: "Memory" },
    { id: "settings", label: "Settings" },
  ] as const;

  return (
    <div className="h-[calc(100vh-73px)] overflow-hidden flex">
      {/* Render Modal */}
      {showCreateAgent && (
        <CreateAgentModal
          onClose={() => setShowCreateAgent(false)}
          onInitialize={handleInitialize}
        />
      )}

      {/* Master - Agent List Sidebar */}
      <div className="w-80 border-r border-border bg-card/50 backdrop-blur-xl flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg text-foreground">Agents</h2>
            <button
              onClick={() => setShowCreateAgent(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground hover:bg-accent transition-all"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Agent List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredAgents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Bot className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm mb-2">No agents yet</p>
              <button
                onClick={() => setShowCreateAgent(true)}
                className="text-primary text-sm hover:underline"
              >
                Create your first agent
              </button>
            </div>
          ) : (
            filteredAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className={`group w-full rounded-xl p-3 text-left transition-all mb-2 ${
                  selectedAgent?.id === agent.id
                    ? "bg-primary/20 border border-primary/50"
                    : "border border-transparent hover:bg-muted hover:border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar with Status */}
                  <div className="relative flex-shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground text-xl">
                      {agent.avatar}
                    </div>
                    <div
                      className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background ${statusStyles[agent.status].dot}`}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate mb-0.5">{agent.name}</p>
                    <p className="text-xs text-muted-foreground truncate mb-1">{agent.role}</p>
                    <div className="flex items-center gap-1">
                      <div
                        className={`h-1.5 w-1.5 rounded-full ${statusStyles[agent.status].dot}`}
                      />
                      <span className="text-xs text-muted-foreground capitalize">
                        {agent.status}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer Stats */}
        <div className="border-t border-border p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total Agents</span>
            <span className="text-foreground">{agents.length}</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-2">
            <span className="text-muted-foreground">Active</span>
            <span className="text-green-400">
              {agents.filter((a) => a.status === "active").length}
            </span>
          </div>
        </div>
      </div>

      {/* Detail - Agent Details */}
      {selectedAgent ? (
        <div className="flex-1 flex flex-col">
          {/* Agent Header */}
          <div className="border-b border-border bg-card/50 backdrop-blur-xl p-6">
            <div className="flex items-start justify-between mb-4">
              {/* Identity */}
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-3xl shadow-lg shadow-primary/20 text-primary-foreground">
                  {selectedAgent.avatar}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl text-foreground">{selectedAgent.name}</h2>
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${statusStyles[selectedAgent.status].badge}`}
                    >
                      {selectedAgent.status === "active" && "🟢"}
                      {selectedAgent.status === "idle" && "🟡"}
                      {selectedAgent.status === "error" && "🔴"}{" "}
                      {selectedAgent.status.charAt(0).toUpperCase() + selectedAgent.status.slice(1)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">{selectedAgent.role}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>🧠 {selectedAgent.model}</span>
                    <span>|</span>
                    <span>⏳ Task: {selectedAgent.currentTask}</span>
                  </div>
                </div>
              </div>

              {/* Control Toolbar */}
              <div className="flex items-center gap-2">
                {selectedAgent.status === "active" ? (
                  <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-foreground transition-all hover:bg-muted">
                    <Square className="h-4 w-4" />
                    Stop
                  </button>
                ) : (
                  <button className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/50">
                    <Play className="h-4 w-4" />
                    Start
                  </button>
                )}
                <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <RotateCw className="h-4 w-4" />
                </button>
                <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <SettingsIcon className="h-4 w-4" />
                </button>
                <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-border -mb-6 pb-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm transition-all relative ${
                    activeTab === tab.id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "overview" && <AgentOverview agent={selectedAgent} />}
            {activeTab === "terminal" && <AgentTerminal agent={selectedAgent} />}
            {activeTab === "memory" && <AgentMemory agent={selectedAgent} />}
            {activeTab === "settings" && <AgentSettings agent={selectedAgent} />}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <div className="w-24 h-24 rounded-2xl bg-muted flex items-center justify-center mb-6">
            <Bot className="h-10 w-10 opacity-50" />
          </div>
          <h2 className="text-xl font-medium text-foreground mb-2">
            {agents.length === 0 ? "No Agents Yet" : "Select an Agent"}
          </h2>
          <p className="max-w-xs text-center">
            {agents.length === 0
              ? "Click the + button to create your first AI agent."
              : "Choose an agent from the sidebar to view details."}
          </p>
        </div>
      )}
    </div>
  );
}
