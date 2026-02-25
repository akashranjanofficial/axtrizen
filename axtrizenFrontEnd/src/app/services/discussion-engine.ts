/**
 * Discussion Engine — Enterprise Multi-Agent Conversation Manager
 *
 * Provides:
 * 1. Smart Speaker Selection — picks who speaks next based on context
 * 2. Convergence Detection — detects agreement to stop early
 * 3. Hierarchical Delegation — manager delegates tasks, workers report back
 */

// ── Types ──

export interface DiscussionAgent {
  id: string;
  name: string;
  role?: string; // 'manager' | 'frontend' | 'backend' | 'reviewer' | etc.
}

export interface AgentResponse {
  agentId: string;
  name: string;
  text: string;
  timestamp: number;
}

export interface DelegationTask {
  taskDescription: string;
  assignedTo: DiscussionAgent;
  assignedBy: DiscussionAgent;
  status: "pending" | "in_progress" | "completed" | "revision_requested";
  output?: string;
  reviewFeedback?: string;
}

export interface DiscussionState {
  topic: string;
  agents: DiscussionAgent[];
  responses: AgentResponse[];
  delegations: DelegationTask[];
  converged: boolean;
  convergenceReason?: string;
  round: number;
  maxRounds: number;
}

// ── 1. Smart Speaker Selection ──

/**
 * Analyze conversation context and determine which agent should speak next.
 * Uses keyword matching, @mention detection, and role relevance scoring.
 *
 * Algorithm:
 * - Score each agent based on topic relevance (keywords → role mapping)
 * - Boost agents who were @mentioned in recent messages
 * - Penalize agents who already spoke recently (avoid monopolizing)
 * - Skip agents who signaled convergence
 */

// Keywords that map to agent roles
const ROLE_KEYWORDS: Record<string, string[]> = {
  frontend: [
    "ui",
    "ux",
    "css",
    "html",
    "react",
    "component",
    "page",
    "layout",
    "design",
    "style",
    "animation",
    "responsive",
    "button",
    "form",
    "modal",
    "sidebar",
    "navbar",
    "frontend",
    "front-end",
    "client",
    "browser",
    "dom",
    "tailwind",
    "interface",
    "visual",
    "display",
  ],
  backend: [
    "api",
    "database",
    "server",
    "endpoint",
    "rest",
    "graphql",
    "sql",
    "migration",
    "schema",
    "model",
    "controller",
    "route",
    "auth",
    "authentication",
    "token",
    "jwt",
    "middleware",
    "backend",
    "back-end",
    "node",
    "express",
    "rust",
    "python",
    "deploy",
    "docker",
    "cicd",
    "performance",
    "cache",
    "redis",
    "queue",
  ],
  manager: [
    "plan",
    "roadmap",
    "milestone",
    "sprint",
    "priority",
    "timeline",
    "deadline",
    "requirement",
    "scope",
    "architecture",
    "decision",
    "review",
    "approve",
    "assign",
    "delegate",
    "strategy",
    "budget",
    "team",
    "coordinate",
    "integrate",
    "overall",
    "summary",
    "final",
  ],
  reviewer: [
    "review",
    "test",
    "quality",
    "bug",
    "issue",
    "fix",
    "refactor",
    "code review",
    "lint",
    "coverage",
    "security",
    "vulnerability",
    "performance",
    "optimize",
    "best practice",
  ],
  devops: [
    "deploy",
    "ci",
    "cd",
    "pipeline",
    "docker",
    "kubernetes",
    "aws",
    "cloud",
    "infrastructure",
    "monitoring",
    "logs",
    "scaling",
  ],
};

