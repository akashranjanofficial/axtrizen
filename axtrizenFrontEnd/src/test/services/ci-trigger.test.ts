import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the tauri-api module
vi.mock("../../app/tauri-api", () => ({
  ciRunTests: vi.fn(),
  ciTestStatus: vi.fn(),
}));

import { runTestGate, checkTestStatus } from "../../app/services/ci-trigger";
import { ciRunTests, ciTestStatus } from "../../app/tauri-api";

const mockCiRunTests = vi.mocked(ciRunTests);
const mockCiTestStatus = vi.mocked(ciTestStatus);

// ══════════════════════════════════════════════════════════
// runTestGate
// ══════════════════════════════════════════════════════════

describe("CI Trigger - runTestGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return success when all tests pass", async () => {
    mockCiRunTests.mockResolvedValue({
      passed: 10,
      failed: 0,
      skipped: 0,
      total: 10,
      duration_ms: 1234,
      output: "All tests passed",
      failedTests: [],
    });

    const result = await runTestGate("/project");

    expect(result.passed).toBe(true);
    expect(result.summary).toContain("10 tests passed");
    expect(result.totalTests).toBe(10);
    expect(result.failedTests).toBe(0);
  });

  it("should return failure when tests fail", async () => {
    mockCiRunTests.mockResolvedValue({
      passed: 8,
      failed: 2,
      skipped: 0,
      total: 10,
      duration_ms: 1500,
      output: "2 tests failed",
      failedTests: [
        { name: "should work", error: "assertion error", stackTrace: "" },
        { name: "should also work", error: "timeout", stackTrace: "" },
      ],
    });

    const result = await runTestGate("/project");

    expect(result.passed).toBe(false);
    expect(result.summary).toContain("2/10");
    expect(result.failedTests).toBe(2);
  });

  it("should use custom command when provided", async () => {
    mockCiRunTests.mockResolvedValue({
      passed: 5,
      failed: 0,
      skipped: 0,
      total: 5,
      duration_ms: 500,
      output: "OK",
      failedTests: [],
    });

    await runTestGate("/project", "cargo test");

    expect(mockCiRunTests).toHaveBeenCalledWith("/project", "cargo test");
  });

  it("should handle Tauri command failures gracefully", async () => {
    mockCiRunTests.mockRejectedValue(new Error("Not running in Tauri"));

    const result = await runTestGate("/project");

    expect(result.passed).toBe(false);
    expect(result.summary).toContain("failed");
    expect(result.totalTests).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════
// checkTestStatus
// ══════════════════════════════════════════════════════════

describe("CI Trigger - checkTestStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should unwrap lastRun when present", async () => {
    mockCiTestStatus.mockResolvedValue({
      lastRun: {
        passed: 15,
        failed: 0,
        skipped: 1,
        total: 16,
        duration_ms: 2000,
        output: "All tests passed",
        failedTests: [],
      },
      running: false,
    });

    const result = await checkTestStatus("/project");

    expect(result.passed).toBe(true);
    expect(result.totalTests).toBe(16);
    expect(result.output).toBe("All tests passed");
  });

  it("should return default when no lastRun", async () => {
    mockCiTestStatus.mockResolvedValue({
      lastRun: undefined,
      running: false,
    });

    const result = await checkTestStatus("/project");

    expect(result.passed).toBe(false);
    expect(result.summary).toContain("No test results");
    expect(result.totalTests).toBe(0);
  });

  it("should handle errors gracefully", async () => {
    mockCiTestStatus.mockRejectedValue(new Error("DB error"));

    const result = await checkTestStatus("/project");

    expect(result.passed).toBe(false);
    expect(result.totalTests).toBe(0);
  });
});
