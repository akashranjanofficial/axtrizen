/**
 * CI/CD Pipeline Service
 * Sprint 6, Epic 8 — Autonomous test running and deploy previews
 *
 * Allows agents to trigger tests, monitor results, deploy preview
 * environments, and integrate test feedback into their workflow.
 */

import { invoke } from "@tauri-apps/api/core";

// ── Types ──────────────────────────────────────────────────

export interface TestRunConfig {
  projectPath: string;
  framework?: "vitest" | "jest" | "pytest" | "cargo" | "auto";
  pattern?: string;           // file or test name pattern
  watch?: boolean;
  coverage?: boolean;
  env?: Record<string, string>;
}

export interface TestResult {
  id: string;
  status: "running" | "passed" | "failed" | "error";
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;           // ms
  failures: TestFailure[];
  coverage?: CoverageReport;
  startedAt: string;
  finishedAt?: string;
}

export interface TestFailure {
  name: string;
  file: string;
  line?: number;
  message: string;
  expected?: string;
  actual?: string;
  stack?: string;
}

export interface CoverageReport {
  lines: number;              // percentage 0-100
  branches: number;
  functions: number;
  statements: number;
}

export interface DeployPreviewConfig {
  projectPath: string;
  branch?: string;
  provider?: "vercel" | "netlify" | "cloudflare" | "local";
  env?: Record<string, string>;
}

export interface DeployPreviewResult {
  id: string;
  url: string;
  status: "deploying" | "ready" | "failed" | "stopped";
  provider: string;
  branch?: string;
  startedAt: string;
}

// ── Detect framework ───────────────────────────────────────

/**
 * Auto-detect the test framework from project config files.
 */
export function detectTestFramework(
  files: string[]
): "vitest" | "jest" | "pytest" | "cargo" | null {
  const nameSet = new Set(files.map((f) => f.split("/").pop() ?? ""));

  if (nameSet.has("vitest.config.ts") || nameSet.has("vitest.config.js")) {
    return "vitest";
  }
  if (nameSet.has("jest.config.ts") || nameSet.has("jest.config.js")) {
    return "jest";
  }
  if (nameSet.has("pytest.ini") || nameSet.has("pyproject.toml") || nameSet.has("conftest.py")) {
    return "pytest";
  }
  if (nameSet.has("Cargo.toml")) {
    return "cargo";
  }
  return null;
}

/**
 * Build the shell command to run tests for a given framework.
 */
export function buildTestCommand(config: TestRunConfig): string {
  const fw = config.framework ?? "auto";
  const parts: string[] = [];

  switch (fw) {
    case "vitest":
      parts.push("npx vitest run");
      if (config.pattern) parts.push(`--reporter=verbose "${config.pattern}"`);
      if (config.coverage) parts.push("--coverage");
      if (config.watch) parts.push("--watch");
      break;

    case "jest":
      parts.push("npx jest");
      if (config.pattern) parts.push(`--testPathPattern="${config.pattern}"`);
      if (config.coverage) parts.push("--coverage");
      if (config.watch) parts.push("--watch");
      break;

    case "pytest":
      parts.push("python -m pytest -v");
      if (config.pattern) parts.push(`-k "${config.pattern}"`);
      if (config.coverage) parts.push("--cov");
      break;

    case "cargo":
      parts.push("cargo test");
      if (config.pattern) parts.push(`-- ${config.pattern}`);
      break;

    default:
      parts.push("npm test");
  }

  return parts.join(" ");
}

/**
 * Parse a vitest/jest JSON result into our TestResult format.
 */
