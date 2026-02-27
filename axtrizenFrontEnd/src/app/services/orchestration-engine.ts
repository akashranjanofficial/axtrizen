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

import type { GatewayAdapter, AgentResponse, StreamDelta } from "./gateway-adapter";
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
  /** Project workspace path — agents write files here */
  workspacePath?: string;
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
  | { type: "text_delta"; agentId: string; agentName: string; text: string }
  | { type: "tool_start"; agentId: string; agentName: string; tool: string; input: string }
  | {
      type: "tool_result";
      agentId: string;
      agentName: string;
      tool: string;
      output: string;
      error?: string;
    }
  | { type: "product_ready"; workspacePath: string; summary: string }
  | { type: "complete"; strategy: string }
  | {
      type: "task_update";
      taskId: string;
      agentId: string;
      agentName: string;
      status: string;
      filesCreated?: string[];
      notes?: string;
    };

// ── Event Priority System (Mission Control Foundation) ──────────────

export type EventPriority = "critical" | "review" | "info" | "debug";

/** Classify an orchestration event by priority for the Mission Control UI.
 *  - critical: needs human input NOW (errors, blocked agents)
 *  - review: work ready for human approval
 *  - info: milestones, summaries, key decisions
 *  - debug: routine thinking/progress (collapsed by default)
 */
export function classifyEventPriority(event: OrchestrationEvent): EventPriority {
  switch (event.type) {
    // CRITICAL — needs human attention immediately
    case "agent_error":
      return "critical";

    // REVIEW — work ready for approval
    case "product_ready":
      return "review";
    case "review_result":
      return event.approved ? "info" : "review";

    // INFO — milestones and key outputs
    case "summary":
    case "agent_response":
    case "delegation_result":
    case "revision":
    case "pivot_gate_verdict":
    case "complete":
      return "info";

    // DEBUG — routine progress (collapse in large teams)
    case "agent_thinking":
    case "summary_thinking":
    case "review_thinking":
    case "delegation_start":
    case "round_start":
    case "pivot_gate_thinking":
    case "text_delta":
    case "tool_start":
    case "tool_result":
      return "debug";

    default:
      return "debug";
  }
}

/** Pivot Gate verdict types — inspired by War Room Wave Protocol */
export type PivotVerdictType = "CONVERGED" | "CONTINUE" | "ASSIGN";

export interface PivotVerdict {
  type: PivotVerdictType;
  summary?: string;
  assignments?: Array<{ agentName: string; task: string }>;
}

export type Intent = "question" | "build" | "decide" | "pipeline" | "route" | "mission";

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

/**
 * Send a message with streaming — collects tool events into a buffer
 * and returns both the final response AND any tool events that occurred.
 */
