# TeamForge AI - Final Comprehensive Plan

> **Codename**: TeamForge AI  
> **Version**: 2.0 (OpenClaw-based)  
> **Last Updated**: 2026-02-06

---

## Executive Summary

TeamForge AI is a **production-grade cross-platform desktop application** that wraps OpenClaw to enable multi-agent AI team orchestration. Unlike typical AI tools, this platform is designed for:

| Requirement         | Target                            |
| ------------------- | --------------------------------- |
| **Agents per PC**   | 20-30 concurrent                  |
| **Hardware**        | 4GB RAM minimum (low-spec PCs)    |
| **Uptime**          | Months/years continuous operation |
| **Users**           | Millions of desktop installations |
| **Crash tolerance** | Zero crashes, graceful recovery   |

---

## 1. What We're Building (NOT Building)

### ✅ We ARE Building (OpenClaw Wrapper)

| Layer                   | Technology        | Purpose                                |
| ----------------------- | ----------------- | -------------------------------------- |
| **Desktop UI**          | C++17/Qt 6 QML    | Lightweight native interface (~20MB)   |
| **Agent Memory**        | SQLite + LanceDB  | Persistent context, vector search      |
| **Team Manager**        | C++ Backend       | Team creation, hierarchy, templates    |
| **Workflow Engine**     | C++ State Machine | Domain-agnostic SDLC automation        |
| **Orchestration Layer** | WebSocket Client  | Bridge between UI and OpenClaw Gateway |

### ❌ We are NOT Building (Use OpenClaw)

