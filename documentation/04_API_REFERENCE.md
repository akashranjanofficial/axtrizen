# API & Command Reference

# Axtrizen AI Platform

**Version:** 1.0 | **Date:** 2026-02-26

---

## Overview

Axtrizen uses Tauri's IPC (Inter-Process Communication) system. The frontend calls Rust backend functions via `invoke()`. Commands are registered in `lib.rs` and organized across 18 modules.

**Total Commands:** 65+

---

## Terminal Commands (`terminal.rs`)

| Command         | Parameters                            | Returns           | Description                       |
| --------------- | ------------------------------------- | ----------------- | --------------------------------- |
| `create_pty`    | `rows: u16, cols: u16`                | `string (pty_id)` | Create a new PTY terminal session |
| `write_pty`     | `ptyId: string, data: string`         | `void`            | Send input data to a PTY          |
| `resize_pty`    | `ptyId: string, rows: u16, cols: u16` | `void`            | Resize terminal dimensions        |
| `kill_pty`      | `ptyId: string`                       | `void`            | Kill a terminal session           |
| `spawn_agent`   | `agentId: string`                     | `string`          | Spawn an agent in a terminal      |
| `open_terminal` | —                                     | `void`            | Open system default terminal      |

---

## Gateway Connection (`gateway_client.rs`)

| Command                | Parameters                   | Returns | Description                               |
| ---------------------- | ---------------------------- | ------- | ----------------------------------------- |
| `gateway_connect`      | `url: string, token: string` | `bool`  | Connect to OpenClaw Gateway via WebSocket |
| `gateway_disconnect`   | —                            | `void`  | Disconnect from Gateway                   |
| `gateway_is_connected` | —                            | `bool`  | Check connection status                   |

---

## Agent Commands (`agents.rs`)

| Command            | Parameters                   | Returns       | Description                  |
| ------------------ | ---------------------------- | ------------- | ---------------------------- |
| `get_agents`       | —                            | `Agent[]`     | List all agents from Gateway |
| `get_agent_status` | `agentId: string`            | `AgentStatus` | Get agent's current status   |
| `create_agent`     | `name: string, role: string` | `Agent`       | Create new agent via Gateway |
| `update_agent`     | `id, name, role, model, ...` | `void`        | Update agent properties      |
| `delete_agent`     | `agentId: string`            | `void`        | Delete agent from Gateway    |
| `get_agent_files`  | `agentId: string`            | `FileEntry[]` | List agent's workspace files |
| `get_agent_file`   | `agentId, fileName`          | `string`      | Read a specific agent file   |
| `set_agent_file`   | `agentId, fileName, content` | `void`        | Write to an agent file       |

---

## Chat Commands (`chat.rs`)

| Command                    | Parameters                            | Returns          | Description                        |
| -------------------------- | ------------------------------------- | ---------------- | ---------------------------------- |
| `chat_send`                | `sessionKey, message, idempotencyKey` | `ChatResponse`   | Send message to agent/group        |
| `chat_history`             | `sessionKey, limit?`                  | `Message[]`      | Get chat transcript from Gateway   |
| `chat_abort`               | `sessionKey`                          | `void`           | Cancel running response            |
| `chat_inject`              | `sessionKey, content, label`          | `void`           | Inject system message into session |
| `save_chat_message`        | `role, content, sessionKey, ...`      | `void`           | Persist message to local SQLite    |
| `get_all_conversations`    | —                                     | `Conversation[]` | List all conversations             |
| `get_conversation_history` | `conversationId`                      | `Message[]`      | Get local chat history             |
| `search_chat`              | `query: string`                       | `SearchResult[]` | Full-text search across chats      |
| `delete_conversation`      | `conversationId`                      | `void`           | Delete a conversation              |

---

## Project Commands (`projects.rs`)

| Command          | Parameters                                                  | Returns     | Description           |
| ---------------- | ----------------------------------------------------------- | ----------- | --------------------- |
| `get_projects`   | —                                                           | `Project[]` | List all projects     |
| `create_project` | `name, description, teamId, requirements, workspacePath`    | `Project`   | Create project        |
| `update_project` | `id, name?, desc?, status?, phase?, teamId?, requirements?` | `void`      | Update project fields |
| `delete_project` | `projectId: string`                                         | `void`      | Delete project        |

---

## Planning / Board Commands (`planning.rs`)

