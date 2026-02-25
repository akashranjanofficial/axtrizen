/**
 * Orchestration Engine — Production-grade multi-agent conversation orchestrator.
 *
 * Replaces the 400-line hardcoded loop in ChatWindow.tsx with a clean,
 * strategy-based engine that yields events as an AsyncGenerator.
 *
 * Key design:
 * - AsyncGenerator: yields events as they happen → UI just renders
 * - Pluggable strategies: RoundRobin, MapReduce, Debate, Pipeline, AutoRoute
 * - Intent classifier: auto-selects strategy from the user's message
 * - Retry with backoff: resilient to WS drops mid-conversation
 * - Parallel execution: MapReduce runs agents concurrently
 */

import type { GatewayAdapter, AgentResponse } from "./gateway-adapter";
import { buildSessionKey } from "./gateway-adapter";
import {
  getSmartSpeakerOrder,
  parseDelegations,
  buildWorkerReportPrompt,
  buildManagerReviewPrompt,
  parseReviewVerdict,
  type DiscussionAgent,
} from "./discussion-engine";
import { loadAgentMemory, formatMemoryContext, extractMemoryUpdates } from "./agent-memory";

// ── Types ──────────────────────────────────────────────────────────────

export interface AgentInfo {
  id: string;
  name?: string;
  role?: string;
}

export interface OrchestrationContext {
  message: string;
  agents: AgentInfo[];
  gateway: GatewayAdapter;
  teamId?: string;
  mentionedAgentIds: string[];
}

/** Events yielded by the engine — the UI renders these. */
export type OrchestrationEvent =
  | { type: "agent_thinking"; agentId: string; agentName: string; position?: string }
  | { type: "agent_response"; agentId: string; agentName: string; text: string }
  | { type: "agent_error"; agentId: string; agentName: string; error: string }
  | { type: "summary_thinking"; agentName: string }
  | { type: "summary"; agentName: string; text: string }
  | { type: "delegation_start"; agentName: string; task: string }
  | { type: "delegation_result"; agentName: string; text: string }
  | { type: "review_thinking"; reviewerName: string; workerName: string }
  | { type: "review_result"; reviewerName: string; approved: boolean; text: string }
  | { type: "revision"; agentName: string; round: number; text: string }
  | { type: "round_start"; round: number; maxRounds: number }
  | { type: "pivot_gate_thinking"; agentName: string; round: number }
  | { type: "pivot_gate_verdict"; agentName: string; verdict: PivotVerdict; text: string }
  | { type: "complete"; strategy: string };

/** Pivot Gate verdict types — inspired by War Room Wave Protocol */
export type PivotVerdictType = "CONVERGED" | "CONTINUE" | "ASSIGN";

export interface PivotVerdict {
  type: PivotVerdictType;
  summary?: string;
  assignments?: Array<{ agentName: string; task: string }>;
}

export type Intent = "question" | "build" | "decide" | "pipeline" | "route";

// ── Intent Classifier ──────────────────────────────────────────────────

const BUILD_PATTERNS =
  /\b(build|create|implement|write|develop|make|add|code|design|set up|setup)\b/i;
const DECIDE_PATTERNS =
  /\b(should we|which is better|compare|versus|\bvs\b|or should|decide|choose|pick|prefer|trade-?off)\b/i;
const PIPELINE_PATTERNS =
  /\b(then|after that|step by step|first.*then|and then review|write.*then.*review|review.*fix)\b/i;
