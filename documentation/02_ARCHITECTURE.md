# System Architecture Document

# Axtrizen AI Platform

**Version:** 2.0 | **Date:** 2026-02-27 | **Status:** Approved

---

## 1. Architecture Overview

Axtrizen follows a **three-tier desktop architecture** with a clear separation between the native shell, business logic, and external services.

```
┌──────────────────────────────────────────────────┐
│                   USER (Human)                    │
├──────────────────────────────────────────────────┤
│              PRESENTATION LAYER                   │
│   React 18 + TypeScript + Tailwind CSS 4          │
│   ┌─────────┬──────────┬──────────┬───────────┐  │
│   │Dashboard│ Agents   │Projects  │   Chat    │  │
│   │         │ Teams    │Board     │ Settings  │  │
│   │         │ Mission  │Detail    │ Terminal  │  │
│   └─────────┴──────────┴──────────┴───────────┘  │
├──────────────────────────────────────────────────┤
│               BUSINESS LOGIC LAYER                │
│   Rust (Tauri 2.0 Backend)                        │
│   ┌─────────┬──────────┬──────────┬───────────┐  │
│   │Commands │Orchestr. │ DB Layer │ Gateway   │  │
│   │(18 mods)│ Engine   │(SQLite)  │ Client    │  │
│   └─────────┴──────────┴──────────┴───────────┘  │
│         │ SDLC phase control (top-level arbiter)  │
│         ▼                                         │
├──────────────────────────────────────────────────┤
│            AGENT COMMUNICATION LAYER              │
│   Maple OSS (Python) — P2P Agent Messaging        │
│   ┌─────────┬──────────┬──────────┬───────────┐  │
│   │  NATS   │  Task    │  LIM     │ Resource  │  │
│   │  Broker │  Queue   │ Security │ Negotiator│  │
│   └─────────┴──────────┴──────────┴───────────┘  │
│   Agents communicate directly via NATS topics:    │
│   TASK_ASSIGNMENT, CODE_REVIEW_REQUEST,           │
│   STATUS_UPDATE, AVAILABLE_TASK                   │
├──────────────────────────────────────────────────┤
│               EXTERNAL SERVICES                   │
│   ┌─────────────────────┬────────────────────┐   │
│   │  OpenClaw Gateway   │  AI Model APIs     │   │
│   │  (ws://localhost:   │  (Claude, GPT-4,   │   │
│   │   18789)            │   Gemini, etc.)    │   │
│   └─────────────────────┴────────────────────┘   │
└──────────────────────────────────────────────────┘
```

> **Architectural Note (Sprint 3):** The Rust backend remains the top-level SDLC
> arbiter — it owns phase transitions (planning → design → development → review),
> board state, and human-feedback gates. The new **Maple OSS layer** sits below it
> and gives Python agents a high-frequency peer-to-peer channel for task delegation,
> code-review chatter, and resource negotiation **without** routing every message
> through the Rust orchestrator or the Gateway WebSocket.
>
> **Communication split:**
> | Concern | Channel |
> |---|---|
> | Phase control, board updates, human feedback | Rust orchestrator → Gateway RPC |
> | Task claiming, review requests, status pings | Maple OSS NATS broker (P2P) |
> | LLM prompt/response streaming | Gateway `chat.send` per-agent sessions |
>
> **Scaling Architecture (v2.0):** The orchestrator now executes agents in
> **parallel** via `tokio::spawn` with a `Semaphore(10)`. Agent workers are
> autonomous Python processes that subscribe to Maple topics and react
> independently. The `AgentPoolManager` scales workers automatically:
> ≤20 agents → 1:1, 20-100 → multiplexed, 100+ → shared queue.
> SQLite runs in **WAL mode** with performance pragmas for concurrent reads.

---

## 2. Component Architecture

### 2.1 Frontend (React/TypeScript)

**Location:** `axtrizenFrontEnd/src/app/`

