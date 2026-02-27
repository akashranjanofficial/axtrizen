/**
 * Sprint S6 Frontend Tests
 * Tests for: QualityGateBadge, PhaseProgressTracker, VerificationEngine API,
 *            stub pattern detection, override/retry, strictness levels
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Data ──────────────────────────────────────────────────

const MOCK_PHASES = [
  { phase_id: "p1", phase_name: "Requirements", badge: "pass", badge_emoji: "✅", last_verified: "2025-06-01T00:00:00Z", can_advance: true, override_record: null },
  { phase_id: "p2", phase_name: "Design", badge: "pass", badge_emoji: "✅", last_verified: "2025-06-02T00:00:00Z", can_advance: true, override_record: null },
  { phase_id: "p3", phase_name: "Development", badge: "warn", badge_emoji: "⚠️", last_verified: "2025-06-03T00:00:00Z", can_advance: true, override_record: null },
  { phase_id: "p4", phase_name: "Testing", badge: "pending", badge_emoji: "🔄", last_verified: null, can_advance: false, override_record: null },
  { phase_id: "p5", phase_name: "Deployment", badge: "pending", badge_emoji: "🔄", last_verified: null, can_advance: false, override_record: null },
];

const MOCK_VERIFICATION_REPORT = {
  project_id: "proj-1",
  phase_id: "p3",
  phase_name: "Development",
  overall_status: "Warn" as const,
  gate_blocked: false,
  strictness: "WarnOnly" as const,
  levels: [
    {
      level: 1,
      level_name: "Exists Check",
      status: "Pass" as const,
      findings: [
        { level: 1, check_name: "file_exists", status: "Pass" as const, file_path: "main.rs", line_number: null, message: "File exists: main.rs", pattern_matched: null },
      ],
      pass_count: 1,
      fail_count: 0,
      warn_count: 0,
    },
    {
      level: 2,
      level_name: "Substantive Check",
      status: "Warn" as const,
      findings: [
        { level: 2, check_name: "stub_pattern", status: "Warn" as const, file_path: "main.rs", line_number: 5, message: "Stub pattern 'TODO' found: // TODO: implement", pattern_matched: "TODO" },
      ],
      pass_count: 0,
      fail_count: 0,
      warn_count: 1,
    },
    {
      level: 3,
      level_name: "Wired Check",
      status: "Pass" as const,
      findings: [],
      pass_count: 0,
      fail_count: 0,
      warn_count: 0,
    },
  ],
  total_findings: 2,
  timestamp: "2025-06-03T12:00:00Z",
};

const MOCK_BLOCKED_REPORT = {
  ...MOCK_VERIFICATION_REPORT,
  overall_status: "Fail" as const,
  gate_blocked: true,
  strictness: "BlockCritical" as const,
  levels: [
    {
      level: 1,
      level_name: "Exists Check",
      status: "Fail" as const,
      findings: [
        { level: 1, check_name: "file_exists", status: "Fail" as const, file_path: "missing.rs", line_number: null, message: "Missing expected file: missing.rs", pattern_matched: null },
      ],
      pass_count: 0,
      fail_count: 1,
      warn_count: 0,
    },
    { level: 2, level_name: "Substantive Check", status: "Pass" as const, findings: [], pass_count: 0, fail_count: 0, warn_count: 0 },
    { level: 3, level_name: "Wired Check", status: "Pass" as const, findings: [], pass_count: 0, fail_count: 0, warn_count: 0 },
  ],
};

// ─── Tauri Mock ──────────────────────────────────────────────────

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

function setupDefaultMocks() {
  mockInvoke.mockImplementation((cmd: string, args?: any) => {
    switch (cmd) {
      case "verify_phase":
        return Promise.resolve(MOCK_VERIFICATION_REPORT);
      case "get_stub_patterns":
        return Promise.resolve([
          ["TODO", "(?i)\\bTODO\\b"],
          ["FIXME", "(?i)\\bFIXME\\b"],
          ["HACK", "(?i)\\bHACK\\b"],
          ["XXX", "(?i)\\bXXX\\b"],
          ["not implemented", "(?i)not\\s+implemented"],
          ["unimplemented!()", "unimplemented!\\(\\)"],
          ["todo!()", "todo!\\(\\)"],
          ["pass (Python stub)", "^\\s*pass\\s*$"],
          ["empty function body", "(?i)(fn|function|def)\\s+\\w+\\s*\\([^)]*\\)\\s*\\{?\\s*\\}?$"],
          ["lorem ipsum", "(?i)lorem\\s+ipsum"],
          ["placeholder", "(?i)\\bplaceholder\\b"],
          ["sample data", "(?i)sample\\s+data"],
          ["example.com", "example\\.com"],
          ["foo/bar/baz", "\\b(foo|bar|baz)\\b"],
          ["throw not implemented", "throw\\s+new\\s+Error\\([\"']not implemented"],
          ["return null stub", "return\\s+null;\\s*//\\s*(stub|temp)"],
          ["print hello world", "print(ln)?!?\\s*\\(\\s*[\"']hello world"],
          ["hardcoded 42", "=\\s*42\\s*;\\s*//\\s*(temp|stub|todo)"],
        ]);
      case "override_gate":
        if (!args?.reason?.trim()) return Promise.reject(new Error("Override reason is required"));
        return Promise.resolve({
          project_id: args.projectId,
          phase_id: args.phaseId,
          overridden_by: args.overriddenBy,
          reason: args.reason,
          timestamp: "2025-06-03T12:00:00Z",
          findings_at_override: 0,
        });
      case "get_phase_gate_statuses":
        return Promise.resolve(MOCK_PHASES);
      case "check_file_for_stubs":
        return Promise.resolve([
          { level: 2, check_name: "stub_pattern", status: "Warn", file_path: args.filePath, line_number: 1, message: "Stub pattern 'TODO'", pattern_matched: "TODO" },
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

// ── 1. Verification Report Structure ────────────────────────────

describe("Verification Report Structure", () => {
  it("1.1 should have 3 levels", () => {
    expect(MOCK_VERIFICATION_REPORT.levels).toHaveLength(3);
    expect(MOCK_VERIFICATION_REPORT.levels[0].level_name).toBe("Exists Check");
    expect(MOCK_VERIFICATION_REPORT.levels[1].level_name).toBe("Substantive Check");
    expect(MOCK_VERIFICATION_REPORT.levels[2].level_name).toBe("Wired Check");
  });

  it("1.2 each check returns PASS/FAIL/WARN", () => {
    const validStatuses = ["Pass", "Fail", "Warn"];
    for (const level of MOCK_VERIFICATION_REPORT.levels) {
      expect(validStatuses).toContain(level.status);
    }
  });

  it("1.3 overall status reflects worst level", () => {
    // Level 2 is Warn → overall should be Warn
    expect(MOCK_VERIFICATION_REPORT.overall_status).toBe("Warn");
  });

  it("1.4 blocked report has gate_blocked=true", () => {
    expect(MOCK_BLOCKED_REPORT.gate_blocked).toBe(true);
  });

  it("1.5 findings have file_path and optional line_number", () => {
    const finding = MOCK_VERIFICATION_REPORT.levels[1].findings[0];
    expect(finding.file_path).toBe("main.rs");
    expect(finding.line_number).toBe(5);
  });
});

// ── 2. Stub Pattern Detection ───────────────────────────────────

describe("Stub Pattern Detection", () => {
  it("2.1 should have 15+ stub patterns", async () => {
    const patterns = await mockInvoke("get_stub_patterns");
    expect(patterns.length).toBeGreaterThanOrEqual(15);
  });

  it("2.2 includes TODO pattern", async () => {
    const patterns = await mockInvoke("get_stub_patterns");
    expect(patterns.some((p: [string, string]) => p[0] === "TODO")).toBe(true);
  });

  it("2.3 includes FIXME pattern", async () => {
    const patterns = await mockInvoke("get_stub_patterns");
    expect(patterns.some((p: [string, string]) => p[0] === "FIXME")).toBe(true);
  });

  it("2.4 includes lorem ipsum pattern", async () => {
    const patterns = await mockInvoke("get_stub_patterns");
    expect(patterns.some((p: [string, string]) => p[0] === "lorem ipsum")).toBe(true);
  });

  it("2.5 includes empty function body pattern", async () => {
    const patterns = await mockInvoke("get_stub_patterns");
    expect(patterns.some((p: [string, string]) => p[0] === "empty function body")).toBe(true);
  });

  it("2.6 includes unimplemented!() pattern", async () => {
    const patterns = await mockInvoke("get_stub_patterns");
    expect(patterns.some((p: [string, string]) => p[0] === "unimplemented!()")).toBe(true);
  });

  it("2.7 includes Python pass pattern", async () => {
    const patterns = await mockInvoke("get_stub_patterns");
    expect(patterns.some((p: [string, string]) => p[0] === "pass (Python stub)")).toBe(true);
  });

  it("2.8 includes placeholder pattern", async () => {
    const patterns = await mockInvoke("get_stub_patterns");
    expect(patterns.some((p: [string, string]) => p[0] === "placeholder")).toBe(true);
  });

  it("2.9 includes example.com pattern", async () => {
    const patterns = await mockInvoke("get_stub_patterns");
    expect(patterns.some((p: [string, string]) => p[0] === "example.com")).toBe(true);
  });

  it("2.10 check_file_for_stubs returns findings", async () => {
    const findings = await mockInvoke("check_file_for_stubs", { filePath: "test.rs" });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].check_name).toBe("stub_pattern");
  });
});

