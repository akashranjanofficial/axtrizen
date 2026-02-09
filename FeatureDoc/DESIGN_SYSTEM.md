# TeamForge AI - Design System Specification

> **Version**: 1.0 | **Style**: Material Design 3 | **Last Updated**: 2026-02-06

---

## Overview

TeamForge AI uses **Material Design 3** (Material You) via Qt Quick Controls 2 with a **dark theme default** and user-selectable light theme.

---

## Technology Stack

| Layer          | Technology                     | Purpose                        |
| -------------- | ------------------------------ | ------------------------------ |
| **Framework**  | Qt 6.7+ Quick Controls 2       | Native cross-platform UI       |
| **Style**      | Material Style (Dense variant) | Professional desktop aesthetic |
| **Theming**    | QML Theme Engine               | Dynamic dark/light switching   |
| **Icons**      | Material Symbols               | Consistent iconography         |
| **Typography** | Roboto / Inter                 | Modern readable fonts          |

---

## Color System

### Dark Theme (Default)

| Token                         | Value     | Usage              |
| ----------------------------- | --------- | ------------------ |
| `--md-surface`                | `#1C1B1F` | App background     |
| `--md-surface-container`      | `#211F26` | Cards, panels      |
| `--md-surface-container-high` | `#2B2930` | Elevated elements  |
| `--md-primary`                | `#D0BCFF` | Primary actions    |
| `--md-on-primary`             | `#381E72` | Text on primary    |
| `--md-secondary`              | `#CCC2DC` | Secondary elements |
| `--md-tertiary`               | `#EFB8C8` | Accent/highlights  |
| `--md-error`                  | `#F2B8B5` | Error states       |
| `--md-on-surface`             | `#E6E1E5` | Primary text       |
| `--md-on-surface-variant`     | `#CAC4D0` | Secondary text     |

### Light Theme

| Token                    | Value     | Usage           |
| ------------------------ | --------- | --------------- |
| `--md-surface`           | `#FFFBFE` | App background  |
| `--md-surface-container` | `#F3EDF7` | Cards, panels   |
| `--md-primary`           | `#6750A4` | Primary actions |
| `--md-on-primary`        | `#FFFFFF` | Text on primary |
| `--md-on-surface`        | `#1C1B1F` | Primary text    |

### Agent Status Colors

| Status         | Dark      | Light     | Meaning        |
| -------------- | --------- | --------- | -------------- |
| **Active**     | `#4ADE80` | `#16A34A` | Agent working  |
| **Idle**       | `#FACC15` | `#CA8A04` | Agent ready    |
| **Dormant**    | `#94A3B8` | `#64748B` | Agent sleeping |
| **Error**      | `#F87171` | `#DC2626` | Agent failed   |
| **AI Manager** | `#A78BFA` | `#7C3AED` | Special badge  |

---

## Typography

| Role               | Font   | Size | Weight | Line Height |
| ------------------ | ------ | ---- | ------ | ----------- |
| **Display Large**  | Roboto | 57sp | 400    | 64sp        |
| **Headline Large** | Roboto | 32sp | 400    | 40sp        |
| **Title Large**    | Roboto | 22sp | 400    | 28sp        |
| **Title Medium**   | Roboto | 16sp | 500    | 24sp        |
| **Body Large**     | Roboto | 16sp | 400    | 24sp        |
| **Body Medium**    | Roboto | 14sp | 400    | 20sp        |
| **Label Large**    | Roboto | 14sp | 500    | 20sp        |
| **Label Small**    | Roboto | 11sp | 500    | 16sp        |

> **Note**: Use "Dense" variant for desktop (smaller touch targets)

---

## Component Specifications

### Buttons

```qml
// Primary Button
Button {
    Material.background: Material.primary
    Material.foreground: Material.onPrimary
    Material.elevation: 0
    radius: 20
    padding: 24
}

// Outlined Button
Button {
    flat: true
    Material.foreground: Material.primary
    border.color: Material.outline
    border.width: 1
}
```

### Cards

```qml
// Agent Card
Pane {
    Material.elevation: 1
    Material.background: Material.surfaceContainer
    radius: 12
    padding: 16
}

// Project Card (Elevated)
Pane {
    Material.elevation: 2
    Material.background: Material.surfaceContainerHigh
    radius: 16
    padding: 20
}
```

### Navigation

```qml
// Side Navigation Rail
ColumnLayout {
    width: 80  // Rail width
    spacing: 12

    // Nav Item
    IconButton {
        icon.source: "navigation/agents.svg"
        Material.accent: Material.primary
    }
}
```

---

## Layout Grid

| Breakpoint             | Columns | Margin | Gutter |
| ---------------------- | ------- | ------ | ------ |
| **Compact** (< 600dp)  | 4       | 16dp   | 8dp    |
| **Medium** (600-840dp) | 8       | 24dp   | 16dp   |
| **Expanded** (> 840dp) | 12      | 32dp   | 24dp   |

