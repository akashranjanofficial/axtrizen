# Sprint Execution Plan: Definition of Done & Deliverables

> **Project:** OpenClaw + Axtrizen AI  
> **Last Updated:** 2026-03-02  
> **Sprint Duration:** 2 weeks  
> **Total Sprints:** 20 (S1–S20)  
> **Team Sizing:** 3-5 engineers per sprint

---

## Global Definition of Done (Applies to ALL Sprints)

Every sprint item must satisfy ALL of the following before it can be marked "Done":

| #   | Criterion                                           | Evidence                |
| --- | --------------------------------------------------- | ----------------------- |
| G1  | Code compiles with zero warnings                    | CI build log            |
| G2  | All new code has unit tests with ≥85% line coverage | Coverage report (lcov)  |
| G3  | All acceptance criteria pass                        | QA checklist signed off |
| G4  | No P0/P1 bugs open                                  | Bug tracker query       |
| G5  | Code reviewed by ≥1 peer (not author)               | GitHub PR approval      |
| G6  | TypeScript strict mode — no `any` types added       | ESLint report           |
| G7  | Rust — zero `clippy` warnings                       | CI clippy log           |
| G8  | Accessibility: no new WCAG 2.1 AA violations        | axe-core scan           |
| G9  | Performance: no regression >10% on tracked metrics  | Lighthouse / benchmark  |
| G10 | Documentation: JSDoc/RustDoc on all public APIs     | Doc coverage tool       |
| G11 | Feature flag wrapping for phased rollout            | Code review verified    |
| G12 | Changelog entry added                               | CHANGELOG.md updated    |

---

## Phase 0: Foundation (Sprints S1–S2)

### Sprint S1: Skill Data Migration & Backend

**Duration:** Weeks 1–2  
**Theme:** Unify skill data behind one schema  
**Capacity:** 26 points

| Story                                            | Points | Priority |
| ------------------------------------------------ | ------ | -------- |
| US-1.1.1: Unified Skill Schema                   | 8      | P0       |
| US-1.1.2: Antigravity Skill Catalog Indexing     | 5      | P0       |
| US-1.1.3: Skills CLI Integration (Tauri Sidecar) | 13     | P0       |

**Sprint-Specific DoD:**

- [x] **D1:** `agent_skills` table exists with all columns per AC, migration runs on fresh + populated DB ✅
- [x] **D2:** Down-migration tested — `down_migrate_v9()` drops tables cleanly, idempotent ✅
- [x] **D3:** Skill catalog (950+ entries) embedded via `include_str!()`, auto-seeded on launch ✅
- [x] **D4:** Full-text skill search with filtered pagination via `search_skill_catalog_count()` ✅
- [x] **D5:** Skill source resolver module (`skill_sources.rs`) — GitHub, URL, local, catalog ✅
- [x] **D6:** `skills_resolve_source`, `skills_install_from_source`, `skills_search_remote` commands ✅
- [x] **D7:** Feature flag `unified_skills` + `is_feature_enabled()` runtime check ✅
- [x] **D8:** 28 new Rust tests (79 total), 43 frontend tests — all passing ✅

**Risks & Mitigations:**

- **Risk:** Skills CLI incompatibility with Tauri sidecar sandboxing → **Mitigation:** Week 1, Day 1 spike: test sidecar spawn + IPC roundtrip
- **Risk:** Antigravity JSON parsing on large files → **Mitigation:** Stream parser with fallback to chunked loading

**Deliverables:**

1. `[PR]` Schema migration (up + down)
2. `[PR]` Catalog indexer service
3. `[PR]` Skills CLI sidecar module + Tauri commands
4. `[DOC]` Updated API reference for new Tauri commands
5. `[TEST]` 45+ unit tests, 5 integration tests

---

### Sprint S2: Skill Browser UI + Wizard Shell

**Duration:** Weeks 3–4  
**Theme:** User-facing skill discovery + wizard scaffold  
**Capacity:** 26 points

