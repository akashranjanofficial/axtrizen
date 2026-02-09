# TeamForge AI - Inter-Agent Communication Protocol

> **Version**: 1.0 | **Last Updated**: 2026-02-06

---

## Overview

Agents communicate through a **lock-free message bus** that routes messages locally and bridges to OpenClaw's `sessions_*` API for LLM processing.

---

## Message Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Inter-Agent Communication                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Agent A              Message Bus              Agent B                      │
│  ┌───────┐         ┌─────────────────┐        ┌───────┐                     │
│  │       │───────► │                 │───────►│       │                     │
│  │ Dev1  │ send    │  Lock-Free      │ route  │  QA   │                     │
│  │       │         │    Queue        │        │       │                     │
│  └───────┘         │ (moodycamel)    │        └───────┘                     │
│      ▲             └────────┬────────┘             │                         │
│      │                      │                      │                         │
│      │                      ▼                      ▼                         │
│      │             ┌─────────────────┐   ┌─────────────────┐                │
│      │             │    SQLite       │   │   OpenClaw      │                │
│      │             │   (persist)     │   │   Gateway       │                │
│      │             └─────────────────┘   └─────────────────┘                │
│      │                                            │                          │
│      └────────────────────────────────────────────┘                          │
│                        (LLM response)                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Message Types

| Type          | Code          | Usage                | Example                               |
| ------------- | ------------- | -------------------- | ------------------------------------- |
| **TASK**      | `[TASK]`      | Assign work to agent | PM → Dev: "Implement login"           |
| **QUERY**     | `[QUERY]`     | Ask for information  | Dev → Arch: "Which auth method?"      |
| **INFO**      | `[INFO]`      | Share information    | Dev → Team: "Login done"              |
| **REVIEW**    | `[REVIEW]`    | Request code review  | Dev → Senior: "Review PR #12"         |
| **BUG**       | `[BUG]`       | Report defect        | QA → Dev: "Login fails special chars" |
| **BLOCKER**   | `[BLOCKER]`   | Escalate issue       | Dev → AI Mgr: "API key missing"       |
| **APPROVAL**  | `[APPROVAL]`  | Approve/reject       | PM → Dev: "Design approved"           |
| **BROADCAST** | `[BROADCAST]` | Team-wide message    | AI Mgr → All: "Sprint started"        |

---

## Priority Levels

| Priority     | Value | SLA (Response) | Use Case                |
| ------------ | ----- | -------------- | ----------------------- |
| **CRITICAL** | 0     | <1 min         | Blockers, system errors |
| **HIGH**     | 1     | <5 min         | Active task issues      |
| **MEDIUM**   | 2     | <30 min        | Normal workflow         |
| **LOW**      | 3     | <2 hrs         | FYI, non-urgent         |

---

## Message Structure

```cpp
struct AgentMessage {
    // Identity
    uint64_t id;                          // Unique message ID
    std::string correlation_id;           // For threading

    // Routing
    uint32_t from_agent_id;
    uint32_t to_agent_id;                 // 0 = broadcast

    // Content
    MessageType type;
    Priority priority;
    std::string content;

    // Metadata
    std::chrono::system_clock::time_point timestamp;
    std::optional<std::string> project_id;
    std::optional<std::string> task_id;

    // Attachments
    std::vector<Attachment> attachments;
};

struct Attachment {
    std::string filename;
    std::string mime_type;
    std::string path;  // Local file path
    size_t size_bytes;
};
```

---

## Message Bus Implementation

```cpp
class MessageBus {
public:
    // Core operations
    void send(AgentMessage msg);
    std::optional<AgentMessage> receive(AgentId id, std::chrono::milliseconds timeout);
    std::vector<AgentMessage> getHistory(AgentId id, size_t limit);

    // Subscriptions
    void subscribe(AgentId id, MessageType type, Callback callback);
    void unsubscribe(AgentId id, MessageType type);

private:
    // Lock-free queue per agent
    std::unordered_map<AgentId,
        moodycamel::ConcurrentQueue<AgentMessage>> queues;

    // Persistence
    SQLiteConnection db;

    // Routing
    void route(AgentMessage msg) {
        // 1. Persist to SQLite
        db.insert("messages", msg);

        // 2. Route locally
        if (msg.to_agent_id == 0) {
            // Broadcast to all agents in project
            for (auto& [id, queue] : queues) {
                if (isInProject(id, msg.project_id)) {
                    queue.enqueue(msg);
                }
            }
        } else {
            queues[msg.to_agent_id].enqueue(msg);
        }

        // 3. Emit event for UI
        emit messageRouted(msg);
    }
};
```

---

## OpenClaw Integration

### Session Mapping

```cpp
// Each agent maps to one OpenClaw session
struct AgentSession {
    AgentId agent_id;
    std::string session_id;        // OpenClaw session UUID
    std::string session_name;      // "pm", "dev1", "qa"
    ConnectionStatus status;
};
```

