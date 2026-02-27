# SDLC Process & Governance

# Axtrizen AI Platform

**Version:** 1.0 | **Date:** 2026-02-26

---

## 1. Development Methodology

Axtrizen follows an **Agile-inspired iterative process** adapted for a small, AI-augmented development team. The approach combines:

- **Sprint-based planning** (2-week sprints)
- **Feature-driven development** (epics → stories → tasks)
- **Continuous integration** (build gates on every change)
- **Human-in-the-loop AI** (agents assist but humans approve)

---

## 2. SDLC Phases

### Phase 1: Requirements & Planning

**Inputs:** Product vision, user research, stakeholder feedback
**Outputs:** PRD, Feature Specs, Prioritized backlog

| Activity               | Owner                 | Artifact              |
| ---------------------- | --------------------- | --------------------- |
| Stakeholder interviews | Product Manager       | Interview notes       |
| Requirements gathering | PM + Engineering Lead | `01_PRD.md`           |
| Feature specifications | PM + Tech Lead        | `03_FEATURE_SPECS.md` |
| Technical feasibility  | Engineering Lead      | Spike results         |
| Backlog grooming       | Team                  | Prioritized epic list |

### Phase 2: System Design

**Inputs:** PRD, Feature Specs
**Outputs:** Architecture docs, API contracts, DB schema

| Activity                | Owner             | Artifact                |
| ----------------------- | ----------------- | ----------------------- |
| High-level architecture | Architect         | `02_ARCHITECTURE.md`    |
| Database modeling       | Backend Lead      | `05_DATABASE_SCHEMA.md` |
| API design              | Full-stack        | `04_API_REFERENCE.md`   |
| UI/UX wireframes        | Designer          | `06_UI_UX_SPEC.md`      |
| Security review         | Security Engineer | `09_SECURITY.md`        |

### Phase 3: Implementation

**Inputs:** Design docs, API contracts
**Outputs:** Working software, code review approvals

| Activity                | Owner           | Process                       |
| ----------------------- | --------------- | ----------------------------- |
| Feature branching       | Developer       | `feature/<name>` from `main`  |
| Backend implementation  | Rust Developer  | Implement commands + DB       |
| Frontend implementation | React Developer | Build components + views      |
| Unit test writing       | Developer       | Alongside implementation      |
| Code review             | Peer            | PR-based review (2 approvals) |
| CI validation           | Automated       | Build + test gates            |

### Phase 4: Testing & QA

**Inputs:** Working software, test plan
**Outputs:** Test results, bug reports, test coverage

| Activity            | Owner             | Artifact                 |
| ------------------- | ----------------- | ------------------------ |
| Unit testing        | Developer         | `vitest` + `cargo test`  |
| Integration testing | QA Engineer       | `vitest` with mocks      |
| E2E testing         | QA Engineer       | `wdio` E2E tests         |
| Performance testing | Performance Lead  | Benchmark results        |
| Security testing    | Security Engineer | Penetration test report  |
| UAT                 | Product Manager   | User acceptance sign-off |

### Phase 5: Deployment & Release

**Inputs:** Tested software, release checklist
**Outputs:** Production build, release notes

| Activity                | Owner           | Artifact                     |
| ----------------------- | --------------- | ---------------------------- |
| Release candidate build | Build Engineer  | `.dmg` / `.deb` / `.msi`     |
| Smoke testing           | QA              | Smoke test results           |
| Documentation update    | Tech Writer     | Updated docs                 |
| Version bump            | Release Manager | `Cargo.toml`, `package.json` |
| Changelog               | Release Manager | `CHANGELOG.md`               |
| Production release      | Release Manager | GitHub Release               |

### Phase 6: Operations & Monitoring

**Inputs:** Released software
**Outputs:** Incident reports, performance data

| Activity                 | Owner            | Process                           |
| ------------------------ | ---------------- | --------------------------------- |
| User feedback collection | PM               | GitHub Issues, Discord            |
| Bug triage               | Engineering Lead | Weekly bug bash                   |
| Performance monitoring   | Operations       | Gateway health dashboard          |
| Hotfix process           | On-call Engineer | Hotfix branch → emergency release |

