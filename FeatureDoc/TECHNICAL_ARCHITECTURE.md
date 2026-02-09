# TeamForge AI - Technical Architecture

> **Version**: 1.0 | **Last Updated**: 2026-02-06

---

## Process Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TeamForge Desktop                                  │
├─────────────────────┬───────────────────────────────────────────────────────┤
│                     │                                                        │
│  ┌───────────────┐  │  ┌─────────────────────────────────────────────────┐  │
│  │  UI Process   │  │  │             Agent Daemon Process                │  │
│  │   (Qt 6 QML)  │  │  │                                                 │  │
│  │    ~20MB      │  │  │  ┌─────────────────────────────────────────┐   │  │
│  │               │◄─┼──►│  │           Orchestrator Core             │   │  │
│  │  • Dashboard  │  │  │  │  - Agent Pool Manager                   │   │  │
│  │  • Agents     │  │  │  │  - Message Bus (lock-free)              │   │  │
│  │  • Teams      │  │  │  │  - Memory Manager                       │   │  │
│  │  • Projects   │  │  │  │  - Workflow Engine                      │   │  │
│  │  • Messages   │  │  │  └─────────────────────────────────────────┘   │  │
│  │  • Settings   │  │  │                                                 │  │
│  └───────────────┘  │  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐       │  │
│                     │  │  │ Agent │ │ Agent │ │ Agent │ │ Agent │       │  │
│         IPC         │  │  │  PM   │ │ Arch  │ │ Dev1  │ │  QA   │       │  │
│   (Unix Socket /    │  │  │ ~2MB  │ │ ~2MB  │ │ ~2MB  │ │ ~2MB  │       │  │
│    Named Pipe)      │  │  └───────┘ └───────┘ └───────┘ └───────┘       │  │
│                     │  └─────────────────────────────────────────────────┘  │
└─────────────────────┴───────────────────────────────────────────────────────┘
                                       │
                                       │ WebSocket (ws://127.0.0.1:18789)
                                       ▼
                      ┌─────────────────────────────────────┐
                      │      OpenClaw Gateway (Node.js)      │
                      │  - Session management                │
                      │  - Tool streaming                    │
                      │  - Model provider failover           │
                      └─────────────────────────────────────┘
```

---

## Module Hierarchy

### C++ Backend (`src/core/`)

```
src/core/
├── agent/
│   ├── AgentManager.cpp          # Agent pool lifecycle
│   ├── AgentState.cpp            # Agent status tracking
│   └── AgentConfig.cpp           # Agent configuration
├── team/
│   ├── TeamManager.cpp           # Team CRUD
│   ├── HierarchyBuilder.cpp      # Org chart logic
│   └── AIManager.cpp             # Mandatory orchestrator
├── project/
│   ├── ProjectManager.cpp        # Project lifecycle
│   ├── WorkflowEngine.cpp        # SDLC state machine
│   └── PhaseTracker.cpp          # Progress tracking
├── memory/
│   ├── MemoryManager.cpp         # Multi-tier coordinator
│   ├── WorkingMemory.cpp         # RAM-based context
│   ├── ShortTermMemory.cpp       # SQLite history
│   ├── LongTermMemory.cpp        # LanceDB vectors
│   └── EpisodicMemory.cpp        # Project summaries
├── messaging/
│   ├── MessageBus.cpp            # Lock-free queue
│   ├── MessageRouter.cpp         # Agent routing
│   └── NotificationService.cpp   # Desktop notifications
├── gateway/
│   ├── OpenClawGateway.cpp       # WebSocket client
│   ├── SessionManager.cpp        # Session pool
│   └── ToolBridge.cpp            # Tool streaming
├── channels/
│   ├── SlackConnector.cpp        # Slack OAuth + messaging
│   ├── DiscordConnector.cpp      # Discord bot
│   └── ChannelRouter.cpp         # Message routing
├── storage/
│   ├── DatabaseManager.cpp       # SQLite + migrations
│   └── SettingsManager.cpp       # Encrypted settings
└── services/
    ├── IAgentService.h           # Pure virtual interface
    ├── ITeamService.h
    ├── IProjectService.h
    ├── IMessageBus.h
    ├── IMemoryManager.h
    └── IOpenClawGateway.h
```

### Qt 6 QML Frontend (`src/qml/`)

```
src/qml/
├── main.qml                      # Application root
├── theme/
│   ├── MaterialTheme.qml         # MD3 configuration
│   ├── Colors.qml                # Color tokens
│   ├── Typography.qml            # Font scale
│   └── Elevation.qml             # Shadow system
├── components/
│   ├── buttons/
│   │   ├── PrimaryButton.qml
│   │   ├── OutlinedButton.qml
│   │   └── IconButton.qml
│   ├── cards/
│   │   ├── AgentCard.qml
│   │   ├── TeamCard.qml
│   │   └── ProjectCard.qml
│   ├── navigation/
│   │   ├── NavRail.qml           # 80dp navigation
│   │   └── Breadcrumb.qml
│   ├── chat/
│   │   ├── ChatBubble.qml
│   │   ├── MessageList.qml
│   │   └── ChatInput.qml
│   ├── feedback/
│   │   ├── Snackbar.qml
│   │   ├── StatusBadge.qml
│   │   └── AIManagerBadge.qml
│   └── data/
│       ├── AgentList.qml
│       ├── TaskBoard.qml
│       └── HierarchyView.qml
└── views/
    ├── DashboardView.qml
    ├── AgentsView.qml
    ├── TeamsView.qml
    ├── ProjectsView.qml
    ├── MessagesView.qml
    └── SettingsView.qml
```

---

## IPC Protocol

### UI → Daemon Commands

| Command         | Payload                       | Response             |
| --------------- | ----------------------------- | -------------------- |
| `CREATE_AGENT`  | `{name, role, model, config}` | `{id, status}`       |
| `DELETE_AGENT`  | `{id}`                        | `{success}`          |
| `CREATE_TEAM`   | `{name, agents[], hierarchy}` | `{id, aiManagerId}`  |
| `START_PROJECT` | `{id, teamId}`                | `{status}`           |
| `SEND_MESSAGE`  | `{from, to, content, type}`   | `{messageId}`        |
| `QUERY_STATUS`  | `{agentId?}`                  | `{agents[], memory}` |

### Daemon → UI Events

| Event                  | Payload                         |
| ---------------------- | ------------------------------- |
| `AGENT_STATUS_CHANGED` | `{id, status, task}`            |
| `MESSAGE_RECEIVED`     | `{from, to, content, type, ts}` |
| `PHASE_PROGRESSED`     | `{projectId, phase, progress}`  |
| `HUMAN_INPUT_REQUIRED` | `{agentId, question}`           |
| `MEMORY_UPDATED`       | `{agentId, tier, size}`         |

---

## Build System

### CMake Structure

```cmake
cmake_minimum_required(VERSION 3.21)
project(TeamForge VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# vcpkg dependencies
find_package(Qt6 REQUIRED COMPONENTS Quick QuickControls2 WebSockets Sql)
find_package(SQLite3 REQUIRED)
find_package(nlohmann_json REQUIRED)
find_package(websocketpp REQUIRED)

# Core library
add_library(teamforge_core STATIC
    src/core/agent/AgentManager.cpp
    src/core/memory/MemoryManager.cpp
    # ... all core sources
)

# UI executable
add_executable(teamforge
    src/main.cpp
)

target_link_libraries(teamforge PRIVATE
    teamforge_core
    Qt6::Quick
    Qt6::QuickControls2
    Qt6::WebSockets
)
```

### Directory Layout

```
teamforge/
├── CMakeLists.txt
├── vcpkg.json                    # Dependencies
├── src/
│   ├── core/                     # C++ backend
│   ├── qml/                      # QML frontend
│   └── main.cpp                  # Entry point
├── resources/
│   ├── icons/                    # Material Symbols
│   ├── fonts/                    # Roboto/Inter
│   └── qtquickcontrols2.conf     # MD3 config
├── tests/
│   ├── unit/
│   └── integration/
└── scripts/
    ├── build.sh
    └── package.sh
```

---

## Data Flow

### Agent Creation Flow

```
User Click → QML Button
    ↓
[UI Process] Emit signal
    ↓
IPC Message: CREATE_AGENT {name, role}
    ↓
[Daemon] AgentManager.createAgent()
    ↓
SQLite: INSERT INTO agents
    ↓
OpenClaw: Create session via Gateway
    ↓
Load system prompt from template
    ↓
IPC Event: AGENT_STATUS_CHANGED {id: new, status: idle}
    ↓
[UI Process] Update AgentList model
    ↓
QML ListView refreshes
```

### Message Flow

```
Agent A sends message
    ↓
[Daemon] MessageBus.enqueue()
    ↓
Lock-free queue → route to Agent B
    ↓
Store in SQLite (messages table)
    ↓
Forward to OpenClaw via sessions_send
    ↓
IPC Event: MESSAGE_RECEIVED
    ↓
[UI Process] ChatBubble rendered
```

---

## Technology Decisions

| Decision  | Choice                   | Rationale                     |
| --------- | ------------------------ | ----------------------------- |
| Language  | C++20                    | No GC, coroutines, concepts   |
| UI        | Qt 6 QML                 | Native, cross-platform, small |
| IPC       | Unix Socket / Named Pipe | Low latency, no HTTP overhead |
| JSON      | nlohmann/json            | Header-only, fast, idiomatic  |
| WebSocket | websocketpp              | Lightweight C++ library       |
| Database  | SQLite 3                 | Embedded, zero-config         |
| Vectors   | LanceDB                  | Embedded vector DB            |
| Async     | C++20 coroutines         | Native, no runtime overhead   |