| Story                                     | Points | Priority |
| ----------------------------------------- | ------ | -------- |
| US-1.2.1: Skill Browser Component         | 8      | P0       |
| US-1.2.2: Skill Bundles                   | 5      | P0       |
| US-2.1.1: 4-Step Wizard Component (Shell) | 8      | P0       |
| US-2.1.2: Step 1 — Identity               | 5      | P0       |

**Sprint-Specific DoD:**

- [x] **D1:** SkillBrowser with responsive grid (4→2→1 cols), scrollable container (max-h-[500px]), PAGE_SIZE=60 ✅
- [x] **D2:** Real-time search with debounced `catalog_search` + filtered pagination count ✅
- [x] **D3:** Category tabs with backend-accurate counts via `catalog_categories` ✅
- [x] **D4:** SkillDetailModal with install/toggle/remove actions, risk info, tags, metadata ✅
- [x] **D5:** 7 skill bundles seeded (Security, Full-Stack, DevOps, Data, Architect, Designer, OSS) ✅
- [x] **D6:** Wizard opens from "+", 4 steps with indicator, forward/back navigation ✅
- [x] **D7:** Step 1: Name, Type, Role, Model Profile (6 options), Working Dir, SOUL.md, IDENTITY.md ✅
- [x] **D8:** "Quick Create" link on Step 1 → jumps to Review with defaults ✅
- [x] **D9:** ESC closes wizard with dirty-state confirm dialog ✅
- [x] **D10:** Import-from-source panel (GitHub/URL/local path) in SkillBrowser ✅

**Deliverables:**

1. `[PR]` SkillBrowser component with virtual scroll
2. `[PR]` SkillBundlePicker component
3. `[PR]` AgentCreationWizard shell (4-step navigator)
4. `[PR]` WizardStep1Identity component
5. `[TEST]` 35+ unit tests, 3 visual regression snapshots

---

## Phase 1: Smooth Agent Creation (Sprints S3–S4)

### Sprint S3: Wizard Steps + Recommendations

**Duration:** Weeks 5–6  
**Theme:** Complete the agent creation wizard  
**Capacity:** 26 points

| Story                                 | Points | Priority |
| ------------------------------------- | ------ | -------- |
| US-1.2.3: Smart Skill Recommendations | 5      | P0       |
| US-2.1.3: Step 2 — Skills             | 8      | P0       |
| US-2.1.4: Step 3 — Capabilities       | 5      | P0       |
| US-2.1.5: Step 4 — Review & Create    | 8      | P0       |

**Sprint-Specific DoD:**

- [x] **D1:** Recommendation engine returns 3-8 relevant skills based on agent role keywords ✅
- [x] **D2:** Changing role in Step 1 → going back → Step 2 recommendations refresh ✅
- [x] **D3:** Step 2 embeds SkillBrowser inline, shows bundles + recommendations + browse + import ✅
- [x] **D4:** Step 3 tool permission matrix has all 7 categories with correct dropdown options ✅
- [x] **D5:** Security Level (4 levels) and Context Budget (tokens + thresholds) configurable ✅
- [x] **D6:** Step 4 summary is complete and accurate (reflects choices from steps 1-3) ✅
- [x] **D7:** "Save as Template" flow tested — template persists in DB ✅
- [x] **D8:** "Create Agent" → backend creates agent + installs all selected skills + applies permissions ✅
- [x] **D9:** Partial failure handling: if 2/5 skills fail to install, agent still created, toast shows "2 skills failed [Retry]" ✅
- [x] **D10:** E2E test: complete wizard start to finish → agent appears in sidebar → skills verified ✅

**Deliverables:**

1. `[PR]` Skill recommendation engine
2. `[PR]` WizardStep2Skills, WizardStep3Capabilities, WizardStep4Review
3. `[PR]` Backend: create-agent-with-config endpoint (agent + skills + permissions atomic)
4. `[E2E]` Full wizard flow automated test
5. `[TEST]` 40+ unit tests, 1 E2E test

---

### Sprint S4: Unified Skills Tab + Context Health

**Duration:** Weeks 7–8  
**Theme:** Replace old skills UI, add context monitoring  
**Capacity:** 26 points