| Command               | Parameters                                                                   | Returns        | Description                                        |
| --------------------- | ---------------------------------------------------------------------------- | -------------- | -------------------------------------------------- |
| `get_project_board`   | `projectId: string`                                                          | `ProjectBoard` | Get full board (epics + stories + tasks + sprints) |
| `create_epic`         | `projectId, title, description, priority, sortOrder`                         | `Epic`         | Create epic                                        |
| `create_story`        | `epicId, projectId, title, desc, criteria, points, agentId, sprintId, order` | `Story`        | Create story                                       |
| `create_task`         | `storyId, epicId, projectId, title, desc, agentId, minutes, deps, order`     | `Task`         | Create task                                        |
| `update_task_status`  | `taskId, status, filesCreated?`                                              | `void`         | Update task status                                 |
| `update_story_status` | `storyId, status`                                                            | `void`         | Update story status                                |
| `update_epic_status`  | `epicId, status`                                                             | `void`         | Update epic status                                 |
| `create_sprint`       | `projectId, name, goal?`                                                     | `Sprint`       | Create sprint                                      |

---

## Team Commands (`teams.rs`)

| Command              | Parameters                     | Returns        | Description            |
| -------------------- | ------------------------------ | -------------- | ---------------------- |
| `get_teams`          | —                              | `Team[]`       | List all teams         |
| `create_team`        | `name, description`            | `Team`         | Create team            |
| `update_team`        | `id, name?, desc?, managerId?` | `void`         | Update team            |
| `delete_team`        | `teamId: string`               | `void`         | Delete team            |
| `get_team_members`   | `teamId: string`               | `TeamMember[]` | List team members      |
| `add_team_member`    | `teamId, agentId`              | `void`         | Add agent to team      |
| `remove_team_member` | `teamId, agentId`              | `void`         | Remove agent from team |

---

## Orchestrator Commands (`commands/orchestrator.rs`)

| Command                    | Parameters            | Returns           | Description                        |
| -------------------------- | --------------------- | ----------------- | ---------------------------------- |
| `start_project_execution`  | `projectId: string`   | `void`            | Start SDLC execution for a project |
| `stop_project_execution`   | `projectId: string`   | `void`            | Cancel running execution           |
| `get_execution_status`     | `projectId: string`   | `ExecutionStatus` | Get current phase + status         |
| `resume_project_execution` | `projectId, feedback` | `void`            | Resume after human feedback        |

---

## System Commands (`system.rs`)

| Command             | Parameters     | Returns        | Description                               |
| ------------------- | -------------- | -------------- | ----------------------------------------- |
| `gateway_health`    | —              | `HealthData`   | Memory, CPU, version, uptime              |
| `gateway_status`    | —              | `StatusData`   | Gateway status summary                    |
| `last_heartbeat`    | —              | `string`       | Last heartbeat timestamp                  |
| `system_presence`   | —              | `PresenceData` | Online nodes/devices                      |
| `read_file_content` | `path: string` | `string`       | Read text file contents (path-safe)       |
| `list_directory`    | `path: string` | `FileEntry[]`  | Recursively list files in a workspace dir |
| `open_workspace`    | `path: string` | `void`         | Open directory in system file manager     |

### `list_directory` Detail

Recursively walks the given directory and returns a tree of `FileEntry` objects. Skips `node_modules`, `.git`, `dist`, and `__pycache__` directories. Results are sorted directories-first, then alphabetically.

**FileEntry schema:**

```typescript
interface FileEntry {
  name: string; // filename
  path: string; // absolute path
  isDir: boolean; // true for directories
  size: number; // file size in bytes (0 for dirs)
  children?: FileEntry[]; // recursive children (dirs only)
}
```

### `open_workspace` Detail

Opens the given path in the platform-native file manager:

- **macOS:** `open <path>` (Finder)
- **Linux:** `xdg-open <path>`
- **Windows:** `explorer <path>`

### Path-Traversal Security (`is_path_safe`)

All file-system commands (`read_file_content`, `list_directory`) enforce a security boundary via the internal `is_path_safe()` function:

1. The requested path is canonicalized (resolving symlinks and `..` segments).
2. The canonical path must fall within `~/.axtrizen/projects/`.
3. If the check fails, the command returns a `SecurityError` and does not perform any I/O.

This prevents directory traversal attacks through the IPC layer.

---

## Settings Commands (`settings.rs`)

| Command             | Parameters      | Returns     | Description             |
| ------------------- | --------------- | ----------- | ----------------------- |
| `get_settings`      | —               | `Setting[]` | Get all app settings    |
| `set_setting`       | `key, value`    | `void`      | Set a single setting    |
| `update_settings`   | `settings: Map` | `void`      | Batch update settings   |
| `toggle_debug_mode` | —               | `bool`      | Toggle debug mode       |
| `is_debug_mode`     | —               | `bool`      | Check debug mode status |

---

## Config Commands (`config.rs`)

| Command                  | Parameters        | Returns       | Description              |
| ------------------------ | ----------------- | ------------- | ------------------------ |
| `get_gateway_token`      | —                 | `string?`     | Get stored gateway token |
| `get_openclaw_config`    | —                 | `Config`      | Get OpenClaw config      |
| `is_openclaw_configured` | —                 | `bool`        | Check if configured      |
| `get_agent_config`       | `agentId`         | `AgentConfig` | Get agent runtime config |
| `save_agent_config`      | `agentId, config` | `void`        | Save agent config        |

