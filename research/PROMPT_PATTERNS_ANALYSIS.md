# AI Agent Prompt Patterns — Analysis & Mapping to Axtrizen SDLC

> **Goal**: Identify which techniques from 22+ AI coding tools we can leverage in Axtrizen's multi-agent SDLC orchestration pipeline (Planning → Design → Development → Testing → Deployment).

---

## Our Current SDLC Phases (orchestrator.rs)

| Phase | What Happens Now | Key Weakness |
|-------|-----------------|--------------|
| **Planning** | Manager gets requirements → outputs JSON plan (epics/stories/tasks) | Generic prompt, no structured requirement format, no approval gate |
| **Design** | Each agent proposes → cross-review → manager finalizes | No architecture templates, no formal design doc artifact |
| **Development** | Each agent implements → manager review loop → extract files | Generic "write code" prompt, no contract/protocol between agents |
| **Testing** | Circular peer review → manager final review | No actual test execution, no validation criteria, no structured review |
| **Deployment** | Manager generates final report → saves FINAL_REPORT.md | Report only, no verification, no deployment checklist |

---

## Tool-by-Tool Analysis: What We Can Borrow & Where

### 1. Kiro (AWS) — `USE: Planning + Design + Testing`

**What they have**: 3-phase spec-driven development with EARS requirements, design docs with Mermaid diagrams, and task lists as LLM prompts.

| Pattern | Where to Use in Axtrizen | Impact |
|---------|-------------------------|--------|
| **EARS requirement syntax** (`WHEN [event] THEN [system] SHALL [response]`) | **Planning Phase** — Make the manager output formal requirements before creating tasks | HIGH — Eliminates ambiguous requirements |
| **3-document spec flow** (requirements.md → design.md → tasks.md) | **Planning + Design** — Generate persistent spec artifacts per project | HIGH — Creates traceable documentation |
| **Tasks written as "prompts for code-gen LLM"** | **Planning→Development handoff** — Each task becomes the actual prompt for the dev agent | HIGH — Tasks become directly executable |
| **Approval gates between phases** | **All phases** — Emit `project-feedback-requested` between every phase | MEDIUM — Human-in-the-loop checkpoints |
| **Design doc template**: Overview → Architecture → Components → Data Models → Error Handling → Testing Strategy | **Design Phase** — Require structured design output instead of free-form proposals | HIGH — Consistent, complete designs |
| **Mermaid diagrams in design** | **Design Phase** — Require architecture diagrams in agent proposals | MEDIUM — Visual architecture |

**Implementation**: Replace the generic planning prompt with EARS-formatted requirement generation. Add a design.md template that agents must fill. Convert tasks to executable prompts.

---

### 2. Google Antigravity — `USE: All Phases (Orchestration Pattern)`

**What they have**: PLANNING → EXECUTION → VERIFICATION modal workflow with task.md, implementation_plan.md, walkthrough.md artifacts, and backtracking support.

| Pattern | Where to Use | Impact |
|---------|-------------|--------|
| **3-mode workflow (Plan → Execute → Verify)** with backtracking | **Orchestrator loop** — Allow phases to revert (e.g., development discovers design flaw → back to design) | HIGH — Handles real-world complexity |
| **implementation_plan.md with [NEW]/[MODIFY]/[DELETE] file markers** | **Development Phase** — Agents must declare what files they'll create/modify before writing code | HIGH — Predictable file changes |
| **walkthrough.md as proof of work** | **Testing/Deployment** — Generate a verification document with what was tested and validated | MEDIUM — Quality documentation |
| **ConfidenceScore + ConfidenceJustification** on outputs | **All phases** — Agents report confidence level with each deliverable | MEDIUM — Risk visibility |
| **task.md as living checklist** (`[ ]`, `[/]`, `[x]`) | **Kanban board integration** — Map directly to our board task statuses | HIGH — Already have board |

**Implementation**: Add phase backtracking support to orchestrator loop. Require agents to output planned file changes before coding. Generate walkthrough.md at project completion.

---

### 3. Traycer AI — `USE: Planning Phase`

**What they have**: Pure read-only planning agent that outputs high-level phases referencing actual code symbols.