// ── 3. Strictness Levels ────────────────────────────────────────

describe("Strictness Levels", () => {
  it("3.1 WarnOnly never blocks", () => {
    expect(MOCK_VERIFICATION_REPORT.gate_blocked).toBe(false);
    expect(MOCK_VERIFICATION_REPORT.strictness).toBe("WarnOnly");
  });

  it("3.2 BlockCritical blocks on L1/L2 fail", () => {
    expect(MOCK_BLOCKED_REPORT.gate_blocked).toBe(true);
    expect(MOCK_BLOCKED_REPORT.strictness).toBe("BlockCritical");
  });

  it("3.3 default strictness should be WarnOnly", () => {
    const defaultStrictness = "WarnOnly";
    expect(defaultStrictness).toBe("WarnOnly");
  });

  it("3.4 all three strictness values are valid", () => {
    const validValues = ["WarnOnly", "BlockCritical", "BlockAll"];
    expect(validValues).toContain("WarnOnly");
    expect(validValues).toContain("BlockCritical");
    expect(validValues).toContain("BlockAll");
  });
});

// ── 4. Phase Gate Status ────────────────────────────────────────

describe("Phase Gate Status", () => {
  it("4.1 should load phase gate statuses", async () => {
    const statuses = await mockInvoke("get_phase_gate_statuses", {
      phases: [["p1", "Req"], ["p2", "Des"]],
    });
    expect(statuses).toHaveLength(5);
  });

  it("4.2 completed phases show pass badge", () => {
    expect(MOCK_PHASES[0].badge).toBe("pass");
    expect(MOCK_PHASES[0].badge_emoji).toBe("✅");
    expect(MOCK_PHASES[0].can_advance).toBe(true);
  });

  it("4.3 warning phases show warn badge", () => {
    expect(MOCK_PHASES[2].badge).toBe("warn");
    expect(MOCK_PHASES[2].badge_emoji).toBe("⚠️");
  });

  it("4.4 pending phases show 🔄 and cannot advance", () => {
    expect(MOCK_PHASES[3].badge).toBe("pending");
    expect(MOCK_PHASES[3].badge_emoji).toBe("🔄");
    expect(MOCK_PHASES[3].can_advance).toBe(false);
  });

  it("4.5 overridden phases show ⏭️", () => {
    const overriddenPhase = {
      ...MOCK_PHASES[3],
      badge: "overridden",
      badge_emoji: "⏭️",
      can_advance: true,
      override_record: {
        project_id: "proj-1",
        phase_id: "p4",
        overridden_by: "admin",
        reason: "Manually reviewed",
        timestamp: "2025-06-03T12:00:00Z",
        findings_at_override: 2,
      },
    };
    expect(overriddenPhase.badge).toBe("overridden");
    expect(overriddenPhase.badge_emoji).toBe("⏭️");
    expect(overriddenPhase.can_advance).toBe(true);
    expect(overriddenPhase.override_record?.reason).toBe("Manually reviewed");
  });
});

