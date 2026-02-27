# Comprehensive Further Development Plan (Sprints 3–6)

This document outlines the complete plan for the remaining development of the Axtrizen AI platform, moving from our newly completed SDLC execution engine (Sprints 1 and 2) toward a fully autonomous, integrated, and aware multi-agent ecosystem.

It also includes the **Documentation Sync Tasks** required to keep the project's documentation up to date.

---

## Sprint 3: Agent P2P Communication & Role Templates

**Status:** ✅ Complete
**Goal:** Replace the bottleneck of strictly top-down Rust orchestration by enabling the Python agents to negotiate and communicate natively using **Maple OSS**. Introduce agent specialization via templates.

### Epic 1: P2P Agent Communication (Maple OSS)

- **User Story:** As an Agent Manager, I want to use Maple OSS to broadcast task availability to the team so that available Worker agents can claim jobs based on their current load.
  - **Acceptance Criteria:**
    - A lightweight NATS Server is spun up (or Maple’s memory broker is engaged) alongside the OpenClaw gateway.
    - Python Agents import `maple-oss` and initialize connections to the broker.
    - The Manager agent can publish an `AVAILABLE_TASK` message to the team topic.
- **User Story:** As a Developer Agent, I want to request a code review from a Reviewer Agent securely using Maple's Link Identification Mechanism (LIM) so that I don't need the Axtrizen Rust backend to broker the message.
  - **Acceptance Criteria:**
    - Dev and QA agents successfully negotiate a secure LIM connection.
    - The Dev sends a `CODE_REVIEW_REQUEST` over the link.
    - The QA agent returns a `Result<T,E>` type containing feedback or an approval signal.

### Epic 2: Built-in Templates & Skills Ecosystem

- **User Story:** As a user, I want to select predefined Role Templates (e.g., Senior Architect, QA Engineer) when creating an agent so I don't have to manually write system prompts for common roles.
  - **Acceptance Criteria:**
    - The UI offers at least 10 predefined role templates during agent creation.
    - Selecting a template auto-populates the prompt, model selection, and recommended capabilities.
- **User Story:** As a user, I want to browse and install OpenClaw skills natively from the Axtrizen UI so I can give my agents new abilities (like `docker-sandbox` or `github-pr-creator`).
  - **Acceptance Criteria:**
    - A "Skill Marketplace" tab exists in Agent Settings.
    - Clicking "Install" triggers the OpenClaw CLI to fetch and mount the skill to the agent's workspace.

---

## Sprint 4: Mission Control & Enhanced Chat

**Status:** ✅ Complete
**Goal:** Provide the user with a God-view of the multi-agent swarm activity, and upgrade the direct messaging experience.

### Epic 3: Mission Control Dashboard

- **User Story:** As a user, I want a visual "Swim Lane" view in Mission Control so I can see what every agent is doing simultaneously at any given second.
  - **Acceptance Criteria:**
    - The UI displays a real-time grid of all active agents.
    - Each agent card shows its current token consumption, active task, and a pulse indicator if it is currently generating an LLM response.
- **User Story:** As a user, I want a consolidated chronological timeline of all team actions so I can audit how a problem was solved.
  - **Acceptance Criteria:**
    - A master activity feed aggregates messages from the Maple OSS broker and the Rust orchestrator into a single scrolling view.

### Epic 4: Chat Upgrades

- **User Story:** As a user, I want to search through my chat history so I can find past context easily.
  - **Acceptance Criteria:**
    - A global search bar filters all active and historical chats based on keyword matches.
- **User Story:** As a user, I want action buttons on code blocks (Copy, Save to File, Run in Terminal) so I can interact with agent outputs faster.
  - **Acceptance Criteria:**
    - Every Markdown code block renders with action icons in the top right corner.
    - "Run in Terminal" pipes the code to the built-in Tauri terminal component.

---

## Sprint 5: Git Integration & Vector Memory

**Status:** ✅ Complete (memU integrated)
**Goal:** Give agents context persistence across multiple sessions and the ability to autonomously version-control their work.

### Epic 5: Autonomous Version Control

- **User Story:** As a user, I want the agents to automatically commit their code to the project's Git repository when completing a task, so that I have a clean commit history.
  - **Acceptance Criteria:**
    - Before moving a task to "Review", the Dev agent executes `git add` and `git commit -m "[Agent] Implement Feature X"`.
