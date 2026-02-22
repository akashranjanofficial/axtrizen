import { invoke } from "@tauri-apps/api/core";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { agentStore } from "../stores/agent-store";

describe("agentStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate a fresh start with no agents
    (invoke as any).mockResolvedValue([]);
  });

  it("filters out the main system agent", async () => {
    // Override invoke to return some mock agents including "main"
    (invoke as any).mockResolvedValue([
      { id: "main", name: "System Coordinator" },
      { id: "agent-1", name: "Test Agent 1", status: "idle" },
    ]);

    // Force sync
    await agentStore.sync();

    const agents = agentStore.getAgents();

    // Should extract agent-1 but filter out main
    expect(agents.length).toBe(1);
    expect(agents[0].id).toBe("agent-1");
  });

  it("calculates active agent count correctly", async () => {
    (invoke as any).mockResolvedValue([
      { id: "agent-1", name: "Active Agent", status: "active" },
      { id: "agent-2", name: "Idle Agent", status: "idle" },
      { id: "agent-3", name: "Error Agent", status: "error" },
    ]);

    await agentStore.sync();

    expect(agentStore.getActiveCount()).toBe(1);
    expect(agentStore.getAgentCount()).toBe(3);
  });
});