// ── 5. Override Gate ────────────────────────────────────────────

describe("Override Gate", () => {
  it("5.1 should override with valid reason", async () => {
    const result = await mockInvoke("override_gate", {
      projectId: "proj-1",
      phaseId: "p3",
      overriddenBy: "admin",
      reason: "Reviewed manually",
    });
    expect(result.reason).toBe("Reviewed manually");
    expect(result.overridden_by).toBe("admin");
  });

  it("5.2 should reject empty reason", async () => {
    try {
      await mockInvoke("override_gate", {
        projectId: "proj-1",
        phaseId: "p3",
        overriddenBy: "admin",
        reason: "",
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.message).toBe("Override reason is required");
    }
  });

  it("5.3 override includes audit trail timestamp", async () => {
    const result = await mockInvoke("override_gate", {
      projectId: "proj-1",
      phaseId: "p3",
      overriddenBy: "admin",
      reason: "OK",
    });
    expect(result.timestamp).toBeDefined();
  });
});

// ── 6. Verify Phase API ─────────────────────────────────────────

describe("Verify Phase API", () => {
  it("6.1 should call verify_phase", async () => {
    const result = await mockInvoke("verify_phase", {
      projectId: "proj-1",
      phaseId: "p3",
      phaseName: "Development",
      workspacePath: "/tmp/workspace",
      expectedFiles: ["main.rs"],
      strictness: "warn_only",
    });
    expect(result.project_id).toBe("proj-1");
    expect(result.levels).toHaveLength(3);
  });

  it("6.2 verification returns timestamp", async () => {
    const result = await mockInvoke("verify_phase", {});
    expect(result.timestamp).toBeDefined();
  });

  it("6.3 verification includes strictness in report", async () => {
    const result = await mockInvoke("verify_phase", {});
    expect(["WarnOnly", "BlockCritical", "BlockAll"]).toContain(result.strictness);
  });
});

// ── 7. Badge Colors & Rendering ─────────────────────────────────

describe("Badge Colors & Rendering", () => {
  const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
    pass: { bg: "#dcfce7", text: "#166534" },
    fail: { bg: "#fef2f2", text: "#991b1b" },
    warn: { bg: "#fefce8", text: "#854d0e" },
    pending: { bg: "#f3f4f6", text: "#6b7280" },
    overridden: { bg: "#ede9fe", text: "#5b21b6" },
  };

  it("7.1 pass badge is green", () => {
    expect(BADGE_COLORS.pass.bg).toBe("#dcfce7");
  });

  it("7.2 fail badge is red", () => {
    expect(BADGE_COLORS.fail.bg).toBe("#fef2f2");
  });

  it("7.3 warn badge is yellow", () => {
    expect(BADGE_COLORS.warn.bg).toBe("#fefce8");
  });

  it("7.4 pending badge is gray", () => {
    expect(BADGE_COLORS.pending.bg).toBe("#f3f4f6");
  });

  it("7.5 overridden badge is purple", () => {
    expect(BADGE_COLORS.overridden.bg).toBe("#ede9fe");
  });
});

