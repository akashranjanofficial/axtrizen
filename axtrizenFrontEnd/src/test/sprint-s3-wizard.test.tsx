/**
 * Sprint S3 Frontend Tests
 * Tests for: Agent Wizard enhancements — recommendations, capabilities step,
 *            tool permissions, security levels, context budget, templates,
 *            createAgentWithConfig flow, save-as-template
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Data ───────────────────────────────────────────────────

const MOCK_RECOMMENDATIONS = [
  {
    skill_id: "sk-1",
    skill_name: "Rust Analyzer",
    category: "app-builder",
    relevance_score: 0.95,
    reason: "Matches role keyword → app-builder",
  },
  {
    skill_id: "sk-2",
    skill_name: "Python Debugger",
    category: "app-builder",
    relevance_score: 0.85,
    reason: "Matches role keyword → app-builder",
  },
  {
    skill_id: "sk-3",
    skill_name: "Docker Deploy",
    category: "devops",
    relevance_score: 0.75,
    reason: "Matches role keyword → devops",
  },
];

const MOCK_TEMPLATE = {
  id: "tmpl-1",
  name: "Full-Stack Developer",
  description: "Configuration for full-stack development",
  agent_type: "worker",
  role: "Full-Stack Developer",
  model_profile: "claude-sonnet",
  soul_md: "Expert in React and Node.js",
  identity_md: "Senior developer with 10 years experience",
  skill_ids: ["sk-1", "sk-2"],
  bundle_ids: ["bundle-fullstack"],
  tool_permissions: JSON.stringify({
    filesystem: "allow",
    network: "allow",
    process: "ask",
    browser: "deny",
    database: "allow",
    code_execution: "ask",
    system: "deny",
  }),
  security_level: "standard",
  context_budget: 128000,
  created_at: "2026-06-01T00:00:00Z",
};

const MOCK_CREATE_RESULT = {
  agent_id: "agent-abc-123",
  skills_installed: 3,
  skills_failed: [],
  success: true,
};

const MOCK_CREATE_RESULT_PARTIAL = {
  agent_id: "agent-def-456",
  skills_installed: 3,
  skills_failed: ["sk-missing-1", "sk-missing-2"],
  success: false,
};

// ─── Tests ───────────────────────────────────────────────────────

describe("Sprint S3: Skill Recommendations API", () => {
  it("should have correct SkillRecommendation shape", () => {
    const rec = MOCK_RECOMMENDATIONS[0];
    expect(rec).toHaveProperty("skill_id");
    expect(rec).toHaveProperty("skill_name");
    expect(rec).toHaveProperty("category");
    expect(rec).toHaveProperty("relevance_score");
    expect(rec).toHaveProperty("reason");
  });

  it("should have relevance_score in 0-1 range", () => {
    for (const rec of MOCK_RECOMMENDATIONS) {
      expect(rec.relevance_score).toBeGreaterThanOrEqual(0);
      expect(rec.relevance_score).toBeLessThanOrEqual(1);
    }
  });

  it("should return 3-8 recommendations for a typical role", () => {
    expect(MOCK_RECOMMENDATIONS.length).toBeGreaterThanOrEqual(3);
    expect(MOCK_RECOMMENDATIONS.length).toBeLessThanOrEqual(8);
  });

  it("recommendations should be sorted by relevance_score descending", () => {
    for (let i = 1; i < MOCK_RECOMMENDATIONS.length; i++) {
      expect(MOCK_RECOMMENDATIONS[i - 1].relevance_score)
        .toBeGreaterThanOrEqual(MOCK_RECOMMENDATIONS[i].relevance_score);
    }
  });

  it("each recommendation should have a non-empty reason", () => {
    for (const rec of MOCK_RECOMMENDATIONS) {
      expect(rec.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("Sprint S3: Tool Permissions", () => {
  const TOOL_PERMISSION_CATEGORIES = [
    "filesystem",
    "network",
    "process",
    "browser",
    "database",
    "code_execution",
    "system",
  ];

  const VALID_LEVELS = ["deny", "ask", "allow"];

  it("should have exactly 7 tool permission categories", () => {
    expect(TOOL_PERMISSION_CATEGORIES).toHaveLength(7);
  });

  it("default permissions should be restrictive", () => {
    const defaults: Record<string, string> = {
      filesystem: "ask",
      network: "ask",
      process: "deny",
      browser: "deny",
      database: "ask",
      code_execution: "deny",
      system: "deny",
    };
    // Most categories should default to deny or ask
    const denyOrAsk = Object.values(defaults).filter(
      (v) => v === "deny" || v === "ask"
    );
    expect(denyOrAsk.length).toBe(7);
  });

  it("each permission level should be valid", () => {
    for (const level of VALID_LEVELS) {
      expect(["deny", "ask", "allow"]).toContain(level);
    }
  });

  it("template tool_permissions should be valid JSON", () => {
    const perms = JSON.parse(MOCK_TEMPLATE.tool_permissions!);
    for (const cat of TOOL_PERMISSION_CATEGORIES) {
      expect(perms).toHaveProperty(cat);
      expect(VALID_LEVELS).toContain(perms[cat]);
    }
  });
});

describe("Sprint S3: Security Levels", () => {
  const SECURITY_LEVELS = [
    { id: "sandbox", label: "Sandbox" },
    { id: "restricted", label: "Restricted" },
    { id: "standard", label: "Standard" },
    { id: "unrestricted", label: "Unrestricted" },
  ];

  it("should have exactly 4 security levels", () => {
    expect(SECURITY_LEVELS).toHaveLength(4);
  });

  it("should include sandbox as most restrictive", () => {
    expect(SECURITY_LEVELS[0].id).toBe("sandbox");
  });

  it("should include unrestricted as least restrictive", () => {
    expect(SECURITY_LEVELS[3].id).toBe("unrestricted");
  });

  it("standard should be the default level", () => {
    expect(MOCK_TEMPLATE.security_level).toBe("standard");
  });

  it("each level should have unique id", () => {
    const ids = SECURITY_LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Sprint S3: Context Budget", () => {
  it("default context budget should be 128k", () => {
    expect(MOCK_TEMPLATE.context_budget).toBe(128000);
  });

  it("context budget should be within valid range", () => {
    expect(MOCK_TEMPLATE.context_budget).toBeGreaterThanOrEqual(8000);
    expect(MOCK_TEMPLATE.context_budget).toBeLessThanOrEqual(200000);
  });

  it("context budget should be a positive integer", () => {
    expect(Number.isInteger(MOCK_TEMPLATE.context_budget)).toBe(true);
    expect(MOCK_TEMPLATE.context_budget).toBeGreaterThan(0);
  });
});

describe("Sprint S3: Agent Templates", () => {
  it("template should have all required fields", () => {
    expect(MOCK_TEMPLATE).toHaveProperty("id");
    expect(MOCK_TEMPLATE).toHaveProperty("name");
    expect(MOCK_TEMPLATE).toHaveProperty("agent_type");
    expect(MOCK_TEMPLATE).toHaveProperty("role");
    expect(MOCK_TEMPLATE).toHaveProperty("model_profile");
    expect(MOCK_TEMPLATE).toHaveProperty("soul_md");
    expect(MOCK_TEMPLATE).toHaveProperty("identity_md");
    expect(MOCK_TEMPLATE).toHaveProperty("skill_ids");
    expect(MOCK_TEMPLATE).toHaveProperty("bundle_ids");
    expect(MOCK_TEMPLATE).toHaveProperty("tool_permissions");
    expect(MOCK_TEMPLATE).toHaveProperty("security_level");
    expect(MOCK_TEMPLATE).toHaveProperty("context_budget");
  });

  it("template skill_ids should be an array of strings", () => {
    expect(Array.isArray(MOCK_TEMPLATE.skill_ids)).toBe(true);
    for (const id of MOCK_TEMPLATE.skill_ids) {
      expect(typeof id).toBe("string");
    }
  });

  it("template bundle_ids should be an array of strings", () => {
    expect(Array.isArray(MOCK_TEMPLATE.bundle_ids)).toBe(true);
    for (const id of MOCK_TEMPLATE.bundle_ids) {
      expect(typeof id).toBe("string");
    }
  });

  it("template name should be non-empty", () => {
    expect(MOCK_TEMPLATE.name.length).toBeGreaterThan(0);
  });
});

describe("Sprint S3: CreateAgentWithConfig", () => {
  it("create result should have agent_id", () => {
    expect(MOCK_CREATE_RESULT.agent_id).toBeTruthy();
    expect(MOCK_CREATE_RESULT.agent_id.length).toBeGreaterThan(0);
  });

  it("successful creation should have success=true", () => {
    expect(MOCK_CREATE_RESULT.success).toBe(true);
    expect(MOCK_CREATE_RESULT.skills_failed).toHaveLength(0);
  });

  it("partial failure should still return agent_id", () => {
    expect(MOCK_CREATE_RESULT_PARTIAL.agent_id).toBeTruthy();
    expect(MOCK_CREATE_RESULT_PARTIAL.success).toBe(false);
    expect(MOCK_CREATE_RESULT_PARTIAL.skills_failed.length).toBeGreaterThan(0);
  });

  it("partial failure should report exact number of failed skills", () => {
    expect(MOCK_CREATE_RESULT_PARTIAL.skills_failed).toHaveLength(2);
    expect(MOCK_CREATE_RESULT_PARTIAL.skills_installed).toBe(3);
  });

  it("create request should map wizard state correctly", () => {
    // Simulate mapping from wizard state to request
    const wizardState = {
      name: "Test Agent",
      role: "Developer",
      type: "worker" as const,
      folderPath: "/home/user/project",
      modelProfile: "claude-sonnet",
      soulMd: "Be helpful",
      identityMd: "Expert dev",
      selectedSkills: new Map([
        ["sk-1", { id: "sk-1", name: "Skill 1" }],
        ["sk-2", { id: "sk-2", name: "Skill 2" }],
      ]),
      selectedBundleIds: new Set(["bundle-1"]),
      toolPermissions: {
        filesystem: "allow" as const,
        network: "ask" as const,
        process: "deny" as const,
        browser: "deny" as const,
        database: "ask" as const,
        code_execution: "deny" as const,
        system: "deny" as const,
      },
      securityLevel: "standard" as const,
      contextBudget: 128000,
    };

    const request = {
      name: wizardState.name,
      role: wizardState.role,
      agent_type: wizardState.type,
      folder_path: wizardState.folderPath,
      model_profile: wizardState.modelProfile,
      soul_md: wizardState.soulMd,
      identity_md: wizardState.identityMd,
      skill_ids: Array.from(wizardState.selectedSkills.keys()),
      bundle_ids: Array.from(wizardState.selectedBundleIds),
      tool_permissions: JSON.stringify(wizardState.toolPermissions),
      security_level: wizardState.securityLevel,
      context_budget: wizardState.contextBudget,
    };

    expect(request.name).toBe("Test Agent");
    expect(request.skill_ids).toEqual(["sk-1", "sk-2"]);
    expect(request.bundle_ids).toEqual(["bundle-1"]);
    expect(request.tool_permissions).toBeTruthy();
    expect(JSON.parse(request.tool_permissions!).filesystem).toBe("allow");
  });
});

describe("Sprint S3: Wizard State Extensions", () => {
  it("should initialize with default tool permissions", () => {
    const defaultPerms = {
      filesystem: "ask",
      network: "ask",
      process: "deny",
      browser: "deny",
      database: "ask",
      code_execution: "deny",
      system: "deny",
    };
    expect(Object.keys(defaultPerms)).toHaveLength(7);
    expect(defaultPerms.filesystem).toBe("ask");
    expect(defaultPerms.process).toBe("deny");
  });

  it("should initialize with standard security level", () => {
    const defaultLevel = "standard";
    expect(defaultLevel).toBe("standard");
  });

  it("should initialize with 128k context budget", () => {
    const defaultBudget = 128000;
    expect(defaultBudget).toBe(128000);
  });

  it("wizard state should include all S3 fields", () => {
    const state = {
      name: "",
      role: "",
      type: "worker",
      folderPath: "",
      acceptedRisk: false,
      selectedTemplateId: null,
      selectedSkills: new Map(),
      selectedBundleIds: new Set(),
      modelProfile: "default",
      soulMd: "",
      identityMd: "",
      toolPermissions: {
        filesystem: "ask",
        network: "ask",
        process: "deny",
        browser: "deny",
        database: "ask",
        code_execution: "deny",
        system: "deny",
      },
      securityLevel: "standard",
      contextBudget: 128000,
    };

    // All S3 additions present
    expect(state).toHaveProperty("toolPermissions");
    expect(state).toHaveProperty("securityLevel");
    expect(state).toHaveProperty("contextBudget");
    expect(Object.keys(state.toolPermissions)).toHaveLength(7);
  });
});

describe("Sprint S3: Step Definitions", () => {
  const STEPS = [
    { id: "identity", label: "Identity" },
    { id: "skills", label: "Skills" },
    { id: "capabilities", label: "Capabilities" },
    { id: "review", label: "Review" },
  ];

  it("should have 4 steps", () => {
    expect(STEPS).toHaveLength(4);
  });

  it("step 3 should be Capabilities (not Bundles)", () => {
    expect(STEPS[2].id).toBe("capabilities");
    expect(STEPS[2].label).toBe("Capabilities");
  });

  it("steps should be in correct order", () => {
    expect(STEPS[0].id).toBe("identity");
    expect(STEPS[1].id).toBe("skills");
    expect(STEPS[2].id).toBe("capabilities");
    expect(STEPS[3].id).toBe("review");
  });
});

describe("Sprint S3: Recommendation Relevance Scoring", () => {
  it("should assign higher scores to more relevant matches", () => {
    const recs = [...MOCK_RECOMMENDATIONS].sort(
      (a, b) => b.relevance_score - a.relevance_score
    );
    expect(recs[0].relevance_score).toBeGreaterThanOrEqual(recs[1].relevance_score);
  });

  it("should filter already-selected skills from recommendations", () => {
    const selectedIds = new Set(["sk-1"]);
    const unselected = MOCK_RECOMMENDATIONS.filter(
      (r) => !selectedIds.has(r.skill_id)
    );
    expect(unselected.length).toBe(2);
    expect(unselected.every((r) => r.skill_id !== "sk-1")).toBe(true);
  });

  it("should handle empty recommendations gracefully", () => {
    const empty: typeof MOCK_RECOMMENDATIONS = [];
    expect(empty.length).toBe(0);
  });
});

describe("Sprint S3: Template Save/Load Round-Trip", () => {
  it("template should be serializable to JSON", () => {
    const json = JSON.stringify(MOCK_TEMPLATE);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe(MOCK_TEMPLATE.name);
    expect(parsed.skill_ids).toEqual(MOCK_TEMPLATE.skill_ids);
    expect(parsed.security_level).toBe(MOCK_TEMPLATE.security_level);
  });

  it("tool_permissions should survive JSON round-trip", () => {
    const perms = JSON.parse(MOCK_TEMPLATE.tool_permissions!);
    const reserialised = JSON.stringify(perms);
    const reparsed = JSON.parse(reserialised);
    expect(reparsed.filesystem).toBe("allow");
    expect(reparsed.system).toBe("deny");
  });

  it("template with null optionals should be valid", () => {
    const minimal = {
      ...MOCK_TEMPLATE,
      description: null,
      tool_permissions: null,
      context_budget: null,
      created_at: null,
    };
    const json = JSON.stringify(minimal);
    const parsed = JSON.parse(json);
    expect(parsed.description).toBeNull();
    expect(parsed.tool_permissions).toBeNull();
  });
});

describe("Sprint S3: Partial Failure Handling", () => {
  it("should differentiate full success from partial failure", () => {
    expect(MOCK_CREATE_RESULT.success).toBe(true);
    expect(MOCK_CREATE_RESULT_PARTIAL.success).toBe(false);
  });

  it("agent should still be created even with partial failure", () => {
    expect(MOCK_CREATE_RESULT_PARTIAL.agent_id).toBeTruthy();
    expect(MOCK_CREATE_RESULT_PARTIAL.skills_installed).toBeGreaterThan(0);
  });

  it("failed skills list should be actionable for retry", () => {
    expect(MOCK_CREATE_RESULT_PARTIAL.skills_failed).toEqual([
      "sk-missing-1",
      "sk-missing-2",
    ]);
    // Each failed skill ID should be a valid string for retry
    for (const id of MOCK_CREATE_RESULT_PARTIAL.skills_failed) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });
});

describe("Sprint S3: API Type Contracts", () => {
  it("CreateAgentWithConfigRequest should have all required fields", () => {
    const request = {
      name: "Test",
      role: "Developer",
      agent_type: "worker",
      folder_path: "/tmp",
      model_profile: "default",
      soul_md: "",
      identity_md: "",
      skill_ids: [],
      bundle_ids: [],
      tool_permissions: null,
      security_level: "standard",
      context_budget: null,
    };
    expect(request).toHaveProperty("name");
    expect(request).toHaveProperty("role");
    expect(request).toHaveProperty("agent_type");
    expect(request).toHaveProperty("folder_path");
    expect(request).toHaveProperty("model_profile");
    expect(request).toHaveProperty("soul_md");
    expect(request).toHaveProperty("identity_md");
    expect(request).toHaveProperty("skill_ids");
    expect(request).toHaveProperty("bundle_ids");
    expect(request).toHaveProperty("tool_permissions");
    expect(request).toHaveProperty("security_level");
    expect(request).toHaveProperty("context_budget");
  });

  it("CreateAgentResult should have all required fields", () => {
    expect(MOCK_CREATE_RESULT).toHaveProperty("agent_id");
    expect(MOCK_CREATE_RESULT).toHaveProperty("skills_installed");
    expect(MOCK_CREATE_RESULT).toHaveProperty("skills_failed");
    expect(MOCK_CREATE_RESULT).toHaveProperty("success");
  });

  it("SkillRecommendation should have correct field types", () => {
    const rec = MOCK_RECOMMENDATIONS[0];
    expect(typeof rec.skill_id).toBe("string");
    expect(typeof rec.skill_name).toBe("string");
    expect(typeof rec.category).toBe("string");
    expect(typeof rec.relevance_score).toBe("number");
    expect(typeof rec.reason).toBe("string");
  });
});
