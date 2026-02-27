# Research Synthesis: Repository Analysis & Strategic Integration Plan for OpenClaw + Axtrizen AI

> **Date:** 2026-02-27  
> **Scope:** 6 open-source repositories analyzed for enterprise-scale feature integration  
> **Target:** Scale OpenClaw + Axtrizen AI to 1M+ professional/enterprise users

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Repository Summaries](#2-repository-summaries)
3. [Leverage Map — What Can We Use & Where](#3-leverage-map)
4. [User Journey Redesign — How It All Feels](#4-user-journey-redesign)
   - 4.1 Creating an Agent (The Core Flow)
   - 4.2 Managing Skills on an Existing Agent
   - 4.3 Setting Up a Project (Smart Wizard)
   - 4.4 Watching Agents Work (Live Monitoring)
   - 4.5 After the Project (Learning & Reuse)
   - 4.6 Enterprise Admin (Org-Wide Management)
5. [Feature Blueprint — Mapped to User Journeys](#5-feature-blueprint)
6. [Full SDLC Plan — Sprint by Sprint](#6-full-sdlc-plan)
7. [Risk Matrix & Mitigations](#7-risk-matrix)
8. [Success Metrics & KPIs](#8-success-metrics)

---

## 1. Executive Summary

We analyzed 6 repositories spanning **agent skills ecosystems, production agent patterns, real-time multimodal AI, sandboxed browser infrastructure, skill package management, and spec-driven development orchestration**. Here is how each maps to OpenClaw:

| Repository                     | What It Is                                 | Strategic Value to OpenClaw                                                |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------- |
| **antigravity-awesome-skills** | 950+ agent skill library (SKILL.md format) | **Skill Marketplace** — prebuilt skill catalog for agents                  |
| **skills** (Vercel Labs)       | CLI package manager for agent skills       | **Skill Distribution Infrastructure** — install/update/lock skill packages |
| **agents-towards-production**  | 22 production agent tutorials              | **Reference Architecture** — memory, security, eval, deployment patterns   |
| **vision-agents**              | Real-time multimodal AI framework          | **Voice/Video Agent Capabilities** — live interaction layer                |
| **kernel-images**              | Sandboxed browser-in-Docker infra          | **Computer Use Sandbox** — browser automation for agents                   |
| **get-shit-done**              | Spec-driven AI development orchestration   | **Orchestration Engine Upgrade** — context engineering, verification       |

**Bottom Line:** These repos collectively provide the building blocks to transform OpenClaw from a desktop-first multi-agent platform into a **full enterprise AI agent operating system** with a skill marketplace, real-time multimodal interactions, secure sandboxed execution, production-grade memory/security/observability, and intelligent context management — all capable of serving 1M+ enterprise users.

---

## 2. Repository Summaries

### 2.1 antigravity-awesome-skills

**URL:** https://github.com/sickn33/antigravity-awesome-skills  
**Category:** Agent Skill Library

- **950+ curated agent skills** in SKILL.md format with YAML frontmatter (name, description, risk level, tags, category)
- Organized into 9 categories: Architecture, Business, Data & AI, Development, General, Infrastructure, Security, Testing, Workflow
- **Bundle system:** Role-based skill groups (Security Engineer, Full-Stack Developer, Agent Architect, DevOps, etc.)
- **Workflow playbooks:** Multi-step execution sequences ("Ship a SaaS MVP", "Security Audit", "Build an AI Agent System")
- Machine-readable indices: `skills_index.json` (full catalog), `bundles.json`, `workflows.json`, `aliases.json`
- Risk tagging: `safe`, `unknown`, `critical`, `offensive` — enables runtime guardrails
- React/Vite web app for browsing, Python/Node build pipeline for validation + indexing

### 2.2 skills (Vercel Labs)

**URL:** https://github.com/vercel-labs/skills  
**Category:** Skill Package Manager

- **npm for AI agent skills** — CLI tool (`npx skills`) for discover/install/update/remove
- Supports **40+ AI agents** including OpenClaw (already a supported target!)
- Multi-source installation: GitHub shorthand, full URLs, GitLab, local paths, git URLs
- **Symlink-based canonical storage** — skills stored once in `.agents/skills/`, symlinked to each agent
- Dual lock file system: global (`~/.agents/.skill-lock.json`) + project-level (`skills-lock.json`)
- Interactive search via skills.sh API, security auditing before install (Socket, Snyk)
- **Pluggable provider system:** Mintlify, HuggingFace, Well-Known (RFC 8615) — extensible
- node_modules sync — experimental feature to discover skills in npm packages

### 2.3 agents-towards-production

**URL:** https://github.com/NirDiamant/agents-towards-production  
**Category:** Production Agent Reference Architecture

- **22 runnable tutorials** covering every production-readiness concern:
  - **Memory:** Redis (dual short/long-term), Mem0 (self-improving hybrid vector+graph), Cognee (knowledge graphs)
  - **Orchestration:** LangGraph (stateful graph workflows), A2A (Google's agent-to-agent protocol)
  - **Security:** LlamaFirewall (input/output/tool guardrails), Apex (prompt injection attack & defense — 91 examples)
  - **Tool Integration:** MCP servers, Arcade.dev (OAuth2 multi-user tool calling)
  - **Deployment:** Docker, RunPod GPU serverless, AWS Bedrock AgentCore, FastAPI agent-as-API
  - **Evaluation:** IntellAgent (automated behavioral analysis), LangSmith (tracing/observability)
  - **Fine-tuning:** Custom model training for agent behavior
  - **UI:** Streamlit chat interfaces
  - **RAG:** Contextual AI for document analysis
  - **Web Access:** Tavily (search/extract/crawl), Bright Data (scraping)

### 2.4 vision-agents

**URL:** https://github.com/akashranjanofficial/vision-agents  
**Category:** Real-Time Multimodal AI Framework

- Python framework for **live video/audio AI agents** via WebRTC (sub-30ms latency)
- **Pluggable architecture:** 30+ plugins for LLMs (Gemini, OpenAI, Anthropic, Bedrock), STT (Deepgram, Whisper), TTS (ElevenLabs, Cartesia, Kokoro), Video (YOLO, Roboflow, Moondream)
- Full speech loop: STT → LLM → TTS with intelligent turn detection
- **Computer Use ready:** Plug into screen capture + keyboard/mouse control
- Function/tool calling registry with MCP support
- RAG via TurboPuffer (hybrid vector + BM25)
- Phone integration via Twilio, HeyGen avatar support
- HTTP agent server with session management, warmup caching, concurrency limits
- OpenTelemetry observability throughout

### 2.5 kernel-images

**URL:** https://github.com/kernel/kernel-images  
**Category:** Sandboxed Browser Infrastructure

- **Sandboxed Chrome browsers in Docker** — the infrastructure for browser-using AI agents
- Full REST API (40+ endpoints): browser automation, computer control (click/type/scroll/screenshot), file system, process management, screen recording
- **CDP proxy** — Playwright/Puppeteer connect/disconnect/reconnect to persistent sessions
- **Live View** via WebRTC + NoVNC fallback — humans can watch agents browse in real-time
- **Unikernel mode:** Sub-20ms cold restart, snapshot/restore (preserves cookies/state), scale-to-zero
- Persistent Playwright daemon — accepts TypeScript code execution against warm browser connections
- Anti-fingerprinting (20+ font families), batch actions for low-latency multi-step UI operations
- Go server, Envoy proxy with JWT auth, supervisord process management

### 2.6 get-shit-done (GSD)

**URL:** https://github.com/gsd-build/get-shit-done  
**Category:** Spec-Driven Development Orchestration

- **Meta-prompting system** that solves context rot in long AI sessions
- Full project lifecycle: `new-project` → `discuss` → `plan` → `execute` → `verify` → `complete`
- **11 specialized agents:** planner, executor, verifier, debugger, codebase-mapper, researchers, roadmapper, plan-checker, integration-checker
- **Wave-based parallel execution** — dependency graph → wave grouping → concurrent execution
- **Context window monitoring** — hooks inject WARNING/CRITICAL alerts when context runs low
- **Goal-backward verification** — checks if the goal was achieved, not just if tasks completed
- Stub/placeholder detection (TODO patterns, empty returns, hardcoded values)
- **Model profile routing** — Opus for planning, Sonnet for execution, Haiku for verification
- File-system-as-memory: `.planning/` directory with PROJECT.md, ROADMAP.md, STATE.md
- Atomic git integration (one commit per task)

---

## 3. Leverage Map

### 3.1 Direct Integration Opportunities

| Source Repo                    | Feature                         | Target in OpenClaw                 | Integration Effort | Impact      |
| ------------------------------ | ------------------------------- | ---------------------------------- | ------------------ | ----------- |
| **antigravity-awesome-skills** | 950+ skill catalog              | Skill Marketplace in Axtrizen UI   | Medium             | 🔴 Critical |
| **antigravity-awesome-skills** | Bundle system                   | Role-based agent presets           | Low                | 🟠 High     |
| **antigravity-awesome-skills** | Workflow playbooks              | Workflow template library          | Low                | 🟠 High     |
| **antigravity-awesome-skills** | Risk tagging                    | Agent guardrail system             | Low                | 🟠 High     |
| **skills (Vercel)**            | Skill install/update CLI        | Backend skill management           | Medium             | 🔴 Critical |
| **skills (Vercel)**            | Lock file system                | Reproducible agent configs         | Low                | 🟡 Medium   |
| **skills (Vercel)**            | Provider system                 | Custom skill sources               | Medium             | 🟠 High     |
| **agents-towards-production**  | Redis dual-memory               | memU enhancement                   | High               | 🔴 Critical |
| **agents-towards-production**  | LlamaFirewall patterns          | Input/output guardrails            | Medium             | 🔴 Critical |
| **agents-towards-production**  | LangSmith tracing               | Agent observability dashboard      | Medium             | 🟠 High     |
| **agents-towards-production**  | IntellAgent eval                | Agent quality scoring              | Medium             | 🟠 High     |
| **agents-towards-production**  | MCP + Arcade patterns           | Secure external tool calling       | Medium             | 🟠 High     |
| **agents-towards-production**  | A2A protocol                    | Inter-agent communication layer    | High               | 🟠 High     |
| **vision-agents**              | STT → LLM → TTS pipeline        | Voice interaction mode             | High               | 🔴 Critical |
| **vision-agents**              | WebRTC transport                | Real-time agent streaming          | High               | 🟠 High     |
| **vision-agents**              | Screen understanding            | Visual agent feedback              | Medium             | 🟠 High     |
| **vision-agents**              | Phone/Twilio integration        | Phone-based agent access           | Medium             | 🟡 Medium   |
| **kernel-images**              | Browser sandbox                 | Agent web browsing                 | High               | 🔴 Critical |
| **kernel-images**              | Computer Use API                | Autonomous UI interaction          | Medium             | 🔴 Critical |
| **kernel-images**              | Live View (WebRTC)              | Human monitoring of agent browsing | Low                | 🟠 High     |
| **kernel-images**              | Session persistence             | Long-running browser tasks         | Medium             | 🟠 High     |
| **kernel-images**              | Scale-to-zero                   | Cost-efficient sandbox fleet       | Medium             | 🟡 Medium   |
| **get-shit-done**              | Context window monitoring       | Context management hooks           | Low                | 🔴 Critical |
| **get-shit-done**              | Goal-backward verification      | Deliverable quality gates          | Medium             | 🔴 Critical |
| **get-shit-done**              | Wave-based parallel exec        | Orchestrator upgrade               | Medium             | 🟠 High     |
| **get-shit-done**              | Model profile routing           | Cost-optimized model selection     | Low                | 🟠 High     |
| **get-shit-done**              | Stub detection                  | Code quality enforcement           | Low                | 🟠 High     |
| **get-shit-done**              | `.planning/` file-system memory | Project state management           | Medium             | 🟠 High     |

### 3.2 Where Each Integration Lands in Our Stack

```
┌──────────────────────────────────────────────────────────────────────┐
│                        AXTRIZEN FRONTEND (React)                      │
│                                                                        │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │Skill Market-│ │Voice/Video   │ │Browser Live  │ │Agent Eval    │  │
│  │place Browser│ │Interaction   │ │View Monitor  │ │Dashboard     │  │
│  │[antigravity]│ │[vision-agents│ │[kernel-images│ │[agents-prod] │  │
│  └─────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │Context Mgmt │ │Quality Gates │ │Security      │ │Observability │  │
│  │Monitor      │ │& Verification│ │Guardrails    │ │Traces        │  │
│  │[gsd]        │ │[gsd]         │ │[agents-prod] │ │[agents-prod] │  │
│  └─────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│                    TAURI BACKEND (Rust)                                │
│                                                                        │
│  ┌─────────────────┐ ┌──────────────────┐ ┌────────────────────────┐  │
│  │Skill Manager     │ │Browser Sandbox   │ │Enhanced Orchestrator   │  │
│  │(install/update/  │ │Manager (spawn/   │ │(wave execution,        │  │
│  │ lock/discover)   │ │monitor/snapshot) │ │ context monitoring,    │  │
│  │[skills CLI]      │ │[kernel-images]   │ │ model routing, verify) │  │
│  └─────────────────┘ └──────────────────┘ │[gsd patterns]          │  │
│                                             └────────────────────────┘  │
│  ┌─────────────────┐ ┌──────────────────┐ ┌────────────────────────┐  │
│  │Voice Pipeline    │ │Security Layer    │ │Evaluation Engine       │  │
│  │(STT/TTS/Turn)   │ │(guardrails,      │ │(quality scoring,       │  │
│  │[vision-agents]   │ │ prompt injection │ │ behavioral analysis)   │  │
│  └─────────────────┘ │ defense)         │ │[agents-prod]           │  │
│                       │[agents-prod]     │ └────────────────────────┘  │
│                       └──────────────────┘                             │
├──────────────────────────────────────────────────────────────────────┤
│                    OPENCLAW GATEWAY (Node.js)                          │
│                                                                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │Skills Platform│ │MCP Tool Hub  │ │A2A Protocol  │ │RAG Pipeline  │ │
│  │(SKILL.md load,│ │(external API │ │(agent-to-    │ │(doc grounding│ │
│  │ bundle system)│ │ integration) │ │ agent comms) │ │ web search)  │ │
│  │[antigravity + │ │[agents-prod] │ │[agents-prod] │ │[agents-prod  │ │
│  │ skills CLI]   │ │              │ │              │ │ + Tavily]    │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE (Cloud)                               │
│                                                                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │Browser Fleet  │ │GPU Inference │ │Redis Memory  │ │Observability │ │
│  │(Docker/Uni-  │ │(RunPod/      │ │Cluster       │ │(OpenTelemetry│ │
│  │ kernel pool) │ │ Bedrock)     │ │(dual memory) │ │ + LangSmith) │ │
│  │[kernel-images]│ │[agents-prod] │ │[agents-prod] │ │[agents-prod  │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ │+ vision-agt] │ │
│                                                       └──────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. User Journey Redesign — How It All Feels

> **Design Principle:** Every feature must be discoverable at the moment the user needs it. No hidden menus, no "go to settings first." The user's natural workflow IS the navigation.

### Current State vs. Target State

| Touchpoint          | Current (Today)                                                                                       | Target (After Integration)                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Create Agent**    | Modal: name, role, template, workdir → done. No skills.                                               | Multi-step wizard: identity → skills → capabilities → model → done. Agent is ready to work on day one.                                      |
| **Agent Skills**    | Hidden in Tab 4 (marketplace) + Tab 5 (settings config). Two disconnected systems for the same thing. | Unified skill system. Browse, install, and configure right inside the agent creation flow AND the agent detail page. One system, one truth. |
| **Agent Settings**  | 1421-line page mixing models, 54 skills, 14 messaging channels, TTS, sandbox, A2A                     | Clean sections. Skills get their own first-class section. Model config is step 1 of agent creation.                                         |
| **Team + Project**  | Create team → add agents → create project → assign team → start                                       | Smart wizard: "What do you want done?" → auto-suggests team composition + skills per agent based on the goal                                |
| **Running Project** | Activity feed + manual feedback                                                                       | Live agent views (browser, terminal, chat), context health bar, quality gates with visual verdicts, voice check-ins                         |
| **Post-Project**    | Final report markdown                                                                                 | Agent scorecards, skill effectiveness analysis, "save this config as a template"                                                            |

---

### 4.1 USER JOURNEY: Creating an Agent (The Core Flow)

**Current:** Click "+" → modal with 5 fields → agent exists but has no skills, no model preference, no personality beyond a one-line role.

**New Design — 4-Step Agent Creation Wizard:**

```
┌──────────────────────────────────────────────────────────────────┐
│  Step 1/4          Step 2/4          Step 3/4          Step 4/4  │
│  ● Identity        ○ Skills          ○ Capabilities    ○ Review  │
│  ─────────         ─────────         ────────────      ────────  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  STEP 1: IDENTITY                                                │
│  ┌────────────────────────────┐                                  │
│  │ 👤 Start from Template     │  ← role template picker (grid)   │
│  │    OR blank agent          │                                  │
│  └────────────────────────────┘                                  │
│  Name: [Code Reviewer___________]                                │
│  Type: [Worker ▼] / [Manager ▼]                                  │
│  Role: [Reviews PRs and ensures code quality___]                 │
│  Model: [claude-sonnet-4-20250514 ▼]  Profile: [Balanced ▼]     │
│         ↳ (Quality = Opus | Balanced = Sonnet | Budget = Haiku)  │
│  Working Directory: [~/projects/myapp] [📁]                      │
│                                                                   │
│  ┌─ Personality (optional, click to expand) ─────────────────┐   │
│  │  SOUL.md: [textarea — who this agent is, values, style]   │   │
│  │  IDENTITY.md: [textarea — background, expertise areas]    │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│                                         [Back] [Next: Skills →]  │
└──────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────┐
│  Step 1/4          Step 2/4          Step 3/4          Step 4/4  │
│  ✓ Identity        ● Skills          ○ Capabilities    ○ Review  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  STEP 2: EQUIP YOUR AGENT WITH SKILLS                            │
│                                                                   │
│  ┌─ Quick Start: Install a Bundle ───────────────────────────┐   │
│  │  🔒 Security Engineer  🛠 Full-Stack Dev  📐 Architect    │   │
│  │  🚀 DevOps & Cloud     📊 Data Engineer   🎨 Web Designer │   │
│  │  ↳ Click any bundle to auto-install 10-20 relevant skills │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Recommended for "Code Reviewer" role ────────────────────┐   │
│  │  ✅ code-review        ✅ pull-request-analysis            │   │
│  │  ✅ security-scanning  ☐ documentation-review              │   │
│  │  ☐ performance-audit   ☐ accessibility-check               │   │
│  │  ↳ Auto-suggested based on role. Check to install.         │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Browse All Skills (950+) ────────────────────────────────┐   │
│  │  🔍 [Search skills..._______________]                      │   │
│  │  [All] [Architecture] [Security] [Testing] [DevOps] [AI]  │   │
│  │                                                             │   │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐ │   │
│  │  │ 🧪 TDD Mastery  │ │ 🔐 OWASP Top10 │ │ 📝 API Design│ │   │
│  │  │ Testing          │ │ Security        │ │ Architecture │ │   │
│  │  │ Risk: safe       │ │ Risk: safe      │ │ Risk: safe   │ │   │
│  │  │ [+ Install]      │ │ [+ Install]     │ │ [+ Install]  │ │   │
│  │  └─────────────────┘ └─────────────────┘ └──────────────┘ │   │
│  │  ... (paginated grid, 950+ skills)                         │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Import from URL ─────────────────────────────────────────┐   │
│  │  [https://github.com/org/my-custom-skill___] [+ Import]   │   │
│  │  ↳ GitHub, GitLab, or any SKILL.md URL                     │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  Installed (4): code-review, pull-request-analysis,              │
│                 security-scanning, tdd-mastery                   │
│                                                                   │
│                                    [← Back] [Next: Capabilities →]│
└──────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────┐
│  Step 1/4          Step 2/4          Step 3/4          Step 4/4  │
│  ✓ Identity        ✓ Skills          ● Capabilities    ○ Review  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  STEP 3: WHAT CAN THIS AGENT ACCESS?                             │
│                                                                   │
│  ┌─ Tool Permissions ────────────────────────────────────────┐   │
│  │  🌐 Web Browser       [●  Full Access  ▼]                 │   │
│  │  💻 Terminal/Shell     [●  Full Access  ▼]                 │   │
│  │  📁 File System        [◐  Read + project dir only ▼]     │   │
│  │  🔗 GitHub API         [●  Full Access  ▼]                 │   │
│  │  💬 Slack/Discord      [◐  Read Only  ▼]                   │   │
│  │  🐳 Docker Sandbox     [○  Disabled  ▼]                    │   │
│  │  📞 Phone/Voice        [○  Disabled  ▼]                    │   │
│  │                                                             │   │
│  │  Options: Full Access / Read Only / Requires Approval /    │   │
│  │           Disabled                                          │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Security Level ──────────────────────────────────────────┐   │
│  │  ○ Open — agent can use any safe-tagged skill freely       │   │
│  │  ● Standard — unknown-risk skills need one-time approval   │   │
│  │  ○ Strict — all tool use shows confirmation prompt first   │   │
│  │  ○ Locked — only pre-approved skills, no new installs      │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Context Budget ──────────────────────────────────────────┐   │
│  │  Max tokens per session: [200,000]                         │   │
│  │  Auto-summarize at: [70%] context usage                    │   │
│  │  Alert at: [35%] remaining                                 │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│                                      [← Back] [Next: Review →]   │
└──────────────────────────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────────────────────────┐
│  Step 1/4          Step 2/4          Step 3/4          Step 4/4  │
│  ✓ Identity        ✓ Skills          ✓ Capabilities    ● Review  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  STEP 4: REVIEW & CREATE                                         │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  👤 Code Reviewer                                          │  │
│  │  Type: Worker  |  Model: claude-sonnet-4  |  Profile: Balanced │  │
│  │  Working Dir: ~/projects/myapp                             │  │
│  │                                                             │  │
│  │  📦 Skills (4):                                             │  │
│  │     code-review, pull-request-analysis,                     │  │
│  │     security-scanning, tdd-mastery                          │  │
│  │                                                             │  │
│  │  🔐 Security: Standard                                     │  │
│  │  🌐 Browser: Full  |  💻 Terminal: Full  |  📁 Files: Read │  │
│  │  📊 Context budget: 200K tokens, summarize at 70%          │  │
│  │                                                             │  │
│  │  [Save as Template]   ← reuse this config for future agents│  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ☑ Accept risk: AI agents execute commands in your environment   │
│                                                                   │
│                              [← Back] [🚀 Create Agent]         │
└──────────────────────────────────────────────────────────────────┘
```

**Key UX Decisions:**

- **Step 2 (Skills) is the star.** Three pathways to get skills: bundles (one-click presets), recommendations (auto-suggested from role), and full marketplace browse. Zero skill setup friction.
- **Role templates now auto-suggest skills.** When user picks "Security Engineer" template in Step 1, Step 2 pre-checks the Security Engineer bundle. User can adjust, not start from scratch.
- **Model profile is in Step 1, not buried in settings.** Quality/Balanced/Budget maps to Opus/Sonnet/Haiku. User picks in 1 click — cost-aware from moment zero.
- **Capabilities (Step 3) replaces the scattered tool toggles.** Instead of digging through 1421 lines of AgentSettings, permissions are a clean matrix with 4 levels: Full / Read-Only / Requires Approval / Disabled.
- **"Save as Template"** on Step 4 lets enterprise teams create standardized agent configs that others can reuse.

---

### 4.2 USER JOURNEY: Managing Skills on an Existing Agent

**Current:** Tab 4 (SkillMarketplace) shows 25 hardcoded skills. Tab 5 (Settings) shows 54 config-based skills. Two disconnected systems.

**New Design — Unified Skills Tab:**

```
┌──────────────────────────────────────────────────────────────────┐
│  Code Reviewer                                          ● Active │
│  [Overview] [Terminal] [Memory] [★ Skills] [Settings]            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  INSTALLED SKILLS (4)                              [Manage All]  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────┐ │
│  │ ✅ code-review│ │ ✅ pr-analysis│ │ ✅ sec-scan  │ │ ✅ tdd  │ │
│  │ v2.1.0       │ │ v1.4.0       │ │ v3.0.1       │ │ v1.0.0  │ │
│  │ [⚙ Configure]│ │ [⚙ Configure]│ │ [⚙ Configure]│ │ [⚙]    │ │
│  │ [— Remove]   │ │ [— Remove]   │ │ [— Remove]   │ │ [—]    │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └─────────┘ │
│  ⟳ 1 update available: sec-scan v3.0.1 → v3.1.0 [Update All]   │
│                                                                   │
│  ──────────────────────────────────────────────────────────────  │
│                                                                   │
│  ADD MORE SKILLS                                                  │
│  ┌─ Recommended for you (based on role + installed skills) ──┐   │
│  │  📝 documentation-review  "You review code but not docs"   │   │
│  │  🏗 architecture-patterns  "Pairs well with code-review"   │   │
│  │  ⚡ performance-audit      "Complete your quality toolkit"  │   │
│  │                                              [+ Add] each   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Browse Marketplace ──────────────────────────────────────┐   │
│  │  🔍 [Search 950+ skills..._______________]                 │   │
│  │  [All] [Architecture] [Security] [Testing] [DevOps] [...] │   │
│  │                                                             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │   │
│  │  │ Skill A  │ │ Skill B  │ │ Skill C  │ │ Skill D  │     │   │
│  │  │ [+ Add]  │ │ [+ Add]  │ │ [+ Add]  │ │ [+ Add]  │     │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Import Custom ───────────────────────────────────────────┐   │
│  │  [GitHub URL or local path...___________] [+ Import]       │   │
│  │  [Create New Skill]  ← opens SKILL.md editor               │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  🔒 Skills Lock: skills-lock.json synced ✓  [Export Config]     │
└──────────────────────────────────────────────────────────────────┘
```

**What Changed:**

- **One unified skills system.** Merges the 25-skill marketplace (Tab 4) and 54-skill settings (Tab 5) into one. Backed by the Vercel `skills` CLI for install/update/lock.
- **Installed skills always visible at top** with version, update status, configure and remove buttons.
- **Smart recommendations.** Based on what skills are already installed + the agent's role, the system suggests complementary skills. "You review code but not docs — add documentation-review?"
- **Inline skill configuration.** Click "Configure" → expand a section to set environment variables (API keys, etc.) right there. No navigation away.
- **Lock file indicator.** Shows whether the project's `skills-lock.json` is synced. Enterprise teams can enforce "all agents in this project must use this exact skill set."

---

### 4.3 USER JOURNEY: Setting Up a Project (Smart Wizard)

**Current:** Create project → pick workflow template → write requirements → assign team → start.  
**Problem:** User has to manually figure out which agents to create, what skills they need, and how to compose a team. Lots of back-and-forth.

**New Design — Guided Project Setup:**

```
STEP 1: WHAT DO YOU WANT DONE?
┌──────────────────────────────────────────────────────────────────┐
│  Project Name: [E-commerce Platform Security Audit__]            │
│                                                                   │
│  Describe your goal:                                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Audit the security of our e-commerce platform. Check for   │  │
│  │ OWASP Top 10 vulnerabilities, review authentication flows, │  │
│  │ assess API security, and provide a remediation report.     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Workflow: [Security Audit ▼]  (auto-selected from description)  │
│                                                [Next →]          │
└──────────────────────────────────────────────────────────────────┘

STEP 2: AI-SUGGESTED TEAM COMPOSITION
┌──────────────────────────────────────────────────────────────────┐
│  Based on your goal, here's a recommended team:                  │
│                                                                   │
│  👑 MANAGER                                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  🛡 Security Lead  (new agent — will be created)           │  │
│  │  Skills: security-audit-orchestration, owasp-assessment,   │  │
│  │          threat-modeling                                    │  │
│  │  Model: claude-sonnet-4 (Balanced)                         │  │
│  │  [Customize] [Use existing agent ▼]                        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  👷 WORKERS                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │ 🔐 Auth Reviewer     │  │ 🌐 API Tester        │             │
│  │ Skills: auth-review,  │  │ Skills: api-security, │             │
│  │  session-mgmt, oauth  │  │  rate-limiting, cors  │             │
│  │ [Customize]           │  │ [Customize]           │             │
│  │ [Use existing ▼]     │  │ [Use existing ▼]     │             │
│  └──────────────────────┘  └──────────────────────┘             │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │ 🛡 Vuln Scanner      │  │ 📝 Report Writer     │             │
│  │ Skills: owasp-top10,  │  │ Skills: security-    │             │
│  │  pen-testing, cve-db  │  │  reporting, markdown  │             │
│  │ [Customize]           │  │ [Customize]           │             │
│  │ [Use existing ▼]     │  │ [Use existing ▼]     │             │
│  └──────────────────────┘  └──────────────────────┘             │
│                                                                   │
│  [+ Add another agent]   [Remove agent]                          │
│  Total estimated cost: ~$2.40/run based on Balanced profile      │
│                                                                   │
│                              [← Back] [Next: Review →]           │
└──────────────────────────────────────────────────────────────────┘
```

**What Changed:**

- **AI reads the project description** and auto-suggests a team with specific agents, each pre-loaded with relevant skills and appropriate model profiles.
- **Every suggested agent shows its skills upfront.** User sees exactly what capabilities each agent brings.
- **"Use existing agent"** dropdown lets user swap in an agent they already have instead of creating a new one.
- **"Customize"** opens the agent creation wizard (Step 2: Skills) scoped to that agent. User can add/remove skills right here.
- **Cost estimate** before starting. Users know what they're spending.

---

### 4.4 USER JOURNEY: Watching Agents Work (Live Monitoring)

**Current:** Activity feed (text log) + manual feedback textbox when agent asks.

**New Design — Multi-Pane Live View:**

```
┌──────────────────────────────────────────────────────────────────┐
│  🟢 E-commerce Security Audit    Phase: 2/4 Vulnerability Scan   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 48% complete     │
│  Context: ████████░░ 62%  |  Cost: $1.23  |  Duration: 12m      │
├──────────────────────────────────────────────────────────────────┤
│                              │                                    │
│  AGENT ACTIVITY              │  LIVE VIEW                        │
│  ┌────────────────────────┐  │  ┌──────────────────────────────┐ │
│  │ 🔐 Auth Reviewer       │  │  │                              │ │
│  │ ✅ Phase 1 complete     │  │  │  [WebRTC Browser Stream]    │ │
│  │ → Testing OAuth flows  │  │  │                              │ │
│  │ Context: ████░░ 45%    │  │  │  Vuln Scanner is browsing:  │ │
│  ├────────────────────────┤  │  │  https://shop.example.com   │ │
│  │ 🌐 API Tester          │  │  │  /api/v2/checkout           │ │
│  │ → Scanning rate limits │  │  │                              │ │
│  │ Context: ██████░ 58%   │  │  │  [Fullscreen] [Record]      │ │
│  ├────────────────────────┤  │  └──────────────────────────────┘ │
│  │ 🛡 Vuln Scanner        │  │                                   │
│  │ → Browsing target site │  │  ┌──────────────────────────────┐ │
│  │ Context: ███░░░ 31%    │  │  │ 💻 Terminal: Auth Reviewer   │ │
│  │ 🌐 [Watch Browser]     │  │  │ $ running owasp-zap...       │ │
│  ├────────────────────────┤  │  │ [INFO] Scanning /login       │ │
│  │ 📝 Report Writer       │  │  │ [WARN] CSRF token missing    │ │
│  │ ⏳ Waiting for inputs  │  │  └──────────────────────────────┘ │
│  └────────────────────────┘  │                                   │
│                              │                                    │
│  ┌─ Quality Gates ────────┐  │  ┌──────────────────────────────┐ │
│  │ Phase 1: ✅ PASSED      │  │  │ 💬 Agent Chat               │ │
│  │  exists ✓ substantive ✓│  │  │ [Join conversation with      │ │
│  │  wired ✓               │  │  │  any agent — type or voice]  │ │
│  │ Phase 2: 🔄 IN PROGRESS│  │  │                              │ │
│  │ Phase 3: ⏳ PENDING     │  │  │ 🎙 [Push to Talk]           │ │
│  └────────────────────────┘  │  └──────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**What Changed:**

- **Context health bar per agent** right in the monitoring view. User sees when an agent is running hot (GSD pattern).
- **Live Browser View** — when an agent is using a browser sandbox (kernel-images), the user sees it browsing in real-time.
- **Quality gates visible** — each completed phase shows a 3-level verification badge (exists / substantive / wired).
- **Voice check-in** — user can push-to-talk to any agent (vision-agents STT→LLM→TTS pipeline). "Hey Auth Reviewer, what did you find so far?"
- **Click any agent → expand their live terminal, chat, or browser.** No navigating away from the project view.

---

### 4.5 USER JOURNEY: After the Project (Learning & Reuse)

**Current:** Final deliverables markdown report. That's it.

**New Design — Project Completion Dashboard:**

```
┌──────────────────────────────────────────────────────────────────┐
│  ✅ E-commerce Security Audit — COMPLETED                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  📊 PROJECT SCORECARD                                            │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Overall: 92/100  |  Duration: 34m  |  Total Cost: $2.87 │    │
│  │                                                           │    │
│  │  Agent Performance:                                       │    │
│  │  🔐 Auth Reviewer     95/100  ★★★★★  $0.62              │    │
│  │  🌐 API Tester         89/100  ★★★★☆  $0.71              │    │
│  │  🛡 Vuln Scanner       94/100  ★★★★★  $0.88              │    │
│  │  📝 Report Writer      88/100  ★★★★☆  $0.66              │    │
│  │                                                           │    │
│  │  Skill Effectiveness:                                     │    │
│  │  owasp-top10    — used 14 times, 92% useful               │    │
│  │  api-security   — used 8 times, 87% useful                │    │
│  │  auth-review    — used 11 times, 95% useful               │    │
│  │  pen-testing    — used 3 times, 67% useful (consider ?)   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  📋 DELIVERABLES           │  🔄 REUSE                          │
│  ┌───────────────────────┐ │ ┌──────────────────────────────┐    │
│  │ 📄 Security Report    │ │ │ [💾 Save Team as Template]   │    │
│  │ 📄 Vuln Assessment    │ │ │ → "Security Audit Team"      │    │
│  │ 📄 Remediation Plan   │ │ │ Saves: agent configs, skills,│    │
│  │ 📁 Project Workspace  │ │ │ model profiles, workflow     │    │
│  └───────────────────────┘ │ │                              │    │
│                             │ │ [📤 Share with Organization] │    │
│  📝 REVISION               │ │ → Publish to org template    │    │
│  [Request changes...__]    │ │   library for others to use  │    │
│  [Submit Revision]         │ └──────────────────────────────┘    │
│                                                                   │
│  💡 RECOMMENDATIONS                                              │
│  • "pen-testing" skill underperformed — consider replacing with  │
│    "advanced-penetration-testing" (newer, 4.5★ community rating) │
│  • Auth Reviewer's context hit 89% — consider splitting into     │
│    two agents for larger codebases                                │
│  • Add "compliance-reporter" skill to Report Writer for SOC 2    │
│    formatted output next time                                     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

**What Changed:**

- **Agent scorecards** — each agent gets a performance score based on task completion, verification results, and cost efficiency.
- **Skill effectiveness tracking** — user see which skills actually helped. "pen-testing used only 3 times, 67% useful" = maybe swap it.
- **Save as Template** — one click saves the entire team config (agents + skills + models + workflow) for reuse. Next time user wants a security audit, they click one button.
- **Smart recommendations** — based on the run data, the system suggests skill changes, agent splits, and model adjustments.

---

### 4.6 USER JOURNEY: Enterprise Admin (Org-Wide Management)

```
┌──────────────────────────────────────────────────────────────────┐
│  🏢 ORGANIZATION: Acme Corp         Plan: Enterprise             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ SKILL POLICIES ──────────────────────────────────────────┐   │
│  │  Approved Skills: 342 / 950+                               │   │
│  │  Blocked Skills: 28 (offensive, unapproved)                │   │
│  │  Pending Review: 5 skills awaiting admin approval          │   │
│  │                                                             │   │
│  │  Policy: Agents can only install org-approved skills       │   │
│  │  [Manage Approved List]  [Review Pending]                  │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ TEAM TEMPLATES ──────────────────────────────────────────┐   │
│  │  📋 Security Audit Team    — used 23 times this month      │   │
│  │  📋 Code Review Squad      — used 45 times this month      │   │
│  │  📋 Marketing Content      — used 12 times this month      │   │
│  │  [+ Create Org Template]   [Import from Community]         │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ USAGE & COSTS ───────────────────────────────────────────┐   │
│  │  This month: $4,230 / $5,000 budget                        │   │
│  │  ████████████████████░░░░  84.6%                           │   │
│  │  Top cost: Engineering team ($2,100) → Marketing ($890)    │   │
│  │  Top model: claude-sonnet-4 (67%) → gpt-4o (21%)          │   │
│  │  [Detailed Breakdown]  [Set Budgets]  [Export Report]      │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ SECURITY DASHBOARD ──────────────────────────────────────┐   │
│  │  Guardrail blocks this month: 47 (2.1% of requests)       │   │
│  │  Prompt injection attempts: 3 (all blocked)                │   │
│  │  PII leak prevention: 12 instances caught                  │   │
│  │  Audit log entries: 124,331 (exportable)                   │   │
│  │  [View Audit Log]  [Security Report]  [Configure Rules]   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Feature Blueprint — Mapped to User Journeys

> Every feature below is traced back to which user journey it enables and what user problem it solves.

### TIER 1 — Core Experience (0-3 months)

_Goal: Make Agent Creation → Skill Assignment → Project Execution feel like one smooth flow._

| #     | Feature                                                              | User Journey                  | User Problem Solved                                             | Source Repo                        | Effort |
| ----- | -------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------- | ---------------------------------- | ------ |
| T1.1  | **Agent Creation Wizard (4-step)**                                   | §4.1 Create Agent             | Current modal is too bare — agents start empty                  | Internal redesign                  | Medium |
| T1.2  | **Unified Skill System** (merge Tab 4 + Tab 5 + antigravity catalog) | §4.1 Step 2, §4.2 Skills Tab  | Two disconnected skill systems confuse users                    | antigravity + skills CLI           | Medium |
| T1.3  | **Skill Bundles** — one-click role preset installation               | §4.1 Step 2 Quick Start       | "I don't know which 950 skills to pick"                         | antigravity bundles.json           | Low    |
| T1.4  | **Smart Skill Recommendations** per agent role                       | §4.1 Step 2 Recommended, §4.2 | User shouldn't have to guess what skills match their agent      | antigravity index + role templates | Medium |
| T1.5  | **Model Profile Picker** (Quality/Balanced/Budget)                   | §4.1 Step 1                   | Model selection buried in 1421-line settings page               | GSD model profiles                 | Low    |
| T1.6  | **SOUL.md / IDENTITY.md Editor** in creation wizard                  | §4.1 Step 1 Personality       | Currently no UI to edit agent personality markdown              | Internal                           | Low    |
| T1.7  | **Tool Permission Matrix** (Full/ReadOnly/Approval/Disabled)         | §4.1 Step 3                   | Capabilities scattered across settings, no clear access control | agents-towards-production          | Medium |
| T1.8  | **Context Health Bar** per agent                                     | §4.4 Live View                | Users can't see when an agent's context is degrading            | GSD context-monitor                | Low    |
| T1.9  | **Context Auto-Summarization** at configurable threshold             | §4.4 Live View                | Long sessions degrade quality with no user visibility           | GSD patterns                       | Medium |
| T1.10 | **Skill Import from URL** (GitHub/GitLab/any SKILL.md)               | §4.2 Import Custom            | Users with custom skills can't easily add them                  | skills CLI source-parser           | Low    |

### TIER 2 — Quality & Intelligence (3-6 months)

_Goal: Agents deliver verified work. Users trust the output without manually checking everything._

| #     | Feature                                                               | User Journey               | User Problem Solved                                                 | Source Repo                      | Effort |
| ----- | --------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------- | -------------------------------- | ------ |
| T2.1  | **Quality Gates** (exists → substantive → wired) at phase transitions | §4.4 Quality Gates         | AI says "done" but output is stubs/TODOs                            | GSD verifier                     | Medium |
| T2.2  | **Stub/Placeholder Detection** in agent outputs                       | §4.4 Quality Gates         | Empty functions, TODO comments, hardcoded values slip through       | GSD verification-patterns        | Low    |
| T2.3  | **Security Guardrails** (input scan + output filter + tool control)   | §4.1 Step 3 Security, §4.6 | Prompt injection, PII leaks, unauthorized tool use                  | agents-towards-production        | High   |
| T2.4  | **AI-Suggested Team Composition** from project description            | §4.3 Step 2                | Users manually figure out which agents and skills for a project     | antigravity workflows + internal | High   |
| T2.5  | **Cost Estimation** before project execution                          | §4.3 Step 2 footer         | No cost visibility until after the run                              | Internal (token pricing data)    | Medium |
| T2.6  | **Wave-Based Parallel Execution** in orchestrator                     | §4.4 Live View             | Sequential phases are slow; independent tasks could run in parallel | GSD wave execution               | Medium |
| T2.7  | **Browser Sandbox Integration** (spawn, control, live view)           | §4.4 Live Browser          | Agents can't browse the web or interact with web UIs                | kernel-images                    | High   |
| T2.8  | **Live Browser View** (WebRTC stream in project monitoring)           | §4.4 Live View             | User can't see what the agent is doing on the web                   | kernel-images WebRTC             | Medium |
| T2.9  | **Skill Lock Files** per project workspace                            | §4.2 Lock indicator        | No way to ensure all team members use same skill versions           | skills CLI lock system           | Low    |
| T2.10 | **Agent Performance Scoring** post-project                            | §4.5 Scorecard             | No data on whether agents actually performed well                   | agents-towards-production eval   | Medium |

### TIER 3 — Delight & Scale (6-12 months)

_Goal: Voice interaction, agent reuse, enterprise controls, 1M+ users._

| #     | Feature                                                             | User Journey          | User Problem Solved                                           | Source Repo                             | Effort    |
| ----- | ------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------- | --------------------------------------- | --------- |
| T3.1  | **Voice Interaction** (push-to-talk / hands-free)                   | §4.4 Voice            | Typing is slow; executives want to talk to agents             | vision-agents STT/TTS                   | High      |
| T3.2  | **Save Team as Template** after project completion                  | §4.5 Reuse            | Great agent configs are lost — user rebuilds every time       | Internal                                | Medium    |
| T3.3  | **Skill Effectiveness Analytics** post-project                      | §4.5 Scorecard        | No visibility into which skills actually helped               | Internal + eval framework               | Medium    |
| T3.4  | **Smart Recommendations** engine (model, skill, agent split)        | §4.5 Recommendations  | Users don't know how to improve their agent setups            | Internal ML/heuristics                  | High      |
| T3.5  | **Custom Skill Authoring** (SKILL.md editor + test sandbox)         | §4.2 Create New Skill | Enterprise teams need domain-specific skills not in catalog   | antigravity format                      | Medium    |
| T3.6  | **Org Skill Policies** (approved/blocked lists, approval workflows) | §4.6 Skill Policies   | Enterprise compliance — can't let agents use any random skill | skills CLI + RBAC                       | Medium    |
| T3.7  | **Org Template Library** (shared team templates across org)         | §4.6 Team Templates   | Teams reinvent agent configs instead of reusing proven setups | Internal                                | Medium    |
| T3.8  | **Usage & Budget Dashboard** per team/org                           | §4.6 Usage & Costs    | No cost visibility or budget enforcement                      | Internal billing                        | Medium    |
| T3.9  | **Agent Observability** (traces, decision replay, anomaly alerts)   | §4.4 extending        | Debugging agent failures is impossible without trace data     | agents-towards-production tracing       | High      |
| T3.10 | **Phone/Messaging Access** (call your agent, WhatsApp voice notes)  | Extends §4.4          | Desktop-only access; want agents reachable anywhere           | vision-agents Twilio + Gateway channels | High      |
| T3.11 | **A2A Protocol** (cross-team agent lending, external interop)       | Extends §4.3          | Agents are siloed per team; can't share expertise             | agents-towards-production A2A           | High      |
| T3.12 | **Multi-Region Cloud Deployment** (K8s, SSO, RBAC, multi-tenant)    | §4.6 fully            | Desktop-only limits enterprise adoption                       | agents-towards-production deploy        | Very High |

---

## 6. Full SDLC Plan — Sprint by Sprint

> Organized by user-visible impact. Each sprint delivers something a user can see and use.

### Phase 0: Foundation (Sprints 1-2) — 4 weeks

**User sees:** Nothing yet — but the pipes are laid.

| Sprint | Task                                                                                                          | Deliverable                                                                     | Enables          |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------- |
| S1     | Unify skill data model — merge SkillMarketplace (25 skills) + AgentSettings skills (54) into one SQLite table | Single `agent_skills` table with metadata from antigravity index                | T1.2             |
| S1     | Integrate `skills` CLI as Tauri sidecar (Node.js child process)                                               | `install_skill`, `remove_skill`, `update_skill`, `search_skills` Tauri commands | T1.2, T1.10      |
| S1     | Index antigravity `skills_index.json` (950+ skills) into local DB on first launch                             | Categorized, searchable skill catalog accessible from Rust backend              | T1.2, T1.3, T1.4 |
| S1     | Add OpenTelemetry spans to Gateway agent message handling                                                     | Trace data for every agent interaction                                          | T3.9             |
| S2     | Build `AgentCreationWizard` React component (4-step shell) — Step 1 Identity only                             | New creation flow replaces old modal                                            | T1.1             |
| S2     | Build `SkillBrowser` React component (search, filter, category tabs, install button)                          | Reusable skill browser used in both wizard Step 2 and agent Skills tab          | T1.2, T1.3       |
| S2     | Implement bundle install API — parse `bundles.json`, batch install skills                                     | One-click "Install Security Engineer bundle"                                    | T1.3             |
| S2     | Wire model profile picker into agent creation (Quality/Balanced/Budget dropdown)                              | Model selection in Step 1 maps to Opus/Sonnet/Haiku                             | T1.5             |

### Phase 1: Smooth Agent Creation (Sprints 3-4) — 4 weeks

**User sees:** Brand new agent creation wizard with integrated skill marketplace.

| Sprint | Task                                                                                         | Deliverable                                                                      |
| ------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| S3     | Wizard Step 2: Skills — bundles, recommendations engine, full marketplace browse, URL import | User can equip agent with skills during creation                                 |
| S3     | Wizard Step 3: Capabilities — tool permission matrix (Full/ReadOnly/Approval/Disabled)       | User controls what each agent can access                                         |
| S3     | Wizard Step 4: Review + "Save as Template" button                                            | User confirms config and optionally saves for reuse                              |
| S3     | Smart skill recommendations — match role keywords against skill tags/categories              | "Code Reviewer" auto-suggests code-review, pr-analysis, security-scanning skills |
| S4     | Unified Skills Tab on agent detail page (replaces Tab 4 + Tab 5 skills section)              | One place to manage installed skills, see recommendations, browse marketplace    |
| S4     | Inline skill configuration (env vars, API keys) within the Skills tab                        | No more digging through 1421-line Settings page for skill config                 |
| S4     | SOUL.md / IDENTITY.md textarea editor in wizard Step 1 (expandable section)                  | Users can define personality at creation time                                    |
| S4     | Context health bar in agent Overview tab                                                     | Per-agent context % visible at a glance                                          |

### Phase 2: Smart Projects & Quality (Sprints 5-7) — 6 weeks

**User sees:** Project wizard auto-suggests teams. Running projects show live quality gates.

| Sprint | Task                                                                                | Deliverable                                                       |
| ------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| S5     | AI-suggested team composition — parse project description → suggest agents + skills | "Describe your goal" → auto-generated team with pre-loaded skills |
| S5     | Cost estimation engine — model × token estimate × agent count                       | "Estimated cost: ~$2.40" shown before "Start"                     |
| S5     | "Use existing agent" dropdown in project wizard suggested team                      | Swap suggested new agent for one user already has                 |
| S6     | Goal-backward verification engine (3-level: exists → substantive → wired)           | Phase transition blocked if deliverables don't pass               |
| S6     | Stub/placeholder detection (TODO patterns, empty returns, hardcoded values)         | Catches AI "done but not done" outputs                            |
| S6     | Quality gate badges on project monitoring view                                      | ✅ PASSED / ❌ FAILED / 🔄 IN PROGRESS per phase                  |
| S7     | Context auto-summarization when usage exceeds configurable threshold                | Agents stay sharp in long sessions                                |
| S7     | Model profile routing — auto-switch to cheaper model for verification/simple tasks  | Cost drops 30-50% without quality loss on complex tasks           |
| S7     | Wave-based parallel execution — DAG → waves → concurrent tasks in orchestrator      | 2-5x faster project completion                                    |

### Phase 3: Browser & Live Monitoring (Sprints 8-10) — 6 weeks

**User sees:** Agents browsing the web with live video feeds. Multi-pane project monitoring.

| Sprint | Task                                                                            | Deliverable                                                     |
| ------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| S8     | Docker integration for kernel-images — spawn/destroy browser sandboxes          | `spawn_browser`, `destroy_browser`, `screenshot` Tauri commands |
| S8     | CDP connection manager — agents connect Playwright to browser sandbox           | Agents can navigate, click, type, extract data from websites    |
| S8     | Security guardrails v1 — input scan for prompt injection patterns               | Malicious prompts blocked before reaching agents                |
| S9     | Live Browser View — WebRTC iframe in project monitoring view                    | User watches agent browse in real-time                          |
| S9     | Multi-pane project monitoring layout (agent list + live view + terminal + chat) | Full situational awareness during project execution             |
| S9     | Security guardrails v2 — output filter for PII, unsafe code patterns            | Agent responses scrubbed before reaching user                   |
| S10    | Browser session persistence (snapshot/restore)                                  | Agents resume browser sessions without re-authentication        |
| S10    | Skill lock files — `skills-lock.json` synced per project workspace              | Team uses exact same skill versions, reproducible runs          |
| S10    | Screen recording for browser sessions (FFmpeg)                                  | Audit trail of agent web activity                               |

### Phase 4: Voice & Intelligence (Sprints 11-13) — 6 weeks

**User sees:** Talk to agents by voice. Post-project scorecards with smart recommendations.

| Sprint | Task                                                                                     | Deliverable                                                   |
| ------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| S11    | STT integration (Deepgram/Whisper) → Gateway → LLM → TTS (ElevenLabs/Kokoro)             | Voice pipeline working end-to-end                             |
| S11    | WebRTC transport for voice (sub-second latency)                                          | Low-latency voice interaction                                 |
| S12    | Push-to-talk button in project monitoring view + agent chat                              | User talks to any agent mid-project                           |
| S12    | Agent performance scoring engine (completion rate × quality × cost efficiency)           | Post-project agent scorecard                                  |
| S12    | Skill effectiveness tracking (usage count × positive outcome correlation)                | "owasp-top10 used 14 times, 92% useful"                       |
| S13    | Smart recommendations engine — suggest skill swaps, model changes, agent splits          | "Replace pen-testing skill with advanced-penetration-testing" |
| S13    | "Save Team as Template" — persist full team config (agents + skills + models + workflow) | One-click reuse of proven team compositions                   |
| S13    | Observability dashboard — latency, token usage, cost per agent, error rates              | Real-time operational visibility                              |

### Phase 5: Enterprise & Scale (Sprints 14-20) — 14 weeks

**User sees:** Org admin panel. Skill policies. Budget controls. Cloud deployment.

| Sprint | Task                                                                               | Deliverable                                           |
| ------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| S14    | Org skill policies — approved/blocked lists, admin approval workflow               | Compliance: agents can only use org-sanctioned skills |
| S14    | Org template library — shared team templates visible to all org members            | Standardized agent configurations org-wide            |
| S15    | Usage & budget dashboard — cost per team, per project, per model                   | FinOps visibility and budget enforcement              |
| S15    | Decision replay / trace viewer — click any agent output → see full reasoning chain | Debug agent failures, understand decisions            |
| S16    | Custom skill authoring — SKILL.md editor with preview + test sandbox               | Enterprise teams create domain-specific skills in-app |
| S16    | Skill publishing — push to org private registry or public skills.sh                | Share skills within org or with community             |
| S17    | Kubernetes Helm charts + Docker Compose for cloud deployment                       | Deploy OpenClaw to any K8s cluster                    |
| S17    | Multi-tenant isolation (namespace per org, encrypted storage)                      | Enterprise data separation                            |
| S18    | SSO integration (SAML/OIDC — Okta, Azure AD, Google Workspace)                     | Enterprise login                                      |
| S18    | RBAC — Admin / Manager / Operator / Viewer role hierarchy                          | Access control within organizations                   |
| S19    | Phone/messaging agent access — Twilio calls, WhatsApp voice notes                  | Agents reachable outside the desktop app              |
| S19    | A2A protocol — cross-team agent lending, external agent interop                    | Agents collaborate across team boundaries             |
| S20    | Multi-region deployment (US, EU, APAC) + scale-to-zero browser fleet               | Global availability, cost-efficient at scale          |
| S20    | Load testing at 1M user scale + SOC 2 compliance prep                              | Enterprise production readiness                       |

---

## 7. Risk Matrix & Mitigations

| Risk                                                         | Severity | Likelihood | Mitigation                                                                                                                               |
| ------------------------------------------------------------ | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Two skill systems create data conflicts during merge**     | High     | High       | Migration script in S1: map all existing 54+25 skills to unified schema. Feature flag for rollback.                                      |
| **Agent creation wizard feels heavyweight for quick agents** | Medium   | Medium     | "Quick Create" link on Step 1 that skips to Step 4 with defaults. Wizard is optional.                                                    |
| **950+ skills overwhelm users**                              | Medium   | High       | Bundles as first option. Recommendations second. Full browse third. Progressive disclosure.                                              |
| **Context auto-summarization loses important details**       | High     | Medium     | Summary is appended (not replaced). User can expand to see original. Configurable threshold.                                             |
| **Quality gates block too aggressively**                     | Medium   | Medium     | Three strictness levels: Warn Only / Block Critical / Block All. Default = Warn Only.                                                    |
| **Browser sandbox costs at scale**                           | High     | Medium     | Scale-to-zero (kernel-images), session time limits, usage-based billing pass-through.                                                    |
| **Voice latency >1s ruins UX**                               | Medium   | Medium     | WebRTC edge relay, regional deployment, fallback to text with "transcribing..." indicator.                                               |
| **Prompt injection bypasses guardrails**                     | Critical | Medium     | Defense-in-depth: input scan + output filter + tool permission matrix. Regular red-team testing with Apex patterns.                      |
| **LLM API cost overruns**                                    | High     | High       | Model profile routing (Budget for verification), per-project token budgets with hard caps, cost estimation before start.                 |
| **Open-source license conflicts**                            | Medium   | Low        | GSD is non-commercial license — re-implement patterns (context monitoring, verification), don't copy code. antigravity + skills are MIT. |

---

## 8. Success Metrics & KPIs

### User Experience Metrics

| Metric                                            | Baseline (Today)                                           | Target (3 months)                    | Target (12 months)           |
| ------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------ | ---------------------------- |
| Time to create a useful agent                     | ~5 min (create + find settings + enable skills separately) | <90 seconds (wizard with bundles)    | <60 seconds (template reuse) |
| Skills installed per agent (avg)                  | 0-2 (manual)                                               | 5-8 (bundle + recommendations)       | 8-15 (smart recommendations) |
| % agents created with skills                      | ~20% (users don't find the skills tab)                     | >80% (skills are Step 2 of creation) | >95%                         |
| Projects using quality gates                      | 0%                                                         | >50% (default on)                    | >90%                         |
| % projects with cost estimate viewed before start | 0%                                                         | >70%                                 | >90%                         |

### Product Metrics

| Metric                                    | Target (6 months) | Target (12 months) |
| ----------------------------------------- | ----------------- | ------------------ |
| Monthly Active Users                      | 10,000            | 100,000            |
| Enterprise Accounts                       | 10                | 100                |
| Skills Installed (total across all users) | 50,000            | 500,000            |
| Agent Sessions / Day                      | 50,000            | 500,000            |
| Templates Shared (org-wide)               | 200               | 5,000              |
| Voice Interactions / Day                  | —                 | 25,000             |

### Quality Metrics

| Metric                                 | Target |
| -------------------------------------- | ------ |
| Agent Task Completion Rate             | >85%   |
| Quality Gate Pass Rate (first attempt) | >75%   |
| Quality Gate Pass Rate (after retry)   | >95%   |
| Security Guardrail False Positive Rate | <2%    |
| User Satisfaction (CSAT)               | >4.2/5 |

### Engineering Metrics

| Metric                     | Target            |
| -------------------------- | ----------------- |
| API P99 Latency            | <500ms            |
| Voice Response P95 Latency | <1.5s             |
| Browser Sandbox Cold Start | <3s               |
| Uptime SLA                 | 99.9%             |
| Deploy Frequency           | Daily (automated) |

### Business Metrics

| Metric                    | Target (12 months)                    |
| ------------------------- | ------------------------------------- |
| ARR                       | $2M                                   |
| Net Revenue Retention     | >120%                                 |
| Gross Margin              | >70%                                  |
| Customer Acquisition Cost | <$500 (self-serve), <$5K (enterprise) |

---

## Appendix A: Current UI → New UI Mapping

| Current Component                                        | What Changes                     | New Component(s)                                                    |
| -------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------- |
| `CreateAgentModal` (simple 5-field modal)                | Replaced by multi-step wizard    | `AgentCreationWizard` (4 steps)                                     |
| `SkillMarketplace` (Tab 4, 25 hardcoded skills)          | Merged into unified skill system | `UnifiedSkillsTab` (installed + recommended + marketplace + import) |
| `AgentSettings` skills section (Tab 5, 54 config skills) | Merged into unified skill system | Removed — skills managed in `UnifiedSkillsTab`                      |
| `AgentSettings` model section                            | Moved to wizard Step 1           | `ModelProfilePicker` in wizard + still in Settings for changes      |
| `AgentSettings` capabilities section                     | Moved to wizard Step 3           | `ToolPermissionMatrix` in wizard + still in Settings for changes    |
| `AgentOverview` metrics grid                             | Add context health bar           | Add `ContextHealthBar` widget                                       |
| `ProjectsView` create form                               | Replace with guided wizard       | `ProjectSetupWizard` (describe goal → suggested team → review)      |
| Project execution activity feed                          | Upgrade to multi-pane monitoring | `ProjectMonitoringView` (agent list + live view + quality gates)    |
| Final report (plain markdown)                            | Add scorecard + recommendations  | `ProjectCompletionDashboard`                                        |

## Appendix B: Repo → Feature → Sprint Quick Reference

| Repository                     | Features Enabled                                                                                     | Sprint(s)                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------- |
| **antigravity-awesome-skills** | Skill catalog (950+), bundles, recommendations, risk tagging, workflow playbooks                     | S1-S4                        |
| **skills (Vercel Labs)**       | Skill CLI (install/update/remove), lock files, URL import, provider system                           | S1-S3, S10, S16              |
| **agents-towards-production**  | Security guardrails, evaluation framework, memory architecture, A2A, tracing, deployment             | S8-S9, S12-S13, S15, S17-S19 |
| **vision-agents**              | Voice pipeline (STT/TTS), WebRTC transport, phone access                                             | S11-S12, S19                 |
| **kernel-images**              | Browser sandbox, Live View, CDP proxy, recordings, scale-to-zero                                     | S8-S10, S20                  |
| **get-shit-done**              | Context monitoring, auto-summarization, quality gates, stub detection, wave execution, model routing | S4, S6-S7                    |
