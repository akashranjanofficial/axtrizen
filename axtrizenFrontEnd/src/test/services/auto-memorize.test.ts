import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock vector-memory module (autoMemorizeConversation uses vectorMemory.memorize)
const mockMemorize = vi.fn().mockResolvedValue(undefined);
vi.mock("../../app/services/vector-memory", () => ({
  default: {
    memorize: (...args: unknown[]) => mockMemorize(...args),
  },
}));

import { autoMemorizeConversation } from "../../app/services/agent-memory";

// ══════════════════════════════════════════════════════════
// autoMemorizeConversation
// ══════════════════════════════════════════════════════════

describe("Auto-Memorize - autoMemorizeConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should store conversation messages via vectorMemory.memorize", async () => {
    const messages = [
      { role: "user", content: "What is TypeScript?" },
      { role: "assistant", content: "TypeScript is a typed superset of JavaScript." },
    ];

    await autoMemorizeConversation("agent-1", messages);

    expect(mockMemorize).toHaveBeenCalledTimes(1);
    // Should pass transcript, category "conversation", and agentId
    expect(mockMemorize).toHaveBeenCalledWith(
      expect.stringContaining("What is TypeScript"),
      "conversation",
      "agent-1",
    );
  });

  it("should early-return on empty message list without calling memorize", async () => {
    await autoMemorizeConversation("agent-1", []);

    expect(mockMemorize).not.toHaveBeenCalled();
  });

  it("should not throw on memorize failure", async () => {
    mockMemorize.mockRejectedValueOnce(new Error("memU unavailable"));

    const messages = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];

    await expect(autoMemorizeConversation("agent-1", messages)).resolves.not.toThrow();
  });

  it("should format messages as [ROLE]: content transcript", async () => {
    const messages = [
      { role: "user", content: "First question" },
      { role: "assistant", content: "First answer" },
    ];

    await autoMemorizeConversation("agent-1", messages);

    const transcript = mockMemorize.mock.calls[0]?.[0] as string;
    expect(transcript).toContain("[USER]: First question");
    expect(transcript).toContain("[ASSISTANT]: First answer");
  });

  it("should pass agentId as the third argument", async () => {
    const messages = [{ role: "user", content: "test" }];
    await autoMemorizeConversation("my-agent-42", messages);

    expect(mockMemorize).toHaveBeenCalledWith(expect.any(String), "conversation", "my-agent-42");
  });
});
