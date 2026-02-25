import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadAgentMemory,
  saveAgentMemory,
  updateAgentMemorySection,
  appendToMemory,
  clearAgentMemory,
  formatMemoryContext,
  extractMemoryUpdates,
  type AgentMemory,
} from "../../app/services/agent-memory";

// ── Setup ──

const TEST_AGENT_ID = "test-agent-123";
const TEST_AGENT_ID_2 = "test-agent-456";

beforeEach(() => {
  // Clean up test keys
  clearAgentMemory(TEST_AGENT_ID);
  clearAgentMemory(TEST_AGENT_ID_2);
});

afterEach(() => {
  clearAgentMemory(TEST_AGENT_ID);
  clearAgentMemory(TEST_AGENT_ID_2);
});

// ══════════════════════════════════════════════════════════
// CORE MEMORY OPERATIONS
// ══════════════════════════════════════════════════════════

describe("Agent Memory - Core Operations", () => {
  describe("loadAgentMemory", () => {
    it("should return empty memory for new agent", () => {
      const memory = loadAgentMemory(TEST_AGENT_ID);
      expect(memory.taskPlan).toBe("");
      expect(memory.notes).toBe("");
      expect(memory.context).toBe("");
      expect(memory.lastUpdated).toBe(0);
    });

    it("should return saved memory for existing agent", () => {
      const memory: AgentMemory = {
        taskPlan: "Build upload component",
        notes: "Use drag-and-drop library",
        context: "Image converter app",
        lastUpdated: Date.now(),
      };
      saveAgentMemory(TEST_AGENT_ID, memory);

      const loaded = loadAgentMemory(TEST_AGENT_ID);
      expect(loaded.taskPlan).toBe("Build upload component");
      expect(loaded.notes).toBe("Use drag-and-drop library");
      expect(loaded.context).toBe("Image converter app");
    });
  });

  describe("saveAgentMemory", () => {
    it("should persist memory and update lastUpdated", () => {
      const memory: AgentMemory = {
        taskPlan: "Test plan",
        notes: "Test notes",
        context: "Test context",
        lastUpdated: 0,
      };
      saveAgentMemory(TEST_AGENT_ID, memory);

      const loaded = loadAgentMemory(TEST_AGENT_ID);
      expect(loaded.lastUpdated).toBeGreaterThan(0);
      expect(loaded.taskPlan).toBe("Test plan");
    });
  });

  describe("updateAgentMemorySection", () => {
    it("should update only the specified section", () => {
      saveAgentMemory(TEST_AGENT_ID, {
        taskPlan: "Original plan",
        notes: "Original notes",
        context: "Original context",
        lastUpdated: 0,
      });

      updateAgentMemorySection(TEST_AGENT_ID, "taskPlan", "Updated plan");

      const loaded = loadAgentMemory(TEST_AGENT_ID);
      expect(loaded.taskPlan).toBe("Updated plan");
      expect(loaded.notes).toBe("Original notes");
      expect(loaded.context).toBe("Original context");
    });
  });

  describe("appendToMemory", () => {
    it("should append to existing content with separator", () => {
      saveAgentMemory(TEST_AGENT_ID, {
        taskPlan: "",
        notes: "First note",
        context: "",
        lastUpdated: 0,
      });

      appendToMemory(TEST_AGENT_ID, "notes", "Second note");

      const loaded = loadAgentMemory(TEST_AGENT_ID);
      expect(loaded.notes).toContain("First note");
      expect(loaded.notes).toContain("Second note");
      expect(loaded.notes).toContain("---");
    });

    it("should not add separator for first entry", () => {
      appendToMemory(TEST_AGENT_ID, "notes", "First note");

      const loaded = loadAgentMemory(TEST_AGENT_ID);
      expect(loaded.notes).toBe("First note");
      expect(loaded.notes).not.toContain("---");
    });
  });

  describe("clearAgentMemory", () => {
    it("should remove all memory for agent", () => {
      saveAgentMemory(TEST_AGENT_ID, {
        taskPlan: "Plan",
        notes: "Notes",
        context: "Context",
        lastUpdated: Date.now(),
      });

      clearAgentMemory(TEST_AGENT_ID);

      const loaded = loadAgentMemory(TEST_AGENT_ID);
      expect(loaded.taskPlan).toBe("");
      expect(loaded.notes).toBe("");
      expect(loaded.lastUpdated).toBe(0);
    });

    it("should not affect other agents", () => {
      saveAgentMemory(TEST_AGENT_ID, {
        taskPlan: "Agent 1",
        notes: "",
        context: "",
        lastUpdated: 0,
      });
      saveAgentMemory(TEST_AGENT_ID_2, {
        taskPlan: "Agent 2",
        notes: "",
        context: "",
        lastUpdated: 0,
      });

      clearAgentMemory(TEST_AGENT_ID);

      const agent2 = loadAgentMemory(TEST_AGENT_ID_2);
      expect(agent2.taskPlan).toBe("Agent 2");
    });
  });

  describe("listAgentsWithMemory", () => {
    it("should store and retrieve memory for multiple agents", () => {
      saveAgentMemory(TEST_AGENT_ID, {
        taskPlan: "Plan",
        notes: "",
        context: "",
        lastUpdated: 0,
      });
      saveAgentMemory(TEST_AGENT_ID_2, {
        taskPlan: "Plan 2",
        notes: "",
        context: "",
        lastUpdated: 0,
      });

      // Verify both agents' memory is independently stored and retrievable
      const mem1 = loadAgentMemory(TEST_AGENT_ID);
      const mem2 = loadAgentMemory(TEST_AGENT_ID_2);
      expect(mem1.taskPlan).toBe("Plan");
      expect(mem2.taskPlan).toBe("Plan 2");
    });
  });
});