### Message Forwarding

```cpp
void OpenClawGateway::forwardMessage(AgentMessage msg) {
    // Format for OpenClaw sessions_send
    json payload = {
        {"tool", "sessions_send"},
        {"arguments", {
            {"session_id", getSessionId(msg.to_agent_id)},
            {"message", formatForLLM(msg)}
        }}
    };

    websocket.send(payload.dump());
}

std::string formatForLLM(AgentMessage msg) {
    // Format: [TYPE] From: AgentName | Content
    return fmt::format("[{}] From: {} | {}",
        toString(msg.type),
        getAgentName(msg.from_agent_id),
        msg.content
    );
}
```

---

## AI Manager Orchestration

The AI Manager receives all messages and orchestrates workflow:

```
                    ┌─────────────┐
                    │  AI Manager │
                    │   (Hub)     │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      ┌─────────┐    ┌─────────┐    ┌─────────┐
      │   PM    │    │   Dev   │    │   QA    │
      └─────────┘    └─────────┘    └─────────┘
```

### AI Manager Message Handling

```cpp
void AIManager::onMessage(AgentMessage msg) {
    switch (msg.type) {
        case MessageType::TASK:
            // Parse and distribute subtasks
            distributeTask(msg);
            break;

        case MessageType::BLOCKER:
            // Try to resolve, else escalate to human
            handleBlocker(msg);
            break;

        case MessageType::INFO:
            // Update task board status
            updateTaskStatus(msg);
            break;

        case MessageType::QUERY:
            // Route to appropriate expert
            routeQuery(msg);
            break;
    }
}
```

---

## Message Flow Examples

### Task Assignment Flow

```
Human ──────────────────────────────────────────────────────────►
       │ "Build user login page"
       ▼
┌─────────────┐
│ AI Manager  │ Parse request
└──────┬──────┘
       │ [TASK] Create login UI
       ▼
┌─────────────┐
│ Frontend    │ Acknowledge
│    Dev      │─────────────────────────────────────────────────►
└──────┬──────┘ [INFO] "Starting login page implementation"
       │
       │ [REVIEW] "Login page ready for review"
       ▼
┌─────────────┐
│  Code       │─────────────────────────────────────────────────►
│  Reviewer   │ [APPROVAL] "Looks good, approved"
└──────┬──────┘
       │
       │ [INFO] "Login page merged"
       ▼
┌─────────────┐
│ AI Manager  │─────────────────────────────────────────────────►
└─────────────┘ Notify Human: "Task completed"
```

### Blocker Escalation Flow

```
┌───────┐
│  Dev  │ Encounters issue
└───┬───┘
    │ [BLOCKER] "Cannot access API key"
    ▼
┌─────────────┐
│ AI Manager  │ Attempt resolution
└──────┬──────┘
       │ Check settings
       │ (Not found)
       │
       │ [BLOCKER] Escalate to human
       ▼
Human ◄─────────────── Desktop notification
       │ "Please configure API key in Settings"
       │
       │ (Human configures key)
       ▼
┌─────────────┐
│ AI Manager  │─────────────────────────────────────────────────►
└──────┬──────┘ [INFO] "API key now available"
       │
       ▼
┌───────┐
│  Dev  │ Resumes work
└───────┘
```

---

## External Channel Routing

### Incoming Slack Message

```
Slack Channel ──► TeamForge Slack Bot ──► Channel Router ──► AI Manager
              │                                                   │
              │ "@ai-manager build dashboard"                     │
              │                                                   ▼
              │                                             Parse & Distribute
              │                                                   │
              │                                                   ▼
              ◄──────────────────────────────────── Response formatted
                  "🎯 Task received! Assigned to @frontend-dev"
```

### Channel Message Format

| Channel     | Format               |
| ----------- | -------------------- |
| **Slack**   | Blocks + attachments |
| **Discord** | Embeds               |
| **Desktop** | Native notification  |

---

## Threading Support

Messages can be threaded using `correlation_id`:

```cpp
// Original message
AgentMessage task = {
    .id = 1001,
    .correlation_id = "thread-001",
    .content = "Implement authentication"
};

// Reply in thread
AgentMessage reply = {
    .id = 1002,
    .correlation_id = "thread-001",  // Same thread
    .content = "Should we use JWT or sessions?"
};

// Query thread
auto thread = messageStore.getThread("thread-001");
// Returns: [task, reply, ...]
```

---

## Rate Limiting

| Channel      | Limit      | Window      |
| ------------ | ---------- | ----------- |
| **Local**    | 1000 msg/s | Per agent   |
| **OpenClaw** | 60 msg/min | Per session |
| **Slack**    | 1 msg/sec  | Per channel |
| **Discord**  | 5 msg/5sec | Per channel |