export function parseTestOutput(
  raw: string,
  framework: string
): Partial<TestResult> {
  const failures: TestFailure[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let total = 0;

  if (framework === "vitest" || framework === "jest") {
    // Parse summary line: Tests: X passed, Y failed, Z total
    const summaryMatch = raw.match(
      /Tests\s*[:\s]+(\d+)\s+passed(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+skipped)?(?:,\s*(\d+)\s+total)?/i
    );
    if (summaryMatch) {
      passed = parseInt(summaryMatch[1] || "0", 10);
      failed = parseInt(summaryMatch[2] || "0", 10);
      skipped = parseInt(summaryMatch[3] || "0", 10);
      total = parseInt(summaryMatch[4] || "0", 10) || passed + failed + skipped;
    }

    // Extract FAIL lines
    const failRegex = /FAIL\s+(.+?)\s*\n.*?●\s+(.+?)\n\s*([\s\S]*?)(?=\n\s*(?:FAIL|PASS|Test Suites))/g;
    let match;
    while ((match = failRegex.exec(raw)) !== null) {
      failures.push({
        file: match[1].trim(),
        name: match[2].trim(),
        message: match[3].trim().slice(0, 500),
      });
    }
  } else if (framework === "pytest") {
    const summaryMatch = raw.match(
      /(\d+)\s+passed(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+skipped)?/i
    );
    if (summaryMatch) {
      passed = parseInt(summaryMatch[1] || "0", 10);
      failed = parseInt(summaryMatch[2] || "0", 10);
      skipped = parseInt(summaryMatch[3] || "0", 10);
      total = passed + failed + skipped;
    }
  } else if (framework === "cargo") {
    const summaryMatch = raw.match(
      /test result: (?:ok|FAILED)\.\s*(\d+)\s+passed;\s*(\d+)\s+failed;\s*(\d+)\s+ignored/
    );
    if (summaryMatch) {
      passed = parseInt(summaryMatch[1], 10);
      failed = parseInt(summaryMatch[2], 10);
      skipped = parseInt(summaryMatch[3], 10);
      total = passed + failed + skipped;
    }
  }

  return {
    total,
    passed,
    failed,
    skipped,
    failures,
    status: failed > 0 ? "failed" : "passed",
  };
}

// ── CI/CD Service ──────────────────────────────────────────

export class CICDService {
  private activeRuns = new Map<string, TestResult>();

  /**
   * Trigger a test run via the Tauri backend.
   */
  async runTests(config: TestRunConfig): Promise<TestResult> {
    const command = buildTestCommand(config);
    const result = await invoke<TestResult>("ci_run_tests", {
      projectPath: config.projectPath,
      command,
      framework: config.framework ?? "auto",
    });
    this.activeRuns.set(result.id, result);
    return result;
  }

  /**
   * Poll for test run status.
   */
  async getTestStatus(runId: string): Promise<TestResult> {
    return invoke<TestResult>("ci_test_status", { runId });
  }

  /**
   * Deploy a preview environment.
   */
  async deployPreview(config: DeployPreviewConfig): Promise<DeployPreviewResult> {
    return invoke<DeployPreviewResult>("ci_deploy_preview", {
      projectPath: config.projectPath,
      branch: config.branch,
      provider: config.provider ?? "local",
      env: config.env ? JSON.stringify(config.env) : undefined,
    });
  }

  /**
   * Stop a running preview.
   */
  async stopPreview(previewId: string): Promise<void> {
    await invoke<void>("ci_stop_preview", { previewId });
  }

  /**
   * Build a human-readable summary of test results for agent consumption.
   */
  formatTestSummary(result: TestResult): string {
    const lines: string[] = [];
    const icon = result.status === "passed" ? "✅" : "❌";
    lines.push(
      `${icon} Test Run: ${result.passed}/${result.total} passed (${result.duration}ms)`
    );

    if (result.failures.length > 0) {
      lines.push("\nFailures:");
      for (const f of result.failures.slice(0, 10)) {
        lines.push(`  • ${f.file}: ${f.name}`);
        lines.push(`    ${f.message.slice(0, 200)}`);
      }
      if (result.failures.length > 10) {
        lines.push(`  ... and ${result.failures.length - 10} more`);
      }
    }

    if (result.coverage) {
      lines.push(
        `\nCoverage: ${result.coverage.lines.toFixed(1)}% lines, ${result.coverage.branches.toFixed(1)}% branches`
      );
    }

    return lines.join("\n");
  }
}

/** Singleton CI/CD service */
export const cicd = new CICDService();