const COLLABORATIVE_PATTERNS =
  /\b(discuss|team|everyone|all of you|brainstorm|collaborate|together|as a team|with the team|with team|round.?table|group discussion|let'?s talk)\b/i;

export function classifyIntent(message: string, mentionedAgentIds: string[]): Intent {
  // Collaborative language overrides ALL other patterns.
  // "discuss with team how we can develop X" → RoundRobin, NOT MapReduce
  const isCollaborative = COLLABORATIVE_PATTERNS.test(message);

  // Single @mention WITHOUT collaborative intent → direct route
  if (mentionedAgentIds.length === 1 && !isCollaborative) return "route";

  // Collaborative language → always RoundRobin discussion
  // This takes priority over build/decide/pipeline because the user
  // explicitly asked for a discussion, not parallel execution.
  if (isCollaborative) return "question";

  // Decision/comparison language → Debate
  if (DECIDE_PATTERNS.test(message)) return "decide";

  // Sequential/step-by-step → Pipeline (check BEFORE build since
  // "write code then review" should be pipeline, not parallel build)
  if (PIPELINE_PATTERNS.test(message)) return "pipeline";

  // Build/create language → MapReduce (parallel)
  if (BUILD_PATTERNS.test(message)) return "build";

  // Default → RoundRobin discussion
  return "question";
}

// ── Helpers ─────────────────────────────────────────────────────────────

function agentName(agent: AgentInfo): string {
  return agent.name || agent.id;
}

function sessionKey(agentId: string, teamId?: string): string {
  return teamId
    ? buildSessionKey(agentId, { type: "team", teamId })
    : buildSessionKey(agentId, { type: "dm" });
}

/** Extract response text from agent response, handling both adapter formats */
function extractText(response: AgentResponse): string {
  const payloads = response.payloads ?? [];
  return (
    payloads
      .map((p) => p.text)
      .filter(Boolean)
      .join("\n") ||
    response.summary ||
    "No reply from agent."
  );
}

/** Send a message with retry (1 retry with 2s delay) */
async function sendWithRetry(
  gw: GatewayAdapter,
  message: string,
  agentId: string,
  key: string,
): Promise<AgentResponse> {
  try {
    return await gw.sendMessage(message, agentId, key);
  } catch {
    // Wait 2s and retry once
    await new Promise((r) => setTimeout(r, 2000));
    return await gw.sendMessage(message, agentId, key);
  }
}

/** Inject memory context into a prompt */
function withMemory(agentId: string, prompt: string): string {
  const memory = loadAgentMemory(agentId);
  const ctx = formatMemoryContext(memory);
  return ctx ? `${prompt}\n${ctx}` : prompt;
}

/** Extract and clean memory updates from response text */
function processMemory(agentId: string, text: string): string {
  const result = extractMemoryUpdates(agentId, text);
  return result.updated ? result.cleanText : text;
}

// ── System Prompt Builders (inspired by War Room + cc-godmode) ───────────

const MAX_PIVOT_ROUNDS = 3;

function buildManagerRoundPrompt(round: number, maxRounds: number): string {
  if (round === 1) {
    return [
      "## Your Role: Team Manager (Round 1)",
      "You are leading a team discussion. Share your high-level vision and direction.",
      "",
      "### Guidelines:",
      "- Give your strategic perspective on the topic",
      "- DO NOT assign follow-up tasks or @mention teammates — the orchestration engine handles turn-taking",
      "- Your teammates will speak after you, building on your direction",
      `- There may be up to ${maxRounds} discussion rounds`,
    ].join("\n");
  }
  return [
    `## Your Role: Team Manager (Round ${round}/${maxRounds})`,
    "The team has gone through another round of discussion.",
    "Build on the new input. Refine your position if needed.",
    "",
    "### Guidelines:",
    "- Acknowledge new points from teammates",
    "- Refine or adjust your direction based on their input",
    "- DO NOT assign tasks or @mention teammates",
  ].join("\n");
}

function buildWorkerRoundPrompt(agentRole: string, round: number): string {
  return [
    `## Team Discussion — Round ${round}`,
    `Your role: ${agentRole}`,
    "",
    "### Guidelines:",
    "- Focus on YOUR area of expertise",
    "- Build on what teammates have said",
    "- Be specific and actionable",
    "- If you disagree, state your reasoning clearly",
    "- DO NOT try to manage or orchestrate the team",
  ].join("\n");
}

function buildPivotGatePrompt(
  round: number,
  maxRounds: number,
  transcript: string,
  agentNames: string[],
): string {
  const isFinalRound = round >= maxRounds;
  const verdictOptions = isFinalRound
    ? [
        "This is the **final round**. You MUST choose CONVERGED.",
        "",
        "**VERDICT: CONVERGED**",
        "Provide a comprehensive final summary of the discussion outcomes.",
      ].join("\n")
    : [
        "Choose ONE of these verdicts:",
        "",
        "1. **VERDICT: CONVERGED** — Discussion is complete. Provide a clear summary of outcomes.",
        "2. **VERDICT: CONTINUE** — More discussion needed. State what still needs resolution.",
        `3. **VERDICT: ASSIGN** — Specific agents need follow-up tasks. List as:`,
        ...agentNames.map((n) => `   - @${n}: [task description]`),
        "",
        `Remaining rounds: ${maxRounds - round}`,
      ].join("\n");

  return [
    `## 🔄 Pivot Gate — Round ${round}/${maxRounds} Review`,
    "",
    "You have heard from all team members. Here is the full discussion:",
    "",
    "---",
    transcript,
    "---",
    "",
    verdictOptions,
    "",
    'Start your response with your verdict line (e.g., "VERDICT: CONVERGED"), then your explanation.',
  ].join("\n");
}

// ── Pivot Gate Verdict Parser ────────────────────────────────────────────

export function parsePivotGateVerdict(text: string): PivotVerdict {
  const upper = text.toUpperCase();

  // Parse VERDICT line
  if (upper.includes("VERDICT: ASSIGN") || upper.includes("VERDICT:ASSIGN")) {
    // Parse assignments: "@AgentName: task" or "- @AgentName: task"
    const assignRegex = /@(\w+)[:\s]+(.+)/g;
    const assignments: Array<{ agentName: string; task: string }> = [];
    let match;
    // Only parse lines after the VERDICT line
    const afterVerdict = text.slice(text.toUpperCase().indexOf("ASSIGN"));
    while ((match = assignRegex.exec(afterVerdict)) !== null) {
      assignments.push({ agentName: match[1], task: match[2].trim() });
    }
    return { type: "ASSIGN", assignments, summary: text };
  }

  if (upper.includes("VERDICT: CONTINUE") || upper.includes("VERDICT:CONTINUE")) {
    return { type: "CONTINUE", summary: text };
  }

  // Default to CONVERGED (explicit or implicit — if Manager doesn't use the format, we treat it as done)
  return { type: "CONVERGED", summary: text };
}

// ── Strategies ──────────────────────────────────────────────────────────

// ──── 1. RoundRobin (with Pivot Gate multi-round protocol) ──────────────

async function* roundRobin(ctx: OrchestrationContext): AsyncGenerator<OrchestrationEvent> {
  const { message, agents, gateway, teamId } = ctx;

  // Smart speaker order
  const discussionAgents: DiscussionAgent[] = agents.map((a) => ({
    id: a.id,
    name: agentName(a),
    role: a.role || a.name || "",
  }));
  const ordered = getSmartSpeakerOrder(discussionAgents, message);
  const orderedInfos = ordered
    .map((da) => agents.find((a) => a.id === da.id))
    .filter(Boolean) as AgentInfo[];

  // Identify the manager (for Pivot Gate)
  const manager =
    orderedInfos.find((a) => a.role?.toLowerCase().includes("manager")) || orderedInfos[0];
  const managerName = agentName(manager);
  const workerNames = orderedInfos.filter((a) => a.id !== manager.id).map(agentName);

  console.log(
    `[orchestration:roundrobin] ${orderedInfos.length} agents, manager=${managerName}, max_rounds=${MAX_PIVOT_ROUNDS}`,
  );

  let fullTranscript = `**User:** ${message}`;

  // ── Multi-round loop with Pivot Gate ──
  for (let round = 1; round <= MAX_PIVOT_ROUNDS; round++) {
    yield { type: "round_start", round, maxRounds: MAX_PIVOT_ROUNDS };
    console.log(`[orchestration:roundrobin] === ROUND ${round}/${MAX_PIVOT_ROUNDS} ===`);

    const roundResponses: Array<{ name: string; text: string; agentId: string }> = [];

    // Each agent speaks in order
    for (let i = 0; i < orderedInfos.length; i++) {
      const agent = orderedInfos[i];
      const name = agentName(agent);
      yield {
        type: "agent_thinking",
        agentId: agent.id,
        agentName: name,
        position: `${i + 1}/${orderedInfos.length}`,
      };

      try {
        // Build the prompt with role-specific instructions
        const isManager = agent.id === manager.id;
        const rolePrompt = isManager
          ? buildManagerRoundPrompt(round, MAX_PIVOT_ROUNDS)
          : buildWorkerRoundPrompt(agent.role || agent.name || "team member", round);

        let prompt: string;
        if (round === 1 && roundResponses.length === 0) {
          // First speaker in first round — just the message + role prompt
          prompt = `${rolePrompt}\n\n---\n\n${message}`;
        } else {
          // Has prior context — include full transcript
          const prev =
            roundResponses.length > 0
              ? roundResponses.map((r) => `**@${r.name}** said:\n${r.text}`).join("\n\n---\n\n")
              : "";
          const contextBlock = round > 1 ? `**Previous rounds:**\n${fullTranscript}` : "";
          const currentRoundBlock = prev ? `**This round so far:**\n${prev}` : "";

          prompt = [
            rolePrompt,
            "",
            "---",
            contextBlock,
            currentRoundBlock,
            "---",
            "",
            `Now it's your turn, @${name}. Share your perspective.`,
          ]
            .filter(Boolean)
            .join("\n");
        }

        prompt = withMemory(agent.id, prompt);

        console.log(`[orchestration:roundrobin] R${round} — calling ${name}...`);
        const response = await sendWithRetry(
          gateway,
          prompt,
          agent.id,
          sessionKey(agent.id, teamId),
        );
        console.log(`[orchestration:roundrobin] R${round} — ${name} responded OK`);
        const text = processMemory(agent.id, extractText(response));

        roundResponses.push({ name, text, agentId: agent.id });

        yield { type: "agent_response", agentId: agent.id, agentName: name, text };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[orchestration:roundrobin] R${round} — ${name} FAILED:`, error);
        yield { type: "agent_error", agentId: agent.id, agentName: name, error };
      }
    }

    // Append round responses to full transcript
    for (const r of roundResponses) {
      fullTranscript += `\n\n**@${r.name}** (round ${round}): ${r.text}`;
    }

    // Skip Pivot Gate if no one responded
    if (roundResponses.length < 2) {
      console.log(
        `[orchestration:roundrobin] Only ${roundResponses.length} responses — skipping Pivot Gate`,
      );
      break;
    }

    // ── PIVOT GATE: Manager reviews all responses ──
    yield { type: "pivot_gate_thinking", agentName: managerName, round };
    console.log(
      `[orchestration:roundrobin] Pivot Gate — Manager ${managerName} reviewing round ${round}...`,
    );

    try {
      const pivotPrompt = buildPivotGatePrompt(
        round,
        MAX_PIVOT_ROUNDS,
        fullTranscript,
        workerNames,
      );
      const pivotResp = await sendWithRetry(
        gateway,
        withMemory(manager.id, pivotPrompt),
        manager.id,
        sessionKey(manager.id, teamId),
      );
      const pivotText = processMemory(manager.id, extractText(pivotResp));
      const verdict = parsePivotGateVerdict(pivotText);

      console.log(`[orchestration:roundrobin] Pivot verdict: ${verdict.type}`);
      yield { type: "pivot_gate_verdict", agentName: managerName, verdict, text: pivotText };

      if (verdict.type === "CONVERGED") {
        // Discussion complete — emit summary and finish
        yield { type: "summary", agentName: managerName, text: pivotText };
        yield { type: "complete", strategy: "round-robin" };
        return;
      }

      if (verdict.type === "ASSIGN") {
        // Manager assigned specific tasks — execute via delegation
        yield { type: "summary", agentName: managerName, text: pivotText };
        if (verdict.assignments && verdict.assignments.length > 0) {
          yield* executeAssignments(ctx, orderedInfos, verdict.assignments, fullTranscript);
        }
        yield { type: "complete", strategy: "round-robin" };
        return;
      }

      // CONTINUE → next round (loop continues)
      console.log(`[orchestration:roundrobin] Manager says CONTINUE — starting round ${round + 1}`);
    } catch (err) {
      console.error(`[orchestration:roundrobin] Pivot Gate FAILED:`, err);
      // If pivot gate fails, just finish with what we have
      break;
    }
  }

  // Fell through all rounds — emit final summary from last Manager response
  yield { type: "complete", strategy: "round-robin" };
}

// ── Execute ASSIGN Tasks (from Pivot Gate) ──────────────────────────────

async function* executeAssignments(
  ctx: OrchestrationContext,
  orderedAgents: AgentInfo[],
  assignments: Array<{ agentName: string; task: string }>,
  transcript: string,
): AsyncGenerator<OrchestrationEvent> {
  const { gateway, teamId } = ctx;

  for (const assignment of assignments) {
    // Find the agent by name (case-insensitive)
    const worker = orderedAgents.find(
      (a) => agentName(a).toLowerCase() === assignment.agentName.toLowerCase(),
    );
    if (!worker) {
      console.warn(`[orchestration:assign] Agent "${assignment.agentName}" not found, skipping`);
      continue;
    }

    const name = agentName(worker);
    yield { type: "delegation_start", agentName: name, task: assignment.task };

    try {
      const prompt = withMemory(
        worker.id,
        [
          `## Task Assignment from Manager`,
          ``,
          `**Your task:** ${assignment.task}`,
          ``,
          `**Context from team discussion:**`,
          transcript,
          ``,
          `Complete this task based on the discussion context. Be specific and actionable.`,
        ].join("\n"),
      );

      const response = await sendWithRetry(
        gateway,
        prompt,
        worker.id,
        sessionKey(worker.id, teamId),
      );
      const text = processMemory(worker.id, extractText(response));
      yield { type: "delegation_result", agentName: name, text };
    } catch (err) {
      yield {
        type: "agent_error",
        agentId: worker.id,
        agentName: name,
        error: String(err),
      };
    }
  }
}