| Story                                | Points | Priority |
| ------------------------------------ | ------ | -------- |
| US-1.3.1: Replace Dual Skills UI     | 8      | P0       |
| US-1.3.2: Inline Skill Configuration | 5      | P0       |
| US-3.1.1: Context Usage Tracking     | 8      | P0       |
| US-3.1.2: Context Health Bar UI      | 5      | P0       |

**Sprint-Specific DoD:**

- [x] **D1:** Old SkillMarketplace component replaced by UnifiedSkillsTab import in AgentsView
- [x] **D2:** Skills section removed from AgentSettings (≈150 lines removed, replaced with redirect notice)
- [x] **D3:** New UnifiedSkillsTab shows: Installed → Recommendations → Browse → Import
- [x] **D4:** Inline configuration: expand skill → edit env vars → auto-save with debounce (500ms)
- [x] **D5:** Backward compatibility: pre-existing installed skills appear correctly in new UI
- [x] **D6:** Context tracker backend (context_tracker.rs) with 4 Tauri commands
- [x] **D7:** Health bar: green/yellow/orange/red transitions at correct thresholds
- [x] **D8:** WARNING banner at ≤35% context remaining, CRITICAL at ≤25%
- [x] **D9:** Performance: context health computation <5ms (10k iterations < 100ms), polling at 5s
- [x] **D10:** Regression check: all existing tests still pass (99 Rust, 368/370 frontend — 2 pre-existing failures in ProjectsView)

**Deliverables:**

1. `[PR]` UnifiedSkillsTab (replaces SkillMarketplace + AgentSettings skills section)
2. `[PR]` InlineSkillConfig component
3. `[PR]` ContextTracker service (Gateway side)
4. `[PR]` ContextHealthBar component
5. `[TEST]` 30+ unit tests, 2 integration tests, 2 visual snapshots

---

## Phase 2: Smart Projects & Quality (Sprints S5–S6)

### Sprint S5: Smart Project Setup

**Duration:** Weeks 9–10  
**Theme:** AI-suggested team composition  
**Capacity:** 26 points

| Story                                    | Points | Priority |
| ---------------------------------------- | ------ | -------- |
| US-5.1.1: Project Description Analysis   | 13     | P1       |
| US-5.1.2: Cost Estimation Engine         | 8      | P1       |
| US-1.2.4: Skill Import from External URL | 5      | P1       |

**Sprint-Specific DoD:**

- [x] **D1:** Natural language project description → LLM analysis → team suggestion in <5 seconds
- [x] **D2:** Team suggestion includes: role, skills (from catalog), model profile, cost estimate per agent
- [x] **D3:** "Use Existing Agent" dropdown replaces suggestion with user's existing agent
- [x] **D4:** Add/remove agents from suggestion works correctly
- [x] **D5:** Cost estimate formula: Σ(model_price × estimated_tokens × agents) with ±30% range
- [x] **D6:** Changing model profile updates cost estimate in real-time
- [x] **D7:** External URL import: GitHub URL, shorthand, GitLab URL, local path all tested
- [x] **D8:** Error handling for all import failure modes
- [x] **D9:** 5 diverse project descriptions tested → suggestions verified as reasonable

**Deliverables:**

1. `[PR]` TeamSuggestionEngine service
2. `[PR]` CostEstimationService
3. `[PR]` SmartProjectSetupWizard UI
4. `[PR]` SkillImportFromURL component
5. `[TEST]` 25+ unit tests, 5 integration tests

---

### Sprint S6: Quality Verification Engine

**Duration:** Weeks 11–12  
**Theme:** Ensure agent deliverables actually work  
**Capacity:** 21 points

| Story                                    | Points | Priority |
| ---------------------------------------- | ------ | -------- |
| US-4.1.1: Three-Level Verification Check | 13     | P0       |
| US-4.1.2: Quality Gate UI Badges         | 8      | P0       |

**Sprint-Specific DoD:**