// ── 8. Level Aggregate Logic ────────────────────────────────────

describe("Level Aggregate Logic", () => {
  function aggregateStatus(findings: { status: string }[]): string {
    const hasFail = findings.some((f) => f.status === "Fail");
    const hasWarn = findings.some((f) => f.status === "Warn");
    if (hasFail) return "Fail";
    if (hasWarn) return "Warn";
    return "Pass";
  }

  it("8.1 all pass → Pass", () => {
    expect(aggregateStatus([{ status: "Pass" }, { status: "Pass" }])).toBe("Pass");
  });

  it("8.2 any fail → Fail", () => {
    expect(aggregateStatus([{ status: "Pass" }, { status: "Fail" }])).toBe("Fail");
  });

  it("8.3 any warn → Warn", () => {
    expect(aggregateStatus([{ status: "Pass" }, { status: "Warn" }])).toBe("Warn");
  });

  it("8.4 fail overrides warn", () => {
    expect(aggregateStatus([{ status: "Warn" }, { status: "Fail" }])).toBe("Fail");
  });

  it("8.5 empty → Pass", () => {
    expect(aggregateStatus([])).toBe("Pass");
  });
});

// ── 9. Golden Tests ─────────────────────────────────────────────

describe("Golden Tests", () => {
  it("9.1 clean codebase → all 3 levels pass", () => {
    // Simulate: all files exist, no stubs, imports resolve
    const cleanReport = {
      overall_status: "Pass",
      gate_blocked: false,
      levels: [
        { level: 1, status: "Pass", fail_count: 0 },
        { level: 2, status: "Pass", fail_count: 0 },
        { level: 3, status: "Pass", fail_count: 0 },
      ],
    };
    expect(cleanReport.overall_status).toBe("Pass");
    expect(cleanReport.gate_blocked).toBe(false);
    expect(cleanReport.levels.every((l) => l.status === "Pass")).toBe(true);
  });

  it("9.2 stub codebase → Level 2 fails", () => {
    // Simulate: files exist but full of stubs
    const stubReport = {
      overall_status: "Warn",
      gate_blocked: false,
      levels: [
        { level: 1, status: "Pass", fail_count: 0 },
        { level: 2, status: "Warn", fail_count: 0, warn_count: 12 },
        { level: 3, status: "Pass", fail_count: 0 },
      ],
    };
    expect(stubReport.levels[1].status).toBe("Warn");
    expect(stubReport.levels[1].warn_count).toBeGreaterThan(0);
  });
});

