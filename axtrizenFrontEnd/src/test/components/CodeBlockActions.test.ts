import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractText,
  getLanguageLabel,
  getFileExtension,
  markdownComponents,
} from "../../app/components/CodeBlockActions";

// ── extractText ────────────────────────────────────────────────────────

describe("extractText", () => {
  it("extracts plain strings", () => {
    expect(extractText("hello world")).toBe("hello world");
  });

  it("extracts numbers as strings", () => {
    expect(extractText(42)).toBe("42");
  });

  it("joins arrays of children", () => {
    expect(extractText(["hello", " ", "world"])).toBe("hello world");
  });

  it("returns empty string for null/undefined", () => {
    expect(extractText(null)).toBe("");
    expect(extractText(undefined)).toBe("");
  });
});

// ── getLanguageLabel ───────────────────────────────────────────────────

describe("getLanguageLabel", () => {
  it("returns 'Code' for undefined", () => {
    expect(getLanguageLabel(undefined)).toBe("Code");
  });

  it("maps 'ts' to 'TypeScript'", () => {
    expect(getLanguageLabel("ts")).toBe("TypeScript");
  });

  it("maps 'typescript' to 'TypeScript'", () => {
    expect(getLanguageLabel("typescript")).toBe("TypeScript");
  });

  it("maps 'py' to 'Python'", () => {
    expect(getLanguageLabel("py")).toBe("Python");
  });

  it("maps 'rs' to 'Rust'", () => {
    expect(getLanguageLabel("rs")).toBe("Rust");
  });

  it("handles case-insensitive input", () => {
    expect(getLanguageLabel("PYTHON")).toBe("Python");
  });

  it("returns raw string for unknown languages", () => {
    expect(getLanguageLabel("brainfuck")).toBe("brainfuck");
  });
});

// ── getFileExtension ───────────────────────────────────────────────────

describe("getFileExtension", () => {
  it("returns 'txt' for undefined", () => {
    expect(getFileExtension(undefined)).toBe("txt");
  });

  it("maps 'typescript' to 'ts'", () => {
    expect(getFileExtension("typescript")).toBe("ts");
  });

  it("maps 'python' to 'py'", () => {
    expect(getFileExtension("python")).toBe("py");
  });

  it("maps 'rust' to 'rs'", () => {
    expect(getFileExtension("rust")).toBe("rs");
  });

  it("maps 'bash' to 'sh'", () => {
    expect(getFileExtension("bash")).toBe("sh");
  });

  it("returns 'txt' for unknown languages", () => {
    expect(getFileExtension("brainfuck")).toBe("txt");
  });
});

// ── markdownComponents ─────────────────────────────────────────────────

describe("markdownComponents", () => {
  it("exports a code component", () => {
    expect(markdownComponents).toBeDefined();
    expect(markdownComponents.code).toBeDefined();
    expect(typeof markdownComponents.code).toBe("function");
  });
});
