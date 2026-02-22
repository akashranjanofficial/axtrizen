/**
 * Shared agent store backed by OpenClaw Gateway.
 * Agents survive tab switches and page reloads.
 */

import {
  getAgents,
  createAgent,
  deleteAgent,
  stopAgent as killAgent,
  spawnAgent,
} from "../tauri-api";

export interface Agent {
  id: string;
  name: string;
  role: string;
  type: "worker" | "manager";
  avatar: string;
  status: "active" | "idle" | "error" | "dormant";
  model: string;
  currentTask: string;
  tokenUsage: number;
  cost: number;
  memoryLoad: number;
  workingDir?: string;
  acceptedRisk?: boolean;
}

type Listener = () => void;

class AgentStore {
  private agents: Agent[] = [];
  private listeners = new Set<Listener>();

  constructor() {
    this.sync();
    // Periodically sync to catch external changes
    setInterval(() => this.sync(), 5000);
  }

  async sync() {
    try {
      const backendAgents = await getAgents();
      this.agents = backendAgents.map((ba) => ({
        id: ba.id,
        name: ba.name,
        role: "AI Agent",
        type: (ba as unknown as { type?: string }).type === "manager" ? "manager" : "worker",
        avatar: (ba as unknown as { emoji?: string }).emoji || "🤖",
        status: (ba.status as Agent["status"]) || "idle",
        model: ba.model || "System Default",
        currentTask: "",
        tokenUsage: 0,
        cost: 0,
        memoryLoad: 0,
        workingDir: ba.workspace,
      }));
      this.notify();
    } catch (err) {
      console.error("Failed to sync agents:", err);
    }
  }

  /** Returns user-created agents only (hides system 'main' and legacy group chat agents) */
  getAgents(): Agent[] {
    return this.agents.filter(
      (a) =>
        a.id !== "main" &&
        !a.id.includes("group-chat") &&
        !a.name.toLowerCase().includes("group chat"),
    );
  }

  getAgentCount(): number {
    return this.getAgents().length;
  }

  getActiveCount(): number {
    return this.getAgents().filter((a) => a.status === "active").length;
  }

  async addAgent(
    name: string,
    role: string,
    workingDir: string,
    type: "worker" | "manager",
    acceptedRisk: boolean,
  ) {
    try {
      await createAgent(name, role, workingDir, type);
      await this.sync();
    } catch (e) {
      console.error("Failed to create agent", e);
      throw e;
    }
  }

  async removeAgent(id: string) {
    // Optimistic removal — update UI immediately
    this.agents = this.agents.filter((a) => a.id !== id);
    this.notify();

    try {
      await deleteAgent(id);
      // Also stop the terminal session
      await killAgent(id).catch(() => {});
      // Sync to confirm backend state
      await this.sync();
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message || "";
      // If agent is already gone, treat as success
      if (msg.toLowerCase().includes("not found")) {
        console.warn(`Agent ${id} not found on backend, treating as deleted.`);
        await this.sync();
        return;
      }

      console.error("Failed to remove agent from backend:", e);
      // Re-sync to restore true state if backend failed (and it wasn't a "not found" error)
      await this.sync();
      throw e;
    }
  }

  async startAgent(id: string, name: string) {
    try {
      this.agents = this.agents.map((a) => (a.id === id ? { ...a, status: "active" as const } : a));
      this.notify();
      await spawnAgent(name);
      await this.sync();
    } catch (e) {
      console.error("Failed to start agent", e);
      // Revert optimism
      this.agents = this.agents.map((a) => (a.id === id ? { ...a, status: "idle" as const } : a));
      this.notify();
    }
  }

  async stopAgent(id: string) {
    try {
      await killAgent(id);
      this.agents = this.agents.map((a) => (a.id === id ? { ...a, status: "idle" as const } : a));
      this.notify();
    } catch (e) {
      console.error("Failed to stop agent", e);
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) {
      fn();
    }
  }
}

export const agentStore = new AgentStore();
