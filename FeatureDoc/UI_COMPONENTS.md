# TeamForge AI - UI Components Specification

> **Status**: Draft | **Design System**: Material Design 3 | **Framework**: Qt 6 QML

---

## Component Inventory

### Core Components (Sprint 1-2)

| Component                  | Priority | Dependencies | Sprint |
| -------------------------- | -------- | ------------ | ------ |
| NavRail                    | MUST     | -            | 1      |
| Button (Primary, Outlined) | MUST     | -            | 1      |
| TextField                  | MUST     | -            | 1      |
| Card                       | MUST     | -            | 1      |
| Dialog                     | MUST     | -            | 2      |
| Snackbar                   | SHOULD   | -            | 2      |

### Agent Components (Sprint 3-4)

| Component        | Priority | Dependencies      | Sprint |
| ---------------- | -------- | ----------------- | ------ |
| AgentCard        | MUST     | Card, StatusBadge | 3      |
| AgentAvatar      | MUST     | -                 | 3      |
| StatusBadge      | MUST     | -                 | 3      |
| AgentList        | MUST     | AgentCard         | 3      |
| RoleSelector     | MUST     | ComboBox          | 3      |
| AgentDetailPanel | MUST     | Card, Tabs        | 4      |
| AIManagerBadge   | MUST     | Badge             | 4      |

### Team Components (Sprint 4-5)

| Component     | Priority | Dependencies          | Sprint |
| ------------- | -------- | --------------------- | ------ |
| TeamCard      | MUST     | Card, AgentAvatar     | 4      |
| HierarchyView | SHOULD   | TreeView, AgentAvatar | 4      |
| TeamCreator   | MUST     | Dialog, RoleSelector  | 4      |
| OrgChart      | SHOULD   | Canvas                | 5      |

### Communication Components (Sprint 6-7)

| Component     | Priority | Dependencies                | Sprint |
| ------------- | -------- | --------------------------- | ------ |
| ChatBubble    | MUST     | Card                        | 6      |
| MessageList   | MUST     | ChatBubble, ListView        | 6      |
| ChatInput     | MUST     | TextField, IconButton       | 6      |
| ThreadView    | SHOULD   | MessageList                 | 6      |
| MentionPicker | SHOULD   | Popup, AgentAvatar          | 7      |
| ChannelBadge  | MUST     | Badge (Slack/Discord icons) | 3      |

### Project Components (Sprint 5-7)

| Component       | Priority | Dependencies      | Sprint |
| --------------- | -------- | ----------------- | ------ |
| ProjectCard     | MUST     | Card, ProgressBar | 5      |
| PhaseIndicator  | MUST     | -                 | 6      |
| TaskBoard       | SHOULD   | Card, DragDrop    | 7      |
| ArtifactBrowser | SHOULD   | TreeView          | 7      |

### Memory Components (Sprint 9-10)

| Component       | Priority | Dependencies | Sprint |
| --------------- | -------- | ------------ | ------ |
| MemoryMeter     | SHOULD   | ProgressBar  | 9      |
| MemoryBreakdown | COULD    | Chart        | 10     |

---

## Component Specifications

### AgentCard

```
┌──────────────────────────────────────────┐
│  [Avatar]  👤 Agent Name                 │
│             Senior Developer             │
│  ┌────────────────────────────────────┐  │
│  │ 🟢 Active • Working on login.js    │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Model: Claude 4 Sonnet    [⋮]           │
└──────────────────────────────────────────┘
```

**Properties:**

| Property      | Type   | Description                  |
| ------------- | ------ | ---------------------------- |
| `agentId`     | string | Unique agent identifier      |
| `name`        | string | Display name                 |
| `role`        | string | Role (Developer, PM, etc.)   |
| `status`      | enum   | active, idle, dormant, error |
| `currentTask` | string | Current activity description |
| `model`       | string | AI model name                |
| `isAIManager` | bool   | Shows special badge if true  |

**QML Skeleton:**

