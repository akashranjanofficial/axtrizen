import { describe, it, expect } from "vitest";
import {
  buildCommitMessage,
  buildBranchName,
  buildPRTitle,
  buildPRDescription,
  formatDiffSummary,
} from "../../app/services/git-integration";

// ══════════════════════════════════════════════════════════
// buildCommitMessage
// ══════════════════════════════════════════════════════════

describe("Git Integration - buildCommitMessage", () => {
  it("should create a commit message with agent name prefix", () => {
    const msg = buildCommitMessage(
      "BackendAgent",
      "Add user endpoint",
      ["src/api.ts"],
    );
    expect(msg).toContain("Add user endpoint");
    expect(msg).toContain("BackendAgent");
  });

  it("should include task title as subject", () => {
    const msg = buildCommitMessage("Agent1", "Quick fix", []);
    expect(msg).toContain("Quick fix");
  });

  it("should include file change summary", () => {
    const msg = buildCommitMessage(
      "Agent1",
      "Fix bugs",
      ["a.ts", "b.ts"],
    );
    expect(msg).toContain("a.ts");
    expect(msg).toContain("b.ts");
  });

  it("should limit file list to prevent overly long messages", () => {
    const files = Array.from({ length: 25 }, (_, i) => `file${i}.ts`);
    const msg = buildCommitMessage("Agent", "Mass update", files);
    // Should truncate or summarize rather than list all 25
    expect(msg.length).toBeLessThan(2000);
  });
});

// ══════════════════════════════════════════════════════════
// buildBranchName
// ══════════════════════════════════════════════════════════

describe("Git Integration - buildBranchName", () => {
  it("should create a well-formatted branch name", () => {
    const name = buildBranchName("FrontendAgent", "TASK-42", "Add Login Page");
    expect(name).toMatch(/^agent\//);
    expect(name).toContain("frontendagent");
    expect(name).toContain("TASK-42");
    expect(name.toLowerCase()).toContain("add-login-page");
  });

  it("should sanitize special characters from title", () => {
    const name = buildBranchName("Agent", "T-1", "Fix @#$% issues");
    // Title portion should not have special chars
    const titlePart = name.split("/").pop() || "";
    expect(titlePart).not.toMatch(/[@#$%^&*()]/);  
    expect(name.length).toBeGreaterThan(6);
  });
});

// ══════════════════════════════════════════════════════════
// buildPRTitle
// ══════════════════════════════════════════════════════════

describe("Git Integration - buildPRTitle", () => {
  it("should include agent name and task title", () => {
    const title = buildPRTitle("DataAgent", "Migrate database schema");
    expect(title).toContain("DataAgent");
    expect(title).toContain("Migrate database schema");
  });

  it("should include phase if provided", () => {
    const title = buildPRTitle("Agent1", "Add tests", "review");
    expect(title).toContain("review");
  });
});

// ══════════════════════════════════════════════════════════
// buildPRDescription
// ══════════════════════════════════════════════════════════

describe("Git Integration - buildPRDescription", () => {
  it("should produce markdown with agent info", () => {
    const desc = buildPRDescription(
      "BuildAgent",
      "Setup CI pipeline",
      "**1** file changed\n- **+50** insertions",
    );
    expect(desc).toContain("BuildAgent");
    expect(desc).toContain("50");
  });

  it("should handle empty diff summary gracefully", () => {
    const desc = buildPRDescription("Agent", "Empty PR", "");
    expect(desc).toContain("Agent");
  });
});

// ══════════════════════════════════════════════════════════
// formatDiffSummary
// ══════════════════════════════════════════════════════════

describe("Git Integration - formatDiffSummary", () => {
  it("should format diff stats into readable summary", () => {
    const summary = formatDiffSummary({
      filesChanged: 3,
      insertions: 100,
      deletions: 20,
      files: [
        { path: "src/a.ts", insertions: 50, deletions: 10 },
        { path: "src/b.ts", insertions: 30, deletions: 5 },
        { path: "src/c.ts", insertions: 20, deletions: 5 },
      ],
    });
    expect(summary).toContain("3");
    expect(summary).toContain("100");
    expect(summary).toContain("20");
  });

  it("should handle zero changes", () => {
    const summary = formatDiffSummary({
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      files: [],
    });
    expect(summary).toBeDefined();
    // Empty string is valid when no changes
    expect(typeof summary).toBe("string");
  });
});
