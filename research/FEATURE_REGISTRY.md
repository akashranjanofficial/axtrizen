# Feature Registry: Master Index

> **Project:** OpenClaw + Axtrizen AI  
> **Last Updated:** 2026-03-02  
> **Total:** 11 Epics | 20 Features | 38 User Stories | 679 Tests

---

## Quick Reference: Document Map

| Document                  | Path                                                 | Contents                                                                |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| **Research Synthesis**    | [RESEARCH_SYNTHESIS.md](RESEARCH_SYNTHESIS.md)       | Repo analysis, leverage map, user journeys, wireframes, sprint overview |
| **SDLC Backlog**          | [SDLC_BACKLOG.md](SDLC_BACKLOG.md)                   | Epics → Features → User Stories → Acceptance Criteria                   |
| **Sprint Execution Plan** | [SPRINT_EXECUTION_PLAN.md](SPRINT_EXECUTION_PLAN.md) | Sprint-by-sprint DoD, deliverables, risks                               |
| **Test Specifications**   | [TEST_SPECIFICATIONS.md](TEST_SPECIFICATIONS.md)     | Unit, integration, E2E, visual, perf, security, a11y tests              |
| **Feature Registry**      | [FEATURE_REGISTRY.md](FEATURE_REGISTRY.md)           | This file — master index cross-referencing everything                   |

---

## Epic → Feature → Story → Sprint Matrix