async function sendWithRetryStreaming(
  gw: GatewayAdapter,
  message: string,
  agentId: string,
  key: string,
): Promise<{ response: AgentResponse; toolEvents: StreamDelta[] }> {
  const toolEvents: StreamDelta[] = [];
  try {
    const response = await gw.sendMessageStreaming(message, agentId, key, (delta) => {
      if (delta.type === "tool_start" || delta.type === "tool_result") {
        toolEvents.push(delta);
      }
    });
    return { response, toolEvents };
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
    const response = await gw.sendMessageStreaming(message, agentId, key, (delta) => {
      if (delta.type === "tool_start" || delta.type === "tool_result") {
        toolEvents.push(delta);
      }
    });
    return { response, toolEvents };
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

// ── Shared Workspace Instructions Builder ───────────────────────────────

/** Tool names that indicate file creation/modification */
const FILE_TOOL_NAMES = [
  "write_file",
  "create_file",
  "edit_file",
  "str_replace_editor",
  "file_editor",
  "bash",
  "mv",
  "cp",
  "mkdir",
  "touch",
];

/** Build workspace instructions for any worker agent */
function buildWorkspaceInstructions(workspacePath?: string): string {
  if (!workspacePath) return "";
  return [
    ``,
    `## Project Workspace`,
    `All code and files for this project live in:`,
    `\`${workspacePath}\``,
    ``,
    `### ⚡ YOU HAVE FULL SUPERPOWER ACCESS — USE ALL TOOLS:`,
    `You have UNRESTRICTED access to every tool available. Use them aggressively to deliver the best result:`,
    ``,
    `**🛠️ File & Code Tools:**`,
    `- \`bash\` — Run ANY shell command (npm, pip, git, curl, make, docker, etc.)`,
    `- \`write_file\` / \`create_file\` / \`edit_file\` — Create and modify files`,
    `- \`read_file\` / \`list_dir\` — Explore the filesystem`,
    `- \`str_replace_editor\` — Surgical code edits`,
    ``,
    `**📦 Package Management:**`,
    `- Run \`npm install\`, \`pip install\`, \`cargo add\`, \`go get\`, etc. freely`,
    `- Initialize projects with \`npm init\`, \`cargo init\`, \`python -m venv\`, etc.`,
    `- Install ANY dependency the project needs`,
    ``,
    `**🌐 Web & Research:**`,
    `- \`web_search\` — Search the web for docs, APIs, packages`,
    `- \`browser\` — Open and interact with web pages`,
    `- \`curl\` / \`wget\` — Download files, hit APIs`,
    ``,
    `**🔧 System Tools:**`,
    `- \`git\` — Version control, clone repos, create branches`,
    `- \`screen.capture\` — Take screenshots for verification`,
    `- \`camera.snap\` — Access camera if needed`,
    `- Run development servers, build tools, linters, formatters`,
    ``,
    `### CRITICAL INSTRUCTIONS:`,
    `1. **CREATE REAL FILES** — Use your tools to write actual code, not descriptions`,
    `2. **INSTALL DEPENDENCIES** — Run \`npm install\`, \`pip install -r requirements.txt\`, etc. before testing`,
    `3. **TEST YOUR WORK** — Run the code, verify it works, fix errors`,
    `4. **ITERATE** — If something fails, debug and fix it. Don't give up.`,
    `5. **Be thorough** — Set up the complete project structure (configs, tests, docs)`,
    ``,
    `### 📋 FILE VERIFICATION:`,
    `When you finish, list ALL files you created/modified in this format:`,
    `\`\`\``,
    `FILES_CREATED:`,
    `- ${workspacePath}/src/App.tsx (new)`,
    `- ${workspacePath}/package.json (modified)`,
    `\`\`\``,
    ``,
    `> ⚠️ Do NOT just describe what you would do.`,
    `> You MUST create the actual files using your tools.`,
    `> The human expects REAL files, not descriptions.`,
  ].join("\n");
}

/** Check if a review response indicates approval (avoids 'NOT APPROVED' false positives) */
function isApproved(reviewText: string): boolean {
  const t = reviewText.trim().toUpperCase();
  // Must start with APPROVED (optionally after whitespace/emoji)
  // and NOT be preceded by NOT/DIS/UN
  if (/^\s*(✅\s*)?APPROVED\b/.test(t)) return true;
  if (/NOT\s+APPROVED|DISAPPROVED|UNAPPROVED|REVISION\s+NEEDED/i.test(t)) return false;
  // Fallback: check if APPROVED appears prominently
  return /^APPROVED\b/m.test(t);
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
        "This is the **final round**. You MUST choose either CONVERGED or ASSIGN.",
        "",
        "- **VERDICT: CONVERGED** — Only if there are NO remaining action items. Provide a final summary.",
        `- **VERDICT: ASSIGN** — If ANY agent needs to do work. List tasks as:`,
        ...agentNames.map((n) => `   - @${n}: [task description]`),
      ].join("\n")
    : [
        "Choose ONE of these verdicts:",
        "",
        "1. **VERDICT: CONVERGED** — Discussion is FULLY complete with NO remaining work to do.",
        "2. **VERDICT: CONTINUE** — More discussion needed. State what still needs resolution.",
        `3. **VERDICT: ASSIGN** — Specific agents need follow-up tasks. List as:`,
        ...agentNames.map((n) => `   - @${n}: [task description]`),
        "",
        "> **IMPORTANT:** If your summary includes action items, tasks, or deliverables for specific agents,",
        "> you MUST use **ASSIGN**, not CONVERGED. CONVERGED means the discussion is done AND no work remains.",
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

// ── Execute ASSIGN Tasks with Builder Protocol + Streaming ──────────────

async function* executeAssignments(
  ctx: OrchestrationContext,
  orderedAgents: AgentInfo[],
  assignments: Array<{ agentName: string; task: string }>,
  transcript: string,
): AsyncGenerator<OrchestrationEvent> {
  const { gateway, teamId, workspacePath } = ctx;
  const MAX_REVISIONS = 2;

  // Identify the manager for the review loop
  const manager =
    orderedAgents.find((a) => a.role?.toLowerCase().includes("manager")) || orderedAgents[0];
  const managerName = agentName(manager);

  const completedReports: Array<{
    worker: string;
    task: string;
    output: string;
    filesCreated: string[];
  }> = [];

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
      // ── Step 1: Worker executes task with Builder Protocol ──
      const workspaceInstructions = buildWorkspaceInstructions(workspacePath);

      const taskPrompt = withMemory(
        worker.id,
        [
          `## Task Assignment from Manager`,
          ``,
          `**Your task:** ${assignment.task}`,
          workspaceInstructions,
          ``,
          `**Context from team discussion:**`,
          transcript,
          ``,
          `Complete this task thoroughly. When done, provide a clear **report** of what you accomplished,`,
          `including specifics, decisions made, and any deliverables.`,
          `List all files you created or modified.`,
        ].join("\n"),
      );

      // Use streaming to capture tool events
      const { response: taskResp, toolEvents } = await sendWithRetryStreaming(
        gateway,
        taskPrompt,
        worker.id,
        sessionKey(worker.id, teamId),
      );

      // Yield tool events so the UI can display them
      for (const evt of toolEvents) {
        if (evt.type === "tool_start") {
          yield {
            type: "tool_start",
            agentId: worker.id,
            agentName: name,
            tool: evt.toolName,
            input: evt.toolInput,
          };
        } else if (evt.type === "tool_result") {
          yield {
            type: "tool_result",
            agentId: worker.id,
            agentName: name,
            tool: evt.toolName,
            output: evt.output,
            error: evt.error,
          };
        }
      }

      let currentOutput = processMemory(worker.id, extractText(taskResp));
      yield { type: "delegation_result", agentName: name, text: currentOutput };

      // Track files created from tool events
      const filesCreated = toolEvents
        .filter((e): e is StreamDelta & { type: "tool_start" } => e.type === "tool_start")
        .filter((e) => FILE_TOOL_NAMES.includes(e.toolName))
        .map((e) => e.toolInput.slice(0, 200));

      // ── Step 2: Manager reviews the worker's report ──
      for (let rev = 0; rev < MAX_REVISIONS; rev++) {
        yield { type: "review_thinking", reviewerName: managerName, workerName: name };
        console.log(
          `[orchestration:assign] Manager ${managerName} reviewing ${name}'s work (attempt ${rev + 1})...`,
        );

        const filesSummary =
          filesCreated.length > 0
            ? `\n\n**Files created/modified (${filesCreated.length} tool calls detected):**\n${filesCreated.map((f) => `- ${f}`).join("\n")}`
            : "\n\n**⚠️ No file-creation tool calls were detected. The worker may have only provided text.**";

        const reviewPrompt = withMemory(
          manager.id,
          [
            `## Manager Review — @${name}'s Task Report`,
            ``,
            `**Original task:** ${assignment.task}`,
            ``,
            `**@${name}'s report:**`,
            currentOutput,
            filesSummary,
            ``,
            `---`,
            ``,
            `Review this work carefully. Does it meet the requirements?`,
            workspacePath
              ? `If the worker only described what they would do but did NOT create actual files, request REVISION and tell them to USE THEIR TOOLS to create the files.`
              : "",
            ``,
            `If **APPROVED**: Start your response with "APPROVED" and provide brief feedback.`,
            `If **REVISION NEEDED**: Start with "REVISION NEEDED" and explain exactly what needs to change.`,
          ].join("\n"),
        );

        const reviewResp = await sendWithRetry(
          gateway,
          reviewPrompt,
          manager.id,
          sessionKey(manager.id, teamId),
        );
        const reviewText = processMemory(manager.id, extractText(reviewResp));
        const approved = isApproved(reviewText);

        yield {
          type: "review_result",
          reviewerName: managerName,
          approved,
          text: reviewText,
        };

        if (approved) {
          console.log(`[orchestration:assign] Manager APPROVED ${name}'s work`);
          completedReports.push({
            worker: name,
            task: assignment.task,
            output: currentOutput,
            filesCreated,
          });
          break;
        }

        // ── Step 3: Worker revises ──
        console.log(`[orchestration:assign] Manager requested revision from ${name}`);
        const revisePrompt = withMemory(
          worker.id,
          [
            `## Revision Request from Manager`,
            ``,
            `Your manager reviewed your work and requested changes:`,
            ``,
            `"${reviewText}"`,
            ``,
            `**Your previous output:**`,
            currentOutput,
            workspacePath
              ? `\n**REMINDER:** You MUST use your tools (bash, write_file) to create/modify actual files in \`${workspacePath}\`. Do not just describe changes.`
              : "",
            ``,
            `Please revise based on the feedback. Provide the complete updated deliverable.`,
          ].join("\n"),
        );

        // Stream revision too
        const { response: reviseResp, toolEvents: revToolEvents } = await sendWithRetryStreaming(
          gateway,
          revisePrompt,
          worker.id,
          sessionKey(worker.id, teamId),
        );

        // Yield revision tool events
        for (const evt of revToolEvents) {
          if (evt.type === "tool_start") {
            yield {
              type: "tool_start",
              agentId: worker.id,
              agentName: name,
              tool: evt.toolName,
              input: evt.toolInput,
            };
          } else if (evt.type === "tool_result") {
            yield {
              type: "tool_result",
              agentId: worker.id,
              agentName: name,
              tool: evt.toolName,
              output: evt.output,
              error: evt.error,
            };
          }
        }

        currentOutput = processMemory(worker.id, extractText(reviseResp));
        yield { type: "revision", agentName: name, round: rev + 2, text: currentOutput };

        // Track additional files from revision
        const revFiles = revToolEvents
          .filter((e): e is StreamDelta & { type: "tool_start" } => e.type === "tool_start")
          .filter((e) => FILE_TOOL_NAMES.includes(e.toolName))
          .map((e) => e.toolInput.slice(0, 200));
        filesCreated.push(...revFiles);

        // If this was the last revision attempt, auto-accept
        if (rev === MAX_REVISIONS - 1) {
          console.log(`[orchestration:assign] Max revisions reached for ${name}, auto-accepting`);
          completedReports.push({
            worker: name,
            task: assignment.task,
            output: currentOutput,
            filesCreated,
          });
        }
      }
    } catch (err) {
      yield {
        type: "agent_error",
        agentId: worker.id,
        agentName: name,
        error: String(err),
      };
    }
  }

  // ── Step 4: Manager produces final consolidated report ──
  if (completedReports.length > 0) {
    yield { type: "summary_thinking", agentName: managerName };
    console.log(`[orchestration:assign] Manager producing final consolidated report...`);

    try {
      const allReports = completedReports
        .map((r) => {
          const fileList = r.filesCreated.length > 0 ? `\nFiles: ${r.filesCreated.join(", ")}` : "";
          return `### @${r.worker} — ${r.task}\n${r.output}${fileList}`;
        })
        .join("\n\n---\n\n");

      const finalPrompt = withMemory(
        manager.id,
        [
          `## Final Consolidated Report`,
          ``,
          `All team members have completed their assigned tasks and you have reviewed their work.`,
          `Here are the approved deliverables:\n`,
          allReports,
          ``,
          `---`,
          ``,
          `Produce a **final consolidated report** for the human:`,
          `1. Summarize what each team member delivered`,
          `2. Highlight the overall outcome and how the pieces fit together`,
          `3. List ALL files created with their paths`,
          `4. Note any remaining follow-ups or next steps`,
          `5. Present this as the **final product** ready for the human`,
        ].join("\n"),
      );

      const finalResp = await sendWithRetry(
        gateway,
        finalPrompt,
        manager.id,
        sessionKey(manager.id, teamId),
      );
      const finalText = processMemory(manager.id, extractText(finalResp));
      yield { type: "summary", agentName: managerName, text: finalText };

      // Emit product_ready if workspace exists
      if (workspacePath) {
        yield {
          type: "product_ready",
          workspacePath,
          summary: finalText,
        };
      }
    } catch (err) {
      console.error(`[orchestration:assign] Manager final report FAILED:`, err);
      // Still show individual reports if summary fails
      const fallback = completedReports.map((r) => `**@${r.worker}**: ${r.output}`).join("\n\n");
      yield { type: "summary", agentName: managerName, text: fallback };
    }
  }
}

// ──── 2. MapReduce ──────────────────────────────────────────────────────

async function* mapReduce(ctx: OrchestrationContext): AsyncGenerator<OrchestrationEvent> {
  const { message, agents, gateway, teamId, workspacePath } = ctx;
  const MAX_REVISIONS = 2;

  // Manager = first agent (or highest-ranked by role)
  const manager = agents.find((a) => a.role?.toLowerCase().includes("manager")) || agents[0];
  const workers = agents.filter((a) => a.id !== manager.id);
  const managerName_ = agentName(manager);

  if (workers.length === 0) {
    // Fall back to single agent
    yield* autoRoute(ctx);
    return;
  }

  // Step 1: Manager decomposes the task
  yield {
    type: "agent_thinking",
    agentId: manager.id,
    agentName: managerName_,
    position: "planning",
  };

  const workspaceNote = workspacePath
    ? `\n\n**Important:** The project workspace is at \`${workspacePath}\`. Each agent MUST use their tools to create REAL files there. They should install dependencies and test their work.`
    : "";

  const decomposePrompt = withMemory(
    manager.id,
    `Break down this task into ${workers.length} parallel subtasks, one for each team member:\n\n"${message}"${workspaceNote}\n\nTeam members: ${workers.map((w) => `@${agentName(w)} (${w.role || "worker"})`).join(", ")}\n\nFor each, write:\n@AgentName: [specific task description]\n\nBe very specific. Each subtask should be independently completable. Include which files to create and what technologies to use.`,
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
      agentName: managerName_,
      text: decomposition,
    };
  } catch (err) {
    yield {
      type: "agent_error",
      agentId: manager.id,
      agentName: managerName_,
      error: String(err),
    };
    yield { type: "complete", strategy: "map-reduce" };
    return;
  }

  // Step 2: Workers execute in PARALLEL with workspace tools + streaming
  console.log(`[orchestration:mapreduce] Launching ${workers.length} workers in parallel`);
  for (const w of workers) {
    yield { type: "agent_thinking", agentId: w.id, agentName: agentName(w), position: "parallel" };
  }

  const workspaceInstructions = buildWorkspaceInstructions(workspacePath);

  const workerResults = await Promise.allSettled(
    workers.map(async (worker) => {
      const workerPrompt = withMemory(
        worker.id,
        [
          `## Task Assignment from Manager`,
          ``,
          `Your manager decomposed this task:`,
          ``,
          decomposition,
          ``,
          `**Original request:** "${message}"`,
          ``,
          `Complete YOUR assigned subtask. Focus only on your part.`,
          workspaceInstructions,
        ].join("\n"),
      );
      const { response: resp, toolEvents } = await sendWithRetryStreaming(
        gateway,
        workerPrompt,
        worker.id,
        sessionKey(worker.id, teamId),
      );
      return {
        worker,
        text: processMemory(worker.id, extractText(resp)),
        toolEvents,
      };
    }),
  );

  console.log(`[orchestration:mapreduce] All workers settled`);
  const successResults: Array<{
    name: string;
    text: string;
    agentId: string;
    filesCreated: string[];
  }> = [];

  for (const result of workerResults) {
    if (result.status === "fulfilled") {
      const { worker, text, toolEvents } = result.value;
      const name = agentName(worker);

      // Yield tool events so UI can display them
      for (const evt of toolEvents) {
        if (evt.type === "tool_start") {
          yield {
            type: "tool_start",
            agentId: worker.id,
            agentName: name,
            tool: evt.toolName,
            input: evt.toolInput,
          };
        } else if (evt.type === "tool_result") {
          yield {
            type: "tool_result",
            agentId: worker.id,
            agentName: name,
            tool: evt.toolName,
            output: evt.output,
            error: evt.error,
          };
        }
      }

      const filesCreated = toolEvents
        .filter((e): e is StreamDelta & { type: "tool_start" } => e.type === "tool_start")
        .filter((e) => FILE_TOOL_NAMES.includes(e.toolName))
        .map((e) => e.toolInput.slice(0, 200));

      successResults.push({ name, text, agentId: worker.id, filesCreated });
      yield { type: "agent_response", agentId: worker.id, agentName: name, text };
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

  // Step 3: Manager reviews each worker's output (Bug Fix #2 — was missing entirely)
  if (successResults.length > 0 && workspacePath) {
    for (const workerResult of successResults) {
      const filesSummary =
        workerResult.filesCreated.length > 0
          ? `\n\n**Files created/modified (${workerResult.filesCreated.length} tool calls):**\n${workerResult.filesCreated.map((f) => `- ${f}`).join("\n")}`
          : "\n\n**⚠️ No file-creation tool calls detected. Worker may have only provided text.**";

      yield { type: "review_thinking", reviewerName: managerName_, workerName: workerResult.name };

      const reviewPrompt = withMemory(
        manager.id,
        [
          `## Quick Review — @${workerResult.name}'s Work`,
          ``,
          `**Report:**`,
          workerResult.text,
          filesSummary,
          ``,
          `If the worker created real files using tools: respond "APPROVED"`,
          `If the worker only described what they'd do but didn't create files: respond "REVISION NEEDED — use your tools to create actual files"`,
        ].join("\n"),
      );

      try {
        const reviewResp = await sendWithRetry(
          gateway,
          reviewPrompt,
          manager.id,
          sessionKey(manager.id, teamId),
        );
        const reviewText = processMemory(manager.id, extractText(reviewResp));
        const approved = isApproved(reviewText);

        yield {
          type: "review_result",
          reviewerName: managerName_,
          approved,
          text: reviewText,
        };

        // If not approved and workspace exists, request one revision
        if (!approved) {
          const worker = agents.find((a) => agentName(a) === workerResult.name);
          if (worker) {
            const revisePrompt = withMemory(
              worker.id,
              [
                `## Revision Request from Manager`,
                ``,
                `Your manager reviewed your work and requested changes:`,
                `"${reviewText}"`,
                ``,
                `**REMINDER:** You MUST use your tools to create/modify actual files in \`${workspacePath}\`. Do not just describe changes.`,
                ``,
                `Please revise and complete the work.`,
              ].join("\n"),
            );
            try {
              const { response: revResp, toolEvents: revTools } = await sendWithRetryStreaming(
                gateway,
                revisePrompt,
                worker.id,
                sessionKey(worker.id, teamId),
              );
              for (const evt of revTools) {
                if (evt.type === "tool_start") {
                  yield {
                    type: "tool_start",
                    agentId: worker.id,
                    agentName: workerResult.name,
                    tool: evt.toolName,
                    input: evt.toolInput,
                  };
                } else if (evt.type === "tool_result") {
                  yield {
                    type: "tool_result",
                    agentId: worker.id,
                    agentName: workerResult.name,
                    tool: evt.toolName,
                    output: evt.output,
                    error: evt.error,
                  };
                }
              }
              workerResult.text = processMemory(worker.id, extractText(revResp));
              yield {
                type: "revision",
                agentName: workerResult.name,
                round: 2,
                text: workerResult.text,
              };
            } catch {
              /* revision failed, continue with original */
            }
          }
        }
      } catch (err) {
        console.warn(`[orchestration:mapreduce] Review of ${workerResult.name} failed:`, err);
      }
    }
  }

  // Step 4: Manager merges results
  if (successResults.length > 0) {
    yield { type: "summary_thinking", agentName: managerName_ };

    const allResults = successResults
      .map((r) => {
        const fileList = r.filesCreated.length > 0 ? `\nFiles: ${r.filesCreated.join(", ")}` : "";
        return `**@${r.name}**:\n${r.text}${fileList}`;
      })
      .join("\n\n---\n\n");
    const mergePrompt = withMemory(
      manager.id,
      [
        `Your team worked in parallel on: "${message}"`,
        ``,
        `Here are their results:\n\n${allResults}`,
        ``,
        `---`,
        ``,
        `Merge these into a single, coherent final deliverable.`,
        `1. Summarize what each team member delivered`,
        `2. List ALL files created with their paths`,
        `3. Note any remaining follow-ups`,
        `4. Present this as the **final product** ready for the human`,
      ].join("\n"),
    );

    try {
      const resp = await sendWithRetry(
        gateway,
        mergePrompt,
        manager.id,
        sessionKey(manager.id, teamId),
      );
      const summary = processMemory(manager.id, extractText(resp));
      yield { type: "summary", agentName: managerName_, text: summary };

      // Bug Fix #3 — Emit product_ready when workspace exists
      if (workspacePath) {
        yield {
          type: "product_ready",
          workspacePath,
          summary,
        };
      }
    } catch (err) {
      yield {
        type: "agent_error",
        agentId: manager.id,
        agentName: managerName_,
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

    // Execute delegations with streaming + workspace + review loop
    for (const delegation of delegations) {
      const worker = orderedAgents.find((a) => a.id === delegation.assignedTo.id);
      if (!worker) continue;

      const workerName = agentName(worker);
      yield { type: "delegation_start", agentName: workerName, task: delegation.taskDescription };

      try {
        // Use streaming so tool events are captured
        const workerPromptBase = buildWorkerReportPrompt(delegation, transcript);
        const workspaceInstructions = buildWorkspaceInstructions(ctx.workspacePath);
        const workerPrompt = workerPromptBase + workspaceInstructions;

        const { response: workerResp, toolEvents } = await sendWithRetryStreaming(
          gateway,
          workerPrompt,
          worker.id,
          sessionKey(worker.id, teamId),
        );

        // Yield tool events
        for (const evt of toolEvents) {
          if (evt.type === "tool_start") {
            yield {
              type: "tool_start",
              agentId: worker.id,
              agentName: workerName,
              tool: evt.toolName,
              input: evt.toolInput,
            };
          } else if (evt.type === "tool_result") {
            yield {
              type: "tool_result",
              agentId: worker.id,
              agentName: workerName,
              tool: evt.toolName,
              output: evt.output,
              error: evt.error,
            };
          }
        }

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

          // Revision with streaming
          const revisePrompt = `Your manager reviewed your work and requested changes:\n\n"${reviewText}"\n\nYour previous output:\n${currentOutput}${ctx.workspacePath ? `\n\n**REMINDER:** You MUST use your tools to create/modify actual files in \`${ctx.workspacePath}\`. Do not just describe changes.` : ""}\n\nPlease revise based on the feedback.`;
          const { response: reviseResp, toolEvents: revToolEvents } = await sendWithRetryStreaming(
            gateway,
            revisePrompt,
            worker.id,
            sessionKey(worker.id, teamId),
          );
          // Yield revision tool events
          for (const evt of revToolEvents) {
            if (evt.type === "tool_start") {
              yield {
                type: "tool_start",
                agentId: worker.id,
                agentName: workerName,
                tool: evt.toolName,
                input: evt.toolInput,
              };
            } else if (evt.type === "tool_result") {
              yield {
                type: "tool_result",
                agentId: worker.id,
                agentName: workerName,
                tool: evt.toolName,
                output: evt.output,
                error: evt.error,
              };
            }
          }
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
  mission: mapReduce, // mission uses mapReduce at team level — see orchestrateMission
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

// ── Phase 4: Cross-Team Mission Orchestrator ────────────────────────

/** Multi-team mission context — orchestrates across multiple teams */
export interface MissionContext {
  message: string;
  teams: Array<{
    teamId: string;
    teamName: string;
    agents: AgentInfo[];
  }>;
  gateway: GatewayAdapter;
  workspacePath?: string;
}

/** Mission-level event types */
export type MissionEvent =
  | { type: "mission_start"; teamCount: number; agentCount: number; message: string }
  | { type: "team_start"; teamId: string; teamName: string; agentCount: number }
  | { type: "team_complete"; teamId: string; teamName: string; summary: string }
  | { type: "team_error"; teamId: string; teamName: string; error: string }
  | { type: "cross_team_merge"; summary: string }
  | { type: "mission_complete"; summary: string; teamsCompleted: number; totalTeams: number }
  | OrchestrationEvent;

/**
 * Orchestrate a mission across multiple teams.
 *
 * Flow:
 * 1. Coordinator decomposes the task into per-team sub-tasks
 * 2. Each team runs its own MapReduce in parallel
 * 3. Coordinator merges all team outputs into a final deliverable
 *
 * Usage:
 * ```ts
 * for await (const event of orchestrateMission(missionCtx)) {
 *   // Handle both MissionEvent and OrchestrationEvent
 * }
 * ```
 */
export async function* orchestrateMission(ctx: MissionContext): AsyncGenerator<MissionEvent> {
  const { message, teams, gateway, workspacePath } = ctx;
  const totalAgents = teams.reduce((sum, t) => sum + t.agents.length, 0);

  yield {
    type: "mission_start",
    teamCount: teams.length,
    agentCount: totalAgents,
    message,
  };

  if (teams.length === 0) {
    yield {
      type: "mission_complete",
      summary: "No teams available.",
      teamsCompleted: 0,
      totalTeams: 0,
    };
    return;
  }

  // Find a coordinator — the manager from the first team, or any agent
  const coordinator =
    teams[0].agents.find((a) => a.role?.toLowerCase().includes("manager")) || teams[0].agents[0];

  if (!coordinator) {
    yield {
      type: "mission_complete",
      summary: "No coordinator agent available.",
      teamsCompleted: 0,
      totalTeams: teams.length,
    };
    return;
  }

  const coordName = agentName(coordinator);

  // Step 1: Coordinator decomposes the task across teams
  yield {
    type: "agent_thinking",
    agentId: coordinator.id,
    agentName: coordName,
    position: "mission-planning",
  };

  const teamList = teams
    .map(
      (t) =>
        `- **${t.teamName}** (${t.agents.length} agents: ${t.agents.map((a) => agentName(a)).join(", ")})`,
    )
    .join("\n");

  const decomposePrompt = withMemory(
    coordinator.id,
    [
      `## 🎯 Mission Briefing`,
      ``,
      `You are the **Mission Coordinator**. Decompose this task across ${teams.length} teams:`,
      ``,
      `"${message}"`,
      ``,
      `### Available Teams:`,
      teamList,
      ``,
      `For each team, write:`,
      `**[Team Name]:** [specific task description for this team]`,
      ``,
      `Be specific about what each team should deliver. Consider dependencies between teams.`,
      workspacePath ? `\n**Workspace:** \`${workspacePath}\`` : "",
    ].join("\n"),
  );

  let missionPlan: string;
  try {
    const resp = await sendWithRetry(
      gateway,
      decomposePrompt,
      coordinator.id,
      sessionKey(coordinator.id, "mission"),
    );
    missionPlan = processMemory(coordinator.id, extractText(resp));
    yield {
      type: "agent_response",
      agentId: coordinator.id,
      agentName: coordName,
      text: missionPlan,
    };
  } catch (err) {
    yield {
      type: "agent_error",
      agentId: coordinator.id,
      agentName: coordName,
      error: String(err),
    };
    yield {
      type: "mission_complete",
      summary: `Mission planning failed: ${err}`,
      teamsCompleted: 0,
      totalTeams: teams.length,
    };
    return;
  }

  // Step 2: Execute each team's work in parallel using MapReduce
  console.log(`[orchestration:mission] Launching ${teams.length} teams in parallel`);

  const teamResults = await Promise.allSettled(
    teams.map(async (team) => {
      const teamCtx: OrchestrationContext = {
        message: `${missionPlan}\n\n---\n\nOriginal mission: "${message}"\n\nYou are part of team **${team.teamName}**. Complete YOUR team's assigned tasks.`,
        agents: team.agents,
        gateway,
        teamId: team.teamId,
        mentionedAgentIds: [],
        workspacePath,
      };

      // Run MapReduce for this team and collect events
      const events: OrchestrationEvent[] = [];
      for await (const event of mapReduce(teamCtx)) {
        events.push(event);
      }

      const summaryEvent = events.find((e) => e.type === "summary");
      const summaryText =
        summaryEvent?.type === "summary" ? summaryEvent.text : "No summary produced.";
      return { team, events, summary: summaryText };
    }),
  );

  // Yield team results
  const successTeams: Array<{ teamName: string; summary: string }> = [];
  for (const result of teamResults) {
    if (result.status === "fulfilled") {
      const { team, events, summary } = result.value;
      yield {
        type: "team_start",
        teamId: team.teamId,
        teamName: team.teamName,
        agentCount: team.agents.length,
      };

      // Forward important events from the team
      for (const event of events) {
        const priority = classifyEventPriority(event);
        if (priority !== "debug") {
          yield event;
        }
      }

      yield { type: "team_complete", teamId: team.teamId, teamName: team.teamName, summary };
      successTeams.push({ teamName: team.teamName, summary });
    } else {
      const idx = teamResults.indexOf(result);
      const team = teams[idx];
      yield {
        type: "team_error",
        teamId: team.teamId,
        teamName: team.teamName,
        error: String(result.reason),
      };
    }
  }

  // Step 3: Coordinator merges all team outputs
  if (successTeams.length > 0) {
    yield {
      type: "agent_thinking",
      agentId: coordinator.id,
      agentName: coordName,
      position: "mission-merge",
    };

    const teamSummaries = successTeams
      .map((t) => `**${t.teamName}:**\n${t.summary}`)
      .join("\n\n---\n\n");

    const mergePrompt = withMemory(
      coordinator.id,
      [
        `## Mission Results — All Teams Reported`,
        ``,
        `Original mission: "${message}"`,
        ``,
        `### Team Deliverables:`,
        teamSummaries,
        ``,
        `---`,
        ``,
        `As Mission Coordinator, produce the **FINAL MISSION REPORT**:`,
        `1. Summary of what each team delivered`,
        `2. Cross-team integration status`,
        `3. Any remaining gaps or follow-ups`,
        `4. Overall mission completion assessment`,
      ].join("\n"),
    );

    try {
      const resp = await sendWithRetry(
        gateway,
        mergePrompt,
        coordinator.id,
        sessionKey(coordinator.id, "mission"),
      );
      const finalReport = processMemory(coordinator.id, extractText(resp));
      yield { type: "cross_team_merge", summary: finalReport };
      yield { type: "summary", agentName: coordName, text: finalReport };

      if (workspacePath) {
        yield { type: "product_ready", workspacePath, summary: finalReport };
      }
    } catch (err) {
      yield {
        type: "agent_error",
        agentId: coordinator.id,
        agentName: coordName,
        error: String(err),
      };
    }
  }

  yield {
    type: "mission_complete",
    summary: `Mission complete: ${successTeams.length}/${teams.length} teams delivered.`,
    teamsCompleted: successTeams.length,
    totalTeams: teams.length,
  };
}