| Pattern | Where to Use | Impact |
|---------|-------------|--------|
| **Codebase-grounded phases** (reference actual symbols, not abstract concepts) | **Planning Phase** — If workspace has existing code, the planner must reference it | MEDIUM — Context-aware planning |
| **Anti-assumption pattern** ("never assume a library is available, verify against package.json") | **Planning + Development** — Agents verify available dependencies before suggesting them | HIGH — Prevents broken code |
| **One question at a time** for clarification | **Feedback checkpoints** — Ask focused, single questions instead of overwhelming the user | MEDIUM — Better UX |

**Implementation**: Enhance planning prompt to scan workspace for existing dependencies and code before planning. Add dependency verification step.

---

### 4. Devin AI — `USE: All Phases`

**What they have**: Mandatory `<think>` scratchpad with 10 trigger scenarios, plan-then-execute architecture, `<find_and_edit>` batch refactoring.

| Pattern | Where to Use | Impact |
|---------|-------------|--------|
| **Mandatory `<think>` before critical decisions** (10 triggers: before git, before editing, before completion report) | **All phases** — Inject "think step-by-step" instructions at critical moments in each phase | HIGH — Better reasoning |
| **Pre-submit checks** ("run lint, tests before submitting") | **Testing Phase** — Agents must specify and run actual verification commands | HIGH — Real quality gates |
| **LSP-native tools** (go_to_definition, go_to_references, hover_symbol) | **Development + Testing** — If connected to a code intelligence backend, agents can navigate code | MEDIUM — Smarter code understanding |
| **3-attempt CI limit before escalating** | **Testing Phase** — Limit review revision rounds, escalate to human | MEDIUM — Prevents infinite loops |
| **Branch naming convention** (`devin/{timestamp}-{feature-name}`) | **Development Phase** — Auto-create feature branches per agent | LOW BUT nice |

**Implementation**: Wrap each agent prompt with a thinking preamble. Add actual test command execution in the testing phase. Limit review rounds to 3.

---

### 5. Manus AI — `USE: Planning + Development + Testing`

**What they have**: 3-module architecture (Planner, Knowledge, Datasource), todo.md as persistent state, information priority hierarchy.

| Pattern | Where to Use | Impact |
|---------|-------------|--------|
| **Planner module** (numbered pseudocode execution steps) | **Planning Phase** — Output numbered execution steps, not just epics/stories | HIGH — Actionable plans |
| **Knowledge module** (scoped best-practice knowledge injected as events) | **All phases** — Inject domain-specific best practices per project type (web app, API, CLI, etc.) | HIGH — Project-type-aware prompts |
| **Information priority hierarchy** (API data > web search > model knowledge) | **Development Phase** — Agents prefer reading existing code > searching docs > guessing | HIGH — Better code quality |
| **todo.md as persistent execution tracker** updated in real-time | **All phases** — Persist a task checklist file in workspace, map to Kanban board | MEDIUM — Already have board |
| **`notify` (non-blocking) vs `ask` (blocking)** messages | **Feedback system** — Distinguish "FYI" updates from "I need your input" requests | MEDIUM — Better UX |
| **Draft-then-compile for long documents** | **Development Phase** — For large codebases, agents write sections then assemble | MEDIUM — Better code organization |

**Implementation**: Add project-type detection (web/API/CLI/mobile). Inject corresponding best practices. Use information priority in dev prompts.

---

### 6. Qoder — `USE: Design + Development + Testing`

**What they have**: 9 specialized design templates by project type, Quest Design→Quest Action pipeline, mandatory validation after every code change.

| Pattern | Where to Use | Impact |
|---------|-------------|--------|
| **9 design document templates** (Backend, Frontend, Full-Stack, Library, CLI, Mobile, Desktop, etc.) | **Design Phase** — Select template based on detected project type | HIGH — Professional, complete design docs |
| **Design→Action pipeline** (design agent produces doc → execution agent consumes it) | **Design→Development handoff** — Design output becomes the contract for development | HIGH — Traceable implementation |
| **Mandatory `get_problems` after every code change** | **Development Phase** — After each agent submits code, run validation | HIGH — Catch errors immediately |
| **No-code design documents** (only modeling languages, UML, Mermaid) | **Design Phase** — Force design docs to be abstract, not implementation | MEDIUM — Better architecture thinking |
| **Memory management** (`user_prefer`, `project_info`, `project_specification`, `experience_lessons`) | **Cross-session** — Persist project learnings for future runs | MEDIUM — Improves over time |
| **Line budget constraints** (600 lines max per file creation) | **Development Phase** — Prevent agents from generating monster files | MEDIUM — Code quality |

**Implementation**: Add project type detection. Use matching Qoder design template. Enforce validation after each code file. Cap file sizes.

