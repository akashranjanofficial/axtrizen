// CI/CD Trigger Service
//
// Auto-runs project tests after orchestration completes.
// Wraps the existing Tauri CI commands with smart defaults.

import { ciRunTests, ciTestStatus } from "../tauri-api";

export interface TestGateResult {
  passed: boolean;
  summary: string;
  totalTests: number;
  failedTests: number;
  output: string;
}

/**
 * Detect the test framework and command for a given project path.
 * Checks for package.json, Cargo.toml, etc.
 */
function detectTestCommand(projectPath: string): { command: string; framework: string } {
  // Default to npm test — the backend's ci_run_tests handles
  // framework-specific parsing (vitest, jest, cargo test, etc.)
  // For now we use a simple heuristic based on path content.
  if (projectPath.includes("rust") || projectPath.includes("cargo")) {
    return { command: "cargo test", framework: "cargo" };
  }
  return { command: "npm test", framework: "vitest" };
}

/**
 * Run tests for a project and return a structured result.
 * This is the main entry point called by the orchestration engine.
 */
export async function runTestGate(projectPath: string, command?: string): Promise<TestGateResult> {
  try {
    const detected = detectTestCommand(projectPath);
    const testCommand = command ?? detected.command;

    const result = await ciRunTests(projectPath, testCommand);

    return {
      passed: result.failed === 0,
      summary:
        result.failed === 0
          ? `✅ All ${result.total} tests passed`
          : `❌ ${result.failed}/${result.total} tests failed`,
      totalTests: result.total,
      failedTests: result.failed,
      output: result.output,
    };
  } catch (err) {
    return {
      passed: false,
      summary: `⚠️ Test execution failed: ${err}`,
      totalTests: 0,
      failedTests: 0,
      output: String(err),
    };
  }
}

/**
 * Check current test status for a workspace.
 */
export async function checkTestStatus(projectPath: string): Promise<TestGateResult> {
  try {
    const status = await ciTestStatus(projectPath);
    const result = status.lastRun;
    if (!result) {
      return {
        passed: false,
        summary: "No test results available",
        totalTests: 0,
        failedTests: 0,
        output: "",
      };
    }
    return {
      passed: result.failed === 0,
      summary:
        result.failed === 0
          ? `✅ All ${result.total} tests passed`
          : `❌ ${result.failed}/${result.total} tests failed`,
      totalTests: result.total,
      failedTests: result.failed,
      output: result.output,
    };
  } catch (err) {
    return {
      passed: false,
      summary: `No test results available`,
      totalTests: 0,
      failedTests: 0,
      output: String(err),
    };
  }
}
