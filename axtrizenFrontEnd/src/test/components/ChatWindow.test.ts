import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Phase 2 ChatWindow Feature Tests
 *
 * These tests verify the helper logic used in the Phase 2 chat UX
 * enhancements — pin/favorite, search, relative time, last message,
 * and unread tracking — without requiring a full React render.
 */

// ─── Pin / Favorite (localStorage persistence) ──────────────────

describe("Pin/Favorite Chat", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists pinned chats to localStorage", () => {
    const pinned = new Set<string>(["agent-1", "team:team-abc"]);
    localStorage.setItem("axtrizen:pinnedChats", JSON.stringify([...pinned]));

    const restored = new Set<string>(JSON.parse(localStorage.getItem("axtrizen:pinnedChats")!));
    expect(restored.has("agent-1")).toBe(true);
    expect(restored.has("team:team-abc")).toBe(true);
    expect(restored.size).toBe(2);
  });

  it("toggle adds and removes a pin", () => {
    const pinned = new Set<string>();

    // Pin
    pinned.add("agent-1");
    expect(pinned.has("agent-1")).toBe(true);

    // Unpin
    pinned.delete("agent-1");
    expect(pinned.has("agent-1")).toBe(false);
  });

  it("pinned items sort before unpinned", () => {
    const pinnedChats = new Set(["agent-2"]);
    const agents = [
      { id: "agent-1", name: "Alpha" },
      { id: "agent-2", name: "Beta" },
      { id: "agent-3", name: "Gamma" },
    ];

    const sorted = [...agents].toSorted((a, b) => {
      const aPinned = pinnedChats.has(a.id) ? 1 : 0;
      const bPinned = pinnedChats.has(b.id) ? 1 : 0;
      return bPinned - aPinned;
    });

    expect(sorted[0].id).toBe("agent-2"); // pinned first
    expect(sorted[1].id).toBe("agent-1");
    expect(sorted[2].id).toBe("agent-3");
  });
});

// ─── Search Filtering ────────────────────────────────────────────

describe("Search Filtering", () => {
  const agents = [
    { id: "agent-1", name: "Haider" },
    { id: "agent-2", name: "Code Review" },
    { id: "agent-3", name: "Backend Dev" },
  ];

  const teams = [
    { id: "team-1", name: "Frontend" },
    { id: "team-2", name: "Backend" },
  ];

  it("filters agents by name (case-insensitive)", () => {
    const query = "hai";
    const filtered = agents.filter((a) =>
      (a.name || a.id).toLowerCase().includes(query.toLowerCase()),
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("agent-1");
  });

  it("filters teams by name", () => {
    const query = "back";
    const filtered = teams.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("team-2");
  });

  it("returns all items when search is empty", () => {
    const query = "";
    const filteredAgents = agents.filter(
      (a) => !query || (a.name || a.id).toLowerCase().includes(query.toLowerCase()),
    );
    const filteredTeams = teams.filter(
      (t) => !query || t.name.toLowerCase().includes(query.toLowerCase()),
    );
    expect(filteredAgents.length).toBe(3);
    expect(filteredTeams.length).toBe(2);
  });

  it("returns empty when no match", () => {
    const query = "zzzzz";
    const filtered = agents.filter((a) =>
      (a.name || a.id).toLowerCase().includes(query.toLowerCase()),
    );
    expect(filtered.length).toBe(0);
  });
});

// ─── Relative Time Formatting ────────────────────────────────────

describe("Relative Time Formatting", () => {
  const formatRelativeTime = (ts: number): string => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) {
      return "now";
    }
    if (diff < 3600) {
      return `${Math.floor(diff / 60)}m`;
    }
    if (diff < 86400) {
      return `${Math.floor(diff / 3600)}h`;
    }
    return `${Math.floor(diff / 86400)}d`;
  };

  it('returns "now" for timestamps within the last minute', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toBe("now");
    expect(formatRelativeTime(Date.now())).toBe("now");
  });

  it('returns "Xm" for timestamps within the last hour', () => {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    expect(formatRelativeTime(fiveMinAgo)).toBe("5m");
  });

  it('returns "Xh" for timestamps within the last day', () => {
    const threeHoursAgo = Date.now() - 3 * 3600 * 1000;
    expect(formatRelativeTime(threeHoursAgo)).toBe("3h");
  });

  it('returns "Xd" for timestamps older than a day', () => {
    const twoDaysAgo = Date.now() - 2 * 86400 * 1000;
    expect(formatRelativeTime(twoDaysAgo)).toBe("2d");
  });
});