---

### 7. Emergent (E1) — `USE: Development + Testing`

**What they have**: Mock-first frontend, contract file (`contracts.md`), specialized testing subagents, screenshot-based visual QA.

| Pattern | Where to Use | Impact |
|---------|-------------|--------|
| **Mock-first frontend development** (`mock.js` → real backend later) | **Development Phase** — For web projects, build UI with mock data first | HIGH — Faster visible progress |
| **Contract file (`/app/contracts.md`)** as integration protocol | **Development Phase** — Agents agree on API contracts before implementing | HIGH — Prevents integration failures |
| **Specialized testing subagent** (`deep_testing_backend_v2`) | **Testing Phase** — Use a dedicated testing agent persona | MEDIUM — Better test quality |
| **Screenshot-based visual QA** (padding, alignment, colors) | **Testing Phase** — For web projects, visual verification | MEDIUM — Catches UI bugs |
| **≤300-400 lines per component** constraint | **Development Phase** — Forces modular code from agents | MEDIUM — Code quality |
| **"Aha moment" design** — get a working frontend ASAP | **Development prioritization** — Frontend-first for user-facing projects | HIGH — Better demos |
| **Test result file** (`test_result.md`) as persistent cumulative tracker | **Testing Phase** — Persistent test result tracking across iterations | MEDIUM — Audit trail |

**Implementation**: For web projects, adopt mock-first development order. Add contracts.md generation in design phase. Use dedicated test agent.

---

### 8. Lovable — `USE: Planning + Development`

**What they have**: Discussion-first default, action-word gating, design system enforcement, SEO auto-injection.

| Pattern | Where to Use | Impact |
|---------|-------------|--------|
| **Discussion-first default with action-word gate** | **Planning Phase** — Clarify requirements thoroughly before jumping to implementation | MEDIUM — Better requirements |
| **Anti-overengineering rule** ("avoid fallbacks, edge cases not requested") | **Development Phase** — Agents build only what's requested | HIGH — Prevents scope creep |
| **Design system enforcement** (semantic tokens, HSL colors, config-driven) | **Development Phase** — For web projects, inject design system constraints | MEDIUM — Consistent UI |
| **First impression optimization** (special handling for initial output) | **Development Phase** — First agent output should be the most polished | LOW — Nice to have |
| **Debug-first rule** ("use debugging tools FIRST before modifying code") | **Testing Phase** — Review agents must diagnose before suggesting fixes | MEDIUM — Better reviews |

**Implementation**: Add "scope guard" to development prompts preventing feature creep. For web projects, inject design system tokens.

---

### 9. Cursor 2.0 — `USE: Development + Testing`

**What they have**: Memory tool, todo tracking, lint integration, 3-attempt rule, sketched edit delegation.

| Pattern | Where to Use | Impact |
|---------|-------------|--------|
| **3-attempt rule** on lint/test fixing | **Testing Phase** — Cap revision rounds, escalate to human if stuck | HIGH — Prevents infinite loops |
| **Read-before-edit** | **Development Phase** — Agents must read existing workspace files before modifying | HIGH — Context-aware development |
| **Persistent cross-session memory** | **Cross-project** — Store lessons learned from past projects | MEDIUM — Improves over time |
| **Sketched edit delegation** to weaker model | **Development Phase** — Use cheaper model for applying known edits | LOW — Cost optimization |

---

### 10. Claude Code 2.0 — `USE: All Phases`

**What they have**: Sub-agent architecture, TodoWrite with `activeForm`, Plan Mode with gating, extreme brevity.

| Pattern | Where to Use | Impact |
|---------|-------------|--------|
| **Sub-agent architecture** (Task tool → specialized agents) | **All phases** — Our current multi-agent approach, validates the pattern | VALIDATES our approach |
| **TodoWrite with `activeForm`** (present-continuous for UI) | **Kanban board** — Show "Implementing auth..." instead of "Implement auth" | MEDIUM — Better UX |
| **ExitPlanMode gating** (plan → approval → execute) | **Planning→Design gate** — Require explicit approval before moving to execution | HIGH — Quality gate |
| **Read-before-edit rule** (enforced via tool error) | **Development Phase** — Make agents fail if they try to edit without reading first | HIGH — Prevents blind edits |

---

### 11. Windsurf — `USE: All Phases`

**What they have**: Plan mastermind, persistent memory DB, safety protocol for commands, debugging protocol.

