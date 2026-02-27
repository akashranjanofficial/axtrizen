import { describe, it, expect } from "vitest";
import {
  detectTestFramework,
  buildTestCommand,
  parseTestOutput,
} from "../../app/services/cicd-pipeline";

// ══════════════════════════════════════════════════════════
// detectTestFramework
// ══════════════════════════════════════════════════════════

describe("CI/CD Pipeline - detectTestFramework", () => {
  it("should detect vitest from config file", () => {
    const fw = detectTestFramework(["src/main.ts", "vitest.config.ts"]);
    expect(fw).toBe("vitest");
  });

  it("should detect jest from config file", () => {
    const fw = detectTestFramework(["jest.config.js", "src/index.js"]);
    expect(fw).toBe("jest");
  });

  it("should detect pytest from pytest.ini", () => {
    const fw = detectTestFramework(["pytest.ini", "tests/test_app.py"]);
    expect(fw).toBe("pytest");
  });

  it("should detect pytest from conftest.py", () => {
    const fw = detectTestFramework(["conftest.py", "test_main.py"]);
    expect(fw).toBe("pytest");
  });

  it("should detect cargo from Cargo.toml", () => {
    const fw = detectTestFramework(["Cargo.toml", "src/lib.rs"]);
    expect(fw).toBe("cargo");
  });

  it("should return null for unknown project", () => {
    const fw = detectTestFramework(["README.md", "Makefile"]);
    expect(fw).toBeNull();
  });

  it("should prioritize vitest over cargo when both present", () => {
    const fw = detectTestFramework(["vitest.config.ts", "Cargo.toml"]);
    expect(fw).toBe("vitest");
  });
});

// ══════════════════════════════════════════════════════════
// buildTestCommand
// ══════════════════════════════════════════════════════════

describe("CI/CD Pipeline - buildTestCommand", () => {
  it("should build vitest command", () => {
    const cmd = buildTestCommand({
      projectPath: "/app",
      framework: "vitest",
    });
    expect(cmd).toContain("npx vitest run");
  });

  it("should add coverage flag for vitest", () => {
    const cmd = buildTestCommand({
      projectPath: "/app",
      framework: "vitest",
      coverage: true,
    });
    expect(cmd).toContain("--coverage");
  });

  it("should add watch flag for vitest", () => {
    const cmd = buildTestCommand({
      projectPath: "/app",
      framework: "vitest",
      watch: true,
    });
    expect(cmd).toContain("--watch");
  });

  it("should build jest command with pattern", () => {
    const cmd = buildTestCommand({
      projectPath: "/app",
      framework: "jest",
      pattern: "auth",
    });
    expect(cmd).toContain("npx jest");
    expect(cmd).toContain("auth");
  });

  it("should build pytest command", () => {
    const cmd = buildTestCommand({
      projectPath: "/app",
      framework: "pytest",
    });
    expect(cmd).toContain("python -m pytest");
  });

  it("should build cargo test command", () => {
    const cmd = buildTestCommand({
      projectPath: "/app",
      framework: "cargo",
    });
    expect(cmd).toContain("cargo test");
  });

  it("should default to npm test for auto framework", () => {
    const cmd = buildTestCommand({
      projectPath: "/app",
      framework: "auto",
    });
    expect(cmd).toContain("npm test");
  });
});

// ══════════════════════════════════════════════════════════
// parseTestOutput
// ══════════════════════════════════════════════════════════

describe("CI/CD Pipeline - parseTestOutput", () => {
  it("should parse vitest summary output", () => {
    const output = `
 ✓ src/test.ts > should work
 ✓ src/test.ts > should also work
 × src/test.ts > should fail

Tests:  2 passed, 1 failed, 3 total
Time:  1.23s
    `;
    const result = parseTestOutput(output, "vitest");
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.total).toBe(3);
    expect(result.status).toBe("failed");
  });

  it("should parse all-passing output", () => {
    const output = "Tests:  5 passed, 5 total\nTime: 0.5s";
    const result = parseTestOutput(output, "vitest");
    expect(result.passed).toBe(5);
    expect(result.failed).toBe(0);
    expect(result.status).toBe("passed");
  });

  it("should parse pytest output", () => {
    const output = "====== 8 passed, 2 failed, 1 skipped in 3.4s ======";
    const result = parseTestOutput(output, "pytest");
    expect(result.passed).toBe(8);
    expect(result.failed).toBe(2);
    expect(result.skipped).toBe(1);
  });

  it("should parse cargo test output", () => {
    const output = "test result: ok. 15 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out";
    const result = parseTestOutput(output, "cargo");
    expect(result.passed).toBe(15);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(3);
    expect(result.total).toBe(18);
  });

  it("should handle empty output gracefully", () => {
    const result = parseTestOutput("", "vitest");
    expect(result.total).toBe(0);
    expect(result.passed).toBe(0);
    expect(result.status).toBe("passed");
  });
});
