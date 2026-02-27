# Database Schema & Data Model

# Axtrizen AI Platform

**Version:** 2.0 | **Date:** 2026-02-27
**Engine:** SQLite (rusqlite 0.38.0, bundled, **WAL mode**)
**Location:** `~/.axtrizen/axtrizen.db`

---

## Migration History

| Version | Description        | Tables Created                                                   |
| ------- | ------------------ | ---------------------------------------------------------------- |
| 1       | Core schema        | agents, teams, team_members, projects, messages, settings        |
| 2       | Activity + indexes | agent_activity, performance indexes, teams.manager_id            |
| 3       | Execution logs     | execution_logs                                                   |
| 4       | Chat persistence   | conversations, chat_messages                                     |
| 5       | Agent metrics      | agent_usage_snapshots, agent_tool_calls                          |
| 6       | Project board      | epics, stories, tasks, sprints                                   |
| 7       | Workflow templates | workflow_templates, projects.workflow_template_id                |
| 8       | **Scaling (v2.0)** | **agent_groups, agent_group_members, group_messages** + WAL mode |

---

## Entity Relationship Diagram

```
┌──────────┐       ┌───────────┐       ┌──────────┐
│  teams   │──1:N──│team_members│──N:1──│  agents  │
│          │       └───────────┘       │          │
│ manager  │                           │ status   │
│ _id ─────│───────────────────────────│ model    │
└────┬─────┘                           └──────────┘
     │                                      │
     │ 1:N                                  │ 1:N
     ▼                                      ▼
┌──────────┐                          ┌─────────────┐
│ projects │                          │agent_activity│
│          │                          └─────────────┘
│ phase    │                                │
│ status   │                          ┌─────────────────┐
│ workspace│                          │agent_usage_snaps │
└────┬─────┘                          └─────────────────┘
     │                                      │
     │ 1:N                            ┌───────────────┐
     ▼                                │agent_tool_calls│
┌──────────┐                          └───────────────┘
│  epics   │
│ priority │           ┌─────────────┐
│ status   │──1:N─────▶│  stories    │
└──────────┘           │ points      │
                       │ sprint_id   │──N:1──┌─────────┐
                       └──────┬──────┘       │ sprints │
                              │              └─────────┘
                              │ 1:N
                              ▼
                       ┌──────────┐
                       │  tasks   │
                       │ status   │
                       │ agent_id │
                       │ files    │
                       └──────────┘

┌──────────────┐     ┌──────────────┐
│conversations │─1:N─│chat_messages │
└──────────────┘     └──────────────┘

┌────────────────┐
│execution_logs  │
└────────────────┘

┌───────────────────── Phase 3: Agent Groups ────────────────────┐
│                                                            │
│  ┌──────────────┐     ┌────────────────────┐                  │
│  │agent_groups  │─1:N─│agent_group_members │──N:1── agents  │
│  │ team_id (FK) │     └────────────────────┘                  │
│  │ maple_topic  │                                          │
│  └──────┬───────┘                                          │
│        │ 1:N                                              │
│        ▼                                                   │
│  ┌────────────────┐                                         │
│  │group_messages │                                         │
│  └────────────────┘                                         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Table Definitions

### `agents`

| Column        | Type    | Nullable | Default | Description                            |
| ------------- | ------- | -------- | ------- | -------------------------------------- |
| id            | TEXT PK | No       | —       | UUID                                   |
| name          | TEXT    | No       | —       | Display name                           |
| role          | TEXT    | No       | —       | Agent role (developer, designer, etc.) |
| status        | TEXT    | No       | 'idle'  | idle / active / error                  |
| model         | TEXT    | Yes      | —       | AI model (claude-4, gpt-4, etc.)       |
| workspace     | TEXT    | Yes      | —       | Gateway workspace path                 |
| avatar        | TEXT    | Yes      | —       | Emoji or URL                           |
| system_prompt | TEXT    | Yes      | —       | Custom system prompt                   |
| created_at    | TEXT    | No       | now()   | ISO 8601 timestamp                     |
| updated_at    | TEXT    | No       | now()   | ISO 8601 timestamp                     |

### `teams`

| Column      | Type    | Nullable | Default | Description      |
| ----------- | ------- | -------- | ------- | ---------------- |
| id          | TEXT PK | No       | —       | UUID             |
| name        | TEXT    | No       | —       | Team name        |
| description | TEXT    | Yes      | —       | Team description |
| manager_id  | TEXT    | Yes      | —       | FK to Agent ID   |
| created_at  | TEXT    | No       | now()   | ISO 8601         |

### `team_members`

| Column     | Type    | Nullable | Default | Description        |
| ---------- | ------- | -------- | ------- | ------------------ |
| team_id    | TEXT PK | No       | —       | FK → teams.id      |
| agent_id   | TEXT PK | No       | —       | FK → Gateway agent |
| manager_id | TEXT    | Yes      | —       | Manager FK         |
| joined_at  | TEXT    | No       | now()   | ISO 8601           |

### `projects`

| Column         | Type    | Nullable | Default        | Description                |
| -------------- | ------- | -------- | -------------- | -------------------------- |
| id             | TEXT PK | No       | —              | UUID                       |
| name           | TEXT    | No       | —              | Project name               |
| description    | TEXT    | Yes      | —              | Description                |
| team_id        | TEXT FK | Yes      | —              | Assigned team              |
| status         | TEXT    | No       | 'draft'        | draft / active / completed |
| phase          | TEXT    | No       | 'requirements' | SDLC phase                 |
| workspace_path | TEXT    | Yes      | —              | Filesystem path            |
| created_at     | TEXT    | No       | now()          | ISO 8601                   |
| updated_at     | TEXT    | No       | now()          | ISO 8601                   |

### `epics`

| Column      | Type    | Nullable | Default   | Description                      |
| ----------- | ------- | -------- | --------- | -------------------------------- |
| id          | TEXT PK | No       | —         | UUID                             |
| project_id  | TEXT FK | No       | —         | Parent project                   |
| title       | TEXT    | No       | —         | Epic title                       |
| description | TEXT    | Yes      | —         | Description                      |
| status      | TEXT    | No       | 'backlog' | Status enum                      |
| priority    | INTEGER | No       | 0         | 0=Low, 1=Med, 2=High, 3=Critical |
| sort_order  | INTEGER | No       | 0         | Display order                    |
| created_at  | TEXT    | No       | now()     |                                  |
| updated_at  | TEXT    | No       | now()     |                                  |

### `stories`

| Column              | Type    | Nullable | Default   | Description         |
| ------------------- | ------- | -------- | --------- | ------------------- |
| id                  | TEXT PK | No       | —         | UUID                |
| epic_id             | TEXT FK | No       | —         | Parent epic         |
| project_id          | TEXT FK | No       | —         | Parent project      |
| title               | TEXT    | No       | —         | Story title         |
| description         | TEXT    | Yes      | —         | Description         |
| acceptance_criteria | TEXT    | Yes      | —         | Acceptance criteria |
| story_points        | INTEGER | Yes      | 1         | Estimation points   |
| status              | TEXT    | No       | 'backlog' | Status enum         |
| assigned_agent_id   | TEXT FK | Yes      | —         | Assigned agent      |
| sprint_id           | TEXT FK | Yes      | —         | Sprint assignment   |
| sort_order          | INTEGER | No       | 0         | Display order       |
| created_at          | TEXT    | No       | now()     |                     |
| updated_at          | TEXT    | No       | now()     |                     |

### `tasks`

| Column            | Type    | Nullable | Default | Description                          |
| ----------------- | ------- | -------- | ------- | ------------------------------------ |
| id                | TEXT PK | No       | —       | UUID                                 |
| story_id          | TEXT FK | No       | —       | Parent story                         |
| epic_id           | TEXT FK | No       | —       | Parent epic                          |
| project_id        | TEXT FK | No       | —       | Parent project                       |
| title             | TEXT    | No       | —       | Task title                           |
| description       | TEXT    | Yes      | —       | Description                          |
| status            | TEXT    | No       | 'todo'  | backlog/todo/in_progress/review/done |
| assigned_agent_id | TEXT FK | Yes      | —       | Assigned agent                       |
| estimated_minutes | INTEGER | Yes      | —       | Time estimate                        |
| actual_minutes    | INTEGER | Yes      | —       | Actual time spent                    |
| files_created     | TEXT    | Yes      | —       | Comma-separated file list            |
| dependencies      | TEXT    | Yes      | —       | Task dependency IDs                  |
| sort_order        | INTEGER | No       | 0       | Display order                        |
| started_at        | TEXT    | Yes      | —       | Work start timestamp                 |
| completed_at      | TEXT    | Yes      | —       | Completion timestamp                 |
| created_at        | TEXT    | No       | now()   |                                      |
| updated_at        | TEXT    | No       | now()   |                                      |

### `sprints`

| Column     | Type    | Description               |
| ---------- | ------- | ------------------------- |
| id         | TEXT PK | UUID                      |
| project_id | TEXT FK | Parent project            |
| name       | TEXT    | Sprint name               |
| goal       | TEXT    | Sprint goal               |
| status     | TEXT    | planning/active/completed |
| start_date | TEXT    | Start date                |
| end_date   | TEXT    | End date                  |
| created_at | TEXT    | ISO 8601                  |

### `execution_logs`

| Column     | Type    | Description                            |
| ---------- | ------- | -------------------------------------- |
| id         | TEXT PK | UUID                                   |
| project_id | TEXT FK | Project                                |
| phase      | TEXT    | SDLC phase                             |
| agent_id   | TEXT    | Acting agent                           |
| agent_name | TEXT    | Agent display name                     |
| event_type | TEXT    | phase_started/work_submitted/error/... |
| content    | TEXT    | Log content                            |
| created_at | TEXT    | Timestamp                              |

### `conversations`

| Column            | Type        | Description            |
| ----------------- | ----------- | ---------------------- |
| id                | TEXT PK     | UUID                   |
| session_key       | TEXT UNIQUE | Gateway session key    |
| title             | TEXT        | Conversation title     |
| conversation_type | TEXT        | direct / group         |
| agent_id          | TEXT        | Agent (for 1:1 chats)  |
| team_id           | TEXT        | Team (for group chats) |
| last_message_at   | TEXT        | Last activity          |
| message_count     | INTEGER     | Total messages         |
| created_at        | TEXT        | Created timestamp      |

### `chat_messages`

| Column            | Type    | Description                 |
| ----------------- | ------- | --------------------------- |
| id                | TEXT PK | UUID                        |
| conversation_id   | TEXT FK | Parent conversation         |
| role              | TEXT    | user / assistant / system   |
| content           | TEXT    | Message text                |
| sender_agent_id   | TEXT    | Sender agent (if assistant) |
| sender_agent_name | TEXT    | Sender display name         |
| label             | TEXT    | Optional label tag          |
| metadata          | TEXT    | JSON metadata               |
| created_at        | TEXT    | Timestamp                   |

### `settings`

| Column     | Type    | Description   |
| ---------- | ------- | ------------- |
| key        | TEXT PK | Setting name  |
| value      | TEXT    | Setting value |
| updated_at | TEXT    | Last modified |

### `agent_activity`

| Column      | Type       | Description    |
| ----------- | ---------- | -------------- |
| id          | INTEGER PK | Auto-increment |
| agent_id    | TEXT FK    | Agent          |
| action_type | TEXT       | Action type    |
| description | TEXT       | Description    |
| metadata    | TEXT       | JSON metadata  |
| created_at  | TEXT       | Timestamp      |

### `agent_usage_snapshots`

| Column      | Type       | Description        |
| ----------- | ---------- | ------------------ |
| id          | INTEGER PK | Auto-increment     |
| agent_id    | TEXT FK    | Agent              |
| tokens_in   | INTEGER    | Input tokens       |
| tokens_out  | INTEGER    | Output tokens      |
| cost_usd    | REAL       | Cost in USD        |
| model       | TEXT       | Model used         |
| snapshot_at | TEXT       | Snapshot timestamp |

### `agent_tool_calls`

| Column         | Type       | Description     |
| -------------- | ---------- | --------------- |
| id             | INTEGER PK | Auto-increment  |
| agent_id       | TEXT FK    | Agent           |
| tool_name      | TEXT       | Tool name       |
| arguments      | TEXT       | JSON arguments  |
| result_summary | TEXT       | Result summary  |
| duration_ms    | INTEGER    | Duration in ms  |
| status         | TEXT       | success / error |
| created_at     | TEXT       | Timestamp       |

---

## Indexes

| Index                          | Table                 | Columns           | Purpose                   |
| ------------------------------ | --------------------- | ----------------- | ------------------------- |
| `idx_messages_project`         | messages              | project_id        | Query by project          |
| `idx_messages_from`            | messages              | from_agent_id     | Query by sender           |
| `idx_activity_agent`           | agent_activity        | agent_id          | Agent activity lookup     |
| `idx_activity_created`         | agent_activity        | created_at        | Time-range queries        |
| `idx_exec_logs_project`        | execution_logs        | project_id        | Project log lookup        |
| `idx_exec_logs_created`        | execution_logs        | created_at        | Time-range queries        |
| `idx_chat_msg_conv`            | chat_messages         | conversation_id   | Messages per conversation |
| `idx_chat_msg_created`         | chat_messages         | created_at        | Chronological order       |
| `idx_conv_session`             | conversations         | session_key       | Session lookup            |
| `idx_conv_last_msg`            | conversations         | last_message_at   | Recent conversations      |
| `idx_usage_agent`              | agent_usage_snapshots | agent_id          | Usage per agent           |
| `idx_usage_time`               | agent_usage_snapshots | snapshot_at       | Time-range                |
| `idx_tool_agent`               | agent_tool_calls      | agent_id          | Tools per agent           |
| `idx_tool_created`             | agent_tool_calls      | created_at        | Chronological             |
| `idx_epics_project`            | epics                 | project_id        | Epics per project         |
| `idx_stories_epic`             | stories               | epic_id           | Stories per epic          |
| `idx_stories_project`          | stories               | project_id        | Stories per project       |
| `idx_stories_sprint`           | stories               | sprint_id         | Stories per sprint        |
| `idx_tasks_story`              | tasks                 | story_id          | Tasks per story           |
| `idx_tasks_project`            | tasks                 | project_id        | Tasks per project         |
| `idx_tasks_agent`              | tasks                 | assigned_agent_id | Tasks per agent           |
| `idx_sprints_project`          | sprints               | project_id        | Sprints per project       |
| **`idx_agent_groups_team`**    | **agent_groups**      | **team_id**       | **Groups per team**       |
| **`idx_group_messages_group`** | **group_messages**    | **group_id**      | **Messages per group**    |
| **`idx_group_messages_time`**  | **group_messages**    | **created_at**    | **Chronological order**   |

---

## Performance Configuration (Phase 4)

Applied at connection time in `init_db()`:

| Pragma               | Value     | Impact                                                          |
| -------------------- | --------- | --------------------------------------------------------------- |
| `journal_mode`       | **WAL**   | Concurrent reads during writes — critical for 100+ agents       |
| `synchronous`        | NORMAL    | 10× faster writes (acceptable durability trade-off for desktop) |
| `wal_autocheckpoint` | 1000      | Auto-checkpoint every 1000 pages                                |
| `cache_size`         | -20000    | 20MB in-memory page cache                                       |
| `mmap_size`          | 268435456 | 256MB memory-mapped I/O                                         |
| `temp_store`         | MEMORY    | Temp tables stored in RAM                                       |

---

## New Tables (Migration v8)

### `agent_groups`

| Column      | Type    | Nullable | Default | Description                |
| ----------- | ------- | -------- | ------- | -------------------------- |
| id          | TEXT PK | No       | —       | UUID                       |
| team_id     | TEXT FK | No       | —       | FK → teams.id              |
| name        | TEXT    | No       | —       | Group name                 |
| description | TEXT    | Yes      | —       | Description                |
| maple_topic | TEXT    | No       | —       | Auto-generated Maple topic |
| max_members | INTEGER | Yes      | 50      | Max members allowed        |
| created_at  | TEXT    | No       | now()   | ISO 8601                   |

### `agent_group_members`

| Column    | Type    | Nullable | Default | Description          |
| --------- | ------- | -------- | ------- | -------------------- |
| group_id  | TEXT PK | No       | —       | FK → agent_groups.id |
| agent_id  | TEXT PK | No       | —       | FK → agents.id       |
| joined_at | TEXT    | No       | now()   | ISO 8601             |

### `group_messages`

| Column       | Type    | Nullable | Default | Description          |
| ------------ | ------- | -------- | ------- | -------------------- |
| id           | TEXT PK | No       | —       | UUID                 |
| group_id     | TEXT FK | No       | —       | FK → agent_groups.id |
| sender_id    | TEXT    | No       | —       | Agent or human ID    |
| sender_type  | TEXT    | No       | 'agent' | 'agent' or 'human'   |
| content      | TEXT    | No       | —       | Message content      |
| message_type | TEXT    | Yes      | 'chat'  | Message type tag     |
| created_at   | TEXT    | No       | now()   | ISO 8601             |