| Pattern | Where to Use | Impact |
|---------|-------------|--------|
| **Plan mastermind** (update plan before AND after work) | **Orchestrator** — Update Kanban board at phase start AND end | HIGH — Already partially doing this |
| **Persistent memory DB** for context across sessions | **Project state** — Store agent learnings, architecture decisions | MEDIUM — Cross-session |
| **Debugging protocol** (root cause first, add logging, add tests) | **Testing Phase** — Structured debugging approach for review agents | HIGH — Better code review |
| **Safety protocol** (cannot override even with user request) | **Development Phase** — Prevent agents from doing destructive operations | LOW — Security |

---

### 12. Replit — `USE: Development Phase`

**What they have**: Proposal-based architecture, tool nudging, dangerous command classification.

| Pattern | Where to Use | Impact |
|---------|-------------|--------|
| **Proposal-based edits** (every change is reviewable) | **Development Phase** — Agents propose file changes, manager approves before writing | MEDIUM — Quality gate |
| **Dangerous command flagging** | **Development Phase** — Flag potentially destructive shell commands | LOW — Security |

---

### 13. v0 (Vercel) — `USE: Development`

**What they have**: Design token system, Next.js awareness, GenerateDesignInspiration subagent, change comment convention.

| Pattern | Where to Use | Impact |
|---------|-------------|--------|
| **Change comment convention** (`// <CHANGE> description`) | **Development Phase** — Agents annotate what they changed inline | MEDIUM — Easier reviews |
| **Design inspiration subagent** called before design work | **Design Phase** — Generate visual direction before building UI | LOW — Nice to have |

---

### 14. Same.dev — `USE: Development + Deployment`

**What they have**: Versioning+deployment as first-class steps, suggestion tool for next iterations, linter integration.

| Pattern | Where to Use | Impact |
|---------|-------------|--------|
| **Versioning as first-class workflow step** | **Deployment Phase** — Auto-version the project output | MEDIUM — Professional delivery |
| **Suggestions tool for next iteration** | **Deployment Phase** — Final report includes "Next Steps" recommendations | Already doing this |
| **3-loop linter cap** | **Testing Phase** — Same as Cursor's 3-attempt rule | HIGH — Prevents loops |

---

## Priority Implementation Roadmap

### Phase 1: Quick Wins (High Impact, Low Effort)

1. **Fix phaseOrder mismatch** → Already done ("planning" not "requirements")
2. **Add EARS requirements to planning prompt** → Change the manager prompt to output EARS-format requirements alongside the JSON plan
3. **Add thinking preamble** → Inject "Think step-by-step about..." before each critical agent prompt
4. **Add 3-attempt limit on review rounds** → Cap `manager_review_loop` iterations
5. **Add anti-overengineering guardrail** → "Build ONLY what's in the requirements, no extras"

### Phase 2: Structured Artifacts (High Impact, Medium Effort)

6. **Project type detection** → Detect web/API/CLI/mobile from requirements, inject specialized design template
7. **Design document template** → Instead of free-form "propose your approach", use Kiro/Qoder structured templates
8. **Contract file generation** → During design phase, generate `CONTRACTS.md` with API endpoints, data models
9. **Tasks as executable prompts** → Rewrite planning output so each task IS the prompt for the dev agent
10. **File change manifests** → Agents must declare files they'll create/modify before coding

### Phase 3: Advanced Patterns (Medium Impact, Higher Effort)

11. **Phase backtracking** → Allow development to trigger design re-entry if fundamental issues found
12. **Mock-first frontend** → For web projects, build UI with mock data first, then backend
13. **Specialized testing agent** → Separate reviewer persona from development agents
14. **Post-project walkthrough.md** → Auto-generate proof-of-work document
15. **Cross-session memory** → Store project learnings for future executions

---

## Detailed Prompt Enhancements Per Phase

### Planning Phase — Enhanced Prompt

**Borrowed from**: Kiro (EARS), Manus (planner module), Traycer (codebase grounding), Devin (think tool)

```
Current: "Create a structured implementation plan with JSON epics/stories/tasks"

Enhanced additions:
- "First, THINK step-by-step about the requirements. What are the core features? What are the risks?"
- "Output formal requirements using EARS syntax:
   WHEN [trigger event] THEN [system] SHALL [expected behavior]
   IF [precondition] THEN [system] SHALL [behavior]"
- "Detect the project type (web app / API / CLI / mobile / library) and note it"
- "For each task, write it as an actionable prompt that a coding AI could execute directly"
- "Include only what's explicitly requested. Do NOT add features the user didn't ask for"
```

