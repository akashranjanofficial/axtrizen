# Feature Specifications

# Axtrizen AI Platform

**Version:** 2.0 | **Date:** 2026-02-27

---

## Feature Map

```
Axtrizen AI
├── F01: Dashboard & System Monitoring
├── F02: Agent Management
├── F03: Team Composition
├── F04: Project Management
├── F05: SDLC Execution Engine (Parallel)
├── F06: Project Board (Kanban/List)
├── F07: Chat Interface (1:1 + Channel Groups)
├── F08: Mission Control
├── F09: Settings & Configuration
├── F10: Embedded Terminal
├── F11: Agent Metrics & Analytics
├── F12: Agent Groups & Channels        ← NEW
└── F13: Scaling Engine (Workers + Pool)  ← NEW
```

---

## F01: Dashboard & System Monitoring

### Overview

Central command view displaying real-time system health, agent status, and cost metrics.

### Components

| Component           | Source                | Data Source                    |
| ------------------- | --------------------- | ------------------------------ |
| Active Agents count | `Dashboard.tsx`       | `agentStore.agents.length`     |
| Session Cost        | `Dashboard.tsx`       | Gateway `usage.cost` RPC       |
| System Memory       | `Dashboard.tsx`       | Gateway `health` RPC           |
| Gateway Status      | `Dashboard.tsx`       | WebSocket connection state     |
| Gateway Uptime      | `Dashboard.tsx`       | Gateway `health.uptimeSeconds` |
| Agent Load          | `Dashboard.tsx`       | Count vs max agents            |
| Activity Feed       | `ActivityFeed.tsx`    | `localStorage` event log       |
| Agent Status Watch  | `AgentStatusList.tsx` | Polling every 10s              |

### User Stories

- **US-01.1:** As a user, I can see at a glance how many agents are active and their cost
- **US-01.2:** As a user, I can monitor Gateway health and connectivity
- **US-01.3:** As a user, I can review recent activity events in a scrollable feed

---

## F02: Agent Management

### Overview

Full CRUD lifecycle for AI agents with identity configuration.

### Flows

**Create Agent:**

```
User → AgentsView → create_agent(name, role) → Gateway agents.create
     ← Agent created with ID → DB insert → UI updates
```

**Edit Agent Files:**

```
User → AgentsView → get_agent_files(id) → Gateway agents.getFiles
     → Edit SOUL.md/IDENTITY.md → set_agent_file(id, file, content)
     → Gateway writes to agent workspace
```

### Data Model

| Field     | Type   | Source                                   |
| --------- | ------ | ---------------------------------------- |
| id        | UUID   | Gateway-generated                        |
| name      | string | User input                               |
| role      | string | User input                               |
| status    | enum   | Gateway state (idle/active/error)        |
| model     | string | Configured model (claude-4, gpt-4, etc.) |
| workspace | string | Gateway workspace path                   |
| avatar    | string | Emoji or URL from IDENTITY.md            |

### API Commands

| Command            | Parameters                   | Returns       |
| ------------------ | ---------------------------- | ------------- |
| `get_agents`       | —                            | `Agent[]`     |
| `create_agent`     | `name, role`                 | `Agent`       |
| `update_agent`     | `id, name, role, model`      | `void`        |
| `delete_agent`     | `agentId`                    | `void`        |
| `get_agent_files`  | `agentId`                    | `FileEntry[]` |
| `get_agent_file`   | `agentId, fileName`          | `string`      |
| `set_agent_file`   | `agentId, fileName, content` | `void`        |
| `get_agent_status` | `agentId`                    | `AgentStatus` |

---

## F03: Team Composition

### Overview

Teams group multiple agents under a Manager for project execution.

### Flows

**Create Team:**

```
User → TeamsView → create_team(name, desc) → DB insert
     → Assign Manager (dropdown) → update_team(managerId)
     → Add Workers → add_team_member(teamId, agentId)
```

**Group Chat:**

```
User → TeamsView → "Open Group Chat" → ChatWindow(team session key)
     → Messages go to team:ID:group session on Gateway
     → All team members see messages
```

### Data Model

| Table          | Fields                                        |
| -------------- | --------------------------------------------- |
| `teams`        | id, name, description, manager_id, created_at |
| `team_members` | team_id, agent_id, manager_id, joined_at      |

### API Commands

| Command              | Parameters                  | Returns        |
| -------------------- | --------------------------- | -------------- |
| `get_teams`          | —                           | `Team[]`       |
| `create_team`        | `name, description`         | `Team`         |
| `update_team`        | `id, name, desc, managerId` | `void`         |
| `delete_team`        | `teamId`                    | `void`         |
| `get_team_members`   | `teamId`                    | `TeamMember[]` |
| `add_team_member`    | `teamId, agentId`           | `void`         |
| `remove_team_member` | `teamId, agentId`           | `void`         |

---

## F04: Project Management

### Overview

Projects define what to build. Each project has requirements, a team, a workspace, and an SDLC lifecycle.