---

## 3. Sprint Cadence

```
Week 1 (Mon-Fri)           Week 2 (Mon-Fri)
├─ Mon: Sprint Planning    ├─ Mon: Standup
├─ Tue: Development        ├─ Tue: Development
├─ Wed: Development        ├─ Wed: Code Freeze
├─ Thu: Development        ├─ Thu: QA + Bug Fix
└─ Fri: Standup + Review   └─ Fri: Sprint Review + Retro
```

### Sprint Ceremonies

| Ceremony         | Duration | Frequency | Participants        |
| ---------------- | -------- | --------- | ------------------- |
| Sprint Planning  | 2 hours  | Bi-weekly | Full team           |
| Daily Standup    | 15 min   | Daily     | Full team           |
| Sprint Review    | 1 hour   | Bi-weekly | Team + stakeholders |
| Retrospective    | 45 min   | Bi-weekly | Full team           |
| Backlog Grooming | 1 hour   | Weekly    | PM + Tech Lead      |

---

## 4. Definition of Done (DoD)

### Feature DoD

- [ ] Code implements all acceptance criteria from the user story
- [ ] Unit tests written and passing (≥ 80% coverage for new code)
- [ ] Integration tests cover critical paths
- [ ] Code reviewed and approved by 2 peers
- [ ] No `cargo check` warnings
- [ ] `vite build` succeeds without errors
- [ ] Documentation updated (if API or behavior changes)
- [ ] Accessibility reviewed (keyboard navigation, aria labels)
- [ ] Performance tested (no regressions)

### Sprint DoD

- [ ] All committed stories meet Feature DoD
- [ ] E2E test suite passes
- [ ] No P0/P1 bugs open
- [ ] Sprint review demo completed
- [ ] Retrospective action items logged

### Release DoD

- [ ] All Sprint DoDs met
- [ ] Production build tested on all target platforms
- [ ] Security checklist reviewed
- [ ] CHANGELOG updated
- [ ] Version bumped
- [ ] Release notes published
- [ ] Documentation published

---

## 5. Branching Strategy

### Git Flow (Simplified)

```
main ──────────●──────────●──────────●── (releases)
                \        / \        /
feature/xyz ─────●──●──●─   \      /
                              \    /
feature/abc ───────────●──●──●──●─
```

### Branch Naming

| Type    | Pattern                   | Example                        |
| ------- | ------------------------- | ------------------------------ |
| Feature | `feature/<ticket>-<desc>` | `feature/FR-04-execute-engine` |
| Bug fix | `fix/<ticket>-<desc>`     | `fix/BUG-123-board-progress`   |
| Hotfix  | `hotfix/<version>-<desc>` | `hotfix/0.1.1-db-crash`        |
| Release | `release/<version>`       | `release/0.2.0`                |

### Commit Message Convention

```
<type>(<scope>): <short description>

[optional body]
[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`

**Examples:**

```
feat(orchestrator): add code file extraction from agent responses
fix(board): progress bars not updating during execution
docs(api): add API reference for planning commands
test(e2e): add project board rendering tests
```

---

## 6. Code Review Process

### Review Checklist

- [ ] Code is readable and well-commented
- [ ] No hardcoded values (use constants/config)
- [ ] Error handling is comprehensive (no unwrap() in production code)
- [ ] SQL queries are parameterized
- [ ] New Tauri commands are registered in `lib.rs`
- [ ] TypeScript types match Rust struct fields exactly
- [ ] Frontend handles loading and error states
- [ ] No console.log left in production code

### Review Flow

```
Developer → PR → Automated CI → 2 Peer Reviews → Merge to main
                    │                    │
                    ├─ cargo check       ├─ Logic review
                    ├─ cargo test        ├─ Security review
                    ├─ vite build        └─ UX review (if UI)
                    └─ vitest run
```

---

## 7. Risk Management

### Risk Register