export function selectNextSpeaker(
  agents: DiscussionAgent[],
  responses: AgentResponse[],
  topic: string,
  convergedAgentIds: Set<string> = new Set(),
): DiscussionAgent | null {
  if (agents.length === 0) {
    return null;
  }

  const scores = new Map<string, number>();

  // Initialize scores
  for (const agent of agents) {
    scores.set(agent.id, 0);
  }

  // 1. Topic relevance scoring
  const topicLower = topic.toLowerCase();
  const lastResponseText =
    responses.length > 0 ? responses[responses.length - 1].text.toLowerCase() : "";
  const combinedContext = `${topicLower} ${lastResponseText}`;

  for (const agent of agents) {
    const role = (agent.role || agent.name || "").toLowerCase();
    let relevanceScore = 0;

    // Check all role keyword mappings
    for (const [roleKey, keywords] of Object.entries(ROLE_KEYWORDS)) {
      if (role.includes(roleKey)) {
        // This agent's role matches a keyword group
        for (const keyword of keywords) {
          if (combinedContext.includes(keyword)) {
            relevanceScore += 2;
          }
        }
      }
    }

    // Fallback: check if agent's name/role is mentioned in context
    if (combinedContext.includes(role)) {
      relevanceScore += 5;
    }

    scores.set(agent.id, (scores.get(agent.id) || 0) + relevanceScore);
  }

  // 2. @mention boost — if last response mentioned an agent, boost them
  if (responses.length > 0) {
    const lastText = responses[responses.length - 1].text.toLowerCase();
    for (const agent of agents) {
      const name = (agent.name || agent.id).toLowerCase();
      if (lastText.includes(`@${name}`)) {
        scores.set(agent.id, (scores.get(agent.id) || 0) + 10);
      }
    }
  }

  // 3. Recency penalty — reduce score for agents who spoke recently
  const recentSpeakers = responses.slice(-3).map((r) => r.agentId);
  for (let i = 0; i < recentSpeakers.length; i++) {
    const penalty = (3 - i) * 3; // Most recent gets higher penalty
    const current = scores.get(recentSpeakers[i]) || 0;
    scores.set(recentSpeakers[i], current - penalty);
  }

  // 4. Skip converged agents
  for (const agentId of convergedAgentIds) {
    scores.set(agentId, -999);
  }

  // 5. Manager bonus for first turn (orchestrator should start discussions)
  if (responses.length === 0) {
    for (const agent of agents) {
      const role = (agent.role || agent.name || "").toLowerCase();
      if (role.includes("manager") || role.includes("lead") || role.includes("architect")) {
        scores.set(agent.id, (scores.get(agent.id) || 0) + 15);
      }
    }
  }

  // Find highest scoring agent
  let bestAgent: DiscussionAgent | null = null;
  let bestScore = -Infinity;

  for (const agent of agents) {
    const score = scores.get(agent.id) || 0;
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  return bestAgent;
}

/**
 * Get the smart speaker order for all agents based on context.
 * Returns agents sorted by relevance to the discussion topic.
 */
export function getSmartSpeakerOrder(agents: DiscussionAgent[], topic: string): DiscussionAgent[] {
  const remaining = [...agents];
  const order: DiscussionAgent[] = [];
  const responses: AgentResponse[] = [];

  while (remaining.length > 0) {
    const next = selectNextSpeaker(remaining, responses, topic);
    if (!next) {
      break;
    }
    order.push(next);
    remaining.splice(remaining.indexOf(next), 1);
    // Simulate a response to update scoring for next pick
    responses.push({ agentId: next.id, name: next.name, text: "", timestamp: Date.now() });
  }

  return order;
}

// ── 2. Convergence Detection ──

const AGREEMENT_SIGNALS = [
  "i agree",
  "agreed",
  "lgtm",
  "looks good",
  "sounds good",
  "no objections",
  "i'm on board",
  "i concur",
  "nothing to add",
  "fully aligned",
  "that works for me",
  "approved",
  "ship it",
  "let's go with that",
  "perfect plan",
  "well summarized",
  "great plan",
  "no further input",
  "all good",
  "makes sense to me",
  "+1",
  "thumbs up",
  "i support this",
  "no changes needed",
  "ready to proceed",
];

const DISAGREEMENT_SIGNALS = [
  "i disagree",
  "but wait",
  "however",
  "i think we should",
  "alternative approach",
  "what about",
  "concern",
  "issue with",
  "problem with",
  "not sure about",
  "reconsider",
  "instead",
  "on the other hand",
  "i'd rather",
  "needs revision",
  "rejected",
  "not approved",
];

export interface ConvergenceResult {
  converged: boolean;
  reason: string;
  confidence: number; // 0-1
  agentAgreements: Map<string, boolean>; // agentId → agreed or not
}

/**
 * Analyze agent responses to detect if discussion has converged.
 * Returns convergence status with confidence score.
 */
export function detectConvergence(
  responses: AgentResponse[],
  totalAgents: number,
): ConvergenceResult {
  const agentAgreements = new Map<string, boolean>();

  if (responses.length < 2) {
    return {
      converged: false,
      reason: "Not enough responses to detect convergence",
      confidence: 0,
      agentAgreements,
    };
  }

  // Analyze each response for agreement/disagreement signals
  let agreementCount = 0;
  let disagreementCount = 0;

  // Only check recent responses (last round)
  const recentResponses = responses.slice(-totalAgents);

  for (const response of recentResponses) {
    const lower = response.text.toLowerCase();

    let hasAgreement = false;
    let hasDisagreement = false;

    for (const signal of AGREEMENT_SIGNALS) {
      if (lower.includes(signal)) {
        hasAgreement = true;
        break;
      }
    }

    for (const signal of DISAGREEMENT_SIGNALS) {
      if (lower.includes(signal)) {
        hasDisagreement = true;
        break;
      }
    }

    // Disagreement overrides agreement
    if (hasDisagreement) {
      agentAgreements.set(response.agentId, false);
      disagreementCount++;
    } else if (hasAgreement) {
      agentAgreements.set(response.agentId, true);
      agreementCount++;
    }
  }

  // Calculate convergence
  const respondedAgents = recentResponses.length;
  const agreementRatio = respondedAgents > 0 ? agreementCount / respondedAgents : 0;

  // Convergence thresholds
  if (disagreementCount === 0 && agreementRatio >= 0.6) {
    return {
      converged: true,
      reason: `${agreementCount}/${respondedAgents} agents agreed — consensus reached`,
      confidence: agreementRatio,
      agentAgreements,
    };
  }

  if (disagreementCount > 0 && agreementRatio > 0.8) {
    return {
      converged: true,
      reason: `Strong majority agreed (${agreementCount}/${respondedAgents}), minor objections noted`,
      confidence: agreementRatio * 0.8,
      agentAgreements,
    };
  }

  return {
    converged: false,
    reason:
      disagreementCount > 0
        ? `Active disagreement from ${disagreementCount} agent(s)`
        : "Discussion still in progress",
    confidence: agreementRatio,
    agentAgreements,
  };
}

/**
 * Check if a single response signals that the agent has nothing more to add.
 */
export function isAgentDone(responseText: string): boolean {
  const lower = responseText.toLowerCase();
  return AGREEMENT_SIGNALS.some((signal) => lower.includes(signal));
}

// ── 3. Hierarchical Delegation ──

/**
 * Parse delegation commands from manager's response.
 * Looks for patterns like "@Frontend build the upload component"
 */
export function parseDelegations(
  managerResponse: string,
  agents: DiscussionAgent[],
  managerId: string,
): DelegationTask[] {
  const delegations: DelegationTask[] = [];
  const manager = agents.find((a) => a.id === managerId);
  if (!manager) {
    return delegations;
  }

  // Match patterns: "@AgentName: task description" or "@AgentName task description"
  const lines = managerResponse.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Match @mentions followed by action verbs or task descriptions
    const mentionMatch = trimmed.match(/@(\w+)[\s:,]+(.+)/i);

    if (mentionMatch) {
      const mentionedName = mentionMatch[1].toLowerCase();
      const taskDesc = mentionMatch[2].trim();

      // Find the matching agent
      const targetAgent = agents.find((a) => {
        const name = (a.name || a.id).toLowerCase();
        return name === mentionedName || name.includes(mentionedName);
      });

      if (targetAgent && targetAgent.id !== managerId && taskDesc.length > 5) {
        delegations.push({
          taskDescription: taskDesc,
          assignedTo: targetAgent,
          assignedBy: manager,
          status: "pending",
        });
      }
    }
  }

  return delegations;
}

