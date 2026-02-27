# Product Requirements Document (PRD)

# Axtrizen AI — Multi-Agent Orchestration Platform

**Document Version:** 1.0
**Author:** Axtrizen Engineering
**Date:** 2026-02-26
**Status:** Living Document
**Classification:** Internal — Confidential

---

## 1. Executive Summary

Axtrizen AI is a desktop-native multi-agent orchestration platform that enables humans to assemble teams of AI agents, assign them software projects, and watch them autonomously execute the full Software Development Lifecycle (SDLC) — from requirements gathering through deployment — with real-time human oversight and intervention capabilities.

Built as a Tauri 2.0 native application with a Rust backend and React/TypeScript frontend, Axtrizen connects to the OpenClaw Gateway for AI agent lifecycle management, communication, and tool execution.

### Vision Statement

> _"A Jira-like command center where AI agent teams autonomously build software while humans retain full oversight, feedback loops, and final approval."_

### Target Users

| Persona                       | Description                                                |
| ----------------------------- | ---------------------------------------------------------- |
| **Solo Developer**            | Individual using AI agents to accelerate personal projects |
| **Team Lead**                 | Manager assembling agent teams for rapid prototyping       |
| **Enterprise Architect**      | Overseeing multi-agent workflows in CI/CD pipelines        |
| **Non-Technical Stakeholder** | Reviewing deliverables without understanding code          |

---

## 2. Problem Statement

### Current Pain Points

1. **Fragmented AI tooling** — Developers juggle multiple AI assistants (ChatGPT, Copilot, Claude) with no unified orchestration
2. **No project management for AI** — Existing tools lack project-level structure (epics, stories, tasks) for AI-generated work
3. **Black-box execution** — AI agents work invisibly; humans can't observe or intervene during execution
4. **No deliverables pipeline** — AI-generated code exists only in chat, never saved as actual files
5. **Manual handoff** — No structured way to review, approve, and iterate on AI-generated work

### How Axtrizen Solves This

- **Unified dashboard** with real-time visibility into all agent activity
- **Hierarchical project management** (Epics → Stories → Tasks → Sprints)
- **Autonomous SDLC execution** with Manager agent orchestrating Worker agents
- **Human-in-the-loop** feedback at every phase transition
- **Workspace file generation** — code extracted from agent responses and saved as real files
- **Final Deliverables Report** — structured summary of what was built, how to run it, and next steps

---

## 3. Product Scope

### In Scope (v0.1.0)

| Feature                                                               | Priority |
| --------------------------------------------------------------------- | -------- |
| Agent CRUD (Create, Read, Update, Delete)                             | P0       |
| Team composition with Manager + Workers                               | P0       |
| Project creation with requirements                                    | P0       |
| Autonomous SDLC execution (Planning → Design → Development → Testing) | P0       |
| Real-time Kanban/List board with progress tracking                    | P0       |
| Human feedback loops at phase transitions                             | P0       |
| Chat interface (1:1 agent + team group chat)                          | P0       |
| Final Deliverables Report for human review                            | P0       |
| Workspace file generation from agent code                             | P0       |
| Dashboard with system metrics                                         | P1       |
| Mission Control (multi-agent monitoring)                              | P1       |
| Agent settings (SOUL.md, IDENTITY.md)                                 | P1       |
| Embedded terminal (PTY)                                               | P2       |
| Agent activity metrics & cost tracking                                | P2       |

### Out of Scope (Future)

- Cloud-hosted multi-tenant deployment
- Slack/Discord channel integration
- Visual UI builder for agent workflows
- Git integration (auto-commit, PR creation)
- CI/CD pipeline triggers
- Multi-language support (i18n)

---

## 4. Functional Requirements

### FR-01: Agent Management

| ID      | Requirement                                                        | Priority |
| ------- | ------------------------------------------------------------------ | -------- |
| FR-01.1 | User can create an agent with name, role, and model selection      | P0       |
| FR-01.2 | User can view all agents with real-time status (idle/active/error) | P0       |
| FR-01.3 | User can edit agent configuration files (SOUL.md, IDENTITY.md)     | P1       |
| FR-01.4 | User can delete an agent with confirmation dialog                  | P0       |
| FR-01.5 | Agent status auto-refreshes from Gateway every 10 seconds          | P0       |

### FR-02: Team Composition

| ID      | Requirement                                            | Priority |
| ------- | ------------------------------------------------------ | -------- |
| FR-02.1 | User can create a team with name and description       | P0       |
| FR-02.2 | User can assign a Manager agent to the team            | P0       |
| FR-02.3 | User can add/remove Worker agents as team members      | P0       |
| FR-02.4 | Teams support group chat for inter-agent communication | P0       |

### FR-03: Project Management

| ID      | Requirement                                                        | Priority |
| ------- | ------------------------------------------------------------------ | -------- |
| FR-03.1 | User can create a project with name, description, and requirements | P0       |
| FR-03.2 | Project is assigned to a team for execution                        | P0       |
| FR-03.3 | Project workspace directory is auto-created                        | P0       |
| FR-03.4 | Project displays SDLC phase and progress in real-time              | P0       |
| FR-03.5 | User can edit requirements and provide feedback                    | P0       |

### FR-04: SDLC Execution Engine