```qml
// components/cards/AgentCard.qml
import QtQuick
import QtQuick.Controls.Material

Pane {
    id: root

    required property string agentId
    required property string name
    required property string role
    required property string status
    property string currentTask: ""
    property string model: "Claude 4 Sonnet"
    property bool isAIManager: false

    Material.elevation: 1
    Material.background: Material.surfaceContainer

    implicitWidth: 280
    implicitHeight: 120

    RowLayout {
        anchors.fill: parent
        spacing: 12

        AgentAvatar {
            id: avatar
            name: root.name
            status: root.status
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4

            RowLayout {
                Label {
                    text: root.name
                    font.pixelSize: 16
                    font.weight: Font.Medium
                }
                AIManagerBadge {
                    visible: root.isAIManager
                }
            }

            Label {
                text: root.role
                color: Material.secondaryTextColor
            }

            StatusIndicator {
                status: root.status
                task: root.currentTask
            }
        }
    }
}
```

---

### StatusBadge

```
🟢 Active    🟡 Idle    ⚪ Dormant    🔴 Error
```

**Properties:**

| Property   | Type | Description                  |
| ---------- | ---- | ---------------------------- |
| `status`   | enum | active, idle, dormant, error |
| `animated` | bool | Pulse animation for active   |

---

### ChatBubble

```
 ┌──────────────────────────────────────┐
 │  👤 Senior Developer         12:34   │
 │  ──────────────────────────────────  │
 │  I've completed the login page.      │
 │  The tests are passing.              │
 │                                      │
 │  📎 login.js • 124 lines             │
 └──────────────────────────────────────┘

                                ┌──────────────────────────────────────┐
                                │               12:35  🎯 AI Manager  │
                                │  ──────────────────────────────────  │
                                │  Great work! Assigning QA task...    │
                                └──────────────────────────────────────┘
```

**Properties:**

| Property      | Type     | Description             |
| ------------- | -------- | ----------------------- |
| `senderId`    | string   | Agent ID                |
| `senderName`  | string   | Display name            |
| `senderType`  | enum     | agent, human, system    |
| `content`     | string   | Message text (markdown) |
| `timestamp`   | datetime | When sent               |
| `isOwn`       | bool     | Aligns right if true    |
| `attachments` | list     | File attachments        |

---

### ChannelBadge

```
[🔵 Slack #project-x]    [🟣 Discord #general]
```

**Properties:**

| Property      | Type   | Description                   |
| ------------- | ------ | ----------------------------- |
| `channel`     | enum   | slack, discord, telegram, web |
| `channelName` | string | Channel/room name             |
| `connected`   | bool   | Connection status             |

---

### NavRail

```
┌────┐
│ 🏠 │  ← Selected (highlighted)
├────┤
│ 👥 │  Agents
├────┤
│ 🏢 │  Teams
├────┤
│ 📁 │  Projects
├────┤
│ 💬 │  Messages
├────┤
│ 📊 │  Dashboard
├────┤
│    │  (Spacer)
│    │
├────┤
│ ⚙️ │  Settings
└────┘
```

**Properties:**

| Property       | Type | Description                 |
| -------------- | ---- | --------------------------- |
| `currentIndex` | int  | Selected nav item           |
| `items`        | list | Nav items with icon + label |
| `collapsed`    | bool | Show icons only             |

---

## Theming Integration

### Component Theming

All components automatically respond to theme changes:

```qml
// Automatic theme response
Rectangle {
    color: Material.backgroundColor // Auto-switches dark/light

    Label {
        color: Material.foreground // Auto-switches
    }
}
```

### Custom Theme Overrides

```qml
// Per-component customization
AgentCard {
    Material.accent: status === "active" ? "#4ADE80" : Material.accent
}
```

---

## Responsive Behavior

| Viewport       | Behavior                        |
| -------------- | ------------------------------- |
| **< 800px**    | NavRail collapses to icons only |
| **800-1200px** | Side panel overlays content     |
| **> 1200px**   | Side panel persistent           |

---

## Accessibility Checklist

| Component   | Tab Focus     | Screen Reader      | High Contrast |
| ----------- | ------------- | ------------------ | ------------- |
| AgentCard   | ✅            | ✅ Name + Status   | ✅            |
| ChatBubble  | ✅            | ✅ Full content    | ✅            |
| NavRail     | ✅ Arrow keys | ✅ Labels          | ✅            |
| StatusBadge | ⚪            | ✅ Status text     | ✅ Patterns   |
| Dialog      | ✅ Focus trap | ✅ Title + content | ✅            |

---

> **Next**: Build prototype components in Qt Design Studio