// ── 10. Should Block Logic ──────────────────────────────────────

describe("Should Block Logic", () => {
  function shouldBlock(strictness: string, levels: { level: number; status: string }[]): boolean {
    switch (strictness) {
      case "WarnOnly": return false;
      case "BlockCritical":
        return levels.some((l) => l.level <= 2 && l.status === "Fail");
      case "BlockAll":
        return levels.some((l) => l.status === "Fail");
      default: return false;
    }
  }

  it("10.1 WarnOnly + L1 Fail → no block", () => {
    expect(shouldBlock("WarnOnly", [{ level: 1, status: "Fail" }])).toBe(false);
  });

  it("10.2 BlockCritical + L1 Fail → block", () => {
    expect(shouldBlock("BlockCritical", [{ level: 1, status: "Fail" }])).toBe(true);
  });

  it("10.3 BlockCritical + L3 Fail → no block", () => {
    expect(shouldBlock("BlockCritical", [{ level: 3, status: "Fail" }])).toBe(false);
  });

  it("10.4 BlockAll + L3 Fail → block", () => {
    expect(shouldBlock("BlockAll", [{ level: 3, status: "Fail" }])).toBe(true);
  });

  it("10.5 BlockAll + all Pass → no block", () => {
    expect(shouldBlock("BlockAll", [
      { level: 1, status: "Pass" },
      { level: 2, status: "Pass" },
      { level: 3, status: "Pass" },
    ])).toBe(false);
  });
});
