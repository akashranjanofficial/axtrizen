import { browser, $, expect } from "@wdio/globals";

/**
 * Git Integration E2E Tests (Sprint 5)
 *
 * Tests the git-related UI elements and command flow.
 * Uses the same tauriInvoke helper as other e2e tests.
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

describe("Git Integration – E2E", () => {
  describe("git_is_repo command", () => {
    it("should return false for a non-git directory", async () => {
      const result = await tauriInvoke("git_is_repo", {
        workspacePath: "/tmp/nonexistent-dir-xyz",
      });
      expect(result).toBe(false);
    });
  });

  describe("git_current_branch command", () => {
    it("should return a branch name for a git repo", async () => {
      // Use the workspace root which should be a git repo
      const result = await tauriInvoke("git_is_repo", {
        workspacePath: ".",
      });
      if (result === true) {
        const branch = await tauriInvoke("git_current_branch", {
          workspacePath: ".",
        });
        expect(typeof branch).toBe("string");
        expect((branch as any).length).toBeGreaterThan(0);
      }
    });
  });

  describe("git_status command", () => {
    it("should return status object with staged/unstaged/untracked arrays", async () => {
      const isRepo = await tauriInvoke("git_is_repo", { workspacePath: "." });
      if (isRepo === true) {
        const status = await tauriInvoke("git_status", { workspacePath: "." });
        expect(status).toHaveProperty("staged");
        expect(status).toHaveProperty("unstaged");
        expect(status).toHaveProperty("untracked");
      }
    });
  });
});

describe("Vector Memory – E2E", () => {
  describe("vector_store_init command", () => {
    it("should initialize successfully", async () => {
      const result = await tauriInvoke("vector_store_init", {});
      expect(result).toHaveProperty("status");
      expect((result as any).status).toBe("ok");
    });
  });

  describe("vector_store_add and search flow", () => {
    it("should add a document and find it via search", async () => {
      // Initialize
      await tauriInvoke("vector_store_init", {});

      // Add a document
      const addResult = await tauriInvoke("vector_store_add", {
        id: "test-doc-e2e-1",
        content: "The architecture uses React and TypeScript for the frontend",
        collection: "e2e_test",
        metadata: { type: "architecture" },
      });
      expect((addResult as any).status).toBe("ok");

      // Search for it
      const searchResult = await tauriInvoke("vector_store_search", {
        query: "React TypeScript frontend architecture",
        collection: "e2e_test",
        limit: 5,
      });
      expect(searchResult).toHaveProperty("results");
      const results = (searchResult as any).results;
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain("React");

      // Clean up
      await tauriInvoke("vector_store_delete", { id: "test-doc-e2e-1" });
    });
  });

  describe("vector_store_stats command", () => {
    it("should return collection statistics", async () => {
      await tauriInvoke("vector_store_init", {});
      const stats = await tauriInvoke("vector_store_stats", {});
      expect(stats).toHaveProperty("embeddingDimension");
      expect((stats as any).embeddingDimension).toBe(128);
    });
  });
});
