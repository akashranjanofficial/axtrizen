import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  OpenClawAdapter,
  getAdapter,
  setAdapter,
  type GatewayAdapter,
  type AgentResponse,
  type ChatHistory,
  type AgentList,
} from "../../app/services/gateway-adapter";

// ── Mock Gateway Adapter ────────────────────────────────────────────────
// Demonstrates how to create a test adapter that doesn't need a real gateway

class MockGatewayAdapter implements GatewayAdapter {
  status = "disconnected" as const;
  onStatusChange = null;
  onEvent = null;

  private _agents: AgentList = {
    defaultId: "main",
    mainKey: "agent:main:main",
    agents: [
      { id: "manager", name: "Manager" },
      { id: "frontend", name: "Frontend" },
      { id: "backend", name: "Backend" },
    ],
  };

  private _history: Map<string, ChatHistory> = new Map();
  private _injectedMessages: Array<{ sessionKey: string; content: string; role?: string }> = [];

  async connect(): Promise<void> {
    this.status = "connected" as any;
    this.onStatusChange?.("connected" as any);
  }

  disconnect(): void {
    this.status = "disconnected" as any;
    this.onStatusChange?.("disconnected" as any);
  }

  async sendMessage(message: string, agentId: string, _sessionKey: string): Promise<AgentResponse> {
    return {
      status: "done",
      summary: `Response from ${agentId}`,
      payloads: [{ text: `Agent ${agentId} says: processed "${message}"` }],
    };
  }

  async listAgents(): Promise<AgentList> {
    return this._agents;
  }

  async getChatHistory(sessionKey: string): Promise<ChatHistory> {
    return (
      this._history.get(sessionKey) || {
        sessionKey,
        messages: [],
      }
    );
  }

  async injectMessage(sessionKey: string, content: string, role?: string): Promise<void> {
    this._injectedMessages.push({ sessionKey, content, role });
  }

  async resetSession(_sessionKey: string): Promise<void> {
    /* no-op */
  }

  async listSessions() {
    return { sessions: [], count: 0 };
  }

  async getStatus() {
    return { status: "ok" };
  }

  async getHealth() {
    return { healthy: true, uptime: 12345 };
  }

  async getUsageCost() {
    return { totalCost: 0 };
  }

  // Test helpers
  getInjectedMessages() {
    return this._injectedMessages;
  }

  setHistory(sessionKey: string, history: ChatHistory) {
    this._history.set(sessionKey, history);
  }
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Gateway Adapter", () => {
  describe("Mock Adapter", () => {
    let adapter: MockGatewayAdapter;

    beforeEach(() => {
      adapter = new MockGatewayAdapter();
    });

    it("should connect and update status", async () => {
      expect(adapter.status).toBe("disconnected");
      await adapter.connect();
      expect(adapter.status).toBe("connected");
    });

    it("should fire onStatusChange on connect", async () => {
      const handler = vi.fn();
      adapter.onStatusChange = handler;
      await adapter.connect();
      expect(handler).toHaveBeenCalledWith("connected");
    });

    it("should send messages and get responses", async () => {
      const response = await adapter.sendMessage("build a login page", "frontend", "session:1");
      expect(response.payloads.length).toBeGreaterThan(0);
      expect(response.payloads[0].text).toContain("frontend");
      expect(response.payloads[0].text).toContain("build a login page");
    });

    it("should list agents", async () => {
      const result = await adapter.listAgents();
      expect(result.agents).toHaveLength(3);
      expect(result.agents.map((a) => a.id)).toEqual(["manager", "frontend", "backend"]);
    });

    it("should inject messages with role", async () => {
      await adapter.injectMessage("team:1:group", "hello team", "user");
      const injected = adapter.getInjectedMessages();
      expect(injected).toHaveLength(1);
      expect(injected[0].sessionKey).toBe("team:1:group");
      expect(injected[0].content).toBe("hello team");
      expect(injected[0].role).toBe("user");
    });

    it("should return empty chat history for unknown sessions", async () => {
      const history = await adapter.getChatHistory("unknown:session");
      expect(history.messages).toHaveLength(0);
    });

    it("should return stored chat history", async () => {
      adapter.setHistory("team:1:group", {
        sessionKey: "team:1:group",
        messages: [
          { role: "user", content: "hello", timestamp: 123 },
          { role: "assistant", content: "hi there", timestamp: 124 },
        ],
      });
      const history = await adapter.getChatHistory("team:1:group");
      expect(history.messages).toHaveLength(2);
      expect(history.messages[0].role).toBe("user");
    });

    it("should return health info", async () => {
      const health = await adapter.getHealth();
      expect(health.healthy).toBe(true);
    });
  });

  describe("Adapter Singleton", () => {
    it("should return the same instance on multiple calls", () => {
      const a1 = getAdapter();
      const a2 = getAdapter();
      expect(a1).toBe(a2);
    });

    it("should allow replacing the adapter", () => {
      const mock = new MockGatewayAdapter();
      setAdapter(mock);
      const result = getAdapter();
      expect(result).toBe(mock);
    });
  });

  describe("GatewayAdapter interface compliance", () => {
    it("MockGatewayAdapter implements all required methods", () => {
      const adapter: GatewayAdapter = new MockGatewayAdapter();
      // Test that all interface methods exist
      expect(typeof adapter.connect).toBe("function");
      expect(typeof adapter.disconnect).toBe("function");
      expect(typeof adapter.sendMessage).toBe("function");
      expect(typeof adapter.listAgents).toBe("function");
      expect(typeof adapter.getChatHistory).toBe("function");
      expect(typeof adapter.injectMessage).toBe("function");
      expect(typeof adapter.resetSession).toBe("function");
      expect(typeof adapter.listSessions).toBe("function");
      expect(typeof adapter.getStatus).toBe("function");
      expect(typeof adapter.getHealth).toBe("function");
      expect(typeof adapter.getUsageCost).toBe("function");
    });

    it("OpenClawAdapter implements all required methods", () => {
      const adapter: GatewayAdapter = new OpenClawAdapter();
      expect(typeof adapter.connect).toBe("function");
      expect(typeof adapter.disconnect).toBe("function");
      expect(typeof adapter.sendMessage).toBe("function");
      expect(typeof adapter.listAgents).toBe("function");
      expect(typeof adapter.getChatHistory).toBe("function");
      expect(typeof adapter.injectMessage).toBe("function");
      expect(typeof adapter.resetSession).toBe("function");
      expect(typeof adapter.listSessions).toBe("function");
      expect(typeof adapter.getStatus).toBe("function");
      expect(typeof adapter.getHealth).toBe("function");
      expect(typeof adapter.getUsageCost).toBe("function");
    });
  });

  describe("AgentResponse normalization", () => {
    it("should normalize empty payloads", async () => {
      const adapter = new MockGatewayAdapter();
      const response = await adapter.sendMessage("test", "agent1", "s1");
      expect(Array.isArray(response.payloads)).toBe(true);
      expect(response.status).toBe("done");
    });
  });
});