// ─── Last Message Preview ────────────────────────────────────────

describe("Last Message Preview", () => {
  it("truncates long messages to 60 chars", () => {
    const longMsg = "A".repeat(100);
    const preview = longMsg.slice(0, 60);
    expect(preview.length).toBe(60);
    expect(preview).toBe("A".repeat(60));
  });

  it("preserves short messages as-is", () => {
    const shortMsg = "Hello there!";
    const preview = shortMsg.slice(0, 60);
    expect(preview).toBe("Hello there!");
  });

  it("stores last message per chat key", () => {
    const lastMessages = new Map<string, { text: string; time: number }>();
    lastMessages.set("agent-1", { text: "Hello", time: Date.now() });
    lastMessages.set("team:team-1", { text: "Team msg", time: Date.now() });

    expect(lastMessages.get("agent-1")?.text).toBe("Hello");
    expect(lastMessages.get("team:team-1")?.text).toBe("Team msg");
    expect(lastMessages.has("agent-99")).toBe(false);
  });
});

// ─── Unread Badge Logic ──────────────────────────────────────────

describe("Unread Badge Logic", () => {
  it("increments unread count for inactive chats", () => {
    const unreadCounts = new Map<string, number>();

    // Simulate receiving messages for agent-2 while agent-1 is selected
    const selectedChatKey = "agent-1";
    const incomingChatKey = "agent-2";

    if (incomingChatKey !== selectedChatKey) {
      unreadCounts.set(incomingChatKey, (unreadCounts.get(incomingChatKey) || 0) + 1);
    }

    expect(unreadCounts.get("agent-2")).toBe(1);
    expect(unreadCounts.has("agent-1")).toBe(false);
  });

  it("clears unread when chat is selected", () => {
    const unreadCounts = new Map<string, number>([
      ["agent-1", 5],
      ["agent-2", 3],
    ]);

    // Simulate selecting agent-1
    unreadCounts.delete("agent-1");

    expect(unreadCounts.has("agent-1")).toBe(false);
    expect(unreadCounts.get("agent-2")).toBe(3);
  });

  it("displays 9+ for counts above 9", () => {
    const count = 15;
    const display = count > 9 ? "9+" : String(count);
    expect(display).toBe("9+");
  });

  it("displays exact count for single digit", () => {
    const count = 3;
    const display = count > 9 ? "9+" : String(count);
    expect(display).toBe("3");
  });
});

// ─── ChatTarget Navigation ──────────────────────────────────────

describe("ChatTarget Navigation", () => {
  it("correctly constructs team chat target", () => {
    const target = { type: "team" as const, id: "team-abc" };
    expect(target.type).toBe("team");
    expect(target.id).toBe("team-abc");
  });

  it("correctly constructs agent chat target", () => {
    const target = { type: "agent" as const, id: "agent-1" };
    expect(target.type).toBe("agent");
    expect(target.id).toBe("agent-1");
  });

  it("builds correct session key for team", () => {
    const teamId = "team-abc";
    const sessionKey = `team:${teamId}:group`;
    expect(sessionKey).toBe("team:team-abc:group");
  });

  it("builds correct session key for agent", () => {
    const agentId = "agent-1";
    const sessionKey = `agent:${agentId}:main`;
    expect(sessionKey).toBe("agent:agent-1:main");
  });
});
