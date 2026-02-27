/**
 * PlanningEngine — Manager agent auto-generates structured project plans.
 *
 * When user says "Build me X", this engine:
 * 1. Sends a structured prompt to the Manager agent
 * 2. Parses the JSON response into ProjectPlan
 * 3. Persists epics → stories → tasks → sprints to the DB
 *
 * The result populates the ProjectBoard in real-time.
 */

import type { GatewayAdapter } from "./gateway-adapter";
import type { AgentInfo } from "./orchestration-engine";
import { createEpic, createStory, createTask, createSprint } from "../tauri-api";

// ── Types ──────────────────────────────────────────────────────────────

export interface PlanTask {
  title: string;
  description: string;
  estimatedMinutes: number;
  suggestedAgent?: string;
  dependencies?: string[];
}

export interface PlanStory {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  storyPoints: number;
  tasks: PlanTask[];
}

export interface PlanEpic {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  stories: PlanStory[];
}

export interface PlanSprint {
  name: string;
  goal: string;
  storyTitles: string[];
}

export interface ProjectPlan {
  title: string;
  description: string;
  epics: PlanEpic[];
  techStack: string[];
  sprints: PlanSprint[];
}

// ── Priority Map ──────────────────────────────────────────────────────

const PRIORITY_MAP: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// ── Prompt Builder ───────────────────────────────────────────────────

function buildPlanningPrompt(userMessage: string, agents: AgentInfo[]): string {
  const agentList = agents.map((a) => `- **${a.name}** (role: ${a.role || "general"})`).join("\n");

  return [
    `## 📋 Project Planning Request`,
    ``,
    `The user wants to build something. Generate a COMPLETE implementation plan as JSON.`,
    ``,
    `### User's Request:`,
    `"${userMessage}"`,
    ``,
    `### Available Agents:`,
    agentList || "- No specific agents configured",
    ``,
    `### Output Format:`,
    `Return ONLY valid JSON matching this structure (no markdown, no explanation):`,
    ``,
    `\`\`\`json`,
    `{`,
    `  "title": "Project Title",`,
    `  "description": "Brief project description",`,
    `  "epics": [`,
    `    {`,
    `      "title": "Epic Name",`,
    `      "description": "What this epic covers",`,
    `      "priority": "high",`,
    `      "stories": [`,
    `        {`,
    `          "title": "User Story Title",`,
    `          "description": "As a user, I want to...",`,
    `          "acceptanceCriteria": ["Criteria 1", "Criteria 2"],`,
    `          "storyPoints": 3,`,
    `          "tasks": [`,
    `            {`,
    `              "title": "Task name",`,
    `              "description": "What to do",`,
    `              "estimatedMinutes": 15,`,
    `              "suggestedAgent": "frontend"`,
    `            }`,
    `          ]`,
    `        }`,
    `      ]`,
    `    }`,
    `  ],`,
    `  "techStack": ["React", "Node.js"],`,
    `  "sprints": [`,
    `    {`,
    `      "name": "Sprint 1: Core MVP",`,
    `      "goal": "Basic functionality",`,
    `      "storyTitles": ["User Story Title"]`,
    `    }`,
    `  ]`,
    `}`,
    `\`\`\``,
    ``,
    `### Rules:`,
    `- Break into 2-5 epics`,
    `- Each epic has 2-5 stories`,
    `- Each story has 1-5 tasks`,
    `- Priority: "low" | "medium" | "high" | "critical"`,
    `- Be specific — task titles should be actionable`,
    `- Include testing tasks`,
    `- Return ONLY JSON, no other text`,
  ].join("\n");
}

// ── JSON Parser ─────────────────────────────────────────────────────

function extractJson(text: string): string {
  // Try to extract JSON from code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return text;
}

export function parsePlan(rawText: string): ProjectPlan {
  const jsonStr = extractJson(rawText);
  const parsed = JSON.parse(jsonStr);

  // Validate basic structure
  if (!parsed.title || !Array.isArray(parsed.epics)) {
    throw new Error("Invalid plan: missing title or epics");
  }

  return {
    title: parsed.title,
    description: parsed.description || "",
    epics: (parsed.epics || []).map((e: PlanEpic) => ({
      title: e.title,
      description: e.description || "",
      priority: e.priority || "medium",
      stories: (e.stories || []).map((s: PlanStory) => ({
        title: s.title,
        description: s.description || "",
        acceptanceCriteria: s.acceptanceCriteria || [],
        storyPoints: s.storyPoints || 1,
        tasks: (s.tasks || []).map((t: PlanTask) => ({
          title: t.title,
          description: t.description || "",
          estimatedMinutes: t.estimatedMinutes || 10,
          suggestedAgent: t.suggestedAgent,
          dependencies: t.dependencies || [],
        })),
      })),
    })),
    techStack: parsed.techStack || [],
    sprints: (parsed.sprints || []).map((sp: PlanSprint) => ({
      name: sp.name,
      goal: sp.goal || "",
      storyTitles: sp.storyTitles || [],
    })),
  };
}