### Main App Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Title Bar (32dp)                                    [─] [□] [×] │
├──────┬─────────────────────────────────────────────────────────┤
│ Nav  │                                                          │
│ Rail │                     Content Area                         │
│      │                                                          │
│ 80dp │  ┌─────────────────┐  ┌─────────────────────────────────┐│
│      │  │  Agents Panel   │  │       Main Content              ││
│ [🏠] │  │    (280dp)      │  │                                 ││
│ [👥] │  │                 │  │                                 ││
│ [📁] │  │  Agent List     │  │   Project View / Chat           ││
│ [💬] │  │                 │  │                                 ││
│ [⚙️] │  │                 │  │                                 ││
│      │  └─────────────────┘  └─────────────────────────────────┘│
├──────┴─────────────────────────────────────────────────────────┤
│ Status Bar (24dp)                              Memory: 142MB   │
└────────────────────────────────────────────────────────────────┘
```

---

## Motion & Animation

| Transition       | Duration | Easing      |
| ---------------- | -------- | ----------- |
| **Page fade**    | 300ms    | ease-out    |
| **Panel slide**  | 250ms    | ease-in-out |
| **Button press** | 100ms    | linear      |
| **Card hover**   | 200ms    | ease-out    |
| **Agent status** | 400ms    | ease-in-out |

### QML Animation Example

```qml
// Agent status pulse animation
SequentialAnimation on opacity {
    running: agent.status === "active"
    loops: Animation.Infinite
    NumberAnimation { to: 0.6; duration: 800; easing.type: Easing.InOutSine }
    NumberAnimation { to: 1.0; duration: 800; easing.type: Easing.InOutSine }
}
```

---

## Icon System

### Size Scale

| Context    | Size | Usage                     |
| ---------- | ---- | ------------------------- |
| **Tiny**   | 16dp | Status indicators, badges |
| **Small**  | 20dp | Inline with text          |
| **Medium** | 24dp | Buttons, list items       |
| **Large**  | 40dp | Navigation rail           |
| **XL**     | 48dp | Empty states              |

### Key Icons (Material Symbols)

| Feature    | Icon | Name               |
| ---------- | ---- | ------------------ |
| Agents     | 🤖   | `smart_toy`        |
| Teams      | 👥   | `groups`           |
| Projects   | 📁   | `folder`           |
| Chat       | 💬   | `chat`             |
| Settings   | ⚙️   | `settings`         |
| AI Manager | 🎯   | `hub`              |
| Active     | 🟢   | `circle` (filled)  |
| Error      | 🔴   | `error`            |
| Slack      |      | `slack` (custom)   |
| Discord    |      | `discord` (custom) |

---

## Accessibility

| Requirement             | Implementation                   |
| ----------------------- | -------------------------------- |
| **Contrast ratio**      | ≥ 4.5:1 (text), ≥ 3:1 (UI)       |
| **Focus indicators**    | 2dp primary color outline        |
| **Keyboard navigation** | Full Tab/Shift+Tab support       |
| **Screen reader**       | Qt Accessibility API             |
| **Reduced motion**      | Respect `prefers-reduced-motion` |
| **Scalable text**       | Support 200% scaling             |

---

## Theme Implementation

### Qt Material Configuration

```ini
# qtquickcontrols2.conf
[Controls]
Style=Material

[Material]
Theme=Dark
Accent=#D0BCFF
Primary=#D0BCFF
Foreground=#E6E1E5
Background=#1C1B1F

[Material\Dense]
Variant=Dense
```

### Dynamic Theme Switching

```qml
// main.qml
ApplicationWindow {
    id: root

    property bool darkMode: Settings.theme === "dark"

    Material.theme: darkMode ? Material.Dark : Material.Light
    Material.primary: "#D0BCFF"
    Material.accent: "#D0BCFF"
}
```

---

## Component Library

### Required Components

| Category       | Components                             |
| -------------- | -------------------------------------- |
| **Navigation** | NavRail, TabBar, Breadcrumb            |
| **Input**      | TextField, ComboBox, SearchBar, Slider |
| **Actions**    | Button, IconButton, FAB, Chip          |
| **Display**    | Card, Badge, Avatar, StatusIndicator   |
| **Feedback**   | Snackbar, Dialog, ProgressBar, Shimmer |
| **Data**       | ListView, TreeView, Table              |
| **Layout**     | Drawer, Panel, Splitter                |

### Custom Components (TeamForge-specific)

| Component         | Description                             |
| ----------------- | --------------------------------------- |
| **AgentCard**     | Shows agent with status, role, activity |
| **TeamHierarchy** | Org-chart style team view               |
| **ChatBubble**    | Agent/Human message with avatar         |
| **TaskBoard**     | Kanban-style task view                  |
| **MemoryMeter**   | Visual memory usage indicator           |
| **ChannelBadge**  | Slack/Discord channel indicator         |

---

## File Structure

```
src/qml/
├── theme/
│   ├── MaterialTheme.qml      # Theme configuration
│   ├── Colors.qml             # Color tokens
│   ├── Typography.qml         # Font definitions
│   └── Elevation.qml          # Shadow system
├── components/
│   ├── buttons/
│   │   ├── PrimaryButton.qml
│   │   ├── OutlinedButton.qml
│   │   └── IconButton.qml
│   ├── cards/
│   │   ├── AgentCard.qml
│   │   └── ProjectCard.qml
│   ├── navigation/
│   │   └── NavRail.qml
│   └── feedback/
│       ├── Snackbar.qml
│       └── StatusBadge.qml
└── views/
    ├── AgentsView.qml
    ├── TeamsView.qml
    ├── ProjectsView.qml
    └── SettingsView.qml
```

---

> **Next Steps**:
>
> 1. Create Figma mockups using Material Design 3 tokens
> 2. Build QML component library prototype
> 3. User testing with dark/light theme switching