### Lifecycle States

```
draft → active → completed
         │
         └── requirements → planning → design → development → testing → deployment
```

### Data Model

| Field          | Type    | Description                            |
| -------------- | ------- | -------------------------------------- |
| id             | UUID    | Auto-generated                         |
| name           | string  | Project name                           |
| description    | text    | Optional description                   |
| team_id        | UUID FK | Assigned team                          |
| status         | enum    | draft / active / completed             |
| phase          | enum    | SDLC phase (requirements → deployment) |
| workspace_path | string  | `~/.axtrizen/projects/<id>/`           |

### API Commands

| Command          | Parameters                         | Returns     |
| ---------------- | ---------------------------------- | ----------- |
| `get_projects`   | —                                  | `Project[]` |
| `create_project` | `name, desc, teamId, requirements` | `Project`   |
| `update_project` | `id, name, desc, status, ...`      | `void`      |
| `delete_project` | `projectId`                        | `void`      |

---

## F05: SDLC Execution Engine

### Overview

The core orchestration engine that drives autonomous software development through 4 phases.

### Phase Details

| Phase           | What Happens                                                                                                                                                                     | Execution Model              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Planning**    | Manager generates project plan as JSON (epics, stories, tasks). Plan is parsed and persisted to DB.                                                                              | Sequential (Manager only)    |
| **Design**      | All agents propose design, Manager finalizes and assigns tasks.                                                                                                                  | Sequential                   |
| **Development** | Agents implement assigned tasks **in parallel** (`tokio::spawn` + `Semaphore(10)`). Manager reviews with revision loop (2 rounds max). Code blocks extracted and saved as files. | **Parallel** (10 concurrent) |
| **Testing**     | Review pairs execute **in parallel**. Each agent writes tests. Manager performs final review.                                                                                    | **Parallel** (10 concurrent) |
| **Completion**  | Manager generates Final Deliverables Report. Tasks → done. Report saved as FINAL_REPORT.md.                                                                                      | Sequential                   |

### Human Feedback Loop

After each phase, the system pauses and requests human feedback:

```
Phase completes → emit("project-feedback-requested") → UI shows input
Human types feedback → invoke("resume_project_execution") → Next phase begins
```

### Code File Extraction

During development, agent responses are parsed for code blocks:

````
Agent Response:
  **File: `src/index.html`**
  ```html
  // FILE: src/index.html
  <html>...</html>
````

→ extract_and_save_code_files() → writes to ~/.axtrizen/projects/<id>/src/index.html

```

### Final Deliverables Report
Generated at completion with sections:
- 📦 What Was Built
- 📂 Files Created
- 🛠️ Tech Stack
- 🚀 How to Run
- ✅ Testing Results
- 📋 Next Steps

---

## F06: Project Board (Kanban/List)

### Overview
Jira-like project board showing epics, stories, and tasks with two view modes.

### Views
| View | Description |
|------|-------------|
| **Kanban** | 5 columns: Backlog → Todo → In Progress → Review → Done |
| **List** | Hierarchical tree: Epic → Story → Task with progress bars |

### Real-Time Updates
- Auto-refreshes every 5 seconds via `setInterval(loadBoard, 5000)`
- Listens for `project-plan-ready` event for immediate refresh
- Progress bars: `(doneTasks / totalTasks) * 100`

### Data Hierarchy
```

Epic (Critical/High/Medium/Low priority)
└── Story (story points, assigned agent, sprint)
└── Task (status, assigned agent, estimated minutes, files created)

```

---

## F07: Chat Interface

### Overview
Real-time chat with individual agents or team groups with markdown rendering.

### Features
| Feature | Implementation |
|---------|---------------|
| 1:1 Chat | `ChatWindow.tsx` → `chat.send` to agent session via OpenClaw Gateway |
| Team Group Chat | `ChatWindow.tsx` → `chat.send` to team session via OpenClaw Gateway |
| **Channel Group Chat** | `send_group_message` → SQLite + Maple broadcast to group topic ← NEW |
| Chat History | Local SQLite (conversations + chat_messages + group_messages tables) |
| Markdown | `react-markdown` with custom CSS |
| Search | `search_chat` command across all conversations |
| Abort | `chat.abort` RPC to cancel running response |
| **Message Aggregation** | `MessageAggregator` summarizes >5 messages/30s into summaries ← NEW |

### Chat Architecture (How OpenClaw is Leveraged)

**Individual Chat (Human ↔ Agent):**
```

Human → Tauri "chat_send" → GatewayClient → OpenClaw Gateway → Agent LLM
│ (ws://localhost:18789)
└→ Response saved to: conversations + chat_messages

```

**Channel Group Chat (Human ↔ Agent Group):**
```

Human → Tauri "send_group_message" → SQLite group_messages
→ Maple broadcast to group topic
→ Only group members see it
→ Agents respond via Gateway LLM
→ MessageAggregator summarizes high-volume traffic

```