// ══════════════════════════════════════════════════════════
// MEMORY FORMATTING
// ══════════════════════════════════════════════════════════

describe("Agent Memory - Formatting", () => {
  describe("formatMemoryContext", () => {
    it("should return empty string for empty memory", () => {
      const memory: AgentMemory = {
        taskPlan: "",
        notes: "",
        context: "",
        lastUpdated: 0,
      };
      expect(formatMemoryContext(memory)).toBe("");
    });

    it("should include non-empty sections only", () => {
      const memory: AgentMemory = {
        taskPlan: "Build component",
        notes: "",
        context: "React project",
        lastUpdated: 0,
      };
      const formatted = formatMemoryContext(memory);
      expect(formatted).toContain("Task Plan");
      expect(formatted).toContain("Build component");
      expect(formatted).toContain("Project Context");
      expect(formatted).toContain("React project");
      expect(formatted).not.toContain("Notes");
    });

    it("should include all sections when all non-empty", () => {
      const memory: AgentMemory = {
        taskPlan: "Plan",
        notes: "Notes",
        context: "Context",
        lastUpdated: 0,
      };
      const formatted = formatMemoryContext(memory);
      expect(formatted).toContain("Task Plan");
      expect(formatted).toContain("Notes");
      expect(formatted).toContain("Project Context");
    });
  });
});

// ══════════════════════════════════════════════════════════
// MEMORY EXTRACTION FROM RESPONSES
// ══════════════════════════════════════════════════════════

describe("Agent Memory - Extraction", () => {
  describe("extractMemoryUpdates", () => {
    it("should extract [TASK_PLAN] tags", () => {
      const text = "Here's my update. [TASK_PLAN]Build the upload UI[/TASK_PLAN] Done!";
      const { updated, cleanText } = extractMemoryUpdates(TEST_AGENT_ID, text);

      expect(updated).toBe(true);
      expect(cleanText).not.toContain("[TASK_PLAN]");
      expect(cleanText).toContain("Here's my update");

      const memory = loadAgentMemory(TEST_AGENT_ID);
      expect(memory.taskPlan).toBe("Build the upload UI");
    });

    it("should extract [NOTES] tags", () => {
      const text = "Research done. [NOTES]Use sharp library for WebP conversion[/NOTES]";
      const { updated, cleanText } = extractMemoryUpdates(TEST_AGENT_ID, text);

      expect(updated).toBe(true);
      expect(cleanText).not.toContain("[NOTES]");

      const memory = loadAgentMemory(TEST_AGENT_ID);
      expect(memory.notes).toContain("sharp library");
    });

    it("should extract [CONTEXT] tags", () => {
      const text = "[CONTEXT]Tech stack: React, Node.js, Sharp[/CONTEXT] Ready to work.";
      const { updated, cleanText: _cleanText } = extractMemoryUpdates(TEST_AGENT_ID, text);

      expect(updated).toBe(true);

      const memory = loadAgentMemory(TEST_AGENT_ID);
      expect(memory.context).toContain("React, Node.js");
    });

    it("should extract multiple memory sections", () => {
      const text = "[TASK_PLAN]Build API[/TASK_PLAN] Working on it. [NOTES]Need auth[/NOTES]";
      const { updated } = extractMemoryUpdates(TEST_AGENT_ID, text);

      expect(updated).toBe(true);

      const memory = loadAgentMemory(TEST_AGENT_ID);
      expect(memory.taskPlan).toBe("Build API");
      expect(memory.notes).toContain("Need auth");
    });

    it("should return updated=false when no memory tags present", () => {
      const text = "Just a regular response with no memory tags.";
      const { updated, cleanText } = extractMemoryUpdates(TEST_AGENT_ID, text);

      expect(updated).toBe(false);
      expect(cleanText).toBe(text);
    });
  });
});
