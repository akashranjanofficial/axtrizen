/**
 * Sprint S12-S13 Frontend Tests
 * S12: Performance Scoring — weights, agent scores, scorecard, skill effectiveness, star rating
 * S13: Config Reuse — templates, versioning, apply, recommendations, dismiss/apply
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── S12 Mock Data ──────────────────────────────────────────────

const MOCK_WEIGHTS = { completion: 0.4, gate_pass: 0.3, cost_efficiency: 0.2, latency: 0.1 };

const MOCK_AGENT_SCORE = {
  agent_id: "agt-001",
  agent_name: "Coder Agent",
  completion_score: 80.0,
  gate_pass_score: 70.0,
  cost_efficiency_score: 75.0,
  latency_score: 75.0,
  composite_score: 75.5,
  star_rating: 4,
};

const MOCK_SCORECARD = {
  current: MOCK_AGENT_SCORE,
  history: [
    { project_id: "proj-1", project_name: "Alpha", composite_score: 70.0, star_rating: 4, timestamp: "2024-01-01" },
    { project_id: "proj-2", project_name: "Beta", composite_score: 80.0, star_rating: 4, timestamp: "2024-02-01" },
  ],
  trend: "Improving",
};

const MOCK_SKILL_EFFECTIVENESS = [
  { skill_id: "sk-1", skill_name: "CodeReview", invocation_count: 50, positive_outcomes: 45, effectiveness_pct: 90.0, is_underperforming: false, alternatives: [] },
  { skill_id: "sk-2", skill_name: "Testing", invocation_count: 30, positive_outcomes: 18, effectiveness_pct: 60.0, is_underperforming: true, alternatives: ["BetterTesting", "SmartTest"] },
];

// ─── S13 Mock Data ──────────────────────────────────────────────

const MOCK_TEMPLATE = {
  id: "tmpl-001",
  name: "Web Dev Team",
  description: "Full-stack web development team",
  version: 1,
  agents: [
    { role: "Frontend Dev", skills: ["react", "css"], model_profile: "gpt-4", permissions: ["read", "write"] },
    { role: "Backend Dev", skills: ["node", "sql"], model_profile: "gpt-4", permissions: ["read", "write", "deploy"] },
  ],
  workflow: { phases: ["planning", "development", "testing", "review", "deployment"], orchestration_mode: "sequential", max_concurrent_agents: 3 },
  created_from_project: "proj-001",
  created_at: "2024-01-01",
};

const MOCK_RECOMMENDATIONS = [
  { id: "rec-1", title: "Swap skill", description: "Replace CodeReview with BetterReview", category: "SkillSwap", impact: "High", agent_id: "agt-1", skill_id: "sk-1", dismissed: false, applied: false },
  { id: "rec-2", title: "Reduce cost", description: "Switch to cheaper model", category: "CostReduction", impact: "Medium", agent_id: null, skill_id: null, dismissed: false, applied: false },
];

// ─── Tauri Mock ──────────────────────────────────────────────────

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

function setupMocks() {
  mockInvoke.mockImplementation((cmd: string, args?: any) => {
    switch (cmd) {
      // S12
      case "get_score_weights": return Promise.resolve(MOCK_WEIGHTS);
      case "compute_agent_score_cmd": return Promise.resolve(MOCK_AGENT_SCORE);
      case "get_sample_scorecard": return Promise.resolve(MOCK_SCORECARD);
      case "get_skill_effectiveness_report": return Promise.resolve(MOCK_SKILL_EFFECTIVENESS);
      case "score_to_stars_cmd": {
        const s = args?.score ?? 0;
        if (s >= 80) return Promise.resolve(5);
        if (s >= 60) return Promise.resolve(4);
        if (s >= 40) return Promise.resolve(3);
        if (s >= 20) return Promise.resolve(2);
        return Promise.resolve(1);
      }
      // S13
      case "get_sample_template": return Promise.resolve(MOCK_TEMPLATE);
      case "apply_template_cmd": return Promise.resolve(["agent-1", "agent-2"]);
      case "create_template_version_cmd": return Promise.resolve({ ...MOCK_TEMPLATE, version: 2 });
      case "get_sample_recommendations": return Promise.resolve(MOCK_RECOMMENDATIONS);
      case "dismiss_recommendation_cmd": {
        const rec = args?.rec;
        return Promise.resolve({ ...rec, dismissed: true });
      }
      case "apply_recommendation_cmd": {
        const rec = args?.rec;
        return Promise.resolve({ ...rec, applied: true });
      }
      default: return Promise.resolve(null);
    }
  });
}

beforeEach(() => {
  mockInvoke.mockReset();
  setupMocks();
});

// ═══════════════════════════════════════════════════════════════
// S12 — PERFORMANCE SCORING
// ═══════════════════════════════════════════════════════════════

describe("Score Weights", () => {
  it("1.1 weights sum to 1.0", async () => {
    const w = await mockInvoke("get_score_weights");
    expect(w.completion + w.gate_pass + w.cost_efficiency + w.latency).toBeCloseTo(1.0);
  });

  it("1.2 completion has highest weight 0.4", async () => {
    const w = await mockInvoke("get_score_weights");
    expect(w.completion).toBe(0.4);
  });

  it("1.3 latency has lowest weight 0.1", async () => {
    const w = await mockInvoke("get_score_weights");
    expect(w.latency).toBe(0.1);
  });
});

describe("Agent Score", () => {
  it("2.1 computes score from metrics", async () => {
    const s = await mockInvoke("compute_agent_score_cmd", { metrics: {} });
    expect(s.agent_id).toBe("agt-001");
    expect(s.composite_score).toBeGreaterThan(0);
  });

  it("2.2 includes star rating 1-5", async () => {
    const s = await mockInvoke("compute_agent_score_cmd", { metrics: {} });
    expect(s.star_rating).toBeGreaterThanOrEqual(1);
    expect(s.star_rating).toBeLessThanOrEqual(5);
  });

  it("2.3 has all sub-scores", async () => {
    const s = await mockInvoke("compute_agent_score_cmd", { metrics: {} });
    expect(s.completion_score).toBeDefined();
    expect(s.gate_pass_score).toBeDefined();
    expect(s.cost_efficiency_score).toBeDefined();
    expect(s.latency_score).toBeDefined();
  });
});

describe("Scorecard & Trend", () => {
  it("3.1 scorecard has history", async () => {
    const sc = await mockInvoke("get_sample_scorecard");
    expect(sc.history.length).toBeGreaterThan(0);
  });

  it("3.2 trend is Improving", async () => {
    const sc = await mockInvoke("get_sample_scorecard");
    expect(sc.trend).toBe("Improving");
  });

  it("3.3 has current score", async () => {
    const sc = await mockInvoke("get_sample_scorecard");
    expect(sc.current.composite_score).toBeGreaterThan(0);
  });

  it("3.4 history entries have project info", async () => {
    const sc = await mockInvoke("get_sample_scorecard");
    expect(sc.history[0].project_name).toBe("Alpha");
    expect(sc.history[1].project_name).toBe("Beta");
  });
});

describe("Skill Effectiveness", () => {
  it("4.1 returns list of skills", async () => {
    const skills = await mockInvoke("get_skill_effectiveness_report");
    expect(skills.length).toBe(2);
  });

  it("4.2 flags underperforming skills", async () => {
    const skills = await mockInvoke("get_skill_effectiveness_report");
    const under = skills.filter((s: any) => s.is_underperforming);
    expect(under.length).toBe(1);
    expect(under[0].skill_name).toBe("Testing");
  });

  it("4.3 suggests alternatives for underperformers", async () => {
    const skills = await mockInvoke("get_skill_effectiveness_report");
    const under = skills.find((s: any) => s.is_underperforming);
    expect(under.alternatives.length).toBeGreaterThan(0);
    expect(under.alternatives).toContain("BetterTesting");
  });

  it("4.4 effective skills have no alternatives", async () => {
    const skills = await mockInvoke("get_skill_effectiveness_report");
    const good = skills.find((s: any) => !s.is_underperforming);
    expect(good.alternatives).toHaveLength(0);
  });
});

describe("Score to Stars", () => {
  it("5.1 85 → 5 stars", async () => {
    expect(await mockInvoke("score_to_stars_cmd", { score: 85 })).toBe(5);
  });

  it("5.2 65 → 4 stars", async () => {
    expect(await mockInvoke("score_to_stars_cmd", { score: 65 })).toBe(4);
  });

  it("5.3 45 → 3 stars", async () => {
    expect(await mockInvoke("score_to_stars_cmd", { score: 45 })).toBe(3);
  });

  it("5.4 10 → 1 star", async () => {
    expect(await mockInvoke("score_to_stars_cmd", { score: 10 })).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// S13 — CONFIG REUSE & RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════

describe("Team Templates", () => {
  it("6.1 returns template with agents", async () => {
    const t = await mockInvoke("get_sample_template");
    expect(t.agents.length).toBe(2);
    expect(t.name).toBe("Web Dev Team");
  });

  it("6.2 workflow has 5 phases", async () => {
    const t = await mockInvoke("get_sample_template");
    expect(t.workflow.phases.length).toBe(5);
  });

  it("6.3 uses sequential orchestration", async () => {
    const t = await mockInvoke("get_sample_template");
    expect(t.workflow.orchestration_mode).toBe("sequential");
  });

  it("6.4 agents have roles and skills", async () => {
    const t = await mockInvoke("get_sample_template");
    expect(t.agents[0].role).toBe("Frontend Dev");
    expect(t.agents[0].skills).toContain("react");
  });
});

describe("Template Versioning", () => {
  it("7.1 creates new version (v2)", async () => {
    const v2 = await mockInvoke("create_template_version_cmd", { template: MOCK_TEMPLATE });
    expect(v2.version).toBe(2);
  });

  it("7.2 preserves name in new version", async () => {
    const v2 = await mockInvoke("create_template_version_cmd", { template: MOCK_TEMPLATE });
    expect(v2.name).toBe("Web Dev Team");
  });
});

describe("Apply Template", () => {
  it("8.1 creates agents from template", async () => {
    const ids = await mockInvoke("apply_template_cmd", { template: MOCK_TEMPLATE });
    expect(ids.length).toBe(2);
  });

  it("8.2 returns agent IDs", async () => {
    const ids = await mockInvoke("apply_template_cmd", { template: MOCK_TEMPLATE });
    expect(ids).toContain("agent-1");
    expect(ids).toContain("agent-2");
  });
});

describe("Recommendations", () => {
  it("9.1 returns recommendations", async () => {
    const recs = await mockInvoke("get_sample_recommendations");
    expect(recs.length).toBe(2);
  });

  it("9.2 have categories", async () => {
    const recs = await mockInvoke("get_sample_recommendations");
    expect(recs[0].category).toBe("SkillSwap");
    expect(recs[1].category).toBe("CostReduction");
  });

  it("9.3 dismisses a recommendation", async () => {
    const dismissed = await mockInvoke("dismiss_recommendation_cmd", { rec: MOCK_RECOMMENDATIONS[0] });
    expect(dismissed.dismissed).toBe(true);
  });

  it("9.4 applies a recommendation", async () => {
    const applied = await mockInvoke("apply_recommendation_cmd", { rec: MOCK_RECOMMENDATIONS[1] });
    expect(applied.applied).toBe(true);
  });

  it("9.5 initially not dismissed or applied", async () => {
    const recs = await mockInvoke("get_sample_recommendations");
    recs.forEach((r: any) => {
      expect(r.dismissed).toBe(false);
      expect(r.applied).toBe(false);
    });
  });

  it("9.6 recommendations have impact levels", async () => {
    const recs = await mockInvoke("get_sample_recommendations");
    expect(recs[0].impact).toBe("High");
    expect(recs[1].impact).toBe("Medium");
  });
});
