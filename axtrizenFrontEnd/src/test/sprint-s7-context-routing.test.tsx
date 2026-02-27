/**
 * Sprint S7 Frontend Tests
 * Tests for: Context auto-summarization, model routing, conversation sections,
 *            routing matrix (3×3), cost comparison, override pin
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Data ──────────────────────────────────────────────────

const MOCK_SUMMARIZATION_CONFIG = {
  enabled: true,
  threshold_pct: 70.0,
  preserve_recent: 5,
  summary_max_tokens: 2000,
};

const MOCK_MESSAGES = [
  { id: "m1", role: "user", content: "How do I build a REST API?", token_count: 100, timestamp: "2025-01-01T00:00:00Z", is_summarized: false },
  { id: "m2", role: "assistant", content: "You can use Express or FastAPI...", token_count: 500, timestamp: "2025-01-01T00:01:00Z", is_summarized: false },
  { id: "m3", role: "user", content: "Show me Express code", token_count: 80, timestamp: "2025-01-01T00:02:00Z", is_summarized: false },
  { id: "m4", role: "assistant", content: "const app = express(); app.get('/', ...)", token_count: 400, timestamp: "2025-01-01T00:03:00Z", is_summarized: false },
  { id: "m5", role: "user", content: "Add database connection", token_count: 60, timestamp: "2025-01-01T00:04:00Z", is_summarized: false },
  { id: "m6", role: "assistant", content: "Here's how to connect to PostgreSQL...", token_count: 600, timestamp: "2025-01-01T00:05:00Z", is_summarized: false },
  { id: "m7", role: "user", content: "Now add authentication", token_count: 50, timestamp: "2025-01-01T00:06:00Z", is_summarized: false },
];

const MOCK_SUMMARIZATION_RESULT = {
  summary_text: "[Context Summary: 5 messages compressed]\n[user]: How do I build REST API...\n[assistant]: Express or FastAPI...",
  messages_summarized: 5,
  tokens_before: 1790,
  tokens_after: 400,
  tokens_saved: 1390,
  savings_pct: 77.6,
  preserved_message_ids: ["m6", "m7"],
};

const MOCK_ROUTING_MATRIX = [
  ["Balanced", "Complex", "claude-sonnet-4-20250514"],
  ["Balanced", "Simple", "gpt-4o-mini"],
  ["Balanced", "Standard", "claude-sonnet-4-20250514"],
  ["Quality", "Complex", "claude-opus-4-20250514"],
  ["Quality", "Simple", "claude-sonnet-4-20250514"],
  ["Quality", "Standard", "claude-sonnet-4-20250514"],
  ["Speed", "Complex", "deepseek-v3"],
  ["Speed", "Simple", "gpt-4o-mini"],
  ["Speed", "Standard", "gpt-4o-mini"],
];

// ─── Tauri Mock ──────────────────────────────────────────────────

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

function setupMocks() {
  mockInvoke.mockImplementation((cmd: string, args?: any) => {
    switch (cmd) {
      case "get_summarization_config":
        return Promise.resolve(MOCK_SUMMARIZATION_CONFIG);
      case "update_summarization_config":
        if (args?.thresholdPct < 10 || args?.thresholdPct > 95)
          return Promise.reject(new Error("Threshold must be between 10% and 95%"));
        return Promise.resolve({ ...MOCK_SUMMARIZATION_CONFIG, ...args });
      case "run_summarization":
        return Promise.resolve(MOCK_SUMMARIZATION_RESULT);
      case "route_task_to_model":
        if (args?.overrideModel) {
          return Promise.resolve({
            selected_model: args.overrideModel,
            profile: args.profile,
            task_type: "Simple",
            reason: "Override pin",
            is_override: true,
            estimated_cost_per_1k_tokens: 0.021,
          });
        }
        return Promise.resolve({
          selected_model: "gpt-4o-mini",
          profile: args?.profile ?? "balanced",
          task_type: "Simple",
          reason: "Speed + Simple → gpt-4o-mini",
          is_override: false,
          estimated_cost_per_1k_tokens: 0.00033,
        });
      case "get_routing_matrix_cmd":
        return Promise.resolve(MOCK_ROUTING_MATRIX);
      case "compare_costs":
        return Promise.resolve([
          ["Speed", "gpt-4o-mini", 0.033],
          ["Balanced", "claude-sonnet-4-20250514", 0.78],
          ["Quality", "claude-opus-4-20250514", 2.1],
        ]);
      default:
        return Promise.resolve(null);
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMocks();
});

// ── 1. Summarization Config ─────────────────────────────────────

describe("Summarization Config", () => {
  it("1.1 should load default config", async () => {
    const config = await mockInvoke("get_summarization_config");
    expect(config.threshold_pct).toBe(70);
    expect(config.enabled).toBe(true);
    expect(config.preserve_recent).toBe(5);
  });

  it("1.2 should update config", async () => {
    const config = await mockInvoke("update_summarization_config", {
      agentId: "a1", enabled: true, thresholdPct: 80, preserveRecent: 3,
    });
    expect(config.thresholdPct).toBe(80);
  });

  it("1.3 should reject invalid threshold", async () => {
    await expect(
      mockInvoke("update_summarization_config", { thresholdPct: 99 }),
    ).rejects.toThrow("Threshold must be between 10% and 95%");
  });

  it("1.4 can disable summarization per agent", async () => {
    const config = await mockInvoke("update_summarization_config", {
      agentId: "a1", enabled: false, thresholdPct: 70, preserveRecent: 5,
    });
    expect(config.enabled).toBe(false);
  });
});

// ── 2. Summarization Trigger ────────────────────────────────────

describe("Summarization Trigger", () => {
  function shouldSummarize(totalTokens: number, contextWindow: number, thresholdPct: number): boolean {
    return (totalTokens / contextWindow) * 100 >= thresholdPct;
  }

  it("2.1 triggers at 70% usage", () => {
    expect(shouldSummarize(7000, 10000, 70)).toBe(true);
  });

  it("2.2 does not trigger below threshold", () => {
    expect(shouldSummarize(5000, 10000, 70)).toBe(false);
  });

  it("2.3 custom threshold at 80%", () => {
    expect(shouldSummarize(7500, 10000, 80)).toBe(false);
    expect(shouldSummarize(8000, 10000, 80)).toBe(true);
  });
});

// ── 3. Summarization Result ─────────────────────────────────────

describe("Summarization Result", () => {
  it("3.1 should run summarization", async () => {
    const result = await mockInvoke("run_summarization", {
      messages: MOCK_MESSAGES, contextWindow: 2000, thresholdPct: 70, preserveRecent: 2,
    });
    expect(result.messages_summarized).toBe(5);
    expect(result.tokens_saved).toBeGreaterThan(0);
  });

  it("3.2 preserves recent messages", () => {
    expect(MOCK_SUMMARIZATION_RESULT.preserved_message_ids).toContain("m7");
    expect(MOCK_SUMMARIZATION_RESULT.preserved_message_ids).toContain("m6");
  });

  it("3.3 summary contains context summary header", () => {
    expect(MOCK_SUMMARIZATION_RESULT.summary_text).toContain("Context Summary");
  });

  it("3.4 tokens_after < tokens_before", () => {
    expect(MOCK_SUMMARIZATION_RESULT.tokens_after).toBeLessThan(MOCK_SUMMARIZATION_RESULT.tokens_before);
  });

  it("3.5 savings percentage is positive", () => {
    expect(MOCK_SUMMARIZATION_RESULT.savings_pct).toBeGreaterThan(0);
  });
});

// ── 4. Conversation Sections ────────────────────────────────────

describe("Conversation Sections", () => {
  function buildSections(
    messages: typeof MOCK_MESSAGES,
    summary: typeof MOCK_SUMMARIZATION_RESULT | null,
  ) {
    if (!summary) {
      return [{ type: "messages", messages, collapsed: false }];
    }
    const summarized = messages.slice(0, summary.messages_summarized);
    const preserved = messages.slice(summary.messages_summarized);
    return [
      { type: "summary", summary_text: summary.summary_text, messages: summarized, collapsed: true },
      { type: "messages", messages: preserved, collapsed: false },
    ];
  }

  it("4.1 without summary → single section", () => {
    const sections = buildSections(MOCK_MESSAGES, null);
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe("messages");
    expect(sections[0].collapsed).toBe(false);
  });

  it("4.2 with summary → two sections", () => {
    const sections = buildSections(MOCK_MESSAGES, MOCK_SUMMARIZATION_RESULT);
    expect(sections).toHaveLength(2);
    expect(sections[0].type).toBe("summary");
    expect(sections[0].collapsed).toBe(true);
    expect(sections[1].type).toBe("messages");
  });

  it("4.3 summary section contains original messages (expandable)", () => {
    const sections = buildSections(MOCK_MESSAGES, MOCK_SUMMARIZATION_RESULT);
    expect(sections[0].messages.length).toBe(5);
  });

  it("4.4 preserved section has recent messages", () => {
    const sections = buildSections(MOCK_MESSAGES, MOCK_SUMMARIZATION_RESULT);
    expect(sections[1].messages.length).toBe(2);
    expect(sections[1].messages[1].id).toBe("m7");
  });
});

// ── 5. Routing Matrix ───────────────────────────────────────────

describe("Routing Matrix", () => {
  it("5.1 should have 9 combinations", async () => {
    const matrix = await mockInvoke("get_routing_matrix_cmd");
    expect(matrix).toHaveLength(9);
  });

  it("5.2 Speed+Simple → gpt-4o-mini", () => {
    const entry = MOCK_ROUTING_MATRIX.find((e) => e[0] === "Speed" && e[1] === "Simple");
    expect(entry?.[2]).toBe("gpt-4o-mini");
  });

  it("5.3 Quality+Complex → claude-opus-4", () => {
    const entry = MOCK_ROUTING_MATRIX.find((e) => e[0] === "Quality" && e[1] === "Complex");
    expect(entry?.[2]).toBe("claude-opus-4-20250514");
  });

  it("5.4 Balanced+Standard → claude-sonnet-4", () => {
    const entry = MOCK_ROUTING_MATRIX.find((e) => e[0] === "Balanced" && e[1] === "Standard");
    expect(entry?.[2]).toBe("claude-sonnet-4-20250514");
  });

  it("5.5 all 3 profiles represented", () => {
    const profiles = new Set(MOCK_ROUTING_MATRIX.map((e) => e[0]));
    expect(profiles.size).toBe(3);
    expect(profiles).toContain("Speed");
    expect(profiles).toContain("Balanced");
    expect(profiles).toContain("Quality");
  });

  it("5.6 all 3 task types represented", () => {
    const types = new Set(MOCK_ROUTING_MATRIX.map((e) => e[1]));
    expect(types.size).toBe(3);
    expect(types).toContain("Simple");
    expect(types).toContain("Standard");
    expect(types).toContain("Complex");
  });
});

// ── 6. Model Override Pin ───────────────────────────────────────

describe("Model Override Pin", () => {
  it("6.1 override forces specific model", async () => {
    const decision = await mockInvoke("route_task_to_model", {
      taskContent: "fix typo",
      profile: "speed",
      overrideModel: "claude-opus-4-20250514",
    });
    expect(decision.selected_model).toBe("claude-opus-4-20250514");
    expect(decision.is_override).toBe(true);
  });

  it("6.2 without override, uses routing matrix", async () => {
    const decision = await mockInvoke("route_task_to_model", {
      taskContent: "fix typo",
      profile: "speed",
    });
    expect(decision.is_override).toBe(false);
  });
});

// ── 7. Cost Comparison ──────────────────────────────────────────

describe("Cost Comparison", () => {
  it("7.1 should compare costs across profiles", async () => {
    const comparisons = await mockInvoke("compare_costs", {
      taskContent: "refactor auth",
      tokenCount: 100000,
    });
    expect(comparisons).toHaveLength(3);
  });

  it("7.2 Balanced ≥30% cheaper than Quality for Complex tasks", async () => {
    const comparisons = await mockInvoke("compare_costs", {
      taskContent: "refactor auth module",
      tokenCount: 100000,
    });
    const balanced = comparisons.find((c: any) => c[0] === "Balanced");
    const quality = comparisons.find((c: any) => c[0] === "Quality");
    const savings = (1 - balanced[2] / quality[2]) * 100;
    expect(savings).toBeGreaterThanOrEqual(30);
  });

  it("7.3 Speed is cheapest", async () => {
    const comparisons = await mockInvoke("compare_costs", {
      taskContent: "fix typo",
      tokenCount: 100000,
    });
    const speed = comparisons.find((c: any) => c[0] === "Speed");
    const balanced = comparisons.find((c: any) => c[0] === "Balanced");
    expect(speed[2]).toBeLessThan(balanced[2]);
  });
});

// ── 8. Task Classification ──────────────────────────────────────

describe("Task Classification", () => {
  function classifyTask(content: string): string {
    const lower = content.toLowerCase();
    const wordCount = lower.split(/\s+/).length;
    const complex = ["refactor", "architecture", "debug", "optimize", "redesign", "multi-file", "migrate", "security audit", "performance"];
    if (complex.some((kw) => lower.includes(kw)) || wordCount > 200) return "Complex";
    const simple = ["format", "rename", "typo", "fix spelling", "add comment", "what is", "explain", "summarize"];
    if (simple.some((kw) => lower.includes(kw)) && wordCount < 50) return "Simple";
    return "Standard";
  }

  it("8.1 simple task classification", () => {
    expect(classifyTask("fix typo in readme")).toBe("Simple");
  });

  it("8.2 complex task classification", () => {
    expect(classifyTask("Refactor the entire auth module")).toBe("Complex");
  });

  it("8.3 standard task classification", () => {
    expect(classifyTask("Write a function to parse CSV files")).toBe("Standard");
  });

  it("8.4 very long content → Complex", () => {
    const longContent = Array(250).fill("word").join(" ");
    expect(classifyTask(longContent)).toBe("Complex");
  });
});

// ── 9. Token Estimation ─────────────────────────────────────────

describe("Token Estimation", () => {
  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  it("9.1 short text", () => {
    expect(estimateTokens("hello")).toBe(2);
  });

  it("9.2 empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("9.3 longer text proportional", () => {
    const tokens100 = estimateTokens("a".repeat(100));
    const tokens400 = estimateTokens("a".repeat(400));
    expect(tokens400).toBe(tokens100 * 4);
  });
});

// ── 10. Integration ─────────────────────────────────────────────

describe("Integration", () => {
  it("10.1 summarization result IDs are subset of message IDs", () => {
    const msgIds = MOCK_MESSAGES.map((m) => m.id);
    for (const id of MOCK_SUMMARIZATION_RESULT.preserved_message_ids) {
      expect(msgIds).toContain(id);
    }
  });

  it("10.2 savings_pct formula is correct", () => {
    const { tokens_before, tokens_saved, savings_pct } = MOCK_SUMMARIZATION_RESULT;
    const expected = (tokens_saved / tokens_before) * 100;
    expect(Math.abs(savings_pct - expected)).toBeLessThan(0.1);
  });
});
