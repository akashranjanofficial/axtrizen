/**
 * Orchestration Engine Integration Tests
 *
 * Tests the full orchestration flow with a mocked gateway.
 * Verifies: intent classification, all 5 strategies, event ordering,
 * error handling, and that every agent responds.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock agent-memory before importing the engine
vi.mock("../app/services/agent-memory", () => ({
  loadAgentMemory: () => ({ facts: [], preferences: [], history: [] }),
  formatMemoryContext: () => "",
  extractMemoryUpdates: (_id: string, text: string) => ({
    updated: false,
    cleanText: text,
  }),
}));

import {
  orchestrate,
  classifyIntent,
  type OrchestrationEvent,
  type OrchestrationContext,
} from "../app/services/orchestration-engine";
import type { GatewayAdapter, AgentResponse } from "../app/services/gateway-adapter";

// ── Test Helpers ──────────────────────────────────────────────────────

function makeAgent(id: string, name: string, role?: string) {
  return { id, name, role };
}

const TEAM_AGENTS = [
  makeAgent("mgr-1", "Manager", "manager"),
  makeAgent("be-1", "Backend", "backend developer"),
  makeAgent("fe-1", "FrontEndDev1", "frontend developer"),
  makeAgent("tst-1", "Tester", "tester"),
];

function makeMockResponse(text: string): AgentResponse {
  return {
    runId: `run-${Date.now()}`,
    status: "completed",
    summary: text,
    payloads: [{ text }],
  };
}

function createMockGateway(): GatewayAdapter {
  return {
    status: "connected" as const,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    onStatusChange: null,
    onEvent: null,
    sendMessage: vi.fn().mockImplementation(async (_msg: string, agentId: string, _key: string) => {
      // Simulate agent response based on agent ID
      const responses: Record<string, string> = {
        "mgr-1": "As the manager, here is my decomposition and plan for the team.",
        "be-1": "From a backend perspective, I recommend PostgreSQL with a REST API.",
        "fe-1": "For the frontend, I suggest React with TailwindCSS for responsive design.",
        "tst-1": "For testing, I recommend Vitest for unit and Playwright for e2e.",
      };
      const text = responses[agentId] || `Response from ${agentId}`;
      return makeMockResponse(text);
    }),
    listAgents: vi.fn().mockResolvedValue({ defaultId: "mgr-1", mainKey: "", agents: [] }),
    getChatHistory: vi.fn().mockResolvedValue({ sessionKey: "", messages: [] }),
    injectMessage: vi.fn().mockResolvedValue(undefined),
    resetSession: vi.fn().mockResolvedValue(undefined),
    listSessions: vi.fn().mockResolvedValue({ sessions: [], count: 0 }),
    getStatus: vi.fn().mockResolvedValue({}),
    getHealth: vi.fn().mockResolvedValue({}),
    getUsageCost: vi.fn().mockResolvedValue({}),
  } as unknown as GatewayAdapter;
}

async function collectEvents(ctx: OrchestrationContext): Promise<OrchestrationEvent[]> {
  const events: OrchestrationEvent[] = [];
  for await (const event of orchestrate(ctx)) {
    events.push(event);
  }
  return events;
}

// ── Intent Classification Tests ────────────────────────────────────

describe("classifyIntent", () => {
  it("routes single @mention to 'route'", () => {
    expect(classifyIntent("@Backend fix the API bug", ["be-1"])).toBe("route");
  });

  it("collaborative language overrides single @mention → 'question'", () => {
    expect(
      classifyIntent("@Manager discuss with team how we can develop a phone ads website", [
        "mgr-1",
      ]),
    ).toBe("question");
  });

  it("collaborative 'team' keyword → 'question' even with BUILD words", () => {
    expect(classifyIntent("team let's build a new feature together", [])).toBe("question");
  });

  it("multi-agent no collaborative → checks patterns", () => {
    expect(classifyIntent("build the login page", [])).toBe("build");
  });

  it("decision language → 'decide'", () => {
    expect(classifyIntent("should we use REST or GraphQL?", [])).toBe("decide");
  });

  it("pipeline language → 'pipeline'", () => {
    expect(classifyIntent("first write the code, then review it", [])).toBe("pipeline");
  });

  it("default → 'question'", () => {
    expect(classifyIntent("what are the best practices for authentication?", [])).toBe("question");
  });

  it("brainstorm keyword → 'question'", () => {
    expect(classifyIntent("let's brainstorm some ideas", [])).toBe("question");
  });

  it("everyone keyword → 'question'", () => {
    expect(classifyIntent("everyone share your thoughts", [])).toBe("question");
  });
});

// ── Strategy Integration Tests ─────────────────────────────────────

describe("orchestrate – RoundRobin (question)", () => {
  let gw: GatewayAdapter;

  beforeEach(() => {
    gw = createMockGateway();
  });

  it("all 4 agents respond in order", async () => {
    const events = await collectEvents({
      message: "discuss with team how we can develop a phone ads website",
      agents: TEAM_AGENTS,
      gateway: gw,
      teamId: "team-1",
      mentionedAgentIds: [],
    });

    // Should have agent_thinking + agent_response for each agent
    const thinkingEvents = events.filter((e) => e.type === "agent_thinking");
    const responseEvents = events.filter((e) => e.type === "agent_response");
    const completeEvent = events.find((e) => e.type === "complete");

    expect(thinkingEvents.length).toBe(TEAM_AGENTS.length);
    expect(responseEvents.length).toBe(TEAM_AGENTS.length);
    expect(completeEvent).toBeDefined();
    if (completeEvent?.type === "complete") {
      expect(completeEvent.strategy).toBe("round-robin");
    }

    // Verify each agent actually got called
    const respondedAgentIds = responseEvents
      .filter(
        (e): e is Extract<OrchestrationEvent, { type: "agent_response" }> =>
          e.type === "agent_response",
      )
      .map((e) => e.agentId);
    for (const agent of TEAM_AGENTS) {
      expect(respondedAgentIds).toContain(agent.id);
    }
  });

  it("includes summary when 2+ agents respond", async () => {
    const events = await collectEvents({
      message: "what should our tech stack be?",
      agents: TEAM_AGENTS,
      gateway: gw,
      teamId: "team-1",
      mentionedAgentIds: [],
    });

    const summaryThinking = events.find((e) => e.type === "summary_thinking");
    const summary = events.find((e) => e.type === "summary");

    expect(summaryThinking).toBeDefined();
    expect(summary).toBeDefined();
  });

  it("gateway sendMessage is called once per agent + summary", async () => {
    await collectEvents({
      message: "plan the architecture",
      agents: TEAM_AGENTS,
      gateway: gw,
      teamId: "team-1",
      mentionedAgentIds: [],
    });

    // 4 agents + 1 summary call = minimum 5 calls
    const sendCalls = (gw.sendMessage as ReturnType<typeof vi.fn>).mock.calls;
    expect(sendCalls.length).toBeGreaterThanOrEqual(TEAM_AGENTS.length + 1);
  });
});

describe("orchestrate – AutoRoute (route)", () => {
  let gw: GatewayAdapter;

  beforeEach(() => {
    gw = createMockGateway();
  });

  it("routes only to mentioned agent", async () => {
    const events = await collectEvents({
      message: "@Backend fix the API endpoint",
      agents: TEAM_AGENTS,
      gateway: gw,
      mentionedAgentIds: ["be-1"],
    });

    const responseEvents = events.filter(
      (e): e is Extract<OrchestrationEvent, { type: "agent_response" }> =>
        e.type === "agent_response",
    );

    expect(responseEvents.length).toBe(1);
    expect(responseEvents[0].agentId).toBe("be-1");

    const completeEvent = events.find((e) => e.type === "complete");
    if (completeEvent?.type === "complete") {
      expect(completeEvent.strategy).toBe("auto-route");
    }
  });
});

describe("orchestrate – MapReduce (build)", () => {
  let gw: GatewayAdapter;

  beforeEach(() => {
    gw = createMockGateway();
  });

  it("manager decomposes, workers execute in parallel, manager merges", async () => {
    const events = await collectEvents({
      message: "build the login page",
      agents: TEAM_AGENTS,
      gateway: gw,
      teamId: "team-1",
      mentionedAgentIds: [],
    });

    // Manager should think first (planning)
    const firstThinking = events.find(
      (e): e is Extract<OrchestrationEvent, { type: "agent_thinking" }> =>
        e.type === "agent_thinking",
    );
    expect(firstThinking?.agentId).toBe("mgr-1");
    expect(firstThinking?.position).toBe("planning");

    // Workers should think in parallel
    const parallelThinking = events.filter(
      (e): e is Extract<OrchestrationEvent, { type: "agent_thinking" }> =>
        e.type === "agent_thinking" && e.position === "parallel",
    );
    expect(parallelThinking.length).toBe(TEAM_AGENTS.length - 1); // all except manager

    // Should end with summary + complete
    const summary = events.find((e) => e.type === "summary" || e.type === "summary_thinking");
    expect(summary).toBeDefined();

    const completeEvent = events.find((e) => e.type === "complete");
    if (completeEvent?.type === "complete") {
      expect(completeEvent.strategy).toBe("map-reduce");
    }
  });
});

describe("orchestrate – Debate (decide)", () => {
  let gw: GatewayAdapter;

  beforeEach(() => {
    gw = createMockGateway();
  });

  it("two debaters argue, judge decides", async () => {
    const events = await collectEvents({
      message: "should we use REST or GraphQL?",
      agents: TEAM_AGENTS,
      gateway: gw,
      teamId: "team-1",
      mentionedAgentIds: [],
    });

    // Should have 2 debater responses + 1 judge summary
    const responseEvents = events.filter((e) => e.type === "agent_response");
    expect(responseEvents.length).toBeGreaterThanOrEqual(2); // pro + con

    const summary = events.find((e) => e.type === "summary");
    expect(summary).toBeDefined();

    const completeEvent = events.find((e) => e.type === "complete");
    if (completeEvent?.type === "complete") {
      expect(completeEvent.strategy).toBe("debate");
    }
  });
});

describe("orchestrate – Pipeline", () => {
  let gw: GatewayAdapter;

  beforeEach(() => {
    gw = createMockGateway();
  });

  it("each agent processes sequentially, output chains forward", async () => {
    const events = await collectEvents({
      message: "first analyze the requirements, then test them, after that deploy",
      agents: TEAM_AGENTS,
      gateway: gw,
      teamId: "team-1",
      mentionedAgentIds: [],
    });

    // Each agent should think and respond
    const thinkingEvents = events.filter((e) => e.type === "agent_thinking");
    const responseEvents = events.filter((e) => e.type === "agent_response");

    expect(thinkingEvents.length).toBe(TEAM_AGENTS.length);
    expect(responseEvents.length).toBe(TEAM_AGENTS.length);

    // Steps should be numbered
    const firstStep = thinkingEvents[0] as Extract<OrchestrationEvent, { type: "agent_thinking" }>;
    expect(firstStep.position).toContain("step 1");

    const completeEvent = events.find((e) => e.type === "complete");
    if (completeEvent?.type === "complete") {
      expect(completeEvent.strategy).toBe("pipeline");
    }
  });
});

// ── Error Handling Tests ───────────────────────────────────────────

describe("orchestrate – error handling", () => {
  it("yields agent_error when gateway fails", async () => {
    const gw = createMockGateway();
    // Make sendMessage fail for Backend
    (gw.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      async (_msg: string, agentId: string) => {
        if (agentId === "be-1") {
          throw new Error("Gateway connection lost");
        }
        return makeMockResponse(`Response from ${agentId}`);
      },
    );

    const events = await collectEvents({
      message: "what are the best practices for database design?",
      agents: TEAM_AGENTS,
      gateway: gw,
      teamId: "team-1",
      mentionedAgentIds: [],
    });

    const errorEvents = events.filter(
      (e): e is Extract<OrchestrationEvent, { type: "agent_error" }> => e.type === "agent_error",
    );

    // At least one error event should exist with the gateway error message
    expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    const gatewayError = errorEvents.find((e) => e.error.includes("Gateway connection lost"));
    expect(gatewayError).toBeDefined();

    // Other agents that didn't fail should still respond
    const responseEvents = events.filter((e) => e.type === "agent_response");
    expect(responseEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("completes even when all workers fail in MapReduce", async () => {
    const gw = createMockGateway();
    let callCount = 0;
    (gw.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      // First call (manager decompose) succeeds, rest fail
      if (callCount === 1) {
        return makeMockResponse("@Backend: do X, @FrontEndDev1: do Y, @Tester: do Z");
      }
      throw new Error("Worker failed");
    });

    const events = await collectEvents({
      message: "build a new feature",
      agents: TEAM_AGENTS,
      gateway: gw,
      teamId: "team-1",
      mentionedAgentIds: [],
    });

    const completeEvent = events.find((e) => e.type === "complete");
    expect(completeEvent).toBeDefined();
  });
});

// ── Event Ordering Tests ───────────────────────────────────────────

describe("orchestrate – event ordering", () => {
  it("thinking always comes before response for same agent", async () => {
    const gw = createMockGateway();
    const events = await collectEvents({
      message: "let's discuss authentication",
      agents: TEAM_AGENTS,
      gateway: gw,
      teamId: "team-1",
      mentionedAgentIds: [],
    });

    for (const agent of TEAM_AGENTS) {
      const thinkingIdx = events.findIndex(
        (e) => e.type === "agent_thinking" && "agentId" in e && e.agentId === agent.id,
      );
      const responseIdx = events.findIndex(
        (e) => e.type === "agent_response" && "agentId" in e && e.agentId === agent.id,
      );

      if (thinkingIdx !== -1 && responseIdx !== -1) {
        expect(thinkingIdx).toBeLessThan(responseIdx);
      }
    }
  });

  it("complete is always the last event", async () => {
    const gw = createMockGateway();
    const events = await collectEvents({
      message: "plan the project",
      agents: TEAM_AGENTS,
      gateway: gw,
      mentionedAgentIds: [],
    });

    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe("complete");
  });
});