```
src/app/
├── App.tsx                    # Root: routing, theme, gateway init
├── tauri-api.ts               # 65+ Tauri IPC wrappers
├── gateway-client.ts          # WebSocket gateway bridge
├── components/
│   ├── Sidebar.tsx            # Navigation (7 menu items)
│   ├── Dashboard.tsx          # System metrics + activity feed
│   ├── AgentsView.tsx         # Agent CRUD + settings
│   ├── TeamsView.tsx          # Team composition + group chat
│   ├── ProjectsView.tsx       # Project management + board + report
│   ├── ProjectBoard.tsx       # Kanban/List board (epics/stories/tasks)
│   ├── ChatWindow.tsx         # 1:1 and group chat interface
│   ├── MissionControlView.tsx # Multi-agent monitor
│   ├── SettingsView.tsx       # App configuration
│   ├── EmbeddedTerminal.tsx   # PTY terminal (xterm.js)
│   ├── NotificationFeed.tsx   # Real-time notifications
│   └── ui/                    # 48 Radix UI primitives
├── services/
│   ├── orchestration-engine.ts # Frontend orchestration hooks
│   ├── planning-engine.ts      # Plan generation + parsing
│   ├── discussion-engine.ts    # Multi-agent discussions
│   ├── gateway-adapter.ts      # Gateway abstraction layer
│   ├── workspace-manager.ts    # File system operations
│   └── agent-memory.ts         # Agent context management
├── stores/
│   ├── activity-store.ts       # Activity event log
│   └── agent-store.ts          # Agent state management
└── hooks/
    └── useGatewayEvents.ts     # Gateway event hooks
```

### 2.2 Backend (Rust/Tauri)

**Location:** `axtrizen-app/src-tauri/src/`

```
src/
├── main.rs                    # Tauri entry point
├── lib.rs                     # Command registration (75+ commands)
├── db.rs                      # SQLite ORM (20 tables, 8 migrations, WAL mode)
├── gateway_client.rs          # WebSocket client to OpenClaw Gateway
├── orchestrator.rs            # SDLC execution engine (parallel, 1700+ lines)
└── commands/
    ├── mod.rs                 # Module exports
    ├── agents.rs              # Agent CRUD (8 commands)
    ├── chat.rs                # Chat send/history/abort (10 commands)
    ├── projects.rs            # Project CRUD (4 commands)
    ├── teams.rs               # Team CRUD + members (7 commands)
    ├── planning.rs            # Board CRUD (8 commands)
    ├── orchestrator.rs        # Execution control (4 commands)
    ├── agent_groups.rs        # Group CRUD + group chat (8 commands) ← NEW
    ├── config.rs              # Gateway/agent config (5 commands)
    ├── settings.rs            # App settings (5 commands)
    ├── system.rs              # Health + system utils (6 commands)
    ├── terminal.rs            # PTY management (6 commands)
    ├── sessions.rs            # Session management (5 commands)
    ├── agent_metrics.rs       # Usage + activity (6 commands)
    ├── skills.rs              # Skill management (3 commands)
    ├── cron.rs                # Scheduled tasks (5 commands)
    ├── devices.rs             # Device management (4 commands)
    ├── logs.rs                # Log tail (1 command)
    └── usage.rs               # Cost tracking (2 commands)
```

### 2.3 Agent Communication Layer: Maple OSS

**Location:** `axtrizen-app/maple/` (Python package mounted alongside the OpenClaw Gateway)

Maple OSS provides peer-to-peer communication between Python agents without
routing through the Rust orchestrator for every interaction.

```
src/maple_bridge/
├── broker_config.py         # NATS / in-memory broker factory
├── axtrizen_agent.py        # AxtrizenMapleAgent — wraps maple.Agent
├── message_types.py         # TASK_ASSIGNMENT, CODE_REVIEW_REQUEST, …
├── lim_manager.py           # LIM link lifecycle helpers
├── bridge.py                # Rust ↔ Maple bridge (Tauri sidecar IPC)
├── agent_worker.py          # Autonomous agent worker process ← NEW
├── agent_pool.py            # 3-tier auto-scaling pool manager ← NEW
├── message_aggregator.py    # Buffers & summarizes high-volume messages ← NEW
└── memu_handler.py          # Agent memory (memU) handler
```

**Key concepts:**

| Concept                                 | Implementation                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Broker**                              | `ProductionBrokerManager.create_broker(config, BrokerType.NATS)` — lightweight NATS server spun up alongside the Gateway |
| **P2P Messaging**                       | Agents import `maple-oss`, connect to the broker, publish/subscribe on team topics                                       |
| **LIM (Link Identification Mechanism)** | `LinkManager.initiate_link(agent_a, agent_b)` → authenticated, time-bounded secure channel for code review handshakes    |
| **Task Queue**                          | `TaskQueue` with priority scheduling; Manager publishes `AVAILABLE_TASK`, idle Workers claim via `TaskScheduler`         |
| **Resource Negotiation**                | `ResourceNegotiator` lets agents declare capacity and negotiate workload distribution                                    |

