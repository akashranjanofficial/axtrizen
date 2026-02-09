# TeamForge AI - Agent Memory System Design

> **Version**: 1.0 | **Last Updated**: 2026-02-06

---

## Overview

TeamForge uses a **4-tier memory architecture** to balance performance, persistence, and semantic retrieval while keeping memory footprint under 150MB for 30 agents.

---

## Memory Tiers

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          Agent Memory Architecture                          │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  TIER 1: WORKING MEMORY                                               │ │
│  │  ─────────────────────────────────────────────────────────────────── │ │
│  │  • Storage: RAM only                                                  │ │
│  │  • Capacity: ~200 tokens (~800 bytes)                                 │ │
│  │  • Lifetime: Current task/conversation                                │ │
│  │  • Access: O(1) direct                                                │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                              ▲                                              │
│                              │ Promotes on importance score                 │
│                              │ Clears on task completion                    │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  TIER 2: SHORT-TERM MEMORY                                            │ │
│  │  ─────────────────────────────────────────────────────────────────── │ │
│  │  • Storage: SQLite (agents/{id}/history.db)                           │ │
│  │  • Capacity: 10,000 messages per agent                                │ │
│  │  • Lifetime: Rolling window (FIFO on limit)                           │ │
│  │  • Access: O(log n) indexed queries                                   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                              ▲                                              │
│                              │ Summarizes + embeds                          │
│                              │ Triggered every 1,000 messages               │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  TIER 3: LONG-TERM MEMORY (Vector)                                    │ │
│  │  ─────────────────────────────────────────────────────────────────── │ │
│  │  • Storage: LanceDB (agents/{id}/vectors/)                            │ │
│  │  • Capacity: Unlimited (disk-based)                                   │ │
│  │  • Lifetime: Permanent (until explicit clear)                         │ │
│  │  • Access: O(log n) approximate nearest neighbor                      │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                              ▲                                              │
│                              │ Periodic consolidation                       │
│                              │ Triggered on project completion              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  TIER 4: EPISODIC MEMORY                                              │ │
│  │  ─────────────────────────────────────────────────────────────────── │ │
│  │  • Storage: SQLite (agents/{id}/episodes.db)                          │ │
│  │  • Capacity: 100 episodes per agent                                   │ │
│  │  • Lifetime: Compressed project summaries                             │ │
│  │  • Access: O(1) by project ID                                         │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Per-Agent Storage Layout

```
~/.teamforge/agents/{agent-uuid}/
├── config.json           # Agent configuration
├── AGENTS.md             # Role instructions
├── SOUL.md               # Personality traits
├── TOOLS.md              # Available tools
├── CONTEXT.md            # Current project context
├── history.db            # Short-term memory (SQLite)
├── episodes.db           # Episodic memory (SQLite)
└── vectors/
    ├── embeddings.lance  # LanceDB vector store
    └── index.lance       # Vector index
```

---

## Memory Sizing

| Tier       | Per Agent (Active)   | Per Agent (Dormant)     |
| ---------- | -------------------- | ----------------------- |
| Working    | ~800 bytes           | 0 (serialized to disk)  |
| Short-Term | ~5 MB (index in RAM) | ~100 KB (metadata only) |
| Long-Term  | ~50 KB (hot vectors) | 0 (fully on disk)       |
| Episodic   | ~10 KB               | ~10 KB                  |
| **Total**  | **~5 MB**            | **~0.5 MB**             |

### System-Wide Memory Budget

| Configuration     | Memory      |
| ----------------- | ----------- |
| 5 Active Agents   | 25 MB       |
| 25 Dormant Agents | 12.5 MB     |
| Daemon Overhead   | 10 MB       |
| OpenClaw Gateway  | 150 MB      |
| **Total**         | **~200 MB** |

---

## Dormancy Protocol

### Trigger Conditions

- No message received for **5 minutes**
- No active task assigned
- Memory pressure threshold exceeded (>80% budget)

### Dormancy Sequence

```cpp
void AgentManager::putToDormancy(AgentId id) {
    // 1. Serialize working memory to disk
    workingMemory.serialize(agentPath / "working_snapshot.bin");

    // 2. Release RAM-resident short-term indices
    shortTermMemory.releaseIndices();

    // 3. Unload vector embeddings from RAM
    longTermMemory.unloadHotVectors();

    // 4. Close OpenClaw session (keep in pool)
    gateway.pauseSession(id);

    // 5. Update status
    agent.status = AgentStatus::Dormant;
}
```