| Epic                              | Feature                            | User Story                             | Sprint | Points | Priority | Tests                             |
| --------------------------------- | ---------------------------------- | -------------------------------------- | ------ | ------ | -------- | --------------------------------- |
| **E1: Unified Skill System**      |                                    |                                        |        |        |          |                                   |
|                                   | F1.1: Skill Data Unification       |                                        | S1     | 13     | P0       |                                   |
|                                   |                                    | US-1.1.1: Unified Skill Schema         | S1     | 8      | P0       | UT-1.1.1..5, IT-1.1               |
|                                   |                                    | US-1.1.2: Catalog Indexing             | S1     | 5      | P0       | UT-1.2.1..8, PT-1                 |
|                                   |                                    | US-1.1.3: Skills CLI Sidecar           | S1     | 13     | P0       | UT-1.3.1..9, IT-1.3..4            |
|                                   | F1.2: Skill Browser UI             |                                        | S2–S3  | 13     | P0       |                                   |
|                                   |                                    | US-1.2.1: Skill Browser Component      | S2     | 8      | P0       | UT-1.4.1..8, VR-1, PT-2, A11Y-1   |
|                                   |                                    | US-1.2.2: Skill Bundles                | S2     | 5      | P0       | UT-1.5.1..5, VR-10                |
|                                   |                                    | US-1.2.3: Smart Recommendations        | S3     | 5      | P0       | UT-1.6.1..5                       |
|                                   |                                    | US-1.2.4: Import from URL              | S5     | 5      | P1       | IT-1.3                            |
|                                   | F1.3: Unified Skills Tab           |                                        | S4     | 8      | P0       |                                   |
|                                   |                                    | US-1.3.1: Replace Dual Skills UI       | S4     | 8      | P0       | UT-1.7.1..5, VR-9, PT-3, A11Y-8   |
|                                   |                                    | US-1.3.2: Inline Skill Configuration   | S4     | 5      | P0       | (included in UT-1.7)              |
| **E2: Agent Creation Wizard**     |                                    |                                        |        |        |          |                                   |
|                                   | F2.1: Multi-Step Wizard            |                                        | S2–S3  | 8      | P0       |                                   |
|                                   |                                    | US-2.1.1: 4-Step Wizard Shell          | S2     | 8      | P0       | UT-2.1.1..8, VR-2, A11Y-2         |
|                                   |                                    | US-2.1.2: Step 1 — Identity            | S2     | 5      | P0       | UT-2.2.1..6                       |
|                                   |                                    | US-2.1.3: Step 2 — Skills              | S3     | 8      | P0       | UT-2.3.1..7                       |
|                                   |                                    | US-2.1.4: Step 3 — Capabilities        | S3     | 5      | P0       | UT-2.4.1..7                       |
|                                   |                                    | US-2.1.5: Step 4 — Review & Create     | S3     | 8      | P0       | UT-2.5.1..5, IT-2.1..4, E2E-1     |
| **E3: Context Intelligence**      |                                    |                                        |        |        |          |                                   |
|                                   | F3.1: Context Health Monitoring    |                                        | S4     | 8      | P0       |                                   |
|                                   |                                    | US-3.1.1: Context Usage Tracking       | S4     | 8      | P0       | UT-3.1.1..5, PT-4                 |
|                                   |                                    | US-3.1.2: Context Health Bar UI        | S4     | 5      | P0       | UT-3.1.6..11, VR-3, A11Y-3        |
|                                   | F3.2: Auto-Summarization & Routing |                                        | S7     | 13     | P1       |                                   |
|                                   |                                    | US-3.2.1: Context Auto-Summarization   | S7     | 13     | P1       | UT-3.2.1..5, IT-3.2               |
|                                   |                                    | US-3.2.2: Model Profile Routing        | S7     | 13     | P1       | UT-3.3.1..10, IT-3.3              |
| **E4: Quality Verification**      |                                    |                                        |        |        |          |                                   |
|                                   | F4.1: Goal-Backward Verification   |                                        | S6     | 13     | P0       |                                   |
|                                   |                                    | US-4.1.1: Three-Level Verification     | S6     | 13     | P0       | UT-4.1.1..22, IT-4.1..3           |
|                                   |                                    | US-4.1.2: Quality Gate Badges          | S6     | 8      | P0       | VR-4, A11Y-4                      |
| **E5: Smart Project Setup**       |                                    |                                        |        |        |          |                                   |
|                                   | F5.1: AI-Suggested Teams           |                                        | S5     | 13     | P1       |                                   |
|                                   |                                    | US-5.1.1: Project Description Analysis | S5     | 13     | P1       | UT-5.1.1..5, E2E-3                |
|                                   |                                    | US-5.1.2: Cost Estimation Engine       | S5     | 8      | P1       | UT-5.2.1..4                       |
| **E6: Security Guardrails**       |                                    |                                        |        |        |          |                                   |
|                                   | F6.1: Input Guardrails             |                                        | S8     | 8      | P0       |                                   |
|                                   |                                    | US-6.1.1: Prompt Injection Detection   | S8     | 8      | P0       | UT-6.1.1..99, ST-1..3, IT-5.1     |
|                                   | F6.2: Output Guardrails            |                                        | S9     | 8      | P0       |                                   |
|                                   |                                    | US-6.2.1: PII & Unsafe Filtering       | S9     | 8      | P0       | UT-6.2.1..11, ST-4, IT-5.2, E2E-5 |
| **E7: Browser Sandbox**           |                                    |                                        |        |        |          |                                   |
|                                   | F7.1: Docker Browser Management    |                                        | S8     | 13     | P1       |                                   |
|                                   |                                    | US-7.1.1: Spawn/Destroy Sandboxes      | S8     | 13     | P1       | IT-6.1..4, PT-7, ST-8             |
|                                   |                                    | US-7.1.2: CDP Agent Connection         | S8     | 5      | P1       | IT-6.1..3                         |
|                                   | F7.2: Live Browser View            |                                        | S9     | 8      | P1       |                                   |
|                                   |                                    | US-7.2.1: WebRTC Browser Stream        | S9     | 8      | P1       | PT-8                              |
| **E8: Live Monitoring**           |                                    |                                        |        |        |          |                                   |
|                                   | F8.1: Multi-Pane Layout            |                                        | S9     | 8      | P1       |                                   |
|                                   |                                    | US-8.1.1: Monitoring View Redesign     | S9     | 8      | P1       | VR-5, PT-10, A11Y-7               |
| **E9: Voice Interaction**         |                                    |                                        |        |        |          |                                   |
|                                   | F9.1: Voice Pipeline               |                                        | S11    | 13     | P1       |                                   |
|                                   |                                    | US-9.1.1: STT → LLM → TTS              | S11    | 13     | P1       | UT-9.1.1..2, PT-9, E2E-4          |
|                                   |                                    | US-9.1.2: Push-to-Talk UI              | S11    | 8      | P1       | UT-9.1.3..5, VR-7, A11Y-5         |
| **E10: Intelligence & Analytics** |                                    |                                        |        |        |          |                                   |
|                                   | F10.1: Performance Scoring         |                                        | S12    | 8      | P1       |                                   |
|                                   |                                    | US-10.1.1: Agent Scorecard             | S12    | 8      | P1       | UT-10.1.1..5, VR-6                |
|                                   |                                    | US-10.1.2: Skill Effectiveness         | S12    | 8      | P1       | UT-10.1.6..7                      |
|                                   | F10.2: Config Reuse                |                                        | S13    | 8      | P1       |                                   |
|                                   |                                    | US-10.2.1: Save Team Template          | S13    | 8      | P1       | IT-2.4                            |
|                                   |                                    | US-10.2.2: Smart Recommendations       | S13    | 8      | P1       | (dedicated UTs)                   |
| **E11: Enterprise Platform**      |                                    |                                        |        |        |          |                                   |
|                                   | F11.1: Org Skill Policies          |                                        | S14    | 8      | P1       |                                   |
|                                   |                                    | US-11.1.1: Skill Approval Workflow     | S14    | 8      | P1       | UT-11.1.1..4, IT-7.1              |
|                                   | F11.2: SSO & RBAC                  |                                        | S18    | 13     | P1       |                                   |
|                                   |                                    | US-11.2.1: SSO Integration             | S18    | 8      | P1       | ST-6                              |
|                                   |                                    | US-11.2.2: RBAC                        | S18    | 8      | P1       | UT-11.2.1..7, IT-7.3, ST-5        |
|                                   | F11.3: Usage & Budget              |                                        | S15    | 8      | P1       |                                   |
|                                   |                                    | US-11.3.1: Cost Dashboard              | S15    | 8      | P1       | VR-8, IT-7.2, A11Y-6              |