---

## F08: Mission Control

### Overview
Real-time monitoring dashboard for multi-agent activity during project execution.

### Components
- **MissionGrid:** Visual grid of agent cards with status indicators
- **Activity Timeline:** Chronological log of agent actions
- **Team Lanes:** Swim lanes showing work distribution

---

## F09: Settings & Configuration

### Overview
Application configuration panel for Gateway, theme, and debug settings.

### Settings
| Setting | Default | Description |
|---------|---------|-------------|
| `theme` | `dark` | Dark/Light mode |
| `gateway_url` | `ws://127.0.0.1:18789` | Gateway WebSocket URL |
| `debug_mode` | `false` | Verbose logging |
| `auto_reconnect` | `true` | Auto-reconnect to Gateway |

---

## F10: Embedded Terminal

### Overview
Native PTY terminal emulator supporting multiple terminal sessions.

### Commands
| Command | Description |
|---------|-------------|
| `create_pty` | Create new PTY terminal session |
| `write_pty` | Send input to terminal |
| `resize_pty` | Resize terminal viewport |
| `kill_pty` | Terminate terminal session |
| `spawn_agent` | Launch agent in terminal |
| `open_terminal` | Open system default terminal |

---

## F11: Agent Metrics & Analytics

### Overview
Usage tracking and activity analytics for cost monitoring and performance analysis.

### Data Points
| Metric | Source | Storage |
|--------|--------|---------|
| Tokens In/Out | Gateway usage API | `agent_usage_snapshots` |
| Cost (USD) | Gateway usage API | `agent_usage_snapshots` |
| Tool Calls | Gateway events | `agent_tool_calls` |
| Activity Log | Agent actions | `agent_activity` |
| Session Stats | Gateway sessions | Computed on-demand |
```

---

## F12: Agent Groups & Channels

### Overview

Sub-teams within teams for topic-based communication. Prevents chaos when 50+ agents are in a single team by creating focused channels.

### Flows

**Create Group:**

```
User → create_agent_group(teamId, name) → DB insert + auto-generates Maple topic
     → Add agents: add_agent_to_group(groupId, agentId)
     → Agents subscribe to group's Maple topic
```

**Channel Chat:**

```
Human → send_group_message(groupId, content) → SQLite group_messages
                                              → Maple broadcast to "team:X:group:frontend"
                                              → Only group members react
```

### API Commands

| Command                   | Parameters                               | Returns            |
| ------------------------- | ---------------------------------------- | ------------------ |
| `create_agent_group`      | `teamId, name, description?`             | `{id, mapleTopic}` |
| `get_agent_groups`        | `teamId`                                 | `AgentGroup[]`     |
| `add_agent_to_group`      | `groupId, agentId`                       | `void`             |
| `remove_agent_from_group` | `groupId, agentId`                       | `void`             |
| `get_group_members`       | `groupId`                                | `string[]`         |
| `send_group_message`      | `groupId, senderId, senderType, content` | `messageId`        |
| `get_group_messages`      | `groupId, limit?`                        | `GroupMessage[]`   |
| `delete_agent_group`      | `groupId`                                | `void`             |

---

## F13: Scaling Engine (Workers + Pool)

### Overview

Infrastructure for running 100+ agents on a single desktop. Includes autonomous agent workers, auto-scaling pool, and production database optimizations.

### Components

| Component               | File                    | Purpose                                                                           |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| **AgentWorker**         | `agent_worker.py`       | Long-lived Python process that subscribes to Maple topics and reacts autonomously |
| **GatewayBackedWorker** | `agent_worker.py`       | Worker that delegates LLM reasoning to OpenClaw Gateway                           |
| **AgentPoolManager**    | `agent_pool.py`         | Auto-scales workers: direct (≤20), multiplexed (20-100), shared queue (100+)      |
| **MessageAggregator**   | `message_aggregator.py` | Buffers + summarizes high-volume agent messages by topic                          |

### Bridge Commands (JSON-RPC via stdin/stdout)

| Command             | Parameters                      | Returns                         |
| ------------------- | ------------------------------- | ------------------------------- |
| `pool.spawn`        | `{agents, teamId, gatewayUrl?}` | `{workersSpawned, strategy}`    |
| `pool.shutdown`     | —                               | `{status: ok}`                  |
| `pool.status`       | —                               | `{strategy, totalWorkers, ...}` |
| `pool.resolve_task` | `{agentId, taskId, result}`     | `{status}`                      |

### SQLite Performance (Phase 4)

| Pragma         | Value     | Impact                         |
| -------------- | --------- | ------------------------------ |
| `journal_mode` | WAL       | Concurrent reads during writes |
| `synchronous`  | NORMAL    | 10× faster writes              |
| `cache_size`   | -20000    | 20MB in-memory cache           |
| `mmap_size`    | 268435456 | 256MB memory-mapped I/O        |
| `temp_store`   | MEMORY    | RAM-backed temp tables         |