| Risk                              | Probability | Impact | Mitigation                           |
| --------------------------------- | ----------- | ------ | ------------------------------------ |
| Gateway API breaking changes      | Medium      | High   | Pin Gateway version in dev.sh        |
| AI model API cost overruns        | Medium      | Medium | Usage tracking + alerts              |
| SQLite file corruption            | Low         | High   | WAL mode + backups                   |
| Dependency vulnerabilities        | Medium      | Medium | weekly `pnpm audit` + `cargo audit`  |
| AI agent producing malicious code | Low         | High   | Manager review loop + human approval |
| Data loss on crash                | Low         | Medium | SQLite ACID + WAL                    |

---

## 8. Quality Gates

### Pre-Merge Gates (Automated)

| Gate             | Tool           | Criteria    |
| ---------------- | -------------- | ----------- |
| **Rust Compile** | `cargo check`  | Exit code 0 |
| **Rust Tests**   | `cargo test`   | All pass    |
| **TS Build**     | `vite build`   | Exit code 0 |
| **Unit Tests**   | `vitest run`   | All pass    |
| **Lint**         | `cargo clippy` | No warnings |

### Pre-Release Gates (Manual + Automated)

| Gate            | Owner       | Criteria                   |
| --------------- | ----------- | -------------------------- |
| **E2E Tests**   | QA          | All WebDriverIO tests pass |
| **Performance** | Perf Lead   | No regressions vs baseline |
| **Security**    | Security    | Checklist signed off       |
| **UAT**         | PM          | Stakeholder approval       |
| **Docs**        | Tech Writer | All docs updated           |

---

## 9. Incident Response

### Severity Levels

| Level     | Description             | Response Time | Example                  |
| --------- | ----------------------- | ------------- | ------------------------ |
| **SEV-1** | App crash, data loss    | < 1 hour      | DB corruption on startup |
| **SEV-2** | Core feature broken     | < 4 hours     | Execution engine fails   |
| **SEV-3** | Non-core feature broken | < 24 hours    | Settings page blank      |
| **SEV-4** | Cosmetic / minor        | Next sprint   | Wrong icon color         |

### Response Process

```
1. Reproduce → 2. Triage (severity) → 3. Assign
     │                                      │
     │         SEV-1/2: Hotfix branch       │
     │         SEV-3/4: Backlog             │
     ▼                                      ▼
4. Root Cause Analysis → 5. Fix + Test → 6. Release
                                              │
                                         7. Post-mortem
```

---

## 10. Documentation Standards

### Required Documents per Feature

| Document      | When                         | Template                 |
| ------------- | ---------------------------- | ------------------------ |
| Feature Spec  | Before implementation        | `03_FEATURE_SPECS.md`    |
| API Contract  | Before implementation        | `04_API_REFERENCE.md`    |
| Test Cases    | Before/during implementation | `07_TESTING_STRATEGY.md` |
| Release Notes | At release                   | CHANGELOG.md             |

### Document Review

All documentation changes follow the same PR process as code changes:

1. Author writes/updates docs
2. Technical review for accuracy
3. PM review for completeness
4. Merge to `main`

---

## 11. Maple OSS Message Types & Internal Agent Lifecycle

### 11.1 Standard Message Types

The following Maple OSS P2P message types are used for intra-agent communication during an SDLC phase. These messages flow through the NATS broker and bypass the Rust orchestrator.