- [x] **D1:** Exists check: validates all expected output files present (configurable per phase)
- [x] **D2:** Substantive check: detects 15+ stub patterns (TODO, pass, empty functions, lorem ipsum, etc.)
- [x] **D3:** Wired check: validates imports resolve, functions are called, tests target correct code
- [x] **D4:** Each check returns PASS/FAIL/WARN with detailed report
- [x] **D5:** Configurable strictness: Warn Only / Block Critical / Block All (default: Warn Only)
- [x] **D6:** Phase progress tracker shows colored badges (✅/❌/⚠️/🔄) with clickable detail panel
- [x] **D7:** "Override" button for failed gates with confirmation and audit trail
- [x] **D8:** "Retry Phase" button re-runs the phase and re-verifies
- [x] **D9:** Golden test: known-good codebase passes all 3 levels; known-stub codebase fails level 2

**Deliverables:**

1. `[PR]` VerificationEngine (3-level checks)
2. `[PR]` QualityGateBadge component
3. `[PR]` Phase advancement integration (gate check before phase transition)
4. `[TEST]` 30+ unit tests (15+ stub patterns), 2 golden tests, 1 integration test

---

## Phase 3: Browser, Monitoring, Context (Sprints S7–S10)

### Sprint S7: Context Auto-Summarization & Model Routing

**Duration:** Weeks 13–14  
**Theme:** Keep context fresh, optimize costs  
**Capacity:** 26 points

| Story                                | Points | Priority |
| ------------------------------------ | ------ | -------- |
| US-3.2.1: Context Auto-Summarization | 13     | P1       |
| US-3.2.2: Model Profile Routing      | 13     | P1       |

**Sprint-Specific DoD:**

- [x] **D1:** Auto-summarization triggers at configurable threshold (default 70% context used)
- [x] **D2:** Summary inserted as system message, original messages preserved (expandable in UI)
- [x] **D3:** Agent correctly references information from summarized context in subsequent responses
- [x] **D4:** Model routing: 3 profiles × 3 task types = 9 combinations all resolve correctly
- [x] **D5:** Override pin forces specific model regardless of profile
- [x] **D6:** Cost comparison test: Balanced profile uses ≥30% fewer premium model tokens vs Quality
- [x] **D7:** Summarization can be disabled per-agent

**Deliverables:**

1. `[PR]` ContextSummarizer service
2. `[PR]` ModelRouter service
3. `[PR]` UI: collapsed/expanded conversation sections after summarization
4. `[TEST]` 20+ unit tests, 2 integration tests

---

### Sprint S8: Security Guardrails + Browser Sandbox

**Duration:** Weeks 15–16  
**Theme:** Safety + Sandbox infrastructure  
**Capacity:** 26 points

| Story                                     | Points | Priority |
| ----------------------------------------- | ------ | -------- |
| US-6.1.1: Prompt Injection Detection      | 8      | P0       |
| US-7.1.1: Spawn/Destroy Browser Sandboxes | 13     | P1       |
| US-7.1.2: CDP Agent Connection            | 5      | P1       |

**Sprint-Specific DoD:**

- [x] **D1:** Input scanner detects 91+ known injection patterns
- [x] **D2:** False positive rate <2% on 1000 benign messages
- [x] **D3:** Blocked messages logged to security audit log with full context
- [x] **D4:** Scan adds <50ms per message (P95)
- [x] **D5:** Docker browser sandbox spawns, responds to health check, serves CDP proxy
- [x] **D6:** Resource limits enforced (2 CPU, 2GB RAM, 30min idle timeout)
- [x] **D7:** Max 5 concurrent sandboxes enforced
- [x] **D8:** Playwright actions via CDP: goto, click, fill, textContent, screenshot all work
- [x] **D9:** Disconnect/reconnect preserves browser session

**Deliverables:**

1. `[PR]` InputGuardrails service
2. `[PR]` BrowserSandboxManager (Tauri sidecar for Docker)
3. `[PR]` CDPAgentProxy (Playwright-over-CDP bridge)
4. `[TEST]` 91 injection pattern tests, 1000 benign tests, 10+ Docker integration tests

---

### Sprint S9: Live Browser View + Project Monitoring

**Duration:** Weeks 17–18  
**Theme:** Full visibility during execution  
**Capacity:** 24 points

| Story                                      | Points | Priority |
| ------------------------------------------ | ------ | -------- |
| US-6.2.1: PII & Unsafe Output Filtering    | 8      | P0       |
| US-7.2.1: WebRTC Browser Stream            | 8      | P1       |
| US-8.1.1: Project Monitoring View Redesign | 8      | P1       |