### Wake Conditions

- Message received targeting this agent
- Task assigned by AI Manager
- User clicks agent card in UI
- Scheduled wake (if configured)

### Wake Sequence (Target: <500ms)

```cpp
void AgentManager::wakeAgent(AgentId id) {
    // 1. Restore working memory (50ms)
    workingMemory.deserialize(agentPath / "working_snapshot.bin");

    // 2. Reload short-term indices (100ms)
    shortTermMemory.loadIndices();

    // 3. Resume OpenClaw session (200ms)
    gateway.resumeSession(id);

    // 4. Update status
    agent.status = AgentStatus::Idle;
}
```

---

## Memory Retrieval Algorithm

Before each LLM call, relevant memories are retrieved and injected:

```cpp
std::string MemoryManager::retrieveContext(AgentId id, std::string query) {
    std::vector<MemoryChunk> chunks;

    // 1. Always include working memory (full)
    chunks.push_back(workingMemory.getAll(id));

    // 2. Recent short-term (last 5 messages)
    chunks.append(shortTermMemory.getRecent(id, 5));

    // 3. Semantic search in long-term (top 3)
    auto embedding = embed(query);
    chunks.append(longTermMemory.search(id, embedding, 3));

    // 4. Relevant episodic (if project-related)
    if (auto projectId = getActiveProject(id)) {
        chunks.append(episodicMemory.getByProject(id, projectId));
    }

    // 5. Combine respecting token limit
    return combineChunks(chunks, MAX_CONTEXT_TOKENS);
}
```

---

## Embedding Strategy

| Aspect     | Specification                               |
| ---------- | ------------------------------------------- |
| Model      | OpenAI `text-embedding-3-small` (1536 dims) |
| Fallback   | Local `all-MiniLM-L6-v2` (384 dims)         |
| Batch Size | 100 messages                                |
| Trigger    | Every 1,000 new short-term messages         |
| Chunking   | 512 tokens max per chunk                    |

---

## Data Schemas

### Short-Term Memory (SQLite)

```sql
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,           -- 'user' | 'assistant' | 'system'
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    project_id TEXT,
    message_type TEXT,            -- 'task' | 'query' | 'info'
    importance REAL DEFAULT 0.5   -- 0.0 to 1.0
);

CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_messages_project ON messages(project_id);
```

### Episodic Memory (SQLite)

```sql
CREATE TABLE episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    summary TEXT NOT NULL,
    decisions TEXT,               -- JSON array
    blockers TEXT,                -- JSON array
    outcome TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_episodes_project ON episodes(project_id);
```

### Vector Metadata (LanceDB)

```python
# LanceDB schema
schema = pa.schema([
    ("id", pa.string()),
    ("text", pa.string()),
    ("embedding", pa.list_(pa.float32(), 1536)),
    ("timestamp", pa.int64()),
    ("source", pa.string()),      # 'message' | 'summary' | 'decision'
    ("project_id", pa.string())
])
```

---

## Memory Lifecycle

```
┌─────────┐     ┌───────────┐     ┌───────────┐     ┌──────────┐
│ Message │ ──► │  Working  │ ──► │Short-Term │ ──► │Long-Term │
│Received │     │  Memory   │     │  Memory   │     │ (Vector) │
└─────────┘     └───────────┘     └───────────┘     └──────────┘
                     │                  │                  │
                     │                  │                  │
                     ▼                  ▼                  ▼
              ┌──────────┐       ┌───────────┐      ┌──────────┐
              │ Task End │       │ Batch Embd│      │ Project  │
              │ → Clear  │       │ → Vectors │      │ Complete │
              └──────────┘       └───────────┘      │ → Episode│
                                                    └──────────┘
```

---

## Performance Targets

| Operation           | Target | Method               |
| ------------------- | ------ | -------------------- |
| Working memory read | <1ms   | Direct RAM access    |
| Short-term query    | <10ms  | SQLite indexed query |
| Vector search       | <50ms  | LanceDB ANN search   |
| Episode lookup      | <5ms   | SQLite by project_id |
| Dormancy enter      | <100ms | Serialize + unload   |
| Dormancy wake       | <500ms | Deserialize + resume |