| Message Type          | Direction            | Payload                                                                     | Purpose                                                          |
| --------------------- | -------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `AVAILABLE_TASK`      | Manager → Team topic | `{ taskId, title, requirements, priority, estimatedMinutes }`               | Manager broadcasts a newly available task to all idle workers    |
| `TASK_CLAIM`          | Worker → Manager     | `{ taskId, agentId, capabilities, currentLoad }`                            | Worker signals willingness to take the task                      |
| `TASK_ASSIGNMENT`     | Manager → Worker     | `{ taskId, storyId, title, description, acceptanceCriteria, dependencies }` | Manager confirms task assignment to the winning bidder           |
| `STATUS_UPDATE`       | Worker → Team topic  | `{ taskId, agentId, status, percentComplete, blockers? }`                   | Worker reports progress (heartbeat every 30s or on state change) |
| `CODE_REVIEW_REQUEST` | Dev → Reviewer (LIM) | `{ taskId, files: [{path, diff}], commitMessage }`                          | Developer requests peer review over a secure LIM link            |
| `CODE_REVIEW_RESULT`  | Reviewer → Dev (LIM) | `{ taskId, verdict: "APPROVED" \| "CHANGES_REQUESTED", comments[] }`        | Reviewer returns feedback over the same LIM link                 |
| `TASK_COMPLETED`      | Worker → Manager     | `{ taskId, filesCreated[], summary }`                                       | Worker signals task is done and ready for review                 |
| `PHASE_SYNC`          | Manager → Team topic | `{ phase, action: "start" \| "complete", context }`                         | Manager synchronizes all agents at phase boundaries              |
| `RESOURCE_REQUEST`    | Worker → Manager     | `{ agentId, cpu, memory, tokens }`                                          | Worker requests additional resources                             |
| `RESOURCE_GRANT`      | Manager → Worker     | `{ agentId, allocation }`                                                   | Manager grants or denies resource request                        |

### 11.2 Internal Agent Lifecycle (Within a Single SDLC Phase)

Inside each SDLC phase (e.g., "Development"), agents go through the following sub-lifecycle using Maple P2P messaging. The Rust orchestrator only observes phase boundaries — the internal negotiation is P2P.

```
┌─────────────────────────────────────────────────────────────────────┐
│  SDLC Phase (e.g., Development)                                    │
│                                                                     │
│  1. NEGOTIATION                                                     │
│     Manager publishes AVAILABLE_TASK messages                       │
│     Workers respond with TASK_CLAIM based on load + capabilities    │
│     Manager sends TASK_ASSIGNMENT to winning bidder                 │
│     ┌──────────┐    AVAILABLE_TASK    ┌──────────┐                 │
│     │ Manager  │ ──────────────────▶  │ Worker A │                 │
│     │          │    TASK_CLAIM         │          │                 │
│     │          │ ◀──────────────────  │          │                 │
│     │          │    TASK_ASSIGNMENT    │          │                 │
│     │          │ ──────────────────▶  │          │                 │
│     └──────────┘                      └──────────┘                 │
│                                                                     │
│  2. IMPLEMENT                                                       │
│     Worker executes task via Gateway LLM calls                      │
│     Sends STATUS_UPDATE heartbeats to team topic                    │
│     On completion, sends TASK_COMPLETED to Manager                  │
│                                                                     │
│  3. REQUEST REVIEW                                                  │
│     Worker initiates LIM link with Reviewer agent                   │
│     Sends CODE_REVIEW_REQUEST over secure channel                   │
│     Reviewer runs analysis and returns CODE_REVIEW_RESULT           │
│     ┌──────────┐   LIM initiate_link  ┌──────────┐                │
│     │  Dev     │ ──────────────────▶  │ Reviewer │                 │
│     │          │   CODE_REVIEW_REQUEST │          │                 │
│     │          │ ──────────────────▶  │          │                 │
│     │          │   CODE_REVIEW_RESULT  │          │                 │
│     │          │ ◀──────────────────  │          │                 │
│     └──────────┘                      └──────────┘                 │
│                                                                     │
│  4. MERGE / ITERATE                                                 │
│     If APPROVED → Manager moves task to Done, picks next task       │
│     If CHANGES_REQUESTED → Worker revises (max 3 iterations)        │
│     When all tasks complete → Manager sends PHASE_SYNC(complete)    │
│     Rust orchestrator picks up phase completion → advances SDLC     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.3 Rust ↔ Maple Boundary

| Responsibility                                       | Owner             |
| ---------------------------------------------------- | ----------------- |
| Phase transitions (planning → design → dev → review) | Rust orchestrator |
| Human feedback gates                                 | Rust orchestrator |
| Board state (epic/story/task status in SQLite)       | Rust orchestrator |
| Task claiming and load-balancing within a phase      | Maple OSS (P2P)   |
| Code review handshakes                               | Maple OSS (LIM)   |
| Agent heartbeats and progress tracking               | Maple OSS (P2P)   |
| LLM prompt/response streaming                        | OpenClaw Gateway  |
