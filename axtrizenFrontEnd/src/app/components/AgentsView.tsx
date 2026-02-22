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
import { useState, useEffect } from "react";
import { activityStore } from "../stores/activity-store";
import { agentStore, type Agent } from "../stores/agent-store";
import { spawnAgent as tauriSpawnAgent, isTauri } from "../tauri-api";
import { AgentMemory } from "./agents/AgentMemory";
import { AgentOverview } from "./agents/AgentOverview";
import { AgentSettings } from "./agents/AgentSettings";
import { AgentTerminal, clearAgentOnboarding } from "./agents/AgentTerminal";
import { killPtySession } from "./TerminalComponent";

export type { Agent } from "../stores/agent-store";

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
  dormant: {
    dot: "bg-slate-500",
    badge: "bg-slate-500/20 text-slate-400 border-slate-500/50",
  },
};

// Create Agent Modal
function CreateAgentModal({
  onClose,
  onInitialize,
}: {
  onClose: () => void;
  onInitialize: (
    name: string,
    role: string,
    workingDir: string,
    type: "worker" | "manager",
    acceptedRisk: boolean,
  ) => void;
}) {
  const [folderPath, setFolderPath] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [type, setType] = useState<"worker" | "manager">("worker");
  const [acceptedRisk, setAcceptedRisk] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const handleInitialize = async () => {
    if (!name.trim() || !folderPath.trim() || !acceptedRisk) {
      return;
    }
    setIsInitializing(true);
    await onInitialize(name, role, folderPath, type, acceptedRisk);
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
            <label className="block text-sm text-muted-foreground mb-1">Agent Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "worker" | "manager")}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary"
            >
              <option value="worker">Worker (Standard execution agent)</option>
              <option value="manager">Manager (Delegates tasks to teams)</option>
            </select>
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
              <button
                onClick={async () => {
                  try {
                    if (isTauri()) {
                      const { open } = await import("@tauri-apps/plugin-dialog");
                      const selected = await open({
                        directory: true,
                        multiple: false,
                        title: "Select Working Directory",
                      });
                      if (selected) {
                        setFolderPath(selected as string);
                      }
                    }
                  } catch (err) {
                    console.error("Failed to open folder dialog:", err);
                  }
                }}
                className="px-3 py-2 bg-muted hover:bg-accent rounded-lg text-muted-foreground transition-colors"
              >
                <Folder className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Select the folder where this agent will operate.
            </p>
          </div>

          {/* Risk Acceptance */}
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p className="text-xs text-amber-400 mb-2">
              ⚠️ <strong>Security Notice:</strong> AI agents can execute commands on your system. A
              bad prompt can trick them into doing unsafe things. Only proceed if you understand the
              risks.
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Recommended: Use sandboxing, allowlists, and least-privilege tools. See{" "}
              <a
                href="https://docs.openclaw.ai/gateway/security"
                className="text-primary hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  import("@tauri-apps/plugin-opener")
                    .then((m) => m.openUrl("https://docs.openclaw.ai/gateway/security"))
                    .catch(() =>
                      window.open("https://docs.openclaw.ai/gateway/security", "_blank"),
                    );
                }}
              >
                security docs
              </a>
              .
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedRisk}
                onChange={(e) => setAcceptedRisk(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm text-foreground">
                I understand this is powerful and inherently risky. Continue.
              </span>
            </label>
          </div>

          <button
            onClick={handleInitialize}
            disabled={isInitializing || !name.trim() || !folderPath.trim() || !acceptedRisk}
            data-testid="create-agent-submit"
            className="w-full py-3 bg-primary rounded-xl text-primary-foreground font-medium hover:opacity-90 transition-opacity mt-4 disabled:opacity-50"
          >
            {isInitializing ? "Creating Agent..." : "Create Agent"}
          </button>

          {(!folderPath.trim() || !acceptedRisk) && name.trim() && (
            <p className="text-xs text-muted-foreground text-center">
              {!folderPath.trim() && "Select a working directory. "}
              {!acceptedRisk && "Accept the risk acknowledgement to proceed."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Delete Confirmation Modal
function DeleteConfirmationModal({
  agent,
  onClose,
  onConfirm,
}: {
  agent: Agent;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
        <h2 className="text-xl font-bold text-foreground mb-2">Delete Agent?</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-foreground">{agent.name}</span>? This action cannot be
          undone.
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentsView() {
  const [agents, setAgents] = useState<Agent[]>(agentStore.getAgents());
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "terminal" | "memory" | "settings">(
    "overview",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);

  // Sync with persistent store
  useEffect(() => {
    const unsub = agentStore.subscribe(() => {
      setAgents(agentStore.getAgents());
    });
    return unsub;
  }, []);

  const filteredAgents = agents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.role.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleInitialize = async (
    name: string,
    role: string,
    workingDir: string,
    type: "worker" | "manager",
    acceptedRisk: boolean,
  ) => {
    try {
      await agentStore.addAgent(name, role, workingDir, type, acceptedRisk);
      activityStore.addEvent(
        name,
        `was created as a ${type} and started initializing`,
        "success",
        "Dev",
      );
      // We'll let the sync pick up the new agent and update the list/select it
      setShowCreateAgent(false);
    } catch (e) {
      console.error("Failed to create agent:", e);
      alert("Failed to create agent. See console for details.");
    }
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

      {/* Render Delete Confirmation Modal */}
      {agentToDelete && (
        <DeleteConfirmationModal
          agent={agentToDelete}
          onClose={() => setAgentToDelete(null)}
          onConfirm={async () => {
            const agentId = agentToDelete.id;
            try {
              if (selectedAgent?.id === agentId) {
                setSelectedAgent(null);
              }
              killPtySession(agentId);
              clearAgentOnboarding(agentId);
              await agentStore.removeAgent(agentId);
            } catch (e: any) {
              console.error("Failed to delete agent:", e);
              const msg = typeof e === "string" ? e : e?.message || "Unknown error";
              alert(`Failed to delete agent: ${msg}`);
            }
          }}
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
            <span className="text-foreground">{filteredAgents.length}</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-2">
            <span className="text-muted-foreground">Active</span>
            <span className="text-green-400">
              {filteredAgents.filter((a) => a.status === "active").length}
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
                  <button
                    onClick={() => agentStore.stopAgent(selectedAgent.id)}
                    className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-foreground transition-all hover:bg-muted"
                  >
                    <Square className="h-4 w-4" />
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => agentStore.startAgent(selectedAgent.id, selectedAgent.name)}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/50"
                  >
                    <Play className="h-4 w-4" />
                    Start
                  </button>
                )}
                <button
                  onClick={() => agentStore.sync()}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setActiveTab("settings")}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <SettingsIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setAgentToDelete(selectedAgent)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50"
                  title="Delete Agent"
                >
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
          <div className="flex-1 overflow-hidden relative">
            {activeTab === "overview" && <AgentOverview agent={selectedAgent} />}

            {/* ALL agent terminals are ALWAYS in the DOM — never unmounted.
                They are hidden via CSS visibility when:
                - A different tab is active, OR
                - A different agent is selected.
                This preserves terminal output across both agent switches AND tab switches. */}
            <div
              className="absolute inset-0"
              style={
                activeTab === "terminal"
                  ? {}
                  : {
                      visibility: "hidden",
                      pointerEvents: "none",
                    }
              }
            >
              {agents.map((agent) => (
                <div
                  key={`terminal-${agent.id}`}
                  className="absolute inset-0"
                  style={
                    selectedAgent?.id === agent.id
                      ? {}
                      : {
                          visibility: "hidden",
                          pointerEvents: "none",
                        }
                  }
                >
                  <AgentTerminal
                    agent={agent}
                    visible={activeTab === "terminal" && selectedAgent?.id === agent.id}
                  />
                </div>
              ))}
            </div>

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