| Capability          | OpenClaw Already Provides                            |
| ------------------- | ---------------------------------------------------- |
| AI Runtime          | Gateway + Pi agent runtime                           |
| Inter-agent comms   | `sessions_send`, `sessions_list`, `sessions_history` |
| Multi-channel inbox | WhatsApp, Telegram, Discord, Slack, etc.             |
| Browser control     | CDP-based Chrome/Chromium control                    |
| Skills platform     | Bundled, managed, workspace skills                   |
| Model providers     | Anthropic, OpenAI with failover                      |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     TeamForge Desktop (Qt 6 QML)                             │
│                         UI Process (~20MB)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Dashboard │ Agents │ Teams │ Projects │ Messages │ Settings                │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ IPC (Unix Sockets / Named Pipes)
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TeamForge Agent Daemon (C++)                              │
│                       Orchestrator (~10MB base)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         Agent Pool                                       ││
│  │  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐        ││
│  │  │ PM  │  │Arch │  │ Dev │  │ QA  │  │DevOp│  │Anlst│  │ ... │        ││
│  │  │ ~2MB│  │ ~2MB│  │ ~2MB│  │ ~2MB│  │ ~2MB│  │ ~2MB│  │ ~2MB│        ││
│  │  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘        ││
│  │  (Dormant agents: ~0.5MB swapped to disk)                                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Message Bus (Lock-free queue) → Inter-agent communication               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Memory Manager: Working | Short-term | Long-term | Episodic             ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ WebSocket (ws://127.0.0.1:18789)
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway (Node.js subprocess)                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Session Pool: PM | Architect | Dev1 | Dev2 | QA | DevOps | ...      │   │
│  │  Each session = one agent with its own context/memory                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  Tools: sessions_send | sessions_list | sessions_history | browser | etc.  │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
   ┌──────────┐          ┌──────────┐          ┌──────────┐
   │ SQLite   │          │ LanceDB  │          │ Claude   │
   │ (state)  │          │ (vectors)│          │   API    │
   └──────────┘          └──────────┘          └──────────┘
```

---

## 3. Memory Footprint Comparison

| Configuration        | Our Design  | Electron/Tauri Approach |
| -------------------- | ----------- | ----------------------- |
| UI Layer             | ~20 MB      | ~80-150 MB              |
| Per Active Agent     | ~2-5 MB     | ~50-100 MB              |
| Per Dormant Agent    | ~0.5 MB     | N/A (not optimized)     |
| 30 Agents (5 active) | **~100 MB** | **~600-800 MB**         |
| OpenClaw Gateway     | ~150 MB     | ~150 MB                 |
| **Total System**     | **~250 MB** | **~800+ MB**            |

---

## 4. Agent Memory Strategy

### Multi-Tier Memory Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Agent Memory Layers                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  WORKING MEMORY (~200 tokens)                                       │  │
│  │  Current task context, immediate conversation                       │  │
│  │  Storage: In-memory (RAM)                                           │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                              ▲                                            │
│                              │ Promotes on importance                     │
│                              ▼                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  SHORT-TERM MEMORY (~10,000 messages per agent)                     │  │
│  │  Recent conversations, task history, decisions                      │  │
│  │  Storage: SQLite (agents/{id}/history.db)                           │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                              ▲                                            │
│                              │ Summarizes and embeds                     │
│                              ▼                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  LONG-TERM MEMORY (Vector embeddings)                               │  │
│  │  Semantic search across all past interactions                       │  │
│  │  Storage: LanceDB (agents/{id}/vectors/)                            │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                              ▲                                            │
│                              │ Periodic consolidation                     │
│                              ▼                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  EPISODIC MEMORY (Compressed project summaries)                     │  │
│  │  "What did we do in Project X 3 months ago?"                        │  │
│  │  Storage: SQLite (agents/{id}/episodes.db)                          │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Inter-Agent Communication

### Using OpenClaw's sessions\_\* Tools

```cpp
// How agents communicate (leveraging OpenClaw)

// 1. PM assigns task to Developer
orchestrator.sendMessage(
    pm_session_id,      // from
    dev1_session_id,    // to
    "[TASK] Implement user authentication module",
    MessageType::Task
);

// 2. Developer asks Architect for clarification
orchestrator.sendMessage(
    dev1_session_id,    // from
    architect_session_id,  // to
    "[QUESTION] Should we use JWT or session-based auth?",
    MessageType::Query
);

// 3. QA reports bug to Developer
orchestrator.sendMessage(
    qa_session_id,      // from
    dev1_session_id,    // to
    "[BUG] Login fails when password contains special chars",
    MessageType::Bug
);
```

### Message Bus (Local, Lock-Free)

```cpp
// Lock-free queue for agent-to-agent messaging within our app
// (Before forwarding to OpenClaw Gateway)

struct AgentMessage {
    uint64_t id;
    uint32_t from_agent_id;
    uint32_t to_agent_id;
    MessageType type;  // Task, Query, Review, Approval, Bug, Info
    std::string content;
    std::chrono::system_clock::time_point timestamp;
    Priority priority;  // Low, Medium, High, Critical
};

class MessageBus {
    moodycamel::ConcurrentQueue<AgentMessage> queue;  // Lock-free

    void route(AgentMessage msg) {
        // 1. Store in local DB for UI display
        db.storeMessage(msg);

        // 2. Forward to OpenClaw Gateway
        gateway.sendToSession(msg.to_agent_id, formatMessage(msg));

        // 3. Emit event for UI update
        emit messageRouted(msg);
    }
};
```

---

## 6. Technology Stack (Final)

### Desktop Application

| Component        | Technology             | Why                                              |
| ---------------- | ---------------------- | ------------------------------------------------ |
| **Language**     | C++17/20               | Maximum performance, no GC, direct system access |
| **UI Framework** | Qt 6 QML               | Native, cross-platform, small footprint          |
| **Build System** | CMake + vcpkg          | Modern C++ package management                    |
| **Database**     | SQLite 3               | Embedded, zero-config, battle-tested             |
| **Vector DB**    | LanceDB                | Embedded vector search, small footprint          |
| **HTTP/WS**      | libcurl + websocketpp  | Lightweight, no bloat                            |
| **JSON**         | nlohmann/json          | Header-only, fast                                |
| **Async**        | C++ coroutines (C++20) | Native async without heavy runtime               |

### OpenClaw (As Subprocess)

| Component     | OpenClaw Provides                              |
| ------------- | ---------------------------------------------- |
| Gateway       | WebSocket control plane (port 18789)           |
| Agent Runtime | Pi agent with tool streaming                   |
| Sessions      | Isolated per-agent sessions                    |
| Communication | sessions_send, sessions_list, sessions_history |
| Skills        | Bundled + custom workspace skills              |

---

## 7. Prompts (From system-prompts-and-models-of-ai-tools)

We'll leverage prompts from the cloned repository:

| Role      | Source Prompt                       |
| --------- | ----------------------------------- |
| PM        | Cursor Prompts / Anthropic patterns |
| Architect | Devin AI / Amp patterns             |
| Developer | Claude Code / Cursor patterns       |
| QA        | Windsurf / Junie patterns           |
| DevOps    | Replit / Kiro patterns              |
| Analyst   | Custom (Finance domain)             |

### Prompt Structure per Agent

```
~/.teamforge/agents/{agent_id}/
├── AGENTS.md     # Role-specific instructions
├── SOUL.md       # Personality and values
├── TOOLS.md      # Available tools/skills
└── CONTEXT.md    # Current project context
```

---

## 8. SDLC Phases

### Phase 1: Requirements & Planning (Week 1-2)

- [ ] Finalize this document
- [ ] Create detailed user stories
- [ ] Technical feasibility validation
- [ ] UI/UX wireframes

### Phase 2: Foundation (Week 3-4)

- [ ] Qt 6 project scaffold
- [ ] SQLite database layer
- [ ] OpenClaw Gateway integration (WebSocket)
- [ ] Basic agent spawn/terminate

### Phase 3: Core Features (Week 5-8)

- [ ] Agent CRUD and templates
- [ ] Team management with hierarchy
- [ ] Project/workflow engine
- [ ] Message visualization

### Phase 4: Memory & Optimization (Week 9-10)

- [ ] Multi-tier memory system
- [ ] Agent dormancy (swap to disk)
- [ ] LanceDB vector integration
- [ ] Memory footprint optimization

### Phase 5: Polish & Release (Week 11-12)

- [ ] Cross-platform testing
- [ ] Performance benchmarking
- [ ] Documentation
- [ ] Installer packaging

---

## 9. Key Files to Create

| Path                                            | Description                               |
| ----------------------------------------------- | ----------------------------------------- |
| `agenticWork/docs/USER_STORIES.md`              | All user stories with acceptance criteria |
| `agenticWork/docs/FEATURES.md`                  | Feature breakdown by phase                |
| `agenticWork/docs/TECHNICAL_ARCHITECTURE.md`    | Detailed component design                 |
| `agenticWork/docs/AGENT_MEMORY_DESIGN.md`       | Memory tier specifications                |
| `agenticWork/docs/INTER_AGENT_COMMUNICATION.md` | Message protocols                         |
| `agenticWork/specs/DATABASE_SCHEMA.sql`         | Full SQLite schema                        |
| `agenticWork/specs/API_SPEC.md`                 | C++ service interfaces                    |

---

## 10. Success Criteria

| Metric                       | Target                                |
| ---------------------------- | ------------------------------------- |
| App startup                  | < 100ms                               |
| Memory (30 agents, 5 active) | < 150 MB                              |
| Crash rate                   | 0% over 30-day test                   |
| Platforms                    | Windows 10+, macOS 12+, Ubuntu 20.04+ |
| Agent response latency       | < 2s (excluding LLM time)             |
| Binary size                  | < 30 MB (excluding OpenClaw)          |

---

## 11. Risk Mitigation

| Risk                     | Mitigation                                            |
| ------------------------ | ----------------------------------------------------- |
| OpenClaw API changes     | Pin to specific version, abstract integration layer   |
| Memory leaks (C++)       | AddressSanitizer in CI, RAII patterns, smart pointers |
| Long-running stability   | Watchdog process, graceful restart, state persistence |
| Cross-platform Qt issues | Early testing matrix, platform-specific CI            |

---

## Next Steps

1. **User Review**: Get approval on this final plan
2. **Create Detailed Docs**: USER_STORIES.md, FEATURES.md, etc.
3. **Start Development**: Qt 6 project scaffold

---

> **Ready for review and approval before proceeding to implementation.**