// ──── 2. MapReduce ──────────────────────────────────────────────────────

async function* mapReduce(ctx: OrchestrationContext): AsyncGenerator<OrchestrationEvent> {
  const { message, agents, gateway, teamId } = ctx;

  // Manager = first agent (or highest-ranked by role)
  const manager = agents.find((a) => a.role?.toLowerCase().includes("manager")) || agents[0];
  const workers = agents.filter((a) => a.id !== manager.id);

  if (workers.length === 0) {
    // Fall back to single agent
    yield* autoRoute(ctx);
    return;
  }

  // Step 1: Manager decomposes the task
  yield {
    type: "agent_thinking",
    agentId: manager.id,
    agentName: agentName(manager),
    position: "planning",
  };

  const decomposePrompt = withMemory(
    manager.id,
    `Break down this task into ${workers.length} parallel subtasks, one for each team member:\n\n"${message}"\n\nTeam members: ${workers.map((w) => `@${agentName(w)}`).join(", ")}\n\nFor each, write:\n@AgentName: [task description]\n\nBe specific. Each subtask should be independently completable.`,
  );

  let decomposition: string;
  try {
    const resp = await sendWithRetry(
      gateway,
      decomposePrompt,
      manager.id,
      sessionKey(manager.id, teamId),
    );
    decomposition = processMemory(manager.id, extractText(resp));
    yield {
      type: "agent_response",
      agentId: manager.id,
      agentName: agentName(manager),
      text: decomposition,
    };
  } catch (err) {
    yield {
      type: "agent_error",
      agentId: manager.id,
      agentName: agentName(manager),
      error: String(err),
    };
    yield { type: "complete", strategy: "map-reduce" };
    return;
  }

  // Step 2: Workers execute in PARALLEL
  console.log(`[orchestration:mapreduce] Launching ${workers.length} workers in parallel`);
  for (const w of workers) {
    yield { type: "agent_thinking", agentId: w.id, agentName: agentName(w), position: "parallel" };
  }

  const workerResults = await Promise.allSettled(
    workers.map(async (worker) => {
      const workerPrompt = withMemory(
        worker.id,
        `Your manager decomposed this task:\n\n${decomposition}\n\nOriginal request: "${message}"\n\nComplete YOUR assigned subtask. Focus only on your part.`,
      );
      const resp = await sendWithRetry(
        gateway,
        workerPrompt,
        worker.id,
        sessionKey(worker.id, teamId),
      );
      return { worker, text: processMemory(worker.id, extractText(resp)) };
    }),
  );

  console.log(`[orchestration:mapreduce] All workers settled`);
  const successResults: Array<{ name: string; text: string }> = [];
  for (const result of workerResults) {
    if (result.status === "fulfilled") {
      const { worker, text } = result.value;
      successResults.push({ name: agentName(worker), text });
      yield { type: "agent_response", agentId: worker.id, agentName: agentName(worker), text };
    } else {
      // Find which worker failed
      const idx = workerResults.indexOf(result);
      const worker = workers[idx];
      yield {
        type: "agent_error",
        agentId: worker.id,
        agentName: agentName(worker),
        error: String(result.reason),
      };
      console.error(`[orchestration:mapreduce] Worker ${agentName(worker)} FAILED:`, result.reason);
    }
  }

  // Step 3: Manager merges results
  if (successResults.length > 0) {
    yield { type: "summary_thinking", agentName: agentName(manager) };

    const allResults = successResults.map((r) => `**@${r.name}**:\n${r.text}`).join("\n\n---\n\n");
    const mergePrompt = withMemory(
      manager.id,
      `Your team worked in parallel on: "${message}"\n\nHere are their results:\n\n${allResults}\n\n---\n\nMerge these into a single, coherent final deliverable. Resolve any conflicts.`,
    );

    try {
      const resp = await sendWithRetry(
        gateway,
        mergePrompt,
        manager.id,
        sessionKey(manager.id, teamId),
      );
      const summary = processMemory(manager.id, extractText(resp));
      yield { type: "summary", agentName: agentName(manager), text: summary };
    } catch (err) {
      yield {
        type: "agent_error",
        agentId: manager.id,
        agentName: agentName(manager),
        error: String(err),
      };
    }
  }

  yield { type: "complete", strategy: "map-reduce" };
}

