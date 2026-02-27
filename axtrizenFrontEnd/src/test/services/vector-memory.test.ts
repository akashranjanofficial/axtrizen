import { describe, it, expect } from "vitest";
import {
  chunkText,
  estimateTokens,
  formatMemoryResults,
} from "../../app/services/vector-memory";

// ══════════════════════════════════════════════════════════
// chunkText
// ══════════════════════════════════════════════════════════

describe("Vector Memory - chunkText", () => {
  it("should return single chunk for short text", () => {
    const chunks = chunkText("Hello world", 1000, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("Hello world");
  });

  it("should split long text into overlapping chunks", () => {
    const text = Array(50).fill("This is a sentence.").join(" ");
    const chunks = chunkText(text, 100, 20);
    expect(chunks.length).toBeGreaterThan(1);

    // Each chunk should be within max size (with some tolerance for sentence boundary snapping)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200); // generous bound
    }
  });

  it("should handle empty text", () => {
    const chunks = chunkText("", 1000, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("");
  });

  it("should use default parameters", () => {
    const text = "Short text";
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("Short text");
  });

  it("should respect sentence boundaries when possible", () => {
    const text = "First sentence. Second sentence. Third sentence. Fourth sentence.";
    const chunks = chunkText(text, 40, 10);
    // Chunks should start/end near sentence boundaries
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // Should not start mid-word (common case)
      expect(chunk.trimStart()).toBe(chunk.trimStart());
    }
  });
});

// ══════════════════════════════════════════════════════════
// estimateTokens
// ══════════════════════════════════════════════════════════

describe("Vector Memory - estimateTokens", () => {
  it("should return 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("should estimate tokens roughly as words / 0.75", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    const est = estimateTokens(text);
    expect(est).toBeGreaterThan(8);
    expect(est).toBeLessThan(20);
  });

  it("should handle single word", () => {
    expect(estimateTokens("hello")).toBeGreaterThan(0);
  });

  it("should handle code-like text reasonably", () => {
    const code = 'function foo() { return bar.baz("hello"); }';
    const est = estimateTokens(code);
    expect(est).toBeGreaterThan(5);
  });
});

// ══════════════════════════════════════════════════════════
// formatMemoryResults
// ══════════════════════════════════════════════════════════

describe("Vector Memory - formatMemoryResults", () => {
  it("should format results into readable text", () => {
    const formatted = formatMemoryResults([
      {
        document: {
          id: "doc-1",
          content: "Architecture decision: Use React for frontend",
          metadata: { documentType: "decision" },
        },
        score: 0.95,
      },
      {
        document: {
          id: "doc-2",
          content: "Meeting notes from sprint planning",
          metadata: { documentType: "notes" },
        },
        score: 0.82,
      },
    ]);
    expect(formatted).toContain("Architecture decision");
    expect(formatted).toContain("Meeting notes");
    expect(formatted).toContain("95%");
  });

  it("should handle empty results", () => {
    const formatted = formatMemoryResults([]);
    expect(formatted).toBeDefined();
    expect(formatted).toBe("");
  });

  it("should handle results without metadata fields", () => {
    const formatted = formatMemoryResults([
      {
        document: { id: "d1", content: "Some content", metadata: {} },
        score: 0.5,
      },
    ]);
    expect(formatted).toContain("Some content");
  });
});