### 2.4 External: OpenClaw Gateway

The Gateway is a separate service providing:

- **Agent Lifecycle** — create, configure, start, stop agents
- **Chat Protocol** — `chat.send`, `chat.inject`, streaming responses
- **Tool Execution** — file system, web search, code execution tools
- **Session Management** — persistent conversation sessions
- **Health Monitoring** — memory, CPU, version, uptime

**Connection:** WebSocket on `ws://127.0.0.1:18789` with token-based auth.

---

## 3. Data Flow Diagrams

### 3.1 Project Execution Flow

```
Human           Frontend         Rust Backend       Gateway        AI Models
  │                │                  │                │               │
  │─ Start Exec ──▶│                  │                │               │
  │                │── invoke() ─────▶│                │               │
  │                │                  │── ws:connect ──▶│               │
  │                │                  │                │── API call ───▶│
  │                │                  │                │◀── response ──│
  │                │                  │◀─ agent reply ─│               │
  │                │                  │── persist_plan()│               │
  │                │                  │── update_db() ──│               │
  │                │◀─ emit event ───│                │               │
  │◀─ board update─│                  │                │               │
  │                │                  │                │               │
  │─ Feedback ────▶│── invoke() ─────▶│                │               │
  │                │                  │── resume ──────▶│               │
  │                │                  │                │── API call ───▶│
```

### 3.2 Real-Time Event System

```
Rust Backend (orchestrator.rs)
    │
    ├── emit("project-phase-changed")  → Frontend updates SDLC indicator
    ├── emit("project-execution-log")  → Activity feed auto-scrolls
    ├── emit("project-plan-ready")     → ProjectBoard refreshes data
    ├── emit("project-final-report")   → Final Report card appears
    ├── emit("project-feedback-requested") → Feedback input shows
    └── emit("project-execution-completed") → Status → Completed
```

---

## 4. Technology Stack

### 4.1 Backend

| Technology             | Version  | Purpose                        |
| ---------------------- | -------- | ------------------------------ |
| **Rust**               | 2021 ed. | Systems language for backend   |
| **Tauri**              | 2.x      | Native desktop framework + IPC |
| **rusqlite**           | 0.38.0   | SQLite database (bundled)      |
| **tokio**              | 1.x      | Async runtime                  |
| **tokio-tungstenite**  | 0.21     | WebSocket client               |
| **serde / serde_json** | 1.x      | Serialization                  |
| **uuid**               | 1.x      | UUID generation                |
| **chrono**             | 0.4.43   | Date/time handling             |
| **portable-pty**       | 0.9.0    | PTY terminal support           |
| **dirs**               | 5.x      | Platform-specific directories  |

### 4.2 Frontend

| Technology         | Version  | Purpose                      |
| ------------------ | -------- | ---------------------------- |
| **React**          | 18.3.1   | UI framework                 |
| **TypeScript**     | 5.9.3    | Type safety                  |
| **Vite**           | 6.3.5    | Build tool + HMR             |
| **Tailwind CSS**   | 4.1.12   | Utility-first CSS            |
| **Radix UI**       | Various  | 30+ accessible UI primitives |
| **Lucide React**   | 0.487.0  | Icon library                 |
| **xterm.js**       | 5.3.0    | Terminal emulator            |
| **react-markdown** | 10.1.0   | Markdown rendering           |
| **recharts**       | 2.15.2   | Data visualization           |
| **Motion**         | 12.23.24 | Animations                   |
| **date-fns**       | 3.6.0    | Date formatting              |
| **Sonner**         | 2.0.3    | Toast notifications          |

### 4.3 Testing

| Technology          | Version | Purpose                       |
| ------------------- | ------- | ----------------------------- |
| **Vitest**          | 4.0.18  | Unit testing                  |
| **WebDriverIO**     | 9.24.0  | E2E testing (Tauri WebDriver) |
| **Testing Library** | 16.3.2  | React component testing       |

---

## 5. Deployment Architecture

### Development Mode

```bash
./dev.sh
```

This script:

1. Starts OpenClaw Gateway on port 18789
2. Launches Vite dev server on port 5174
3. Builds and runs the Tauri native app
4. Hot-reloads frontend changes