// ──── 3. Debate ─────────────────────────────────────────────────────────

async function* debate(ctx: OrchestrationContext): AsyncGenerator<OrchestrationEvent> {
  const { message, agents, gateway, teamId } = ctx;

  if (agents.length < 2) {
    yield* autoRoute(ctx);
    return;
  }

  // Pick two debaters and a judge
  const judge = agents.find((a) => a.role?.toLowerCase().includes("manager")) || agents[0];
  const debaters = agents.filter((a) => a.id !== judge.id).slice(0, 2);

  if (debaters.length < 2) {
    // Not enough debaters, fall back to round robin
    yield* roundRobin(ctx);
    return;
  }

  const [proAgent, conAgent] = debaters;

  // Round 1: Pro argument
  yield {
    type: "agent_thinking",
    agentId: proAgent.id,
    agentName: agentName(proAgent),
    position: "arguing FOR",
  };
  try {
    const proPrompt = withMemory(
      proAgent.id,
      `The team needs to decide: "${message}"\n\nYou are arguing IN FAVOR of the first option. Make your strongest case with concrete technical reasons, examples, and trade-offs. Be persuasive but honest.`,
    );
    const proResp = await sendWithRetry(
      gateway,
      proPrompt,
      proAgent.id,
      sessionKey(proAgent.id, teamId),
    );
    const proText = processMemory(proAgent.id, extractText(proResp));
    yield {
      type: "agent_response",
      agentId: proAgent.id,
      agentName: agentName(proAgent),
      text: `🟢 **Arguing FOR:**\n\n${proText}`,
    };

    // Round 2: Con argument
    yield {
      type: "agent_thinking",
      agentId: conAgent.id,
      agentName: agentName(conAgent),
      position: "arguing AGAINST",
    };
    const conPrompt = withMemory(
      conAgent.id,
      `The team needs to decide: "${message}"\n\n@${agentName(proAgent)} argued:\n${proText}\n\nYou are arguing AGAINST that position. Counter their points with technical reasons. Be thorough and fair.`,
    );
    const conResp = await sendWithRetry(
      gateway,
      conPrompt,
      conAgent.id,
      sessionKey(conAgent.id, teamId),
    );
    const conText = processMemory(conAgent.id, extractText(conResp));
    yield {
      type: "agent_response",
      agentId: conAgent.id,
      agentName: agentName(conAgent),
      text: `🔴 **Arguing AGAINST:**\n\n${conText}`,
    };

    // Round 3: Judge decides
    yield { type: "summary_thinking", agentName: agentName(judge) };
    const judgePrompt = withMemory(
      judge.id,
      `The team debated: "${message}"\n\n🟢 @${agentName(proAgent)} argued:\n${proText}\n\n🔴 @${agentName(conAgent)} countered:\n${conText}\n\nAs the team lead, make the final decision. Weigh both arguments, acknowledge valid points from both sides, and give a clear recommendation with reasoning.`,
    );
    const judgeResp = await sendWithRetry(
      gateway,
      judgePrompt,
      judge.id,
      sessionKey(judge.id, teamId),
    );
    const judgeText = processMemory(judge.id, extractText(judgeResp));
    yield {
      type: "summary",
      agentName: agentName(judge),
      text: `⚖️ **Decision:**\n\n${judgeText}`,
    };
  } catch (err) {
    yield {
      type: "agent_error",
      agentId: judge.id,
      agentName: agentName(judge),
      error: String(err),
    };
  }

  yield { type: "complete", strategy: "debate" };
}