---

## Agent Metrics Commands (`agent_metrics.rs`)

| Command                   | Parameters                                | Returns           | Description                 |
| ------------------------- | ----------------------------------------- | ----------------- | --------------------------- |
| `get_agent_usage`         | `agentId`                                 | `UsageSnapshot[]` | Token/cost usage over time  |
| `get_agent_session_stats` | `agentId`                                 | `SessionStats`    | Session count, avg duration |
| `get_agent_activity`      | `agentId, limit?`                         | `Activity[]`      | Recent activity log         |
| `get_agent_tool_calls`    | `agentId, limit?`                         | `ToolCall[]`      | Recent tool invocations     |
| `log_agent_activity`      | `agentId, type, desc, meta`               | `void`            | Log an activity event       |
| `log_agent_tool_call`     | `agentId, tool, args, result, ms, status` | `void`            | Log a tool call             |

---

## Additional Commands

### Skills (`skills.rs`)

| Command          | Description                    |
| ---------------- | ------------------------------ |
| `skills_status`  | Get skills installation status |
| `skills_update`  | Update installed skills        |
| `skills_install` | Install new skill              |

### Cron (`cron.rs`)

| Command       | Description                |
| ------------- | -------------------------- |
| `cron_list`   | List scheduled tasks       |
| `cron_add`    | Add new cron job           |
| `cron_update` | Update cron job            |
| `cron_remove` | Delete cron job            |
| `cron_run`    | Manually run a cron job    |
| `cron_runs`   | Get cron execution history |

### Devices (`devices.rs`)

| Command          | Description             |
| ---------------- | ----------------------- |
| `device_list`    | List registered devices |
| `device_approve` | Approve a new device    |
| `device_reject`  | Reject a device         |
| `device_revoke`  | Revoke device access    |

### Logs (`logs.rs`)

| Command     | Description           |
| ----------- | --------------------- |
| `logs_tail` | Tail application logs |

### Usage (`usage.rs`)

| Command        | Description            |
| -------------- | ---------------------- |
| `usage_cost`   | Get total session cost |
| `usage_status` | Get usage status       |

### Agent Wizard (`agent_wizard.rs`)

| Command                      | Description                                        |
| ---------------------------- | -------------------------------------------------- |
| `skill_recommendations`      | Get AI-powered skill suggestions for an agent role |
| `create_agent_with_config`   | Create agent with full config (skills, permissions, security level, context budget) |
| `save_agent_template`        | Save reusable agent configuration template         |
| `list_agent_templates`       | List all saved agent templates                     |
| `delete_agent_template`      | Delete an agent template by ID                     |

**`create_agent_with_config` Request:**
```typescript
{
  name: string;
  role: string;
  agent_type: string;        // "worker" | "manager"
  folder_path: string;
  model_profile: string;
  soul_md: string;
  identity_md: string;
  skill_ids: string[];       // Selected skill catalog IDs
  bundle_ids: string[];      // Selected skill bundle IDs
  tool_permissions: string;  // JSON-encoded permission map
  security_level: string;    // "sandbox" | "restricted" | "standard" | "unrestricted"
  context_budget: number;    // Token budget (e.g. 128000)
}
```

**`create_agent_with_config` Response:**
```typescript
{
  agent_id: string;
  skills_installed: number;
  skills_failed: string[];
  success: boolean;
}
```

### Gateway Client (`gateway_client.rs`)

| Command                | Description                               |
| ---------------------- | ----------------------------------------- |
| `gateway_connect`      | Connect to OpenClaw Gateway via WebSocket |
| `gateway_disconnect`   | Disconnect from Gateway                   |
| `gateway_is_connected` | Check Gateway connection status           |

**Reconnection Behavior:**
- Auto-reconnects on "channel closed", "Not connected", or "WebSocket connection closed" errors
- Fresh token read from `OPENCLAW_GATEWAY_TOKEN` env var or `~/.openclaw/openclaw.json`
- Retry with exponential backoff: [0ms, 500ms, 1000ms, 2000ms]

---

## Events (Tauri → Frontend)

| Event                         | Payload                                 | Description                   |
| ----------------------------- | --------------------------------------- | ----------------------------- |
| `project-phase-changed`       | `{ projectId, phase, nextPhase }`       | Phase transition              |
| `project-execution-log`       | `{ projectId, log: ExecutionLogEntry }` | Real-time log entry           |
| `project-plan-ready`          | `{ projectId, phase }`                  | Plan persisted, refresh board |
| `project-final-report`        | `{ projectId, report, workspacePath }`  | Final report generated        |
| `project-feedback-requested`  | `{ projectId, phase, summary }`         | Human feedback needed         |
| `project-execution-completed` | `{ projectId }`                         | Execution finished            |
