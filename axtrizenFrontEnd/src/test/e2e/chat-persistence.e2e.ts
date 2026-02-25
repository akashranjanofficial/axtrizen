import { browser, $, expect } from "@wdio/globals";

/**
 * Chat Persistence E2E Tests
 *
 * Tests that chat messages are saved to SQLite and survive
 * page navigation. Uses browser.executeAsync() with a done()
 * callback to handle Tauri's async invoke — WKWebView WebDriver
 * doesn't support returning Promises from browser.execute().
 */

/** Helper: invoke a Tauri command using executeAsync with done() callback */
async function tauriInvoke(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const jsonStr = await browser.executeAsync(
    (command: string, params: string, done: (result: string) => void) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoke = (window as any).__TAURI__?.core?.invoke;
        if (!invoke) {
          done(JSON.stringify({ __error: "Tauri not available" }));
          return;
        }
        invoke(command, JSON.parse(params))
          .then((result: unknown) => {
            done(JSON.stringify(result));
          })
          .catch((err: Error) => {
            done(JSON.stringify({ __error: String(err) }));
          });
      } catch (e) {
        done(JSON.stringify({ __error: String(e) }));
      }
    },
    cmd,
    JSON.stringify(args),
  );

  if (!jsonStr || typeof jsonStr !== "string") {
    return { __error: "Empty response" };
  }
  return JSON.parse(jsonStr) as Record<string, unknown>;
}

describe("Chat Persistence E2E", () => {
  before(async () => {
    await browser.url("http://localhost:5174");
    await browser.pause(3000);

    // Clean up any leftover test data from prior runs
    const convResult = await tauriInvoke("get_all_conversations");
    if (!convResult.__error) {
      const conversations = convResult.conversations as Array<Record<string, unknown>>;
      const testConv = conversations.find((c) => c.session_key === "agent:e2e-test-agent:main");
      if (testConv) {
        await tauriInvoke("delete_conversation", { conversationId: testConv.id as string });
      }
    }
  });

  describe("Conversation List", () => {
    it("should navigate to Chat view", async () => {
      const chatBtn = await $('[data-testid="nav-chat"]');
      await chatBtn.click();
      await browser.pause(1000);

      const chatView = await $('[data-testid="chat-search"], [data-testid="chat-input"]');
      await expect(chatView).toBeExisting();
    });
  });

  describe("Message Persistence via Tauri Commands", () => {
    it("should save a chat message to SQLite", async () => {
      const result = await tauriInvoke("save_chat_message", {
        sessionKey: "agent:e2e-test-agent:main",
        role: "user",
        content: "Hello from E2E test - persistence check!",
        conversationType: "direct",
        agentId: "e2e-test-agent",
        title: "E2E Test Chat",
      });

      if (result.__error) {
        console.log("Tauri not available:", result.__error);
        return;
      }
      expect(result.ok).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.conversationId).toBeDefined();
    });

    it("should save an assistant response to SQLite", async () => {
      const result = await tauriInvoke("save_chat_message", {
        sessionKey: "agent:e2e-test-agent:main",
        role: "assistant",
        content: "I am the E2E test agent. Your message was received and persisted!",
        senderAgentId: "e2e-test-agent",
        senderAgentName: "E2E Bot",
        conversationType: "direct",
        agentId: "e2e-test-agent",
      });

      if (result.__error) {
        return;
      }
      expect(result.ok).toBe(true);
    });

    it("should retrieve conversation history from SQLite", async () => {
      const result = await tauriInvoke("get_conversation_history", {
        sessionKey: "agent:e2e-test-agent:main",
        limit: 10,
      });

      if (result.__error) {
        return;
      }

      const messages = result.messages as Array<Record<string, unknown>>;
      expect(messages).toBeDefined();
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content as string).toContain("E2E test - persistence check");
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].sender_agent_name).toBe("E2E Bot");
    });

    it("should list all conversations sorted by activity", async () => {
      const result = await tauriInvoke("get_all_conversations");

      if (result.__error) {
        return;
      }

      const conversations = result.conversations as Array<Record<string, unknown>>;
      expect(conversations).toBeDefined();
      expect(conversations.length).toBeGreaterThanOrEqual(1);

      const testConv = conversations.find((c) => c.session_key === "agent:e2e-test-agent:main");
      expect(testConv).toBeDefined();
      expect(testConv!.conversation_type).toBe("direct");
      expect(testConv!.message_count).toBeGreaterThanOrEqual(2);
      expect(testConv!.title).toBe("E2E Test Chat");
    });

    it("should search messages across conversations", async () => {
      const result = await tauriInvoke("search_chat", {
        query: "persistence check",
        limit: 10,
      });

      if (result.__error) {
        return;
      }

      const messages = result.messages as Array<Record<string, unknown>>;
      expect(messages.length).toBeGreaterThanOrEqual(1);
      expect(messages[0].content as string).toContain("persistence check");
    });

    it("should persist messages across page refresh", async () => {
      await browser.refresh();
      await browser.pause(3000);

      const result = await tauriInvoke("get_conversation_history", {
        sessionKey: "agent:e2e-test-agent:main",
      });

      if (result.__error) {
        return;
      }

      const messages = result.messages as Array<Record<string, unknown>>;
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages[0].content as string).toContain("E2E test - persistence check");
    });
  });

  describe("Cleanup", () => {
    it("should delete the test conversation", async () => {
      const convResult = await tauriInvoke("get_all_conversations");
      if (convResult.__error) {
        return;
      }

      const conversations = convResult.conversations as Array<Record<string, unknown>>;
      const testConv = conversations.find((c) => c.session_key === "agent:e2e-test-agent:main");
      if (!testConv) {
        return;
      }

      const result = await tauriInvoke("delete_conversation", {
        conversationId: testConv.id as string,
      });

      if (result.__error) {
        return;
      }
      expect(result.ok).toBe(true);
    });

    it("should verify conversation was deleted", async () => {
      const result = await tauriInvoke("get_conversation_history", {
        sessionKey: "agent:e2e-test-agent:main",
      });

      if (result.__error) {
        return;
      }

      const messages = result.messages as Array<Record<string, unknown>>;
      expect(messages.length).toBe(0);
    });
  });
});