| ID      | Requirement                                                              | Priority |
| ------- | ------------------------------------------------------------------------ | -------- |
| FR-04.1 | Manager orchestrates 4 phases: Planning → Design → Development → Testing | P0       |
| FR-04.2 | Planning phase generates project plan as JSON (epics, stories, tasks)    | P0       |
| FR-04.3 | Development phase extracts code from agent responses and saves as files  | P0       |
| FR-04.4 | Manager reviews each agent's work with revision loop (up to 2 rounds)    | P0       |
| FR-04.5 | Human feedback requested between phases (approve/revise)                 | P0       |
| FR-04.6 | Final Deliverables Report generated at completion                        | P0       |
| FR-04.7 | Task statuses update in real-time during execution                       | P0       |

### FR-05: Project Board (Kanban/List)

| ID      | Requirement                                                  | Priority |
| ------- | ------------------------------------------------------------ | -------- |
| FR-05.1 | Board displays epics, stories, and tasks in Kanban columns   | P0       |
| FR-05.2 | Board supports List view with hierarchical tree              | P0       |
| FR-05.3 | Status columns: Backlog → Todo → In Progress → Review → Done | P0       |
| FR-05.4 | Board auto-refreshes every 5 seconds                         | P0       |
| FR-05.5 | Sprint filtering support                                     | P1       |
| FR-05.6 | Progress bars per epic showing % completion                  | P0       |

### FR-06: Chat Interface

| ID      | Requirement                                   | Priority |
| ------- | --------------------------------------------- | -------- |
| FR-06.1 | 1:1 chat with individual agents               | P0       |
| FR-06.2 | Team group chat for multi-agent conversations | P0       |
| FR-06.3 | Chat history persisted in local SQLite        | P0       |
| FR-06.4 | Markdown rendering with syntax highlighting   | P0       |
| FR-06.5 | Chat search across all conversations          | P1       |

---

## 5. Non-Functional Requirements

| Category          | Requirement                    | Target                          |
| ----------------- | ------------------------------ | ------------------------------- |
| **Performance**   | Board refresh latency          | < 200ms                         |
| **Performance**   | Gateway WebSocket reconnect    | < 3 seconds                     |
| **Reliability**   | SQLite data persistence        | 100% (local disk)               |
| **Reliability**   | Automatic Gateway reconnection | Yes, with exponential backoff   |
| **Security**      | Data at rest                   | Local SQLite, no cloud sync     |
| **Security**      | Gateway authentication         | Token-based handshake           |
| **Usability**     | Dark theme default             | Yes, with light toggle          |
| **Usability**     | Keyboard shortcuts             | Planned for v0.2                |
| **Scalability**   | Max concurrent agents          | Limited by Gateway (default 10) |
| **Compatibility** | macOS                          | Primary target                  |
| **Compatibility** | Linux/Windows                  | Supported via Tauri             |

---

## 6. Success Metrics

| Metric                      | Target                                      | Measurement      |
| --------------------------- | ------------------------------------------- | ---------------- |
| Project completion rate     | > 80% of started projects reach "completed" | DB query         |
| Files generated per project | > 5 files average                           | Workspace scan   |
| User feedback response time | < 30s between phase transitions             | Event timestamps |
| Board refresh accuracy      | 100% consistency with DB state              | E2E tests        |
| Agent utilization           | > 60% active time during execution          | Activity metrics |

---

## 7. Assumptions & Dependencies

### Assumptions

1. OpenClaw Gateway is installed and running on `ws://127.0.0.1:18789`
2. At least one AI model provider (Claude, GPT-4, etc.) is configured
3. User has macOS 12+ (primary), Linux, or Windows
4. Internet connectivity for AI model API calls

### Dependencies

| Dependency        | Version      | Purpose                               |
| ----------------- | ------------ | ------------------------------------- |
| OpenClaw Gateway  | Latest       | Agent lifecycle, chat, tool execution |
| Tauri             | 2.x          | Native desktop app framework          |
| Rust              | 2021 edition | Backend logic, FFI                    |
| React             | 18.3.1       | Frontend UI                           |
| SQLite (rusqlite) | 0.38.0       | Local data persistence                |
| Node.js           | 18+          | Frontend build tooling                |

---

## 8. Release Plan

| Version      | Milestone                          | Target  |
| ------------ | ---------------------------------- | ------- |
| v0.1.0-alpha | Core SDLC execution + Board + Chat | Current |
| v0.1.0-beta  | Code quality review + bug fixes    | Q2 2026 |
| v0.2.0       | Git integration + CI/CD triggers   | Q3 2026 |
| v0.3.0       | Multi-tenant cloud deployment      | Q4 2026 |
| v1.0.0       | Enterprise GA                      | 2027    |

---

## Appendix A: Glossary

| Term          | Definition                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| **Agent**     | An AI entity managed by OpenClaw Gateway with identity, tools, and memory  |
| **Team**      | A group of agents with a designated Manager                                |
| **Manager**   | The orchestrating agent that coordinates Workers through SDLC phases       |
| **Worker**    | An agent assigned to implement specific tasks                              |
| **Epic**      | A large feature group containing multiple user stories                     |
| **Story**     | A user-facing requirement with acceptance criteria                         |
| **Task**      | A granular work item assigned to an agent within a story                   |
| **Sprint**    | A time-boxed iteration (future: auto-assigned)                             |
| **Gateway**   | The OpenClaw runtime that manages agent lifecycle and communication        |
| **Workspace** | A local directory where project files are generated                        |
| **SDLC**      | Software Development Lifecycle (Planning → Design → Development → Testing) |