---

## Sprint Calendar (40 Weeks)

| Sprint | Weeks | Phase                  | Theme                       | Key Deliverable                                    |
| ------ | ----- | ---------------------- | --------------------------- | -------------------------------------------------- |
| S1     | 1–2   | P0: Foundation         | Skill Data Backend          | Unified DB schema, catalog, CLI sidecar            |
| S2     | 3–4   | P0: Foundation         | Skill UI + Wizard Shell     | SkillBrowser, bundles, wizard Step 1               |
| S3     | 5–6   | P1: Agent Creation     | Wizard Steps 2-4            | Complete wizard with skills, capabilities, review  |
| S4     | 7–8   | P1: Agent Creation     | Unified Tab + Context       | Replace old skills UI, context health bar          |
| S5     | 9–10  | P2: Smart Projects     | AI Team Suggestion          | Project setup with AI composition + cost estimates |
| S6     | 11–12 | P2: Quality            | Verification Engine         | 3-level verification, quality gate badges          |
| S7     | 13–14 | P3: Context            | Auto-Summarize + Routing    | Context compression, model profile routing         |
| S8     | 15–16 | P3: Security + Browser | Guardrails + Sandbox        | Prompt injection, browser containers               |
| S9     | 17–18 | P3: Monitoring         | Live View + Monitoring      | WebRTC stream, multi-pane monitor, PII filter      |
| S10    | 19–20 | P3: Stabilize          | Polish & Load Test          | Bug fixes, performance tuning, docs                |
| S11    | 21–22 | P4: Voice              | Voice Pipeline              | STT/TTS with push-to-talk                          |
| S12    | 23–24 | P4: Analytics          | Agent Scoring               | Performance scorecards, skill analytics            |
| S13    | 25–26 | P4: Reuse              | Templates + Recommendations | Save/reuse team configs, smart suggestions         |
| S14    | 27–28 | P5: Enterprise         | Skill Policies              | Org-level approval, bulk manage                    |
| S15    | 29–30 | P5: Enterprise         | Usage Dashboard             | Cost tracking, budgets, alerts                     |
| S16    | 31–32 | P5: Enterprise         | Cloud Hosting               | Multi-tenant, auto-scaling                         |
| S17    | 33–34 | P5: Enterprise         | Compliance                  | Audit logging, data retention                      |
| S18    | 35–36 | P5: Enterprise         | SSO & RBAC                  | Okta/Azure AD, 4 roles                             |
| S19    | 37–38 | P5: Enterprise         | Scale Testing               | 100 users, 50 projects concurrent                  |
| S20    | 39–40 | P5: GA                 | Release                     | Security audit, final regression, GA               |