- **User Story:** As a user, I want the Manager agent to automatically open up a Pull Request when a phase is complete, so that human review is identical to standard software engineering workflows.
  - **Acceptance Criteria:**
    - Uses the OpenClaw GitHub/GitLab skills to authenticate and create a PR with a markdown summary of the changes.

### Epic 6: Long-Term Memory (RAG)

- **User Story:** As a user, I want my agents to remember architectural decisions from past projects so they don't repeat the same mistakes.
  - **Acceptance Criteria:**
    - Integration of a local Vector DB (ChromaDB or Qdrant).
    - When a project finishes, the `FINAL_REPORT.md` and key code artifacts are embedded and stored.
    - In future planning phases, the Manager queries the vector DB for related past projects to inject into its context window.

---

## Sprint 6: External Integrations & CI/CD

**Status:** ✅ Complete
**Goal:** Break the platform out of the desktop by linking it to external messaging and continuous delivery pipelines.

### Epic 7: Slack/Discord Teammates

- **User Story:** As a user, I want the Manager agent to post daily standup reports to my company's Slack channel so stakeholders can see progress without opening the Axtrizen app.
  - **Acceptance Criteria:**
    - OAuth configuration for Slack/Discord workspaces.
    - Axtrizen backend uses a CRON job or Phase-End events to dispatch webhook payloads formatted for Slack/Discord.
- **User Story:** As a user, I want to message my agent directly from Slack to answer its blocking questions.
  - **Acceptance Criteria:**
    - Slack bot listens for `@Axtrizen` mentions and pipes the reply directly into the Rust orchestrator's Human Feedback gate.

### Epic 8: CI/CD Pipeline Triggers

- **User Story:** As a User, I want the agents to trigger my test suite and read the results before moving a task to the "Done" column.
  - **Acceptance Criteria:**
    - Agents execute `npm run test` or `cargo test`.
    - If tests fail, the task is automatically bounced back to "In Progress" with the stack trace fed to the agent.
- **User Story:** As a user, I want the agents to run a "Deploy Preview" command so I can see the live web app they just built.
  - **Acceptance Criteria:**
    - Agent executes tunneling tools (like ngrok or local cloudflare tunnels) to expose the local workspace port and returns the URL to the chat.

<br><hr><br>

## ✅ Sprint 4: Scaling Architecture (Completed 2026-02-27)

### Phase 8: Scale to 100+ Agents & 1M+ Users

| Phase                             | Deliverable                                                                             | Status  |
| --------------------------------- | --------------------------------------------------------------------------------------- | ------- |
| **8.1 Parallel Orchestrator**     | `tokio::spawn` + `Semaphore(10)` for dev & review phases                                | ✅ Done |
| **8.2 True P2P Agent Workers**    | `agent_worker.py`, `agent_pool.py` (3-tier auto-scaling)                                | ✅ Done |
| **8.3 Smart Group Communication** | DB tables (`agent_groups`, `group_messages`), 8 Tauri commands, `message_aggregator.py` | ✅ Done |
| **8.4 Production Scale**          | SQLite WAL mode, `synchronous=NORMAL`, 256MB mmap, 20MB cache                           | ✅ Done |

**New files created:** `agent_worker.py`, `agent_pool.py`, `message_aggregator.py`, `commands/agent_groups.rs`  
**Files modified:** `orchestrator.rs`, `db.rs`, `bridge.py`, `lib.rs`, `mod.rs`  
**DB migration:** v8 (3 new tables + indexes)

<br><hr><br>

## ✅ Documentation Gaps (Resolved 2026-02-27)

All documentation updated to v2.0 to reflect Sprints 1-4:

1. **`02_ARCHITECTURE.md`** — ✅ Updated with Maple OSS layer, scaling architecture (4 phases), new modules, system roles table
2. **`03_FEATURE_SPECS.md`** — ✅ Added F12 (Agent Groups & Channels), F13 (Scaling Engine), updated F05 & F07
3. **`05_DATABASE_SCHEMA.md`** — ✅ Added migration v8, 3 new tables, performance config, ER diagram expansion
4. **`04_API_REFERENCE.md`** — Pending: `list_directory`, `open_workspace` commands
5. **`06_UI_UX_SPEC.md`** — Pending: Workspace Files Browser specs
6. **`10_SDLC_PROCESS.md`** — Pending: Maple message type mapping
