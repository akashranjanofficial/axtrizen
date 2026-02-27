# SDLC Backlog: Epics, Features, User Stories & Acceptance Criteria

> **Project:** OpenClaw + Axtrizen AI — Enterprise Agent Platform  
> **Date:** 2026-02-27  
> **Methodology:** Agile Scrum — 2-week sprints  
> **Story Point Scale:** Fibonacci (1, 2, 3, 5, 8, 13)  
> **Priority:** P0 (Must Ship) → P1 (Should Ship) → P2 (Nice to Have)

---

## Table of Contents

- [EPIC 1: Unified Skill System](#epic-1-unified-skill-system)
- [EPIC 2: Agent Creation Wizard](#epic-2-agent-creation-wizard)
- [EPIC 3: Context Intelligence](#epic-3-context-intelligence)
- [EPIC 4: Quality Verification Engine](#epic-4-quality-verification-engine)
- [EPIC 5: Smart Project Setup](#epic-5-smart-project-setup)
- [EPIC 6: Security Guardrails](#epic-6-security-guardrails)
- [EPIC 7: Browser Sandbox](#epic-7-browser-sandbox)
- [EPIC 8: Live Project Monitoring](#epic-8-live-project-monitoring)
- [EPIC 9: Voice Interaction](#epic-9-voice-interaction)
- [EPIC 10: Agent Intelligence & Analytics](#epic-10-agent-intelligence--analytics)
- [EPIC 11: Enterprise Platform](#epic-11-enterprise-platform)

---

## EPIC 1: Unified Skill System

**Epic Owner:** Backend Lead + Frontend Lead  
**Business Value:** Users equip agents with skills from a single, discoverable marketplace instead of two disconnected systems.  
**Source Repos:** antigravity-awesome-skills, skills (Vercel Labs)  
**Sprints:** S1–S4

---

### Feature 1.1: Skill Data Unification

**Sprint:** S1 | **Priority:** P0 | **Points:** 13

#### US-1.1.1: Unified Skill Schema

**As a** developer,  
**I want** a single `agent_skills` SQLite table that holds all skill metadata (from both the 25-skill marketplace and 54-skill config),  
**So that** there is one source of truth for all skills in the system.

**Acceptance Criteria:**

- [ ] AC1: New `agent_skills` table created with columns: `id`, `key`, `name`, `description`, `category`, `tags` (JSON), `risk_level` (safe/unknown/critical/offensive), `source` (builtin/marketplace/custom), `version`, `installed` (bool), `config` (JSON for env vars), `agent_id` (FK), `created_at`, `updated_at`
- [ ] AC2: Migration script maps all 25 existing SkillMarketplace hardcoded skills to new schema
- [ ] AC3: Migration script maps all 54 existing AgentSettings config skills to new schema
- [ ] AC4: No data loss — all previously enabled skills remain enabled after migration
- [ ] AC5: Rust CRUD commands: `get_agent_skills`, `install_skill`, `remove_skill`, `update_skill_config`, `search_skills`
- [ ] AC6: Feature flag `unified_skills` controls rollout — old UI still works when flag is off

**Definition of Done:**

- [ ] Code reviewed and merged to main
- [ ] Migration tested on fresh DB + populated DB with existing skills
- [ ] Rollback migration tested (down migration works)
- [ ] All CRUD Tauri commands have unit tests (≥90% coverage)
- [ ] Integration test: create agent → install skill → verify in DB → remove skill → verify removed
- [ ] No regressions in existing agent functionality

---

#### US-1.1.2: Antigravity Skill Catalog Indexing

**As a** user,  
**I want** the 950+ skills from the antigravity catalog available to browse immediately on first launch,  
**So that** I can discover and install skills without manual setup.

**Acceptance Criteria:**

- [ ] AC1: On first app launch (or DB migration), parse `skills_index.json` (950+ entries) and insert into `skill_catalog` table
- [ ] AC2: Each catalog entry stores: `key`, `name`, `description`, `category`, `tags`, `risk_level`, `source_repo`, `path`
- [ ] AC3: Catalog is read-only reference data — separate from per-agent installed skills
- [ ] AC4: Full-text search across name, description, tags returns results in <100ms for any query
- [ ] AC5: Category filter returns correct counts: Architecture (61), Business (43), Data & AI (148), etc.
- [ ] AC6: Catalog auto-updates when app detects newer `skills_index.json` version

**Definition of Done:**

- [ ] First-launch indexing completes in <5 seconds on 2020 MacBook Air
- [ ] Unit tests for JSON parsing (malformed entries, missing fields, empty file)
- [ ] Unit test for search relevance (search "security" returns security-related skills first)
- [ ] Integration test: fresh launch → catalog populated → search works → category counts match

---

#### US-1.1.3: Skills CLI Integration (Tauri Sidecar)

**As a** system,  
**I want** the Vercel `skills` CLI to run as a managed child process,  
**So that** I can install/update/remove skills from any source (GitHub, GitLab, URL, local path).

**Acceptance Criteria:**

- [ ] AC1: Tauri sidecar spawns `skills` CLI as Node.js child process with proper PATH
- [ ] AC2: Tauri command `skills_install(agent_id, source)` installs a skill and updates local DB
- [ ] AC3: Tauri command `skills_remove(agent_id, skill_key)` removes a skill from agent and DB
- [ ] AC4: Tauri command `skills_update(agent_id, skill_key)` updates skill to latest version
- [ ] AC5: Tauri command `skills_search(query)` searches skills.sh API and returns results
- [ ] AC6: Installation from GitHub shorthand works (e.g., `owner/repo`)
- [ ] AC7: Installation from full URL works (e.g., `https://github.com/owner/repo`)
- [ ] AC8: Installation from local path works (e.g., `./my-skills/custom-skill`)
- [ ] AC9: Error handling: network failures, invalid sources, permission errors all return user-friendly messages
- [ ] AC10: Sidecar process is killed cleanly on app shutdown

**Definition of Done:**

- [ ] Unit tests for each install source type (GitHub, URL, local, invalid)
- [ ] Unit tests for error handling (network timeout, 404, malformed SKILL.md)
- [ ] Integration test: install from GitHub → verify files on disk → verify in DB → remove → verify cleanup
- [ ] Sidecar lifecycle test: start → install → kill app → restart → sidecar recovers
- [ ] Memory leak test: install/remove 100 skills sequentially — memory stays stable

---

### Feature 1.2: Skill Browser UI

**Sprint:** S2–S3 | **Priority:** P0 | **Points:** 13

#### US-1.2.1: Skill Browser Component

**As a** user,  
**I want** a searchable, filterable skill browser with category tabs and grid/list views,  
**So that** I can discover relevant skills from the 950+ catalog without being overwhelmed.

**Acceptance Criteria:**

- [ ] AC1: `SkillBrowser` React component renders a grid of skill cards (name, description, category badge, risk badge, install button)
- [ ] AC2: Search input filters skills in real-time (<200ms debounce) across name, description, and tags
- [ ] AC3: Category tabs: All, Architecture, Business, Data & AI, Development, General, Infrastructure, Security, Testing, Workflow
- [ ] AC4: Each category tab shows count of matching skills
- [ ] AC5: Risk badges: green (safe), yellow (unknown), red (critical), skull (offensive)
- [ ] AC6: Install button → calls `skills_install` → shows loading spinner → shows "Installed ✓" state
- [ ] AC7: Already-installed skills show "Installed ✓" badge and "Remove" button instead of "Install"
- [ ] AC8: Responsive layout: 4 columns on wide screen, 2 on medium, 1 on narrow
- [ ] AC9: Pagination or virtual scroll for 950+ items (no performance degradation)
- [ ] AC10: Skill detail modal on card click: full description, README preview, tags, risk level, install button, "Configure" section

**Definition of Done:**

- [ ] Component renders 950+ skills without jank (60fps scroll, <100MB memory)
- [ ] Unit tests: rendering, search filtering, category tabs, install/remove actions
- [ ] Visual regression test: snapshot of grid, list, and detail modal
- [ ] Accessibility: keyboard navigation, screen reader labels, focus management in modal
- [ ] Works in both light and dark theme

---

#### US-1.2.2: Skill Bundles (One-Click Role Presets)

**As a** user,  
**I want** to install a pre-defined bundle of skills with one click (e.g., "Security Engineer"),  
**So that** I don't have to manually pick from 950+ skills.

**Acceptance Criteria:**

- [ ] AC1: Bundle picker displays available bundles: Security Engineer, Full-Stack Dev, Agent Architect, DevOps & Cloud, Web Designer, Data Engineer, OSS Maintainer
- [ ] AC2: Each bundle shows: name, description, skill count, list of included skill names
- [ ] AC3: Click "Install Bundle" → batch installs all skills in the bundle (sequential, with progress bar)
- [ ] AC4: If some skills in bundle are already installed, skip them (partial install)
- [ ] AC5: Bundle data loaded from `bundles.json` — no hardcoded bundles
- [ ] AC6: Install progress: "Installing 3/12 skills..." with cancel button

**Definition of Done:**

- [ ] Unit test: bundle parsing, partial install logic, progress calculation
- [ ] Integration test: install full bundle → verify all skills in DB → remove one → re-install bundle → only missing one reinstalled
- [ ] UI test: progress bar animates correctly, cancel stops remaining installs

---

#### US-1.2.3: Smart Skill Recommendations

**As a** user,  
**I want** the system to automatically recommend skills based on my agent's role,  
**So that** I get a relevant starting point without browsing the full catalog.

**Acceptance Criteria:**

- [ ] AC1: When agent role is set (e.g., "Code Reviewer"), system matches role keywords against skill tags and categories
- [ ] AC2: Recommendations section shows 3-8 most relevant skills with explanation ("Pairs well with your code-review skill")
- [ ] AC3: Recommendations exclude already-installed skills
- [ ] AC4: Recommendations respect risk level — `offensive` skills never auto-recommended
- [ ] AC5: If agent uses a role template, template's `suggestedSkills` are shown as primary recommendations
- [ ] AC6: Each recommendation has a one-click "+ Add" button
- [ ] AC7: After installing a recommended skill, the next recommendation accounts for it (no duplicates, complementary suggestions)

**Definition of Done:**

- [ ] Unit test: recommendation engine with various role inputs (exact match, partial match, no match)
- [ ] Unit test: recommendation excludes installed skills
- [ ] Unit test: template suggestedSkills override generic recommendations
- [ ] Snapshot test: recommendations section renders correctly

---

#### US-1.2.4: Skill Import from External URL

**As a** user,  
**I want** to install a custom skill from a GitHub URL, GitLab URL, or local path,  
**So that** I can use skills not in the main catalog.

**Acceptance Criteria:**

- [ ] AC1: Import input field accepts: GitHub full URL, GitHub shorthand (`owner/repo`), GitLab URL, local path
- [ ] AC2: Validation: check URL format before attempting install
- [ ] AC3: On submit → calls `skills_install` with source → shows progress → shows result
- [ ] AC4: Imported skill appears in "Installed Skills" section with `source: custom` badge
- [ ] AC5: Error messages for: invalid URL, no SKILL.md found, network error, already installed

**Definition of Done:**

- [ ] Unit tests for URL validation (valid GitHub, invalid URL, local path, empty)
- [ ] Integration test: import from GitHub → verify on disk → verify in DB
- [ ] Error display test: all error states render user-friendly messages

---

### Feature 1.3: Unified Skills Tab (Agent Detail)

**Sprint:** S4 | **Priority:** P0 | **Points:** 8

#### US-1.3.1: Replace Dual Skills UI with Unified Tab

**As a** user,  
**I want** one "Skills" tab on the agent detail page that shows installed skills, recommendations, marketplace browse, and custom import all in one view,  
**So that** I have one place to manage all agent skills.

**Acceptance Criteria:**

- [ ] AC1: Tab 4 "Skills" (previously SkillMarketplace) is replaced by `UnifiedSkillsTab`
- [ ] AC2: Skills section from Tab 5 (AgentSettings) is removed — all skill management in new tab
- [ ] AC3: Layout: Installed Skills (top) → Update banner → Recommendations → Browse Marketplace → Import Custom
- [ ] AC4: Installed skills show: name, version, configure button, remove button
- [ ] AC5: "Configure" expands inline to show env var key-value editor (previously in Settings)
- [ ] AC6: Update available banner: "1 update available: skill-x v1.0 → v1.1 [Update All]"
- [ ] AC7: Skill lock indicator: "skills-lock.json synced ✓" or "out of sync ⚠"

**Definition of Done:**

- [ ] Old SkillMarketplace component removed from codebase
- [ ] Skills section removed from AgentSettings
- [ ] Existing users' installed skills appear correctly in new UI (backward compatibility)
- [ ] Unit tests for all sections of UnifiedSkillsTab
- [ ] Visual regression test: full tab in both themes
- [ ] Performance: tab loads in <200ms with 20 installed skills

---

#### US-1.3.2: Inline Skill Configuration

**As a** user,  
**I want** to configure a skill's environment variables (API keys, settings) directly in the Skills tab,  
**So that** I don't have to navigate to a separate settings page.

**Acceptance Criteria:**

- [ ] AC1: Click "Configure" on an installed skill → expands an inline section below the skill card
- [ ] AC2: Section shows a key-value table of current env vars
- [ ] AC3: "Add Variable" button → new row with key input + value input (password masked)
- [ ] AC4: Edit/delete existing variables inline
- [ ] AC5: Changes auto-save with debounce (500ms) — no explicit "Save" button needed
- [ ] AC6: Configuration persists to `openclaw.json` under the skill's config section
- [ ] AC7: Toast notification on save: "Configuration saved"

**Definition of Done:**

- [ ] Unit tests: add/edit/delete env vars, auto-save behavior
- [ ] Integration test: configure skill → restart agent → config still present
- [ ] Security test: API key values not logged in console or telemetry

---

## EPIC 2: Agent Creation Wizard

**Epic Owner:** Frontend Lead  
**Business Value:** Agents start fully equipped (skills + model + permissions) instead of bare-bones.  
**Sprints:** S2–S4

---

### Feature 2.1: Multi-Step Wizard Shell

**Sprint:** S2 | **Priority:** P0 | **Points:** 8

#### US-2.1.1: 4-Step Wizard Component

**As a** user,  
**I want** a guided 4-step wizard (Identity → Skills → Capabilities → Review) when creating a new agent,  
**So that** I can configure everything the agent needs in one flow instead of multiple disconnected pages.

**Acceptance Criteria:**

- [ ] AC1: Wizard opens from the "+" button in Agents sidebar (replaces old CreateAgentModal)
- [ ] AC2: Step indicator at top: numbered circles with labels (Identity, Skills, Capabilities, Review)
- [ ] AC3: Completed steps show checkmark (✓), current step is highlighted, future steps are dimmed
- [ ] AC4: "Back" and "Next" navigation buttons on each step
- [ ] AC5: Step 1 is navigable without completing it (lazy validation on "Next")
- [ ] AC6: "Quick Create" link on Step 1 skips to Step 4 with sensible defaults
- [ ] AC7: Wizard state preserved if user navigates away and comes back (within session)
- [ ] AC8: ESC key closes wizard with "Discard?" confirmation if any fields are dirty
- [ ] AC9: Wizard width: 720px max, centered overlay with backdrop blur

**Definition of Done:**

- [ ] Unit tests: step navigation (forward, backward, skip to review)
- [ ] Unit test: dirty state detection and discard confirmation
- [ ] Accessibility: Tab/Enter navigation works through all steps
- [ ] Animation: smooth step transition (fade + slide, <200ms)

---

#### US-2.1.2: Step 1 — Identity

**As a** user,  
**I want** to set the agent's name, type, role, model profile, and optionally personality (SOUL.md/IDENTITY.md),  
**So that** the agent has a clear identity from the start.

**Acceptance Criteria:**

- [ ] AC1: Role Template picker (grid with search) — selecting auto-fills Name, Role, Type
- [ ] AC2: Agent Name text input (required, 2-50 chars)
- [ ] AC3: Agent Type dropdown: Worker / Manager
- [ ] AC4: Role text input (required, 2-100 chars)
- [ ] AC5: Model Profile picker: Quality (Opus) / Balanced (Sonnet) / Budget (Haiku) — radio buttons with cost hints
- [ ] AC6: Working Directory: text input + folder picker button (Tauri `open()` dialog)
- [ ] AC7: Expandable "Personality" section with two textareas: SOUL.md and IDENTITY.md
- [ ] AC8: SOUL.md textarea has placeholder: "Who is this agent? What are its values and communication style?"
- [ ] AC9: IDENTITY.md textarea has placeholder: "What is this agent's background and area of expertise?"
- [ ] AC10: Validation on "Next": Name and Role required, Working Directory must exist
- [ ] AC11: Risk acceptance checkbox: "I understand AI agents execute commands in my environment"

**Definition of Done:**

- [ ] Unit tests: validation rules, template auto-fill, model profile mapping
- [ ] Unit test: SOUL.md and IDENTITY.md content persists across step navigation
- [ ] Integration test: complete Step 1 → data carries through to Step 4 Review

---

#### US-2.1.3: Step 2 — Skills

**As a** user,  
**I want** to equip my agent with skills during creation via bundles, recommendations, marketplace browse, and URL import,  
**So that** the agent is productive from its first conversation.

**Acceptance Criteria:**

- [ ] AC1: Three sections in order: Quick Start (Bundles) → Recommended → Browse All (950+)
- [ ] AC2: Bundles section: horizontal scrollable cards with "Install" button
- [ ] AC3: Recommended section: auto-populated from agent role (from Step 1). Shows 3-8 skills with checkboxes
- [ ] AC4: Browse All: reuses `SkillBrowser` component (US-1.2.1) embedded inline
- [ ] AC5: Import from URL section at bottom with text input + "Import" button
- [ ] AC6: Footer summary: "Installed (4): code-review, pr-analysis, security-scanning, tdd-mastery"
- [ ] AC7: Changing role in Step 1 (going back) refreshes recommendations in Step 2
- [ ] AC8: Skills selected here are installed when "Create Agent" is clicked on Step 4 (not immediately)
- [ ] AC9: Step is optional — user can click "Next" with 0 skills

**Definition of Done:**

- [ ] Unit tests: bundle selection, recommendation rendering, skill selection state
- [ ] Unit test: going back to Step 1 and changing role updates Step 2 recommendations
- [ ] Unit test: deferred installation (skills queued, not installed until final "Create")
- [ ] Performance test: Step 2 renders <300ms with full 950+ catalog loaded

---

#### US-2.1.4: Step 3 — Capabilities

**As a** user,  
**I want** to set tool permissions and security level for my agent,  
**So that** I control what the agent can access before it starts working.

**Acceptance Criteria:**

- [ ] AC1: Tool Permission Matrix: rows for each tool category (Web Browser, Terminal/Shell, File System, GitHub API, Slack/Discord, Docker Sandbox, Phone/Voice)
- [ ] AC2: Each row has a dropdown: Full Access / Read Only / Requires Approval / Disabled
- [ ] AC3: Defaults: Browser=Full, Terminal=Full, File System=Read+ProjectDir, others=Disabled
- [ ] AC4: Security Level radio buttons: Open / Standard (default) / Strict / Locked
- [ ] AC5: Security level descriptions shown inline
- [ ] AC6: Context Budget section: Max tokens per session (input, default 200K), Auto-summarize threshold (slider, default 70%), Alert threshold (slider, default 35% remaining)
- [ ] AC7: Tooltips on each permission level explaining what it means

**Definition of Done:**

- [ ] Unit tests: default values, dropdown changes, security level selection
- [ ] Unit test: context budget validation (min/max bounds)
- [ ] Accessibility: all dropdowns and radios keyboard accessible

---

#### US-2.1.5: Step 4 — Review & Create

**As a** user,  
**I want** to see a summary of everything I configured and confirm before creating the agent,  
**So that** I can catch mistakes and optionally save the config as a template.

**Acceptance Criteria:**

- [ ] AC1: Summary card shows: Name, Type, Role, Model Profile, Working Dir
- [ ] AC2: Skills list with count: "Skills (4): code-review, pr-analysis, ..."
- [ ] AC3: Security level and key permissions shown
- [ ] AC4: Context budget shown
- [ ] AC5: "Save as Template" button → modal: template name + description → saved for reuse
- [ ] AC6: Risk acceptance checkbox (carried from Step 1 if already checked)
- [ ] AC7: "Create Agent" button → loading state → calls backend → navigates to agent detail on success
- [ ] AC8: Backend creates agent → installs selected skills (sequential) → applies permissions → applies model profile
- [ ] AC9: Error handling: if any skill install fails, agent is still created, failed skills shown in toast with retry option

**Definition of Done:**

- [ ] Integration test: complete wizard → agent created with all config → verify in DB
- [ ] Integration test: partial skill failure → agent created → retry installs
- [ ] Unit test: Save as Template flow
- [ ] E2E test: full wizard flow from "+" button to agent appearing in sidebar

---

## EPIC 3: Context Intelligence

**Epic Owner:** Backend Lead  
**Business Value:** Prevents quality degradation in long agent sessions. Optimizes cost via smart model routing.  
**Source Repos:** get-shit-done  
**Sprints:** S4, S7

---

### Feature 3.1: Context Health Monitoring

**Sprint:** S4 | **Priority:** P0 | **Points:** 8

#### US-3.1.1: Context Usage Tracking in Gateway

**As a** system,  
**I want** to track context window usage (% full, token count in/out, message count) per agent session,  
**So that** the UI can show real-time context health.

**Acceptance Criteria:**

- [ ] AC1: Gateway emits `context_usage` event after each agent message: `{ agent_id, used_tokens, max_tokens, percentage, message_count }`
- [ ] AC2: Event fires via existing WebSocket connection to Tauri backend
- [ ] AC3: Accurate token counting (using tiktoken or model-specific tokenizer)
- [ ] AC4: Handles model switches (different max_tokens per model)
- [ ] AC5: WARNING level emitted when ≤35% remaining
- [ ] AC6: CRITICAL level emitted when ≤25% remaining

**Definition of Done:**

- [ ] Unit test: token counting accuracy (compare with reference tokenizer)
- [ ] Unit test: WARNING/CRITICAL thresholds trigger correctly
- [ ] Integration test: send 50 messages → verify context % increase is monotonic and accurate
- [ ] Performance: event emission adds <5ms per message

---

#### US-3.1.2: Context Health Bar UI

**As a** user,  
**I want** to see a visual health bar showing each agent's context window usage,  
**So that** I know when an agent is running out of context.

**Acceptance Criteria:**

- [ ] AC1: Progress bar in Agent Overview tab: green (0-65%), yellow (65-75%), orange (75-90%), red (90-100%)
- [ ] AC2: Shows: "Context: 62% | 124K / 200K tokens | 47 messages"
- [ ] AC3: Animated fill (smooth transition on updates)
- [ ] AC4: WARNING banner appears in agent chat when ≤35% remaining: yellow bar "Context running low — consider starting a new session"
- [ ] AC5: CRITICAL banner when ≤25%: red bar "Context critically low — quality may degrade"
- [ ] AC6: Also visible in project monitoring view (per-agent, compact version)

**Definition of Done:**

- [ ] Unit tests: color thresholds, banner display logic
- [ ] Visual regression: all color states captured
- [ ] Accessibility: progress bar has aria-label and aria-valuenow

---

### Feature 3.2: Auto-Summarization & Model Routing

**Sprint:** S7 | **Priority:** P1 | **Points:** 13

#### US-3.2.1: Context Auto-Summarization

**As a** system,  
**I want** to automatically summarize the conversation when context usage exceeds a configurable threshold,  
**So that** the agent maintains quality in long sessions.

**Acceptance Criteria:**

- [ ] AC1: When context usage exceeds threshold (default 70%), trigger summarization
- [ ] AC2: Summarization uses a separate LLM call (cheap model) to compress conversation history
- [ ] AC3: Original messages preserved (not deleted) — summary is inserted as a system message
- [ ] AC4: User can expand collapsed section to see original messages
- [ ] AC5: Threshold is configurable per-agent (set in Step 3 of wizard or agent Settings)
- [ ] AC6: Summarization can be disabled entirely per-agent
- [ ] AC7: Toast notification: "Context summarized to maintain quality"

**Definition of Done:**

- [ ] Unit test: summarization triggers at correct threshold
- [ ] Unit test: summary preserves key facts (golden test with known conversation)
- [ ] Unit test: disabled flag prevents summarization
- [ ] Integration test: long conversation → auto-summarize → continue conversation → agent references summarized info correctly

---

#### US-3.2.2: Model Profile Routing

**As a** system,  
**I want** to automatically route to cheaper models for simple tasks (verification, formatting) while using expensive models for complex tasks (planning, architecture),  
**So that** costs drop 30-50% without quality loss on important work.

**Acceptance Criteria:**

- [ ] AC1: Agent has a `model_profile` setting: Quality / Balanced / Budget
- [ ] AC2: Model mapping table: Quality → (planning: Opus, execution: Opus, verification: Sonnet), Balanced → (planning: Sonnet, execution: Sonnet, verification: Haiku), Budget → (planning: Sonnet, execution: Haiku, verification: Haiku)
- [ ] AC3: Orchestrator tags each agent task with a `task_type`: planning / execution / verification
- [ ] AC4: Gateway resolves model based on agent's profile + task type
- [ ] AC5: Model switches are transparent to the user (no UI interruption)
- [ ] AC6: Override: user can pin a specific model regardless of profile

**Definition of Done:**

- [ ] Unit test: model resolution for all profile × task_type combinations (3×3=9 combos)
- [ ] Unit test: override pin takes precedence
- [ ] Integration test: run a project → verify different models used per phase
- [ ] Cost tracking test: Balanced profile uses at least 30% fewer Opus tokens than Quality

---

## EPIC 4: Quality Verification Engine

**Epic Owner:** Backend Lead  
**Business Value:** Ensures agent deliverables actually work, not just "done" with stubs.  
**Source Repos:** get-shit-done  
**Sprints:** S6

---

### Feature 4.1: Goal-Backward Verification

**Sprint:** S6 | **Priority:** P0 | **Points:** 13

#### US-4.1.1: Three-Level Verification Check

**As a** system,  
**I want** to verify every phase deliverable through three checks (exists → substantive → wired),  
**So that** phases can't advance when deliverables are stubs or disconnected.

**Acceptance Criteria:**

- [ ] AC1: **Exists check:** Verify that all expected output files/artifacts are present on disk
- [ ] AC2: **Substantive check:** Scan for stub patterns — TODO comments, `pass` statements, empty function bodies, `throw new Error("Not implemented")`, hardcoded return values, `lorem ipsum` placeholder text
- [ ] AC3: **Wired check:** Verify that outputs are connected to the system — imports resolve, functions are called, routes are registered, tests actually test the right code
- [ ] AC4: Each check returns: PASS / FAIL / WARN with details
- [ ] AC5: Results stored per-phase in the project DB record
- [ ] AC6: Configurable strictness: Warn Only (log, don't block) / Block Critical (block on FAIL, warn on WARN) / Block All (block on WARN or FAIL)
- [ ] AC7: Default strictness: Warn Only (non-disruptive for existing users)

**Definition of Done:**

- [ ] Unit test: stub detection patterns (15+ patterns from GSD verification-patterns)
- [ ] Unit test: exists check with missing files
- [ ] Unit test: wired check for import resolution
- [ ] Unit test: strictness levels correctly gate phase advancement
- [ ] Golden test: known-good codebase passes all 3 levels; known-stub codebase fails level 2

---

#### US-4.1.2: Quality Gate UI Badges

**As a** user,  
**I want** to see pass/fail/warning badges for each completed phase on the project monitoring view,  
**So that** I know at a glance if deliverables are solid.

**Acceptance Criteria:**

- [ ] AC1: Phase progress tracker shows badge next to each completed phase: ✅ PASSED / ❌ FAILED / ⚠️ WARNING / 🔄 IN PROGRESS
- [ ] AC2: Click badge → expandable panel showing detailed results (which checks passed, which failed, with file paths and line numbers)
- [ ] AC3: Failed gate: if strictness = Block, a "Retry Phase" button appears
- [ ] AC4: User can override and advance past a failed gate by clicking "Override" (with confirmation dialog, logged to audit trail)
- [ ] AC5: Badge color: green (pass), red (fail), amber (warn), blue (in progress)

**Definition of Done:**

- [ ] Unit tests: badge rendering for all states
- [ ] Unit test: override flow with confirmation
- [ ] Integration test: run project → phase fails verification → see badge → retry → pass
- [ ] Accessibility: badges have tooltip text matching their state

---

## EPIC 5: Smart Project Setup

**Epic Owner:** Full-Stack  
**Business Value:** Users describe a goal and the system builds the team for them.  
**Sprints:** S5

---

### Feature 5.1: AI-Suggested Team Composition

**Sprint:** S5 | **Priority:** P1 | **Points:** 13

#### US-5.1.1: Project Description Analysis

**As a** user,  
**I want** to describe my project goal in natural language and have the system suggest a complete team (agents + skills + models),  
**So that** I don't have to manually figure out agent composition.

**Acceptance Criteria:**

- [ ] AC1: New project wizard Step 2: after entering name + description, system analyzes text
- [ ] AC2: Analysis uses LLM call to extract: required roles, relevant skill categories, estimated complexity
- [ ] AC3: System generates team suggestion: 1 manager + N workers, each with name, role, and pre-selected skills
- [ ] AC4: Each suggested agent card shows: recommended skills (from antigravity catalog), model profile, estimated cost
- [ ] AC5: "Use existing agent" dropdown on each card — swaps suggestion for a user's existing agent
- [ ] AC6: "Customize" button on each card → opens agent creation wizard Step 2 (Skills) scoped to that agent
- [ ] AC7: User can add or remove agents from the suggestion
- [ ] AC8: Total cost estimate shown at bottom: "Estimated: ~$2.40 based on Balanced profile"
- [ ] AC9: LLM analysis takes <5 seconds; loading skeleton shown during analysis

**Definition of Done:**

- [ ] Integration test: provide 5 different project descriptions → verify suggestions are relevant
- [ ] Unit test: cost estimation formula (model pricing × estimated tokens × agent count)
- [ ] Unit test: "Use existing agent" swap logic
- [ ] Unit test: add/remove agent from suggestion
- [ ] Performance test: analysis completes <5s on standard models

---

#### US-5.1.2: Cost Estimation Engine

**As a** user,  
**I want** to see estimated costs before starting a project,  
**So that** I can adjust team composition to fit my budget.

**Acceptance Criteria:**

- [ ] AC1: Cost estimate = Σ(agent_model_cost_per_token × estimated_tokens × confidence_multiplier)
- [ ] AC2: Estimated tokens based on: workflow phase count × average tokens per phase (from historical data or defaults)
- [ ] AC3: Shown as: "Estimated cost: ~$2.40 (range: $1.80 – $3.20)"
- [ ] AC4: Breakdown on hover: per-agent cost contribution
- [ ] AC5: Changing model profile (Quality → Budget) updates estimate in real-time
- [ ] AC6: After project completes, actual cost is shown alongside estimate for calibration

**Definition of Done:**

- [ ] Unit test: cost formula with known inputs
- [ ] Unit test: range calculation (±30% margin)
- [ ] Unit test: profile switch updates estimate correctly
- [ ] Historical calibration: after 10+ projects, estimate is within 40% of actual

---

## EPIC 6: Security Guardrails

**Epic Owner:** Security Lead + Backend Lead  
**Business Value:** Protects against prompt injection, PII leaks, and unauthorized tool use.  
**Source Repos:** agents-towards-production  
**Sprints:** S8–S9

---

### Feature 6.1: Input Guardrails

**Sprint:** S8 | **Priority:** P0 | **Points:** 8

#### US-6.1.1: Prompt Injection Detection

**As a** system,  
**I want** to scan all inputs (user messages, agent-to-agent messages) for prompt injection patterns,  
**So that** malicious prompts are blocked before reaching agents.

**Acceptance Criteria:**

- [ ] AC1: Input scanner runs on every message before it reaches the LLM
- [ ] AC2: Detects: role override attempts ("ignore previous instructions"), encoded payloads (base64, hex, unicode escapes), system prompt extraction attempts, jailbreak patterns
- [ ] AC3: Detection uses pattern matching (regex) + lightweight classifier
- [ ] AC4: Blocked messages return user-friendly error: "This message was flagged by security. Please rephrase."
- [ ] AC5: False positive rate <2% on normal messages (tested against 1000 benign messages)
- [ ] AC6: All blocks logged to security audit log with: timestamp, agent_id, user_id, message hash, pattern matched

**Definition of Done:**

- [ ] Unit test: 91 known injection patterns from Apex repo (all detected)
- [ ] Unit test: 1000 benign messages (>98% pass without false positive)
- [ ] Unit test: encoded payloads (base64, hex) detected
- [ ] Integration test: inject via chat → blocked → logged in audit
- [ ] Performance: scan adds <50ms per message

---

### Feature 6.2: Output Guardrails

**Sprint:** S9 | **Priority:** P0 | **Points:** 8

#### US-6.2.1: PII & Unsafe Output Filtering

**As a** system,  
**I want** to scan all agent outputs for PII leakage and unsafe code patterns,  
**So that** sensitive data doesn't reach users or external systems.

**Acceptance Criteria:**

- [ ] AC1: Output scanner runs on every agent response before delivery to user
- [ ] AC2: PII detection: email addresses, phone numbers, SSNs, credit card numbers, API keys, passwords
- [ ] AC3: Unsafe code detection: shell commands with `rm -rf`, `chmod 777`, credential hardcoding, SQL injection patterns in generated code
- [ ] AC4: Detected PII is redacted: "Email: j\*\*\*@example.com" with "[REDACTED]" marker
- [ ] AC5: Unsafe code flagged with warning banner: "⚠ This code contains potentially unsafe patterns: [details]"
- [ ] AC6: Admin can configure: redact (default) / warn / block / allow

**Definition of Done:**

- [ ] Unit test: PII patterns (50 test cases: emails, phones, SSNs, API keys of various formats)
- [ ] Unit test: unsafe code patterns (rm -rf, chmod, hardcoded credentials)
- [ ] Unit test: redaction produces expected masked output
- [ ] Integration test: agent generates response with PII → redacted before user sees it
- [ ] Performance: scan adds <100ms per response

---

## EPIC 7: Browser Sandbox

**Epic Owner:** Backend Lead + Infra  
**Business Value:** Agents can browse the web, interact with UIs, and automate web workflows.  
**Source Repos:** kernel-images  
**Sprints:** S8–S10

---

### Feature 7.1: Docker Browser Management

**Sprint:** S8 | **Priority:** P1 | **Points:** 13

#### US-7.1.1: Spawn/Destroy Browser Sandboxes

**As a** system,  
**I want** to spawn and destroy isolated Chrome browser containers via Docker,  
**So that** agents can browse the web in a sandboxed environment.

**Acceptance Criteria:**

- [ ] AC1: Tauri command `spawn_browser(agent_id)` pulls/starts kernel-images Docker container
- [ ] AC2: Container exposes CDP proxy on random port, Live View on random port
- [ ] AC3: Tauri command `destroy_browser(agent_id)` stops and removes the container
- [ ] AC4: Tauri command `browser_screenshot(agent_id)` captures a PNG screenshot
- [ ] AC5: Container has resource limits: 2 CPU, 2GB RAM, 30-min idle timeout
- [ ] AC6: Health check endpoint polled every 10s — unhealthy containers auto-restarted
- [ ] AC7: Max 5 concurrent browser sandboxes per user (configurable)

**Definition of Done:**

- [ ] Integration test: spawn → screenshot → destroy → verify container gone
- [ ] Stress test: spawn 5 browsers simultaneously → all respond
- [ ] Unit test: idle timeout triggers cleanup
- [ ] Unit test: resource limits enforced (container can't exceed 2GB)

---

#### US-7.1.2: CDP Agent Connection

**As an** agent,  
**I want** to connect to a browser sandbox via Chrome DevTools Protocol (Playwright),  
**So that** I can navigate pages, click elements, type text, and extract data.

**Acceptance Criteria:**

- [ ] AC1: Gateway provides agents with CDP WebSocket URL for their sandbox
- [ ] AC2: Agent can execute Playwright commands: `goto`, `click`, `fill`, `textContent`, `screenshot`
- [ ] AC3: Connection survives page navigation (persistent CDP session)
- [ ] AC4: Agent can disconnect and reconnect to the same browser session
- [ ] AC5: Batch actions: agent sends multiple actions in one request for reduced latency

**Definition of Done:**

- [ ] Integration test: connect → navigate → fill form → screenshot → verify page content
- [ ] Integration test: disconnect → reconnect → page state preserved
- [ ] Performance test: batch of 10 actions completes in <2 seconds

---

### Feature 7.2: Live Browser View

**Sprint:** S9 | **Priority:** P1 | **Points:** 8

#### US-7.2.1: WebRTC Browser Stream

**As a** user,  
**I want** to watch what an agent is doing in its browser sandbox via a real-time video stream,  
**So that** I can monitor and verify web-based actions.

**Acceptance Criteria:**

- [ ] AC1: Live View panel in project monitoring view shows WebRTC stream from selected agent's browser
- [ ] AC2: Stream latency <1 second from agent action to user view
- [ ] AC3: Stream resolution: at least 1280x720
- [ ] AC4: Fullscreen toggle button
- [ ] AC5: Read-only mode by default (user watches, can't interact)
- [ ] AC6: Fallback to screenshots every 2s if WebRTC connection fails

**Definition of Done:**

- [ ] Integration test: spawn browser → agent navigates → user sees page in Live View
- [ ] Performance test: stream maintains 15+ FPS
- [ ] Unit test: fallback to screenshots when WebRTC fails
- [ ] Visual test: stream renders correctly in both themes

---

## EPIC 8: Live Project Monitoring

**Epic Owner:** Frontend Lead  
**Business Value:** Full situational awareness — context health, live views, quality gates — during project execution.  
**Source Repos:** get-shit-done, kernel-images  
**Sprints:** S9

---

### Feature 8.1: Multi-Pane Monitoring Layout

**Sprint:** S9 | **Priority:** P1 | **Points:** 8

#### US-8.1.1: Project Monitoring View Redesign

**As a** user,  
**I want** a multi-pane project monitoring view with agent list, live view, terminal, chat, and quality gates,  
**So that** I have complete visibility into running projects.

**Acceptance Criteria:**

- [ ] AC1: Left panel: Agent Activity list (all agents with status, current task, context %, clickable to select)
- [ ] AC2: Right panel (split): top = Live View (browser stream or terminal), bottom = Agent Chat
- [ ] AC3: Quality Gates sidebar: list of phases with pass/fail badges
- [ ] AC4: Top bar: project progress %, cost running total, duration, phase name
- [ ] AC5: Context health bar per agent in the agent list (compact version)
- [ ] AC6: Click agent → right panel updates to show that agent's live view/terminal/chat
- [ ] AC7: Responsive: panels collapsible/resizable

**Definition of Done:**

- [ ] Unit tests: panel rendering, agent selection, data binding
- [ ] Visual regression: full layout captured in snapshot
- [ ] Performance: renders with 10 agents + live data streams without frame drops
- [ ] Accessibility: all panels navigable with keyboard

---

## EPIC 9: Voice Interaction

**Epic Owner:** Backend Lead + Frontend Lead  
**Business Value:** Users talk to agents by voice — faster, more accessible, executive-friendly.  
**Source Repos:** vision-agents  
**Sprints:** S11–S12

---

### Feature 9.1: Voice Pipeline

**Sprint:** S11 | **Priority:** P1 | **Points:** 13

#### US-9.1.1: STT → LLM → TTS Integration

**As a** user,  
**I want** to speak to my agent and hear a voice response,  
**So that** I can communicate hands-free and faster than typing.

**Acceptance Criteria:**

- [ ] AC1: STT provider integration (Deepgram or Whisper) accepts audio input → returns text
- [ ] AC2: Text routed to agent LLM via existing Gateway chat channel
- [ ] AC3: Agent text response → TTS provider (ElevenLabs or Kokoro) → audio output
- [ ] AC4: End-to-end voice response latency <2 seconds (P95)
- [ ] AC5: WebRTC transport for low-latency audio streaming
- [ ] AC6: Silence/turn detection (VAD) — agent knows when user finishes speaking
- [ ] AC7: Transcription shown in chat alongside audio (dual-mode display)

**Definition of Done:**

- [ ] Integration test: speak → transcription correct → agent responds → TTS plays
- [ ] Latency test: P95 <2s for complete loop
- [ ] Unit test: VAD correctly detects end of speech
- [ ] Unit test: transcription displayed in chat with audio playback button

---

#### US-9.1.2: Push-to-Talk UI

**As a** user,  
**I want** a push-to-talk button in the agent chat and project monitoring view,  
**So that** I can voice-interact with any agent.

**Acceptance Criteria:**

- [ ] AC1: Microphone button in chat input area: click-and-hold to record, release to send
- [ ] AC2: While recording: pulsing red indicator, waveform visualization, duration counter
- [ ] AC3: On release: "Transcribing..." state → transcription appears as user message → agent responds
- [ ] AC4: Keyboard shortcut: hold Space to talk (configurable)
- [ ] AC5: Hands-free toggle: switch between push-to-talk and always-listening mode
- [ ] AC6: Works in both 1:1 agent chat and project monitoring chat panel
- [ ] AC7: Microphone permission request on first use with clear explanation dialog

**Definition of Done:**

- [ ] Unit tests: button states (idle, recording, transcribing, playing response)
- [ ] Unit test: keyboard shortcut trigger
- [ ] Accessibility: screen reader announces recording state
- [ ] Browser compatibility: Chrome, Safari (Tauri WebView)

---

## EPIC 10: Agent Intelligence & Analytics

**Epic Owner:** Full-Stack  
**Business Value:** Users learn from past projects, reuse proven configs, and continuously improve.  
**Source Repos:** agents-towards-production, internal  
**Sprints:** S12–S13

---

### Feature 10.1: Performance Scoring

**Sprint:** S12 | **Priority:** P1 | **Points:** 8

#### US-10.1.1: Agent Scorecard

**As a** user,  
**I want** to see a performance scorecard for each agent after a project completes,  
**So that** I know which agents performed well and which need adjustment.

**Acceptance Criteria:**

- [ ] AC1: Score = weighted average: task completion (40%) × quality gate pass rate (30%) × cost efficiency (20%) × latency (10%)
- [ ] AC2: Score displayed as X/100 with star rating (1-5 stars)
- [ ] AC3: Per-agent breakdown: tasks assigned, tasks completed, tasks failed, tokens used, cost, avg response time
- [ ] AC4: Comparison across agents in the same project
- [ ] AC5: Historical trend: last 5 project scores for recurring agents

**Definition of Done:**

- [ ] Unit test: scoring formula with known inputs
- [ ] Unit test: star rating mapping (0-20=1★, 21-40=2★, etc.)
- [ ] Integration test: run project → scores calculated → displayed correctly
- [ ] Visual regression: scorecard component snapshot

---

#### US-10.1.2: Skill Effectiveness Analytics

**As a** user,  
**I want** to see which skills were most/least effective during a project,  
**So that** I can optimize my skill selection for next time.

**Acceptance Criteria:**

- [ ] AC1: Track per-skill: invocation count, positive outcome rate, contribution to verification pass
- [ ] AC2: Display: "owasp-top10 — used 14 times, 92% effective"
- [ ] AC3: Flag underperforming skills: <70% effectiveness highlighted in amber
- [ ] AC4: Suggest alternatives for underperforming skills (if a better-rated skill exists in same category)

**Definition of Done:**

- [ ] Unit test: effectiveness calculation formula
- [ ] Unit test: underperformance flag threshold
- [ ] Unit test: alternative suggestion logic (same category, higher community rating)

---

### Feature 10.2: Config Reuse

**Sprint:** S13 | **Priority:** P1 | **Points:** 8

#### US-10.2.1: Save Team as Template

**As a** user,  
**I want** to save a project's team configuration (agents + skills + models + workflow) as a reusable template,  
**So that** I can recreate proven setups with one click.

**Acceptance Criteria:**

- [ ] AC1: "Save Team as Template" button on project completion dashboard
- [ ] AC2: Modal: template name (required), description (optional), tags (optional)
- [ ] AC3: Template stores: for each agent — role, model profile, skills list, permission matrix, security level
- [ ] AC4: Template stores: workflow template reference, phase configuration
- [ ] AC5: Templates listed in: project creation wizard (step 1), agent creation wizard (step 1), settings page
- [ ] AC6: "Use Template" → creates all agents + installs all skills + creates team + creates project pre-configured
- [ ] AC7: Templates can be edited and versioned

**Definition of Done:**

- [ ] Integration test: complete project → save template → create new project from template → verify all agents and skills match
- [ ] Unit test: template serialization/deserialization
- [ ] Unit test: template versioning (edit → new version, old version preserved)

---

#### US-10.2.2: Smart Recommendations

**As a** user,  
**I want** the system to suggest improvements (skill swaps, model changes, agent splits) based on project performance data,  
**So that** I continuously improve my agent configurations.

**Acceptance Criteria:**

- [ ] AC1: After project completion, system analyzes performance data and generates 2-5 recommendations
- [ ] AC2: Recommendation types: replace underperforming skill, upgrade/downgrade model profile, split overloaded agent into two
- [ ] AC3: Each recommendation includes: what to change, why (data-backed), expected impact
- [ ] AC4: "Apply" button on each recommendation → modifies agent config (with confirmation)
- [ ] AC5: Recommendations dismissed with "Not now" are not repeated

**Definition of Done:**

- [ ] Unit test: recommendation engine with synthetic performance data
- [ ] Unit test: "Apply" correctly modifies agent config
- [ ] Unit test: dismissed recommendations don't reappear
- [ ] Integration test: poor-performing project → relevant recommendations generated

---

## EPIC 11: Enterprise Platform

**Epic Owner:** Platform Team  
**Business Value:** Enterprise sales readiness — SSO, RBAC, compliance, multi-tenant cloud.  
**Sprints:** S14–S20

---

### Feature 11.1: Org Skill Policies

**Sprint:** S14 | **Priority:** P1 | **Points:** 8

#### US-11.1.1: Skill Approval Workflow

**As an** org admin,  
**I want** to define an approved skills list for my organization,  
**So that** agents can only use pre-vetted skills for compliance.

**Acceptance Criteria:**

- [ ] AC1: Admin dashboard: list of all 950+ skills with approved/blocked/pending status toggles
- [ ] AC2: Bulk actions: approve all "safe" skills, block all "offensive" skills
- [ ] AC3: When a user tries to install a non-approved skill: "Skill requires admin approval. Request sent."
- [ ] AC4: Admin sees pending requests with requester name, skill details, and approve/deny buttons
- [ ] AC5: Approved/blocked lists sync to all org members within 1 minute

**Definition of Done:**

- [ ] Integration test: admin blocks skill → user can't install → user requests → admin approves → user can install
- [ ] Unit test: bulk approve/block operations
- [ ] Unit test: sync propagation within timeout

---

### Feature 11.2: SSO & RBAC

**Sprint:** S18 | **Priority:** P1 | **Points:** 13

#### US-11.2.1: SSO Integration

**As an** enterprise user,  
**I want** to log in with my company's identity provider (Okta, Azure AD, Google Workspace),  
**So that** I don't need a separate password for this tool.

**Acceptance Criteria:**

- [ ] AC1: SAML 2.0 SSO flow: SP-initiated and IdP-initiated
- [ ] AC2: OIDC flow for providers that support it
- [ ] AC3: JIT (just-in-time) user provisioning from IdP attributes
- [ ] AC4: Tested with: Okta, Azure AD, Google Workspace
- [ ] AC5: Session timeout configurable per org (default: 8 hours)
- [ ] AC6: Logout: single sign-out from both app and IdP

**Definition of Done:**

- [ ] Integration test with Okta sandbox
- [ ] Integration test with Azure AD sandbox
- [ ] Security test: session hijacking, token replay attacks
- [ ] Unit test: JIT provisioning creates user with correct role

---

#### US-11.2.2: Role-Based Access Control

**As an** org admin,  
**I want** to assign roles (Admin / Manager / Operator / Viewer) to team members,  
**So that** access is controlled based on responsibility.

**Acceptance Criteria:**

- [ ] AC1: **Admin:** Full access — manage users, skills policies, billing, templates, all agents
- [ ] AC2: **Manager:** Create/manage agents, teams, projects, templates. Can't change skill policies or billing.
- [ ] AC3: **Operator:** Use agents, run projects, install approved skills. Can't create templates or manage teams.
- [ ] AC4: **Viewer:** Read-only access to dashboards, project results, agent status. Can't modify anything.
- [ ] AC5: Roles assigned at org level and optionally overridden at team level
- [ ] AC6: Permission denied → friendly error message with "Contact your admin" link
- [ ] AC7: Audit log entry for every role change

**Definition of Done:**

- [ ] Unit test: all 4 roles × all endpoints/actions matrix (expected allow/deny)
- [ ] Integration test: Manager tries admin action → denied
- [ ] Integration test: Viewer tries to modify → denied with message
- [ ] Penetration test: attempt privilege escalation via API

---

### Feature 11.3: Usage & Budget Dashboard

**Sprint:** S15 | **Priority:** P1 | **Points:** 8

#### US-11.3.1: Cost Tracking Dashboard

**As an** org admin or team manager,  
**I want** to see usage and costs broken down by team, project, model, and time period,  
**So that** I can control spending and allocate budgets.

**Acceptance Criteria:**

- [ ] AC1: Dashboard shows: this month total, trend vs. last month, breakdown by team
- [ ] AC2: Per-team: total cost, top model used, total tokens, total agent-hours
- [ ] AC3: Per-project: cost, duration, agents used, model breakdown
- [ ] AC4: Budget setting: per-team monthly budget with soft limit (warning) and hard limit (block execution)
- [ ] AC5: Alert: email/Slack notification when team reaches 80% of budget
- [ ] AC6: Export: CSV download of all usage data

**Definition of Done:**

- [ ] Unit test: cost aggregation by team, project, model
- [ ] Unit test: budget threshold calculations
- [ ] Integration test: exceed soft limit → alert fires; exceed hard limit → execution blocked
- [ ] Visual regression: full dashboard captured in snapshot
