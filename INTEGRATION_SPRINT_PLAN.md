# Integration Sprint Plan — Closing All Gaps

> **Date:** 2026-02-27
> **Methodology:** SDLC — Requirements → Design → Implementation → Testing → Verification
> **Goal:** Wire together ALL backend capabilities that exist but aren't connected, completing the full integration loop.

---

## Current State Assessment

### What's BUILT but NOT CONNECTED

| #   | Feature                | Backend                                            | Frontend                        | Orchestrator                                 | Gap                                                                             |
| --- | ---------------------- | -------------------------------------------------- | ------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | **Workflow Templates** | ✅ 8 templates, DB-seeded, CRUD commands           | ✅ Dynamic phase rendering      | ✅ Uses templates to drive phases            | ❌ **No template picker** in project creation — defaults to SDLC                |
| 2   | **Maple P2P**          | ✅ Full bridge (359 lines), 8 Tauri commands       | ✅ API wrappers                 | ❌ Orchestrator uses Gateway HTTP, not Maple | ❌ **Not used in orchestration** — parallel dead layer                          |
| 3   | **Git Integration**    | ✅ 9 git commands (commit, branch, push, PR, diff) | ✅ Service layer + API wrappers | ❌ Not called                                | ❌ **Agents don't auto-commit or create PRs**                                   |
| 4   | **CI/CD Pipeline**     | ✅ Test runner + deploy preview                    | ✅ Service layer + API wrappers | ❌ Not called                                | ❌ **Agents don't run tests before marking tasks done**                         |
| 5   | **Slack/Discord**      | ✅ Webhook messaging + config (313 lines)          | ✅ Settings UI + API wrappers   | ❌ Not called                                | ❌ **No phase-end notifications** to external channels                          |
| 6   | **memU Vector Memory** | ✅ Full via Maple sidecar                          | ✅ RAG service (509 lines)      | ❌ Not called                                | ❌ **No memory retrieval** during planning, **no memory storage** on completion |
| 7   | **Custom Templates**   | ✅ DB supports custom templates                    | ❌ No editor UI                 | N/A                                          | ❌ **Users can't create templates** from the UI                                 |
| 8   | **Skill Marketplace**  | ✅ Gateway proxy commands                          | ✅ Hardcoded catalog UI         | N/A                                          | ⚠️ Catalog is hardcoded, not fetched from Gateway                               |

---

## Sprint Breakdown (SDLC Process)

### Phase 1: Requirements & Design (This Plan)

**P1.1 — Template Picker in Project Creation**

- **Requirement:** When creating a project, user picks a workflow template
- **Design:** Add a template selector (dropdown or card grid) between project name and requirements fields
- **Impact:** Enables domain-agnostic workflows (marketing, legal, HR, etc.)
- **Files:** `ProjectsView.tsx` (creation form), `tauri-api.ts` (already has `getWorkflowTemplates`)

**P1.2 — Orchestrator ↔ Git Auto-Commit**

- **Requirement:** After development phase, auto-commit agent-created files to git
- **Design:** Call `git_commit()` after `extract_and_save_code_files()` in `run_development_phase()`
- **Impact:** Clean commit history with "[Agent] Implement X" messages
- **Files:** `orchestrator.rs`, `commands/git.rs`

**P1.3 — Orchestrator ↔ CI/CD**

- **Requirement:** Before marking review phase done, run project test suite
- **Design:** Call `ci_run_tests()` at end of `run_review_phase()`; if tests fail, feed errors back to agent
- **Impact:** Agents produce verified, tested code
- **Files:** `orchestrator.rs`, `commands/cicd.rs`

**P1.4 — Orchestrator ↔ Slack/Discord Notifications**

- **Requirement:** Send phase-start and project-complete notifications to configured channels
- **Design:** At each phase transition + final report, call `slack_send()`/`discord_send()` if configured
- **Impact:** Stakeholders see progress without opening the app
- **Files:** `orchestrator.rs`, `commands/integrations.rs`

**P1.5 — Orchestrator ↔ memU Memory**

- **Requirement:** (a) On project completion, store FINAL_REPORT.md + key artifacts in vector memory. (b) During planning, query memory for related past projects.
- **Design:** Call `memu_memorize()` after saving final report; call `memu_retrieve()` at start of planning phase and inject into manager's context
- **Impact:** Agents learn from past projects
- **Files:** `orchestrator.rs`, `commands/memu.rs`

**P1.6 — Custom Template Editor UI**

- **Requirement:** Users can create/edit workflow templates from the UI
- **Design:** Modal/page with phase editor, prompt template fields, board label config
- **Impact:** Users can define custom workflows without editing code
- **Files:** New `WorkflowTemplateEditor.tsx`, `ProjectsView.tsx` or Settings

---

### Phase 2: Implementation Order

