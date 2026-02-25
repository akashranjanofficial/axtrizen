/**
 * Agent Memory Service — Persistent memory for agents across conversations
 *
 * Each agent maintains 3 memory files (like Manus AI):
 * - task_plan: Current work roadmap and assignments
 * - notes: Research findings, external knowledge, decisions made
 * - context: Project context, tech stack, team structure
 *
 * Memory is stored in localStorage with per-agent keys.
 * This enables agents to maintain state across conversation sessions.
 */

// ── Types ──

export interface AgentMemory {
  taskPlan: string; // Current work roadmap
  notes: string; // Research findings, decisions
  context: string; // Project context, team info
  lastUpdated: number;
}

const STORAGE_PREFIX = "axtrizen:agent-memory:";

// ── Core API ──

/**
 * Load an agent's persistent memory from storage.
 */
export function loadAgentMemory(agentId: string): AgentMemory {
  try {
    const key = `${STORAGE_PREFIX}${agentId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.warn(`Failed to load memory for agent ${agentId}:`, err);
  }

  return {
    taskPlan: "",
    notes: "",
    context: "",
    lastUpdated: 0,
  };
}

/**
 * Save an agent's memory to persistent storage.
 */
export function saveAgentMemory(agentId: string, memory: AgentMemory): void {
  try {
    const key = `${STORAGE_PREFIX}${agentId}`;
    const updated: AgentMemory = {
      ...memory,
      lastUpdated: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (err) {
    console.warn(`Failed to save memory for agent ${agentId}:`, err);
  }
}

/**
 * Update a specific memory section for an agent.
 */
export function updateAgentMemorySection(
  agentId: string,
  section: "taskPlan" | "notes" | "context",
  content: string,
): void {
  const memory = loadAgentMemory(agentId);
  memory[section] = content;
  saveAgentMemory(agentId, memory);
}

/**
 * Append to a memory section (useful for accumulating notes).
 */
export function appendToMemory(
  agentId: string,
  section: "taskPlan" | "notes" | "context",
  content: string,
): void {
  const memory = loadAgentMemory(agentId);
  const separator = memory[section] ? "\n\n---\n\n" : "";
  memory[section] = `${memory[section]}${separator}${content}`;
  saveAgentMemory(agentId, memory);
}

/**
 * Clear all memory for an agent.
 */
export function clearAgentMemory(agentId: string): void {
  try {
    const key = `${STORAGE_PREFIX}${agentId}`;
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`Failed to clear memory for agent ${agentId}:`, err);
  }
}

/**
 * List all agents that have saved memory.
 */
export function listAgentsWithMemory(): string[] {
  const agentIds: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        agentIds.push(key.slice(STORAGE_PREFIX.length));
      }
    }
  } catch {
    // localStorage may not be available
  }
  return agentIds;
}

// ── Memory Context Formatting ──

/**
 * Format agent memory into a context string for inclusion in prompts.
 * Only includes non-empty sections.
 */
export function formatMemoryContext(memory: AgentMemory): string {
  const sections: string[] = [];

  if (memory.taskPlan.trim()) {
    sections.push(`## Your Current Task Plan\n${memory.taskPlan}`);
  }

  if (memory.notes.trim()) {
    sections.push(`## Your Notes & Decisions\n${memory.notes}`);
  }

  if (memory.context.trim()) {
    sections.push(`## Project Context\n${memory.context}`);
  }

  if (sections.length === 0) {
    return "";
  }

  return `\n\n---\n**Your Persistent Memory:**\n\n${sections.join("\n\n")}\n---\n`;
}

/**
 * Extract and update agent memory from a conversation response.
 * Parses the response for structured memory updates.
 *
 * Agents can update their memory by including sections like:
 * [TASK_PLAN] ... [/TASK_PLAN]
 * [NOTES] ... [/NOTES]
 * [CONTEXT] ... [/CONTEXT]
 */
export function extractMemoryUpdates(
  agentId: string,
  responseText: string,
): { updated: boolean; cleanText: string } {
  let updated = false;
  let cleanText = responseText;

  // Extract and save task plan updates
  const taskPlanMatch = responseText.match(/\[TASK_PLAN\]([\s\S]*?)\[\/TASK_PLAN\]/i);
  if (taskPlanMatch) {
    updateAgentMemorySection(agentId, "taskPlan", taskPlanMatch[1].trim());
    cleanText = cleanText.replace(taskPlanMatch[0], "").trim();
    updated = true;
  }

  // Extract and save notes updates
  const notesMatch = responseText.match(/\[NOTES\]([\s\S]*?)\[\/NOTES\]/i);
  if (notesMatch) {
    appendToMemory(agentId, "notes", notesMatch[1].trim());
    cleanText = cleanText.replace(notesMatch[0], "").trim();
    updated = true;
  }

  // Extract and save context updates
  const contextMatch = responseText.match(/\[CONTEXT\]([\s\S]*?)\[\/CONTEXT\]/i);
  if (contextMatch) {
    updateAgentMemorySection(agentId, "context", contextMatch[1].trim());
    cleanText = cleanText.replace(contextMatch[0], "").trim();
    updated = true;
  }

  return { updated, cleanText };
}