/**
 * Determine if a response contains a review verdict (approve/reject).
 */
export function parseReviewVerdict(reviewText: string): { approved: boolean; feedback: string } {
  const lower = reviewText.toLowerCase();

  const approvalSignals = [
    "approved",
    "lgtm",
    "looks good",
    "ship it",
    "well done",
    "accepted",
    "ready to merge",
    "no issues found",
  ];

  const rejectionSignals = [
    "rejected",
    "needs revision",
    "not approved",
    "please fix",
    "issues found",
    "revise",
    "rework",
    "try again",
  ];

  const isApproved = approvalSignals.some((s) => lower.includes(s));
  const isRejected = rejectionSignals.some((s) => lower.includes(s));

  return {
    approved: isApproved && !isRejected,
    feedback: reviewText,
  };
}

// ── 4. Prompt Builders ──

/**
 * Build the speaker selection prompt for smart ordering.
 */
export function buildSpeakerSelectionContext(
  topic: string,
  agents: DiscussionAgent[],
  responses: AgentResponse[],
): string {
  const agentList = agents.map((a) => `- @${a.name} (${a.role || "general"})`).join("\n");
  const transcript =
    responses.length > 0
      ? responses.map((r) => `@${r.name}: ${r.text.slice(0, 200)}`).join("\n\n")
      : "(No responses yet)";

  return `Topic: ${topic}\n\nTeam:\n${agentList}\n\nDiscussion so far:\n${transcript}`;
}

/**
 * Build a delegation prompt for the manager.
 */
export function buildDelegationPrompt(topic: string, agents: DiscussionAgent[]): string {
  const agentList = agents
    .filter((a) => !(a.role || a.name || "").toLowerCase().includes("manager"))
    .map((a) => `- @${a.name} (${a.role || "general"})`)
    .join("\n");

  return `As the team manager, break down this task and delegate specific work items to team members. Use @mentions to assign tasks.\n\nTask: ${topic}\n\nAvailable team members:\n${agentList}\n\nFor each team member, write: @Name: [specific task description]\nThen provide the overall coordination plan.`;
}

/**
 * Build a worker report prompt.
 */
export function buildWorkerReportPrompt(delegation: DelegationTask, context: string): string {
  return `You were assigned this task by @${delegation.assignedBy.name}:\n\n"${delegation.taskDescription}"\n\nProject context:\n${context}\n\nComplete this task and report your results. When done, mention @${delegation.assignedBy.name} to notify them for review.`;
}

/**
 * Build a manager review prompt.
 */
export function buildManagerReviewPrompt(delegation: DelegationTask, workerOutput: string): string {
  return `@${delegation.assignedTo.name} has completed their task and submitted for review.\n\nOriginal task: "${delegation.taskDescription}"\n\nTheir output:\n${workerOutput}\n\nReview their work. If it meets requirements, respond with "APPROVED" and brief feedback. If revisions are needed, respond with "NEEDS REVISION" and specific feedback for @${delegation.assignedTo.name}.`;
}
