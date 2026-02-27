import { describe, it, expect } from "vitest";
import { createSnippet, formatSearchTime } from "../../app/components/GlobalChatSearch";

// ── createSnippet ──────────────────────────────────────────────────────

describe("createSnippet", () => {
  it("highlights the matching term with <mark>", () => {
    const snippet = createSnippet("hello world", "world");
    expect(snippet).toContain("<mark>world</mark>");
  });

  it("is case-insensitive", () => {
    const snippet = createSnippet("Hello World", "hello");
    expect(snippet).toContain("<mark>Hello</mark>");
  });

  it("adds ellipsis at start when match is deep in the text", () => {
    const longText = "A".repeat(200) + " target word here";
    const snippet = createSnippet(longText, "target");
    expect(snippet).toMatch(/^…/);
  });

  it("adds ellipsis at end when text continues after context", () => {
    const longText = "target word here " + "B".repeat(200);
    const snippet = createSnippet(longText, "target");
    expect(snippet).toMatch(/…$/);
  });

  it("returns start of text when no match found", () => {
    const snippet = createSnippet("hello world", "zzz", 10);
    expect(snippet).toBe("hello world");
  });

  it("returns start of text when query is empty", () => {
    const snippet = createSnippet("hello world", "", 10);
    expect(snippet).toBe("hello world");
  });

  it("handles empty text", () => {
    const snippet = createSnippet("", "test");
    expect(snippet).toBe("");
  });
});

// ── formatSearchTime ───────────────────────────────────────────────────

describe("formatSearchTime", () => {
  it("returns 'now' for recent timestamps", () => {
    const recent = new Date(Date.now() - 10_000).toISOString();
    expect(formatSearchTime(recent)).toBe("now");
  });

  it("returns minutes ago for timestamps within the hour", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatSearchTime(fiveMinAgo)).toBe("5m ago");
  });

  it("returns hours ago for timestamps within the day", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    expect(formatSearchTime(threeHoursAgo)).toBe("3h ago");
  });

  it("returns days ago for timestamps within the week", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    expect(formatSearchTime(twoDaysAgo)).toBe("2d ago");
  });

  it("returns formatted date for older timestamps", () => {
    const oldDate = new Date("2024-01-15").toISOString();
    const result = formatSearchTime(oldDate);
    // Should be a date string, not relative time
    expect(result).not.toContain("ago");
    expect(result).not.toBe("now");
  });
});