### Production Build

```bash
cd axtrizen-app && cargo tauri build
```

Produces platform-specific installers:

- **macOS:** `.dmg` / `.app`
- **Linux:** `.deb` / `.AppImage`
- **Windows:** `.msi` / `.exe`

---

## 6. Security Architecture

| Layer            | Mechanism                                             |
| ---------------- | ----------------------------------------------------- |
| **IPC**          | Tauri's sandboxed IPC (command allowlist in `lib.rs`) |
| **Gateway Auth** | Token-based WebSocket handshake                       |
| **Data at Rest** | Local SQLite file in `~/.axtrizen/`                   |
| **File Access**  | Workspace scoped to `~/.axtrizen/projects/<id>/`      |
| **Network**      | localhost-only Gateway by default                     |
| **Permissions**  | Tauri capability files restrict plugin access         |

---

## 7. Scalability Architecture (v2.0)

The platform implements a **4-phase scaling architecture** designed for 1M+ users each running 100+ agents.

### 7.1 Phase 1: Parallel Orchestrator (Implemented)

```
BEFORE (sequential):  Agent1 → Agent2 → Agent3  (O(n) time)
AFTER  (parallel):    Agent1 ─┐
                      Agent2 ─┤── Semaphore(10) ── collect results
                      Agent3 ─┘
```

| Agents | Before | After |
| ------ | ------ | ----- |
| 3      | 270s   | ~90s  |
| 10     | 900s   | ~90s  |
| 100    | ~2.5h  | ~900s |

### 7.2 Phase 2: True P2P Agent Workers (Implemented)

```
Orchestrator publishes AVAILABLE_TASK
    ↓
Maple Broker delivers to subscribed workers
    ↓
AgentWorker claims task → GatewayBackedWorker calls LLM
    ↓
Worker publishes TASK_COMPLETED → Orchestrator collects
```

**Auto-scaling strategy (`AgentPoolManager`):**

| Agent Count | Strategy     | Workers                          |
| ----------- | ------------ | -------------------------------- |
| ≤20         | Direct       | 1 worker per agent               |
| 20-100      | Multiplexed  | Batched coroutines               |
| 100+        | Shared Queue | 5 workers pulling from TaskQueue |

### 7.3 Phase 3: Smart Group Communication (Implemented)

**How Individual Chat works:**

```
Human → Tauri "chat_send" → GatewayClient → OpenClaw Gateway → Agent LLM
                                             (ws://localhost:18789)
→ Response saved to: conversations + chat_messages tables
```

**How Group/Channel Chat works:**

```
Human → Tauri "send_group_message" → SQLite (group_messages)
                                   → Maple broadcast to group topic
                                   → Only group members see it
                                   → Agents respond via Gateway LLM
                                   → MessageAggregator summarizes if > 5 msgs/30s
```

**DB tables:** `agent_groups`, `agent_group_members`, `group_messages`

### 7.4 Phase 4: Production Scale (Implemented)

| Optimization      | Setting                | Impact                         |
| ----------------- | ---------------------- | ------------------------------ |
| WAL mode          | `journal_mode = WAL`   | Concurrent reads during writes |
| Sync mode         | `synchronous = NORMAL` | 10× faster writes              |
| Cache             | `cache_size = -20000`  | 20MB in-memory cache           |
| Memory-mapped I/O | `mmap_size = 256MB`    | Reduced disk I/O               |
| Temp storage      | `temp_store = MEMORY`  | RAM-backed temp tables         |

### 7.5 System Roles (Who Does What)

| System                 | Responsibility                                              | Status              |
| ---------------------- | ----------------------------------------------------------- | ------------------- |
| **OpenClaw Gateway**   | LLM reasoning, `chat.send`, agent identity, tool execution  | ✅ Core — unchanged |
| **Maple P2P**          | Agent events (task assignment, status, phase sync, reviews) | ✅ Expanded         |
| **SQLite**             | Persistent storage (agents, teams, groups, messages, logs)  | ✅ Enhanced (WAL)   |
| **Rust Orchestrator**  | Phase control, parallel dispatch, board state               | ✅ Parallelized     |
| **Agent Workers**      | Autonomous task execution via Maple subscribe+react         | ✅ New              |
| **Message Aggregator** | Summarizes high-volume agent traffic for humans             | ✅ New              |