// ──── 4. Pipeline ───────────────────────────────────────────────────────

async function* pipeline(ctx: OrchestrationContext): AsyncGenerator<OrchestrationEvent> {
  const { message, agents, gateway, teamId } = ctx;

  let currentOutput = message;

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const name = agentName(agent);
    const isLast = i === agents.length - 1;

    yield {
      type: "agent_thinking",
      agentId: agent.id,
      agentName: name,
      position: `step ${i + 1}/${agents.length}`,
    };

    try {
      const pipePrompt = withMemory(
        agent.id,
        i === 0
          ? `${currentOutput}\n\nComplete your part and pass your output to the next team member.`
          : `Previous step output from @${agentName(agents[i - 1])}:\n\n${currentOutput}\n\n${isLast ? "This is the final step. Review, polish, and finalize the deliverable." : "Build on this output for your part, then pass it forward."}`,
      );

      const response = await sendWithRetry(
        gateway,
        pipePrompt,
        agent.id,
        sessionKey(agent.id, teamId),
      );
      currentOutput = processMemory(agent.id, extractText(response));
      yield { type: "agent_response", agentId: agent.id, agentName: name, text: currentOutput };
    } catch (err) {
      yield { type: "agent_error", agentId: agent.id, agentName: name, error: String(err) };
      break; // Pipeline can't continue if a step fails
    }
  }

  yield { type: "complete", strategy: "pipeline" };
}