// ── Plan Persistence ────────────────────────────────────────────────

/**
 * Persist a parsed plan into the DB as epics → stories → tasks → sprints.
 * Returns counts of created items.
 */
export async function persistPlan(
  projectId: string,
  plan: ProjectPlan,
  agents: AgentInfo[],
): Promise<{ epics: number; stories: number; tasks: number; sprints: number }> {
  let epicCount = 0;
  let storyCount = 0;
  let taskCount = 0;
  let sprintCount = 0;

  // 1. Create sprints first (we need IDs)
  const sprintMap = new Map<string, string>(); // storyTitle → sprintId
  for (const sp of plan.sprints) {
    const sprint = await createSprint(projectId, sp.name, sp.goal);
    sprintCount++;
    for (const storyTitle of sp.storyTitles) {
      sprintMap.set(storyTitle.toLowerCase(), sprint.id);
    }
  }

  // 2. Create epics → stories → tasks
  for (let ei = 0; ei < plan.epics.length; ei++) {
    const planEpic = plan.epics[ei];
    const epic = await createEpic(
      projectId,
      planEpic.title,
      planEpic.description,
      PRIORITY_MAP[planEpic.priority] ?? 1,
      ei,
    );
    epicCount++;

    for (let si = 0; si < planEpic.stories.length; si++) {
      const planStory = planEpic.stories[si];
      const sprintId = sprintMap.get(planStory.title.toLowerCase()) || null;

      const story = await createStory(
        epic.id,
        projectId,
        planStory.title,
        planStory.description,
        planStory.acceptanceCriteria.length > 0
          ? JSON.stringify(planStory.acceptanceCriteria)
          : null,
        planStory.storyPoints,
        null, // assigned_agent_id
        sprintId,
        si,
      );
      storyCount++;

      for (let ti = 0; ti < planStory.tasks.length; ti++) {
        const planTask = planStory.tasks[ti];

        // Try to match suggested agent
        let agentId: string | null = null;
        if (planTask.suggestedAgent) {
          const matched = agents.find(
            (a) =>
              a.role?.toLowerCase().includes(planTask.suggestedAgent!.toLowerCase()) ||
              (a.name || "").toLowerCase().includes(planTask.suggestedAgent!.toLowerCase()),
          );
          if (matched) agentId = matched.id;
        }

        const deps =
          planTask.dependencies && planTask.dependencies.length > 0
            ? JSON.stringify(planTask.dependencies)
            : null;

        await createTask(
          story.id,
          epic.id,
          projectId,
          planTask.title,
          planTask.description,
          agentId,
          planTask.estimatedMinutes,
          deps,
          ti,
        );
        taskCount++;
      }
    }
  }

  return { epics: epicCount, stories: storyCount, tasks: taskCount, sprints: sprintCount };
}

// ── Main API ────────────────────────────────────────────────────────

export interface PlanGenerationResult {
  plan: ProjectPlan;
  counts: { epics: number; stories: number; tasks: number; sprints: number };
  rawResponse: string;
}

/**
 * Generate a project plan from a user message.
 *
 * Sends a structured prompt to the manager agent, parses the JSON response,
 * and persists everything to the database.
 */
export async function generateProjectPlan(
  projectId: string,
  userMessage: string,
  managerAgent: AgentInfo,
  allAgents: AgentInfo[],
  gateway: GatewayAdapter,
): Promise<PlanGenerationResult> {
  const prompt = buildPlanningPrompt(userMessage, allAgents);

  // Send to manager
  const response = await gateway.sendMessage(prompt, managerAgent.id, `planning-${projectId}`);
  const rawText =
    typeof response === "string"
      ? response
      : (response as { text?: string }).text || JSON.stringify(response);

  // Parse the plan
  const plan = parsePlan(rawText);

  // Persist to DB
  const counts = await persistPlan(projectId, plan, allAgents);

  console.log(
    `[PlanningEngine] Generated plan: ${counts.epics} epics, ${counts.stories} stories, ${counts.tasks} tasks, ${counts.sprints} sprints`,
  );

  return { plan, counts, rawResponse: rawText };
}