### Design Phase — Enhanced Prompt

**Borrowed from**: Qoder (templates), Kiro (design doc), Emergent (contracts), Antigravity (implementation_plan.md)

```
Current: "What's your proposed approach? How would you design your part?"

Enhanced additions:
- Use project-type-specific template:
  Web: UI/UX → Components → Routes → State Management → API Layer → Data Models
  API: Architecture → Endpoints → Data Models → Middleware → Error Handling → Auth
  CLI: Command Structure → Input/Output → Error Handling → Config Management
- "You MUST include a Mermaid architecture diagram"
- "Declare ALL files you plan to create/modify with [NEW]/[MODIFY] markers"
- "Define API contracts: endpoints, request/response shapes, error codes"
- "Do NOT include any code — only architecture, models, and interfaces"
```

### Development Phase — Enhanced Prompt

**Borrowed from**: Emergent (mock-first, contracts), Lovable (anti-overengineering), Cursor (read-before-edit), Qoder (validation)

```
Current: "Implement your assigned tasks. Write REAL, COMPLETE, PRODUCTION-READY code."

Enhanced additions:
- "Before writing code, READ existing files in the workspace to understand the current state"
- "Follow the contracts and design doc from the previous phase exactly"
- "Each file MUST be ≤400 lines. Break larger features into multiple files"
- "Annotate changes with // <CHANGE> comments explaining what you added"
- "Build ONLY what's in the requirements. Do NOT add unrequested features, fallbacks, or edge cases"
- "Verify that all imports reference real packages from the project's dependency file"
- For web projects: "Build the frontend with mock data first, then add real API calls"
```

### Testing Phase — Enhanced Prompt

**Borrowed from**: Devin (pre-submit checks), Windsurf (debugging protocol), Cursor (3-attempt rule), Emergent (test agent)

```
Current: "Review @agent's implementation. Check quality, bugs, suggestions."

Enhanced additions:
- "Follow this debugging protocol:
  1. Identify the ROOT CAUSE, not symptoms
  2. Check for missing imports, undefined variables, type mismatches
  3. Verify all API contracts are satisfied
  4. Check for security issues (injection, exposed secrets, missing auth)
  5. Verify error handling exists for all failure paths"
- "Rate severity: CRITICAL (blocks deployment) / MAJOR (bugs) / MINOR (style/naming)"
- "After 3 rounds of revisions, escalate unresolved issues to the human"
- "Output a structured review:
  ## Approved / Changes Requested
  ### Critical Issues (0)
  ### Major Issues (0)
  ### Minor Issues (0)
  ### What Went Well"
```

### Deployment Phase — Enhanced Prompt

**Borrowed from**: Antigravity (walkthrough.md), Same (versioning), Emergent (test results)

```
Current: "Generate a Final Deliverables Report"

Enhanced additions:
- "Include a VERIFICATION section listing every test/check that was performed"
- "Include a dependency manifest — all packages and their versions"
- "Generate setup instructions that are copy-pasteable (not generic)"
- "List ALL files created with line counts and brief descriptions"
- "Include architecture diagram (Mermaid) of what was built"
- "Rate project completeness: what % of requirements were fully implemented?"
```

---

## Summary: Top 10 Patterns By Impact

| # | Pattern | Source | Our Phase | Why |
|---|---------|--------|-----------|-----|
| 1 | EARS requirement syntax | Kiro | Planning | Eliminates ambiguous requirements |
| 2 | Project-type-aware design templates | Qoder | Design | Professional, complete designs |
| 3 | Tasks as executable prompts | Kiro | Planning→Dev | Tasks become directly actionable |
| 4 | Contract file (contracts.md) | Emergent | Design→Dev | Prevents integration failures |
| 5 | Mandatory think-before-act | Devin | All | Better reasoning at critical moments |
| 6 | Structured code review format | Devin + Windsurf | Testing | Consistent, actionable reviews |
| 7 | 3-attempt revision limit | Cursor + Same | Testing | Prevents infinite review loops |
| 8 | Anti-overengineering guardrail | Lovable | Development | Prevents scope creep |
| 9 | File change manifest ([NEW]/[MODIFY]) | Antigravity | Development | Predictable changes |
| 10 | Phase backtracking support | Antigravity | Orchestrator | Handles real-world complexity |