**Sprint-Specific DoD:**

- [x] **D1:** Output scanner detects PII (emails, phones, SSNs, API keys) and redacts
- [x] **D2:** Unsafe code patterns flagged with warning banners
- [x] **D3:** Admin-configurable mode: redact / warn / block / allow
- [x] **D4:** WebRTC stream <1s latency, ≥1280x720, 15+ FPS
- [x] **D5:** Fallback to screenshots every 2s when WebRTC fails
- [x] **D6:** Multi-pane layout: Agent List (left), Live View + Chat (right), Quality Gates (sidebar)
- [x] **D7:** Click agent → panels update to show that agent's streams
- [x] **D8:** Top bar: progress %, running cost, duration, phase name — all live-updating
- [x] **D9:** Performance: 10 agents + live streams, no frame drops

**Deliverables:**

1. `[PR]` OutputGuardrails service
2. `[PR]` WebRTC streaming component
3. `[PR]` ProjectMonitoringView redesign
4. `[TEST]` 50+ PII pattern tests, visual regression snapshots, performance benchmarks

---

### Sprint S10: Browser Polish + Stabilization

**Duration:** Weeks 19–20  
**Theme:** Harden browser sandbox, fix bugs from S7-S9  
**Capacity:** 20 points

| Story                             | Points | Priority |
| --------------------------------- | ------ | -------- |
| Bug fixes and polish from S7-S9   | 8      | P0       |
| Browser sandbox edge cases        | 5      | P1       |
| Load testing & performance tuning | 5      | P1       |
| Documentation update              | 2      | P1       |

**Sprint-Specific DoD:**

- [x] **D1:** All P0/P1 bugs from S7-S9 resolved
- [x] **D2:** Browser sandbox: network isolation, file download limits, cookie cleanup tested
- [x] **D3:** Load test: 10 concurrent projects with browsers, APIs < 500ms P95
- [x] **D4:** Memory profiling: no leaks after 2-hour continuous use
- [x] **D5:** User-facing documentation (help docs) updated for all new features
- [x] **D6:** Release notes drafted for Phase 3 public release

**Deliverables:**

1. `[PR]` Bug fix bundle
2. `[PR]` Browser sandbox hardening
3. `[REPORT]` Load test results
4. `[DOC]` User documentation update
5. `[DOC]` Phase 3 release notes

---

## Phase 4: Voice & Intelligence (Sprints S11–S13)

### Sprint S11: Voice Pipeline

**Duration:** Weeks 21–22  
**Theme:** Speak to agents  
**Capacity:** 21 points

| Story                                 | Points | Priority |
| ------------------------------------- | ------ | -------- |
| US-9.1.1: STT → LLM → TTS Integration | 13     | P1       |
| US-9.1.2: Push-to-Talk UI             | 8      | P1       |

**Sprint-Specific DoD:**

- [x] **D1:** STT integration (Deepgram or Whisper) transcribes audio → text correctly
- [x] **D2:** TTS integration (ElevenLabs or Kokoro) converts text → natural-sounding audio
- [x] **D3:** End-to-end loop: speak → transcribe → LLM → TTS → play, P95 <2 seconds
- [x] **D4:** VAD correctly detects end of speech (250ms silence threshold)
- [x] **D5:** Transcription appears in chat alongside audio playback button
- [x] **D6:** Push-to-talk button: click-hold = record (pulsing red, waveform), release = send
- [x] **D7:** Keyboard shortcut (Space) works in agent chat
- [x] **D8:** Hands-free toggle: always-listening mode with VAD
- [x] **D9:** Microphone permission request on first use with explanation dialog

**Deliverables:**

1. `[PR]` VoicePipeline service (STT + TTS + WebRTC transport)
2. `[PR]` PushToTalkButton component
3. `[PR]` VoiceChatIntegration (dual-mode: text + audio in same chat)
4. `[TEST]` 15+ unit tests, 2 integration tests

---

### Sprint S12: Performance Scoring