---

## Velocity Tracking Template

| Sprint | Planned | Completed | Carry Over | Velocity |
| ------ | ------- | --------- | ---------- | -------- |
| S1     | 26      | 26        | 0          | 26       |
| S2     | 26      | 26        | 0          | 26       |
| S3     | 26      | 26        | 0          | 26       |
| S4     | 26      | 26        | 0          | 26       |
| S5     | 26      | 26        | 0          | 26       |
| S6     | 21      | 21        | 0          | 21       |
| S7     | 26      | 26        | 0          | 26       |
| S8     | 26      | 26        | 0          | 26       |
| S9     | 24      | 24        | 0          | 24       |
| S10    | 20      | 20        | 0          | 20       |
| S11    | 21      | 21        | 0          | 21       |
| S12    | 21      | 21        | 0          | 21       |
| S13    | 21      | 21        | 0          | 21       |
| S14    | 21      | 21        | 0          | 21       |
| S15    | 16      | 16        | 0          | 16       |
| S16    | 21      | 21        | 0          | 21       |
| S17    | 21      | 21        | 0          | 21       |
| S18    | 16      | 16        | 0          | 16       |
| S19    | 20      | 20        | 0          | 20       |
| S20    | 20      | 20        | 0          | 20       |

**Running average velocity** = 22.4 (total 447 points across 20 sprints)

---

## Status Key

| Symbol | Meaning                           |
| ------ | --------------------------------- |
| 🟢     | Done — all DoD criteria met       |
| 🟡     | In Progress — work started        |
| 🔴     | Blocked — dependency or issue     |
| ⚪     | Not Started                       |
| 🔵     | Carried Over from previous sprint |

---

## Dependency Graph

```
S1 (Skill Schema) ──────────┐
                              ├── S2 (Skill Browser + Wizard Shell)
                              │      ├── S3 (Wizard Steps 2-4)
                              │      │      ├── S4 (Unified Tab + Context Health)
                              │      │      │      ├── S5 (Smart Project Setup)
                              │      │      │      │      └── S6 (Verification Engine)
                              │      │      │      │             └── S9 (Monitoring View)
                              │      │      │      └── S7 (Auto-Summarize + Routing)
                              │      │      └── S14 (Org Skill Policies)
                              │      └── S8 (Security + Browser Sandbox)
                              │             └── S9 (Live View + Monitoring)
                              │                    └── S10 (Stabilization)
                              └── S11 (Voice) ← independent after S4
                                     └── S12 (Scoring)
                                            └── S13 (Templates)
                                                   └── S14-S20 (Enterprise)
```

---

## Traceability: Repository → Feature

| Research Repo              | Skills Leveraged                                  | Features Enabled                                  |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| antigravity-awesome-skills | 950+ SKILL.md catalog, risk taxonomy, bundles     | F1.1, F1.2, F1.3, F11.1                           |
| skills (Vercel Labs)       | CLI for install/remove/search, lockfile, HTTP API | F1.1 (sidecar), F1.2 (import), F1.3 (unified tab) |
| agents-towards-production  | Guardrail patterns, observability, eval loops     | F6.1, F6.2, F10.1, F10.2                          |
| vision-agents              | WebRTC pipeline, STT/TTS, multimodal serving      | F9.1, F7.2                                        |
| kernel-images              | Docker Chrome sandbox, CDP proxy, live view       | F7.1, F7.2                                        |
| get-shit-done              | Context monitoring, verification, model routing   | F3.1, F3.2, F4.1                                  |