| Priority | Task                                | Effort | Dependencies                           |
| -------- | ----------------------------------- | ------ | -------------------------------------- |
| **P0**   | Template picker in project creation | 1h     | None                                   |
| **P1**   | Git auto-commit in dev phase        | 1h     | Template picker (needs workspace_path) |
| **P2**   | CI/CD test run in review phase      | 1h     | Git (tests from committed files)       |
| **P3**   | Slack/Discord phase notifications   | 30m    | None                                   |
| **P4**   | memU memory store/retrieve          | 1h     | Maple broker must be running           |
| **P5**   | Custom template editor UI           | 2h     | Template picker done                   |

---

### Phase 3: Verification Criteria

- [x] `cargo check` passes on Rust backend ✅
- [x] No TypeScript errors in frontend ✅
- [x] Project creation shows template picker with 8+ templates ✅
- [x] Orchestrator calls git commit after saving code files ✅
- [x] Orchestrator runs tests during review phase ✅
- [x] Configured Slack/Discord channels receive phase notifications ✅
- [x] memU stores final report + retrieves context during planning ✅
- [x] Custom template editor UI in Settings → Workflows tab ✅

---

### Phase 4: Implementation Summary (Completed)

**Files Modified:**

- `orchestrator.rs` — Added 6 integration helpers (`git_run`, `auto_git_commit`, `run_tests`, `notify_external_channels`, `memu_store`, `memu_retrieve`) + wired into dev phase (git commit after file save), review phase (CI/CD before manager review), phase transitions (Slack/Discord notifications), planning phase (memU memory retrieval), completion (memU storage + final git commit + Slack/Discord)
- `ProjectsView.tsx` — Added template picker card grid in project creation form
- `SettingsView.tsx` — Added "Workflows" tab with WorkflowTemplateEditor component
- `settings/WorkflowTemplateEditor.tsx` — New component: template inspector, phase editor (reorder, add/remove, edit prompts), board label editor, phase flow preview

---

### Phase 5: Critical Bug Fixes (Completed 2026-02-28)

**Bug 1: Agent Delete Hangs on Second Deletion**

- **Root Cause (Layer 1):** `config-reload.ts` had no rule for `meta.*` config paths → updating `meta.lastTouchedAt` after agent deletion triggered a full Gateway restart → WebSocket died
- **Root Cause (Layer 2):** `gateway_client.rs` reader task didn't clear the sender or drain pending requests when WebSocket closed → `call()` sent messages into the void → 120s timeout hang
- **Root Cause (Layer 3):** `try_reconnect()` used stale stored token (could be `None` from early auto-connect before frontend sends token)
- **Fixes:**
  - Added `{ prefix: "meta", kind: "none" }` to `BASE_RELOAD_RULES_TAIL` in `config-reload.ts` + rebuilt Gateway via `npx tsdown`
  - Reader task now clears `sender → None` and drains all pending with "WebSocket connection closed" error
  - Added `read_auth_token()` static method that reads fresh from `OPENCLAW_GATEWAY_TOKEN` env var or `~/.openclaw/openclaw.json`
  - `try_reconnect()` reads fresh token, retries with backoff [0, 500, 1000, 2000]ms
  - `ChatWindow.tsx` changed from `deleteTauriAgent(id)` to `agentStore.removeAgent(id)`
- **Files:** `config-reload.ts`, `config-reload.test.ts` (+3 tests), `gateway_client.rs`, `ChatWindow.tsx`

**Bug 2: Create Agent Button Does Nothing**

- **Root Cause:** All 5 commands in `agent_wizard.rs` used `State<'_, Mutex<Connection>>` for DB access, but no `Mutex<Connection>` was ever registered with Tauri's `.manage()`. Every other DB command uses `db::init_db()` to open a connection directly.
- **Secondary:** `handleCreate()` catch block silently swallowed errors with no user feedback.
- **Fixes:**
  - Replaced `State<'_, Mutex<Connection>>` with `db::init_db()` in all 5 wizard commands (`skill_recommendations`, `create_agent_with_config`, `save_agent_template`, `list_agent_templates`, `delete_agent_template`)
  - Added error alert in catch block + moved `setIsCreating(false)` to `finally` block
- **Files:** `agent_wizard.rs`, `AgentCreationWizard.tsx`

**Bug 3: Newly Created Agent Not Visible in Chat Section**

- **Root Cause:** `ChatWindow.tsx` only loaded the agent list once — on initial Gateway WebSocket connect. After that, no refresh ever happened. Since ChatWindow is always mounted (hidden via CSS), the WebSocket connects once at app startup and never re-fetches.
- **Fix:** Enhanced the `agentStore` subscription in ChatWindow to sync both status updates AND the agent list. When agents are created/deleted via AgentsView, `agentStore.sync()` fires → subscribers notified → ChatWindow compares agent IDs and updates its `agents` state.
- **Files:** `ChatWindow.tsx`

**Test Results After All Fixes:**
- Rust: 437 tests passing
- Frontend: 907 tests passing (38 files)
- Config-reload: 11 tests passing
- **Total: 1,355 tests passing**