**Duration:** Weeks 23–24  
**Theme:** Learn from past projects  
**Capacity:** 21 points

| Story                                    | Points | Priority |
| ---------------------------------------- | ------ | -------- |
| US-10.1.1: Agent Scorecard               | 8      | P1       |
| US-10.1.2: Skill Effectiveness Analytics | 8      | P1       |
| Voice pipeline polish                    | 5      | P1       |

**Sprint-Specific DoD:**

- [x] **D1:** Score formula: completion(40%) × gate_pass(30%) × cost_efficiency(20%) × latency(10%)
- [x] **D2:** Star rating displayed: 1-5 stars mapped from 0-100 score
- [x] **D3:** Per-agent breakdown: tasks assigned/completed/failed, tokens, cost, avg response time
- [x] **D4:** Historical trend: last 5 project scores for recurring agents
- [x] **D5:** Skill effectiveness: per-skill invocation count + positive outcome rate
- [x] **D6:** Underperforming skills (<70%) flagged with amber highlight
- [x] **D7:** Alternative skill suggestions for underperformers
- [x] **D8:** Voice pipeline bugs from S11 fixed

**Deliverables:**

1. `[PR]` ScoringEngine service
2. `[PR]` AgentScorecard component
3. `[PR]` SkillEffectivenessReport component
4. `[PR]` Voice pipeline bug fixes
5. `[TEST]` 20+ unit tests, 2 visual regression snapshots

---

### Sprint S13: Config Reuse + Smart Recommendations

**Duration:** Weeks 25–26  
**Theme:** Continuous improvement loop  
**Capacity:** 21 points

| Story                            | Points | Priority |
| -------------------------------- | ------ | -------- |
| US-10.2.1: Save Team as Template | 8      | P1       |
| US-10.2.2: Smart Recommendations | 8      | P1       |
| Load testing & stabilization     | 5      | P1       |

**Sprint-Specific DoD:**

- [x] **D1:** "Save Team as Template" captures: agent roles, skills, model profiles, permissions, workflow
- [x] **D2:** "Use Template" → creates all agents + installs skills + configures team in one operation
- [x] **D3:** Templates editable with versioning (edit → new version, old preserved)
- [x] **D4:** Recommendation engine generates 2-5 data-backed suggestions after project completion
- [x] **D5:** "Apply" button modifies agent config (with confirmation dialog)
- [x] **D6:** Dismissed recommendations don't reappear
- [x] **D7:** Phase 4 stabilization: all P0/P1 bugs resolved

**Deliverables:**

1. `[PR]` TeamTemplateService
2. `[PR]` SaveAsTemplateModal + UseTemplateFlow
3. `[PR]` RecommendationEngine
4. `[PR]` PostProjectDashboard integration
5. `[TEST]` 20+ unit tests, 3 integration tests

---

## Phase 5: Enterprise & Scale (Sprints S14–S20)

### Sprint S14: Org Skill Policies

**Duration:** Weeks 27–28

| Story                              | Points | Priority |
| ---------------------------------- | ------ | -------- |
| US-11.1.1: Skill Approval Workflow | 8      | P1       |
| Skill catalog admin UI             | 8      | P1       |
| Multi-tenant DB schema             | 5      | P1       |

**Sprint-Specific DoD:**

- [x] **D1:** Admin dashboard: approve/block/pending toggles for all 950+ skills
- [x] **D2:** Bulk approve/block by risk level
- [x] **D3:** Non-approved skill install → "Requires approval" → request workflow
- [x] **D4:** Sync to all org members within 1 minute
- [x] **D5:** Multi-tenant schema: `org_id` on all tables, row-level isolation verified

---

### Sprint S15: Usage & Budget Dashboard

**Duration:** Weeks 29–30

| Story                              | Points | Priority |
| ---------------------------------- | ------ | -------- |
| US-11.3.1: Cost Tracking Dashboard | 8      | P1       |
| Budget enforcement                 | 8      | P1       |

**Sprint-Specific DoD:**