// ──── 5. AutoRoute ──────────────────────────────────────────────────────

async function* autoRoute(ctx: OrchestrationContext): AsyncGenerator<OrchestrationEvent> {
  const { message, agents, gateway, teamId, mentionedAgentIds } = ctx;

  // Find mentioned agents, or use all
  const targets =
    mentionedAgentIds.length > 0 ? agents.filter((a) => mentionedAgentIds.includes(a.id)) : agents;

  for (const agent of targets) {
    const name = agentName(agent);
    yield { type: "agent_thinking", agentId: agent.id, agentName: name };

    try {
      const prompt = withMemory(agent.id, message);
      const response = await sendWithRetry(gateway, prompt, agent.id, sessionKey(agent.id, teamId));
      const text = processMemory(agent.id, extractText(response));
      yield { type: "agent_response", agentId: agent.id, agentName: name, text };
    } catch (err) {
      yield { type: "agent_error", agentId: agent.id, agentName: name, error: String(err) };
    }
  }

  yield { type: "complete", strategy: "auto-route" };
}

// ── Summary + Delegation (shared by RoundRobin) ─────────────────────────

async function* summaryAndDelegation(
  ctx: OrchestrationContext,
  orderedAgents: AgentInfo[],
  responses: Array<{ name: string; text: string; agentId: string }>,
  transcript: string,
): AsyncGenerator<OrchestrationEvent> {
  const { message, gateway, teamId } = ctx;
  const MAX_REVISIONS = 2;

  const summaryAgent = orderedAgents[0];
  const summaryName = agentName(summaryAgent);

  yield { type: "summary_thinking", agentName: summaryName };

  try {
    const allResponses = responses.map((r) => `**@${r.name}**:\n${r.text}`).join("\n\n---\n\n");
    const summaryPrompt = withMemory(
      summaryAgent.id,
      `The team just discussed: "${message}"\n\nHere are all responses:\n\n${allResponses}\n\n---\n\nAs the lead, synthesize everyone's input into a **clear, actionable final plan**. If you need a specific agent to do something, @mention them with their task (e.g., "@Frontend: build the upload component").`,
    );

    const resp = await sendWithRetry(
      gateway,
      summaryPrompt,
      summaryAgent.id,
      sessionKey(summaryAgent.id, teamId),
    );
    const summaryText = processMemory(summaryAgent.id, extractText(resp));
    yield { type: "summary", agentName: summaryName, text: summaryText };

    // Parse delegations from summary
    const discussionAgents = orderedAgents.map((a) => ({
      id: a.id,
      name: agentName(a),
      role: a.role || a.name || "",
    }));
    const delegations = parseDelegations(summaryText, discussionAgents, summaryAgent.id);

    // Execute delegations with review loop
    for (const delegation of delegations) {
      const worker = orderedAgents.find((a) => a.id === delegation.assignedTo.id);
      if (!worker) continue;

      const workerName = agentName(worker);
      yield { type: "delegation_start", agentName: workerName, task: delegation.taskDescription };

      try {
        const workerPrompt = buildWorkerReportPrompt(delegation, transcript);
        const workerResp = await sendWithRetry(
          gateway,
          workerPrompt,
          worker.id,
          sessionKey(worker.id, teamId),
        );
        let currentOutput = processMemory(worker.id, extractText(workerResp));
        yield { type: "delegation_result", agentName: workerName, text: currentOutput };

        // Manager review loop
        for (let rev = 0; rev < MAX_REVISIONS; rev++) {
          yield { type: "review_thinking", reviewerName: summaryName, workerName };

          const reviewPrompt = buildManagerReviewPrompt(delegation, currentOutput);
          const reviewResp = await sendWithRetry(
            gateway,
            reviewPrompt,
            summaryAgent.id,
            sessionKey(summaryAgent.id, teamId),
          );
          const reviewText = extractText(reviewResp);
          const verdict = parseReviewVerdict(reviewText);

          yield {
            type: "review_result",
            reviewerName: summaryName,
            approved: verdict.approved,
            text: reviewText,
          };

          if (verdict.approved) break;

          // Revision
          const revisePrompt = `Your manager reviewed your work and requested changes:\n\n"${reviewText}"\n\nYour previous output:\n${currentOutput}\n\nPlease revise based on the feedback.`;
          const reviseResp = await sendWithRetry(
            gateway,
            revisePrompt,
            worker.id,
            sessionKey(worker.id, teamId),
          );
          currentOutput = processMemory(worker.id, extractText(reviseResp));
          yield { type: "revision", agentName: workerName, round: rev + 2, text: currentOutput };
        }
      } catch (err) {
        yield {
          type: "agent_error",
          agentId: worker.id,
          agentName: workerName,
          error: String(err),
        };
      }
    }
  } catch (err) {
    yield {
      type: "agent_error",
      agentId: summaryAgent.id,
      agentName: summaryName,
      error: String(err),
    };
  }
}

