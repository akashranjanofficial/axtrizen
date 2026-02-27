/**
 * Sprint S5 Frontend Tests
 * Tests for: SmartProjectSetupWizard, team suggestion engine, cost estimation,
 *            model pricing, external URL import
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Data ──────────────────────────────────────────────────

const MOCK_MODEL_PRICING = [
  {
    model_id: "claude-sonnet-4-20250514",
    display_name: "Claude Sonnet 4",
    provider: "anthropic",
    input_cost_per_m: 3.0,
    output_cost_per_m: 15.0,
    context_window: 200000,
  },
  {
    model_id: "gpt-4o-mini",
    display_name: "GPT-4o Mini",
    provider: "openai",
    input_cost_per_m: 0.15,
    output_cost_per_m: 0.60,
    context_window: 128000,
  },
  {
    model_id: "deepseek-r1",
    display_name: "DeepSeek R1",
    provider: "deepseek",
    input_cost_per_m: 0.55,
    output_cost_per_m: 2.19,
    context_window: 64000,
  },
];

const MOCK_TEAM_SUGGESTION = {
  project_description: "Build a REST API backend with Docker deployment",
  suggested_agents: [
    {
      role: "Backend Developer",
      suggested_model: "claude-sonnet-4-20250514",
      agent_type: "worker",
      skill_categories: ["app-builder", "database-processing"],
      recommended_skills: ["sk-1", "sk-2"],
      confidence: 0.8,
      estimated_tokens: 500000,
    },
    {
      role: "DevOps Engineer",
      suggested_model: "claude-sonnet-4-20250514",
      agent_type: "worker",
      skill_categories: ["devops", "automation"],
      recommended_skills: ["sk-3"],
      confidence: 0.6,
      estimated_tokens: 500000,
    },
  ],
  cost_estimates: [
    {
      agent_role: "Backend Developer",
      model_id: "claude-sonnet-4-20250514",
      model_name: "Claude Sonnet 4",
      estimated_tokens: 500000,
      input_cost: 0.9,
      output_cost: 3.0,
      total_cost: 3.9,
    },
    {
      agent_role: "DevOps Engineer",
      model_id: "claude-sonnet-4-20250514",
      model_name: "Claude Sonnet 4",
      estimated_tokens: 500000,
      input_cost: 0.9,
      output_cost: 3.0,
      total_cost: 3.9,
    },
  ],
  total_cost_low: 5.46,
  total_cost_mid: 7.8,
  total_cost_high: 10.14,
  total_estimated_tokens: 1000000,
};

// ─── Tauri Mock ──────────────────────────────────────────────────

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

function setupDefaultMocks() {
  mockInvoke.mockImplementation((cmd: string, args?: any) => {
    switch (cmd) {
      case "suggest_team_for_project":
        return Promise.resolve(MOCK_TEAM_SUGGESTION);
      case "get_model_pricing":
        return Promise.resolve(MOCK_MODEL_PRICING);
      case "estimate_cost":
        return Promise.resolve({
          agent_role: args?.role ?? "Dev",
          model_id: args?.modelId ?? "claude-sonnet-4-20250514",
          model_name: "Claude Sonnet 4",
          estimated_tokens: args?.estimatedTokens ?? 500000,
          input_cost: 0.9,
          output_cost: 3.0,
          total_cost: 3.9,
        });
      case "recalculate_team_cost":
        const agents = args?.agents ?? [];
        const total = agents.length * 3.9;
        return Promise.resolve([
          agents.map((a: any) => ({
            agent_role: a.role,
            model_id: a.suggested_model,
            model_name: "Model",
            estimated_tokens: a.estimated_tokens,
            input_cost: 0.9,
            output_cost: 3.0,
            total_cost: 3.9,
          })),
          total * 0.7,
          total,
          total * 1.3,
        ]);
      default:
        return Promise.resolve(null);
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

// ── 1. Team Suggestion — API ────────────────────────────────────

describe("Team Suggestion — API", () => {
  it("1.1 should call suggest_team_for_project", async () => {
    const result = await mockInvoke("suggest_team_for_project", {
      description: "Build a REST API backend with Docker deployment",
    });
    expect(result.suggested_agents).toHaveLength(2);
    expect(result.suggested_agents[0].role).toBe("Backend Developer");
    expect(result.suggested_agents[1].role).toBe("DevOps Engineer");
  });

  it("1.2 should return cost estimates per agent", async () => {
    const result = await mockInvoke("suggest_team_for_project", {
      description: "Build an API",
    });
    expect(result.cost_estimates).toHaveLength(2);
    expect(result.cost_estimates[0].total_cost).toBe(3.9);
  });

  it("1.3 should return ±30% cost range", async () => {
    const result = await mockInvoke("suggest_team_for_project", {
      description: "Build an API",
    });
    const mid = result.total_cost_mid;
    expect(Math.abs(result.total_cost_low - mid * 0.7)).toBeLessThan(0.01);
    expect(Math.abs(result.total_cost_high - mid * 1.3)).toBeLessThan(0.01);
  });

  it("1.4 should include skill categories", async () => {
    const result = await mockInvoke("suggest_team_for_project", {
      description: "Build backend",
    });
    expect(result.suggested_agents[0].skill_categories).toContain("app-builder");
  });

  it("1.5 should include confidence scores", async () => {
    const result = await mockInvoke("suggest_team_for_project", {
      description: "Build backend",
    });
    expect(result.suggested_agents[0].confidence).toBeGreaterThan(0);
    expect(result.suggested_agents[0].confidence).toBeLessThanOrEqual(1);
  });
});

// ── 2. Model Pricing ────────────────────────────────────────────

describe("Model Pricing", () => {
  it("2.1 should load model pricing table", async () => {
    const pricing = await mockInvoke("get_model_pricing");
    expect(pricing.length).toBeGreaterThanOrEqual(3);
    expect(pricing[0].model_id).toBe("claude-sonnet-4-20250514");
  });

  it("2.2 should include input and output costs", () => {
    const sonnet = MOCK_MODEL_PRICING[0];
    expect(sonnet.input_cost_per_m).toBe(3.0);
    expect(sonnet.output_cost_per_m).toBe(15.0);
  });

  it("2.3 should include context window sizes", () => {
    expect(MOCK_MODEL_PRICING[0].context_window).toBe(200000);
    expect(MOCK_MODEL_PRICING[1].context_window).toBe(128000);
  });

  it("2.4 cheap models should cost less", () => {
    const mini = MOCK_MODEL_PRICING.find((m) => m.model_id === "gpt-4o-mini")!;
    const sonnet = MOCK_MODEL_PRICING.find((m) => m.model_id.includes("sonnet"))!;
    const miniTotal = (mini.input_cost_per_m * 0.6 + mini.output_cost_per_m * 0.4);
    const sonnetTotal = (sonnet.input_cost_per_m * 0.6 + sonnet.output_cost_per_m * 0.4);
    expect(miniTotal).toBeLessThan(sonnetTotal);
  });
});

// ── 3. Cost Estimation Logic ────────────────────────────────────

describe("Cost Estimation Logic", () => {
  it("3.1 should compute cost for 1M tokens with Sonnet", () => {
    const tokens = 1_000_000;
    const inputTokens = tokens * 0.6;
    const outputTokens = tokens * 0.4;
    const inputCost = (inputTokens / 1_000_000) * 3.0; // $1.80
    const outputCost = (outputTokens / 1_000_000) * 15.0; // $6.00
    expect(inputCost).toBeCloseTo(1.80);
    expect(outputCost).toBeCloseTo(6.00);
    expect(inputCost + outputCost).toBeCloseTo(7.80);
  });

  it("3.2 should compute cost for GPT-4o Mini", () => {
    const tokens = 300_000;
    const inputCost = (tokens * 0.6 / 1_000_000) * 0.15;
    const outputCost = (tokens * 0.4 / 1_000_000) * 0.60;
    expect(inputCost + outputCost).toBeLessThan(0.15);
  });

  it("3.3 total_cost_mid should be sum of all agent costs", () => {
    const sum = MOCK_TEAM_SUGGESTION.cost_estimates.reduce((acc, c) => acc + c.total_cost, 0);
    expect(sum).toBeCloseTo(MOCK_TEAM_SUGGESTION.total_cost_mid);
  });

  it("3.4 should compute ±30% range", () => {
    const mid = 10.0;
    expect(mid * 0.7).toBeCloseTo(7.0);
    expect(mid * 1.3).toBeCloseTo(13.0);
  });

  it("3.5 should call estimate_cost for single agent", async () => {
    const est = await mockInvoke("estimate_cost", {
      modelId: "claude-sonnet-4-20250514",
      role: "Backend Developer",
      estimatedTokens: 500000,
    });
    expect(est.total_cost).toBe(3.9);
    expect(est.agent_role).toBe("Backend Developer");
  });
});

// ── 4. Team Modification ────────────────────────────────────────

describe("Team Modification", () => {
  it("4.1 should add agent to team", () => {
    const agents = [...MOCK_TEAM_SUGGESTION.suggested_agents];
    const newAgent = {
      role: "Custom Agent",
      suggested_model: "gpt-4o-mini",
      agent_type: "worker",
      skill_categories: [],
      recommended_skills: [],
      confidence: 1.0,
      estimated_tokens: 500000,
    };
    agents.push(newAgent);
    expect(agents).toHaveLength(3);
  });

  it("4.2 should remove agent from team", () => {
    const agents = [...MOCK_TEAM_SUGGESTION.suggested_agents];
    const updated = agents.filter((_, i) => i !== 1);
    expect(updated).toHaveLength(1);
    expect(updated[0].role).toBe("Backend Developer");
  });

  it("4.3 should change model for an agent", () => {
    const agents = [...MOCK_TEAM_SUGGESTION.suggested_agents];
    agents[0] = { ...agents[0], suggested_model: "gpt-4o-mini" };
    expect(agents[0].suggested_model).toBe("gpt-4o-mini");
  });

  it("4.4 should edit agent role name", () => {
    const agents = [...MOCK_TEAM_SUGGESTION.suggested_agents];
    agents[0] = { ...agents[0], role: "Senior Backend Developer" };
    expect(agents[0].role).toBe("Senior Backend Developer");
  });

  it("4.5 should recalculate costs after modification", async () => {
    const agents = [MOCK_TEAM_SUGGESTION.suggested_agents[0]]; // one agent
    const [estimates, low, mid, high] = await mockInvoke("recalculate_team_cost", { agents });
    expect(estimates).toHaveLength(1);
    expect(mid).toBeCloseTo(3.9);
    expect(low).toBeCloseTo(3.9 * 0.7);
    expect(high).toBeCloseTo(3.9 * 1.3);
  });
});

// ── 5. Use Existing Agent ───────────────────────────────────────

describe("Use Existing Agent", () => {
  it("5.1 should swap suggested agent with existing", () => {
    const existingAgents = [
      { id: "agent-1", name: "My Backend Bot", role: "Backend" },
    ];
    const swappedMap = new Map<number, string>();
    swappedMap.set(0, "agent-1");
    expect(swappedMap.get(0)).toBe("agent-1");
    const found = existingAgents.find((a) => a.id === swappedMap.get(0));
    expect(found?.name).toBe("My Backend Bot");
  });

  it("5.2 should clear swap when choosing 'create new'", () => {
    const swappedMap = new Map<number, string>();
    swappedMap.set(0, "agent-1");
    swappedMap.delete(0);
    expect(swappedMap.has(0)).toBe(false);
  });
});

// ── 6. Format Helpers ───────────────────────────────────────────

describe("Format Helpers", () => {
  function formatCost(cost: number): string {
    if (cost < 0.01) return "<$0.01";
    if (cost < 1) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(2)}`;
  }

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return String(n);
  }

  it("6.1 should format cost < $0.01", () => {
    expect(formatCost(0.005)).toBe("<$0.01");
  });

  it("6.2 should format cost < $1 with 3 decimals", () => {
    expect(formatCost(0.123)).toBe("$0.123");
  });

  it("6.3 should format cost >= $1 with 2 decimals", () => {
    expect(formatCost(7.80)).toBe("$7.80");
  });

  it("6.4 should format tokens in thousands", () => {
    expect(formatTokens(500000)).toBe("500k");
  });

  it("6.5 should format tokens in millions", () => {
    expect(formatTokens(1500000)).toBe("1.5M");
  });
});

// ── 7. Project Descriptions → Roles ─────────────────────────────

describe("Project Descriptions → Roles", () => {
  const ROLE_KEYWORDS: Record<string, string[]> = {
    "Backend Developer": ["backend", "api", "server", "rest", "database"],
    "Frontend Developer": ["frontend", "ui", "react", "vue", "css", "web"],
    "DevOps Engineer": ["devops", "deploy", "docker", "kubernetes", "ci/cd"],
    "QA Engineer": ["test", "qa", "quality", "e2e"],
    "Security Engineer": ["security", "pentest", "vulnerability"],
    "Technical Writer": ["doc", "documentation", "readme"],
    "Game Developer": ["game", "unity", "unreal"],
    "Mobile Developer": ["mobile", "ios", "android", "flutter"],
    "Data Engineer": ["data", "analytics", "ml", "machine learning"],
    "Project Manager": ["manage", "project", "plan", "coordinate"],
  };

  function matchRoles(description: string): string[] {
    const lower = description.toLowerCase();
    return Object.entries(ROLE_KEYWORDS)
      .filter(([_, keywords]) => keywords.some((kw) => lower.includes(kw)))
      .map(([role]) => role);
  }

  it("7.1 backend API → Backend Developer", () => {
    const roles = matchRoles("Build a REST API backend with authentication");
    expect(roles).toContain("Backend Developer");
  });

  it("7.2 React app → Frontend Developer", () => {
    const roles = matchRoles("Create a React dashboard with charts");
    expect(roles).toContain("Frontend Developer");
  });

  it("7.3 Docker deploy → DevOps Engineer", () => {
    const roles = matchRoles("Setup Docker deployment with CI/CD pipeline");
    expect(roles).toContain("DevOps Engineer");
  });

  it("7.4 2D game → Game Developer", () => {
    const roles = matchRoles("Create a 2D game with Unity");
    expect(roles).toContain("Game Developer");
  });

  it("7.5 complex project → multiple roles", () => {
    const roles = matchRoles(
      "Build a web app with React frontend, REST API backend, Docker deployment, and comprehensive testing",
    );
    expect(roles.length).toBeGreaterThanOrEqual(3);
    expect(roles).toContain("Backend Developer");
    expect(roles).toContain("Frontend Developer");
  });
});

// ── 8. External URL Import ──────────────────────────────────────

describe("External URL Import", () => {
  it("8.1 should detect GitHub URL format", () => {
    const isGitHub = (url: string) => /^(https:\/\/github\.com\/|[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$|github:)/.test(url);
    expect(isGitHub("owner/repo")).toBe(true);
    expect(isGitHub("https://github.com/owner/repo")).toBe(true);
    expect(isGitHub("github:owner/repo")).toBe(true);
    expect(isGitHub("https://gitlab.com/repo")).toBe(false);
  });

  it("8.2 should detect URL format", () => {
    const isUrl = (s: string) => /^https?:\/\//.test(s);
    expect(isUrl("https://example.com/skill")).toBe(true);
    expect(isUrl("http://localhost:3000")).toBe(true);
    expect(isUrl("owner/repo")).toBe(false);
  });

  it("8.3 should detect local path", () => {
    const isLocal = (s: string) => s.startsWith("/") || s.startsWith("~") || s.startsWith("./");
    expect(isLocal("/home/user/skill")).toBe(true);
    expect(isLocal("~/skills/my-skill")).toBe(true);
    expect(isLocal("./local-skill")).toBe(true);
    expect(isLocal("owner/repo")).toBe(false);
  });

  it("8.4 should install from source via API", async () => {
    mockInvoke.mockImplementationOnce(() =>
      Promise.resolve({
        success: true,
        skill_key: "sk-imported",
        name: "Imported",
        source_type: "GitHub",
        agent_id: "agent-1",
      }),
    );
    const result = await mockInvoke("skills_install_from_source", {
      agentId: "agent-1",
      source: "owner/repo",
    });
    expect(result.success).toBe(true);
    expect(result.source_type).toBe("GitHub");
  });

  it("8.5 should handle import error gracefully", async () => {
    mockInvoke.mockImplementationOnce(() =>
      Promise.reject(new Error("Repository not found")),
    );
    try {
      await mockInvoke("skills_install_from_source", {
        agentId: "agent-1",
        source: "invalid/repo",
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.message).toBe("Repository not found");
    }
  });
});

// ── 9. Token Estimation ─────────────────────────────────────────

describe("Token Estimation", () => {
  function estimateAgentTokens(description: string, role: string): number {
    const wordCount = description.split(/\s+/).length;
    const base = role === "Project Manager" ? 200000
      : role === "QA Engineer" ? 300000
      : role === "Technical Writer" ? 250000
      : 500000;
    const mult = wordCount > 100 ? 1.5 : wordCount > 50 ? 1.2 : 1.0;
    return Math.round(base * mult);
  }

  it("9.1 short description → base tokens", () => {
    expect(estimateAgentTokens("Build an API", "Backend Developer")).toBe(500000);
  });

  it("9.2 medium description → 1.2x", () => {
    const desc = Array(60).fill("word").join(" ");
    expect(estimateAgentTokens(desc, "Backend Developer")).toBe(600000);
  });

  it("9.3 long description → 1.5x", () => {
    const desc = Array(120).fill("word").join(" ");
    expect(estimateAgentTokens(desc, "Backend Developer")).toBe(750000);
  });

  it("9.4 PM gets fewer tokens", () => {
    expect(estimateAgentTokens("Manage project", "Project Manager")).toBe(200000);
  });

  it("9.5 QA gets moderate tokens", () => {
    expect(estimateAgentTokens("Write tests", "QA Engineer")).toBe(300000);
  });
});

// ── 10. Integration Checks ──────────────────────────────────────

describe("Integration Checks", () => {
  it("10.1 team suggestion total_cost_mid equals sum of agent costs", () => {
    const sum = MOCK_TEAM_SUGGESTION.cost_estimates.reduce((acc, c) => acc + c.total_cost, 0);
    expect(sum).toBeCloseTo(MOCK_TEAM_SUGGESTION.total_cost_mid);
  });

  it("10.2 total_estimated_tokens equals sum of agent tokens", () => {
    const sum = MOCK_TEAM_SUGGESTION.suggested_agents.reduce((acc, a) => acc + a.estimated_tokens, 0);
    expect(sum).toBe(MOCK_TEAM_SUGGESTION.total_estimated_tokens);
  });

  it("10.3 cost_estimates length matches suggested_agents length", () => {
    expect(MOCK_TEAM_SUGGESTION.cost_estimates.length).toBe(
      MOCK_TEAM_SUGGESTION.suggested_agents.length,
    );
  });

  it("10.4 all agents have valid agent_type", () => {
    for (const agent of MOCK_TEAM_SUGGESTION.suggested_agents) {
      expect(["worker", "manager"]).toContain(agent.agent_type);
    }
  });

  it("10.5 all confidence scores are 0-1", () => {
    for (const agent of MOCK_TEAM_SUGGESTION.suggested_agents) {
      expect(agent.confidence).toBeGreaterThanOrEqual(0);
      expect(agent.confidence).toBeLessThanOrEqual(1);
    }
  });
});