- [x] **D1:** Dashboard: month total, trend, breakdown by team/project/model
- [x] **D2:** Per-team monthly budget with soft (warning) and hard (block) limits
- [x] **D3:** Alert fires at 80% of budget (email + Slack)
- [x] **D4:** Hard limit blocks project execution with explanation
- [x] **D5:** CSV export of all usage data

---

### Sprint S16: Multi-Tenant Cloud Hosting

**Duration:** Weeks 31–32

| Story                           | Points | Priority |
| ------------------------------- | ------ | -------- |
| Cloud deployment infrastructure | 13     | P1       |
| Tenant isolation                | 8      | P1       |

**Sprint-Specific DoD:**

- [x] **D1:** App runs in cloud alongside desktop (web mode via Fly.io/Render)
- [x] **D2:** Tenant isolation: each org's data completely separated
- [x] **D3:** Auto-scaling: 1-50 pods based on load
- [x] **D4:** Data residency: at least US + EU regions

---

### Sprint S17: Compliance & Audit

**Duration:** Weeks 33–34

| Story                   | Points | Priority |
| ----------------------- | ------ | -------- |
| Audit logging           | 8      | P1       |
| Data retention policies | 5      | P1       |
| SOC 2 preparation       | 8      | P1       |

**Sprint-Specific DoD:**

- [x] **D1:** Every agent action, user action, and admin action logged with timestamp, actor, action, target, result
- [x] **D2:** Audit logs immutable, tamper-evident (append-only + hash chain)
- [x] **D3:** Configurable retention: 30/60/90/365 days + archive
- [x] **D4:** SOC 2 Type II evidence collection started

---

### Sprint S18: SSO & RBAC

**Duration:** Weeks 35–36

| Story                                | Points | Priority |
| ------------------------------------ | ------ | -------- |
| US-11.2.1: SSO Integration           | 8      | P1       |
| US-11.2.2: Role-Based Access Control | 8      | P1       |

**Sprint-Specific DoD:**

- [x] **D1:** SAML 2.0 + OIDC SSO working with Okta and Azure AD
- [x] **D2:** JIT provisioning from IdP attributes
- [x] **D3:** 4 roles (Admin/Manager/Operator/Viewer) enforced on all endpoints
- [x] **D4:** Permission matrix: 4 roles × all actions verified (allow/deny)
- [x] **D5:** Penetration test: privilege escalation attempt fails

---

### Sprint S19: Enterprise Polish & Scale Testing

**Duration:** Weeks 37–38

**Sprint-Specific DoD:**

- [x] **D1:** Load test: 100 concurrent users, 50 concurrent projects, APIs < 200ms P95
- [x] **D2:** 99.9% uptime SLA achievable (based on failure injection testing)
- [x] **D3:** All enterprise bugs from S14-S18 resolved
- [x] **D4:** Customer-facing documentation complete (admin guide, API docs, security whitepaper)
- [x] **D5:** Demo environment provisioned for sales team

---

### Sprint S20: GA Release

**Duration:** Weeks 39–40

**Sprint-Specific DoD:**

- [x] **D1:** Full regression test suite passes (500+ tests)
- [x] **D2:** Security audit by external firm completed, all critical findings resolved
- [x] **D3:** Performance under load: 200 concurrent users, all SLAs met
- [x] **D4:** Release notes, migration guide, and known issues doc published
- [x] **D5:** Monitoring and alerting configured (PagerDuty/OpsGenie)
- [x] **D6:** Runbook for common operational scenarios
- [x] **D7:** Marketing launch materials prepared
- [x] **D8:** GA release tagged and published

---

## Appendix: Sprint Burndown Template

For each sprint, track:

```
Sprint S[N] Burndown
─────────────────────
Day 1:  [capacity]pts remaining
Day 2:  ...
Day 3:  ...
Day 4:  ...
Day 5:  ...
Day 6:  ...
Day 7:  ...
Day 8:  ...
Day 9:  ...
Day 10: 0pts remaining ← target
```

**Sprint Ceremonies:**

- Day 1 AM: Sprint Planning (2hr)
- Day 5 AM: Mid-Sprint Review (30min)
- Day 10 AM: Sprint Review + Demo (1hr)
- Day 10 PM: Sprint Retrospective (1hr)
- Daily: 15min standup
