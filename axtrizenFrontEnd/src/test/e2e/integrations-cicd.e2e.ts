import { browser, $, expect } from "@wdio/globals";

/**
 * Integrations & CI/CD E2E Tests (Sprint 6)
 *
 * Tests for Slack/Discord integration commands and CI/CD pipeline commands.
 */

/** Helper: invoke a Tauri command via WebDriver */
async function tauriInvoke(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const jsonStr = await browser.executeAsync(
    (command: string, params: string, done: (result: string) => void) => {
      try {
        const invoke = (window as any).__TAURI__?.core?.invoke;
        if (!invoke) {
          done(JSON.stringify({ __error: "Tauri not available" }));
          return;
        }
        invoke(command, JSON.parse(params))
          .then((result: unknown) => done(JSON.stringify(result)))
          .catch((err: Error) => done(JSON.stringify({ __error: String(err) })));
      } catch (e) {
        done(JSON.stringify({ __error: String(e) }));
      }
    },
    cmd,
    JSON.stringify(args),
  );
  return JSON.parse(jsonStr as string);
}

describe("Slack / Discord Integration – E2E", () => {
  describe("slack_status command", () => {
    it("should return disconnected when not configured", async () => {
      const status = await tauriInvoke("slack_status");
      expect(status).toHaveProperty("platform");
      expect((status as any).platform).toBe("slack");
      // Not configured yet, so not connected
      expect((status as any).connected).toBe(false);
    });
  });

  describe("discord_status command", () => {
    it("should return disconnected when not configured", async () => {
      const status = await tauriInvoke("discord_status");
      expect((status as any).platform).toBe("discord");
      expect((status as any).connected).toBe(false);
    });
  });

  describe("integration_handle_mention command", () => {
    it("should acknowledge an incoming mention", async () => {
      const result = await tauriInvoke("integration_handle_mention", {
        platform: "slack",
        channel: "#test",
        user: "U12345",
        text: "@axtrizen help me",
        timestamp: new Date().toISOString(),
      });
      expect((result as any).acknowledged).toBe(true);
      expect((result as any).platform).toBe("slack");
    });
  });
});

describe("CI/CD Pipeline – E2E", () => {
  describe("ci_run_tests command", () => {
    it("should run a simple echo command and return a result", async () => {
      const result = await tauriInvoke("ci_run_tests", {
        projectPath: "/tmp",
        command: 'echo "Tests:  1 passed, 1 total"',
        framework: "vitest",
      });
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("status");
      // echo always succeeds
      expect(["passed", "failed"]).toContain((result as any).status);
    });
  });

  describe("ci_test_status command", () => {
    it("should retrieve status for an existing run", async () => {
      // First create a run
      const run = await tauriInvoke("ci_run_tests", {
        projectPath: "/tmp",
        command: 'echo "test result: ok. 2 passed; 0 failed; 0 ignored"',
        framework: "cargo",
      });

      const runId = (run as any).id;
      expect(runId).toBeDefined();

      // Now check status
      const status = await tauriInvoke("ci_test_status", { runId });
      expect((status as any).id).toBe(runId);
      expect((status as any).status).toBeDefined();
    });
  });

  describe("ci_deploy_preview command", () => {
    it("should create a local preview entry", async () => {
      const result = await tauriInvoke("ci_deploy_preview", {
        projectPath: "/tmp",
        provider: "local",
      });
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("url");
      expect((result as any).provider).toBe("local");

      // Clean up
      const previewId = (result as any).id;
      if (previewId) {
        await tauriInvoke("ci_stop_preview", { previewId });
      }
    });
  });

  describe("ci_stop_preview command", () => {
    it("should stop a preview without error", async () => {
      const result = await tauriInvoke("ci_stop_preview", {
        previewId: "nonexistent-preview",
      });
      expect((result as any).status).toBe("stopped");
    });
  });
});