// ── Strategy Map ────────────────────────────────────────────────────────

const STRATEGIES: Record<
  Intent,
  (ctx: OrchestrationContext) => AsyncGenerator<OrchestrationEvent>
> = {
  question: roundRobin,
  build: mapReduce,
  decide: debate,
  pipeline: pipeline,
  route: autoRoute,
};

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Run the orchestration engine.
 *
 * Usage:
 * ```
 * for await (const event of orchestrate(ctx)) {
 *   switch (event.type) {
 *     case "agent_thinking": showPlaceholder(event.agentId); break;
 *     case "agent_response": updateMessage(event.agentId, event.text); break;
 *     ...
 *   }
 * }
 * ```
 */
export async function* orchestrate(ctx: OrchestrationContext): AsyncGenerator<OrchestrationEvent> {
  const intent = classifyIntent(ctx.message, ctx.mentionedAgentIds);
  console.log(
    `[orchestration] intent="${intent}" agents=${ctx.agents.length} mentioned=${ctx.mentionedAgentIds.length} message="${ctx.message.slice(0, 60)}..."`,
  );
  const strategy = STRATEGIES[intent];
  yield* strategy(ctx);
}

/** Orchestrate with an explicit strategy override */
export async function* orchestrateWith(
  strategyName: Intent,
  ctx: OrchestrationContext,
): AsyncGenerator<OrchestrationEvent> {
  const strategy = STRATEGIES[strategyName];
  yield* strategy(ctx);
}
