# UI/UX Design Specification

# Axtrizen AI Platform

**Version:** 1.0 | **Date:** 2026-02-26

---

## 1. Design Philosophy

Axtrizen follows a **dark-first, data-dense command center** aesthetic inspired by:

- Mission control dashboards (NASA-style density)
- Jira/Linear project boards (familiar PM patterns)
- IDE interfaces (developer-friendly layouts)

### Design Principles

| Principle            | Implementation                                     |
| -------------------- | -------------------------------------------------- |
| **Dark by Default**  | Corona gradient dark theme; light toggle available |
| **Data Density**     | Compact cards, small fonts, minimal padding        |
| **Real-Time**        | Auto-refreshing metrics, live activity feeds       |
| **Glassmorphism**    | Frosted glass panels with backdrop blur            |
| **Micro-Animations** | Smooth transitions, hover effects, loading states  |

---

## 2. Design System

### 2.1 Color Palette

| Token              | Value                      | Usage                      |
| ------------------ | -------------------------- | -------------------------- |
| `--background`     | `#0f172a`                  | App background (slate-900) |
| `--card`           | `rgba(15, 23, 42, 0.6)`    | Card surfaces              |
| `--border`         | `rgba(148, 163, 184, 0.1)` | Subtle borders             |
| `--text-primary`   | `#e2e8f0`                  | Primary text (slate-200)   |
| `--text-secondary` | `#94a3b8`                  | Muted text (slate-400)     |
| `--text-muted`     | `#64748b`                  | De-emphasized text         |
| `--accent-purple`  | `#8b5cf6`                  | Primary accent             |
| `--accent-blue`    | `#3b82f6`                  | Links, active states       |
| `--accent-green`   | `#22c55e`                  | Success, completion        |
| `--accent-amber`   | `#f59e0b`                  | Warnings                   |
| `--accent-red`     | `#ef4444`                  | Errors, critical           |
| `--accent-pink`    | `#ec4899`                  | Running state              |

### 2.2 Typography

| Element         | Font           | Size | Weight |
| --------------- | -------------- | ---- | ------ |
| H1 (Page title) | Inter          | 24px | 700    |
| H2 (Section)    | Inter          | 18px | 700    |
| H3 (Card title) | Inter          | 14px | 700    |
| Body            | Inter          | 13px | 400    |
| Caption         | Inter          | 11px | 400    |
| Monospace       | JetBrains Mono | 12px | 400    |
| Badge           | Inter          | 10px | 600    |

### 2.3 Spacing

| Token | Value | Usage                    |
| ----- | ----- | ------------------------ |
| `xs`  | 4px   | Inline gaps              |
| `sm`  | 8px   | Card padding, tight gaps |
| `md`  | 12px  | Standard gaps            |
| `lg`  | 16px  | Section padding          |
| `xl`  | 24px  | Major sections           |

### 2.4 Border Radius

| Element | Radius       |
| ------- | ------------ |
| Cards   | 16px         |
| Buttons | 8px          |
| Badges  | 6px          |
| Inputs  | 8px          |
| Avatars | 50% (circle) |

---

## 3. Layout Structure

### 3.1 Application Shell

```
┌──────────────────────────────────────────┐
│              Title Bar (native)          │
├────────┬─────────────────────────────────┤
│        │                                 │
│  Side  │       Content Area              │
│  bar   │                                 │
│  (64px │   ┌───────────────────────┐    │
│  or    │   │   View Component      │    │
│  220px)│   │   (varies by route)   │    │
│        │   └───────────────────────┘    │
│        │                                 │
├────────┴─────────────────────────────────┤
│              Status Bar (optional)       │
└──────────────────────────────────────────┘
```

### 3.2 Sidebar Navigation

| Icon | Label           | Route       |
| ---- | --------------- | ----------- |
| 🏠   | Dashboard       | `dashboard` |
| 🎯   | Mission Control | `mission`   |
| 🤖   | Agents          | `agents`    |
| 👥   | Teams           | `teams`     |
| 📁   | Projects        | `projects`  |
| 💬   | Chat            | `chat`      |
| ⚙️   | Settings        | `settings`  |

**States:**

- **Collapsed:** 64px wide, icons only
- **Expanded:** 220px wide, icons + labels
- **Active item:** Purple highlight bar + text color

---

## 4. View Specifications

### 4.1 Dashboard View

**Layout:** 2-column grid

| Row | Left Column                           | Right Column       |
| --- | ------------------------------------- | ------------------ |
| 1   | Active Agents (count card)            | Session Cost ($)   |
| 2   | System Memory (gauge)                 | Agent Load (gauge) |
| 3   | Gateway Status/Version                | Gateway Uptime     |
| 4-N | Activity Feed (full-width scrollable) | Agent Status List  |

### 4.2 Projects View

**Layout:** Master-detail split with **tab navigation** in the detail pane.

```
┌──────────────────┬───────────────────────────────────┐
│  Project List    │   Project Detail                   │
│  (300px sidebar) │                                    │
│                  │   SDLC Phase Indicator              │
│  [+ Create]      │                                    │
│                  │   ┌────────┬────────┐              │
│  • Project A     │   │ Board  │ Files  │  ← Tabs      │
│  • Project B  ◄──│   └────────┴────────┘              │
│  • Project C     │                                    │
│                  │   (active tab content below)        │
└──────────────────┴───────────────────────────────────┘
```

**Board Tab** (`activeTab: "board"`):

- Full Kanban Board (see §4.3)
- Execution activity feed
- Final Report card (green, when available)

**Files Tab** (`activeTab: "files"`):

- **FileTree** (left): Recursive tree of workspace files via `list_directory`.
  Expand/collapse folders, file-type icons (📘 TS, 🐍 PY, 🦀 RS, etc.),
  depth-based indentation.
- **CodeViewer** (right): Selected file content rendered with syntax
  highlighting via `read_file_content`. Displays language, path, and size.

```
┌─────── Files Tab ────────────────────────────────┐
│                                                   │
│  ▸ src/                                           │
│    ▸ components/          │  // App.tsx            │
│      ▾ ui/                │  import React from ... │
│        button.tsx         │  function App() {      │
│        card.tsx           │    return <div>...     │
│    App.tsx ◄──────────────│  }                     │
│    main.tsx               │  export default App;   │
│  ▸ styles/                │                        │
│  package.json             │                        │
│                           │                        │
└───── FileTree ────────────┴───── CodeViewer ──────┘
```

Both components live in `FileBrowser.tsx` (436 lines) and use `workspace-manager.ts`
for all Tauri IPC calls.

### 4.3 Project Board

**Kanban View:**

```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ Backlog  │  Todo    │In Progress│ Review  │  Done    │
│ 📋       │ 📝      │ 🔨       │ 👁️      │ ✅      │
├──────────┼──────────┼──────────┼──────────┼──────────┤
│ [Card]   │ [Card]   │ [Card]   │ [Card]   │ [Card]   │
│ [Card]   │          │ [Card]   │          │ [Card]   │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

**List View:**

```
▸ Critical  Cinematic Visual Identity  ■ Backlog ████████░░ 40%
  ▸ Story: Define Glitch-Glass UI Tokens
    • Task: Create CSS token file          📋 Backlog
    • Task: Build typography system        ✅ Done
```

### 4.4 Chat View

```
┌──────────────────┬───────────────────────────────────┐
│  Agent List      │   Chat Area                        │
│  (sidebar)       │                                    │
│                  │   ┌─────────────────────────────┐  │
│  [Search]        │   │ Message bubble (assistant)  │  │
│                  │   │ with markdown rendering     │  │
│  🤖 Agent A ●    │   └─────────────────────────────┘  │
│  🤖 Agent B ●    │                                    │
│  👥 Team Chat    │   ┌─────────────────────────────┐  │
│                  │   │ User message (right-aligned) │  │
│                  │   └─────────────────────────────┘  │
│                  │                                    │
│                  │   ┌──────────────────┐ [Send ▶]   │
│                  │   │ Type a message   │             │
│                  │   └──────────────────┘             │
└──────────────────┴───────────────────────────────────┘
```

---

## 5. Component Library

### UI Primitives (48 components from Radix UI)

| Category       | Components                                                                        |
| -------------- | --------------------------------------------------------------------------------- |
| **Inputs**     | Button, Input, Textarea, Select, Checkbox, Switch, Slider, RadioGroup, OTP        |
| **Overlays**   | Dialog, AlertDialog, Popover, Tooltip, HoverCard, DropdownMenu, ContextMenu       |
| **Layout**     | Card, Separator, AspectRatio, ScrollArea, ResizablePanels, Accordion, Collapsible |
| **Navigation** | Sidebar, Tabs, NavigationMenu, Menubar                                            |
| **Feedback**   | Progress, Sonner (toast), Badge, Avatar                                           |
| **Data**       | Table, Calendar, Carousel                                                         |

---

## 6. Responsive Behavior

| Breakpoint  | Layout Changes                   |
| ----------- | -------------------------------- |
| > 1200px    | Full layout, sidebar expanded    |
| 1024-1200px | Sidebar collapsed (icons only)   |
| 768-1024px  | Single column, stacked views     |
| < 768px     | Not primary target (desktop app) |

---

## 7. Accessibility

| Feature              | Status                                    |
| -------------------- | ----------------------------------------- |
| Keyboard navigation  | Partial (Radix primitives are accessible) |
| Screen reader labels | Via Radix's aria-\* attributes            |
| Focus management     | Radix handles focus trapping in dialogs   |
| Color contrast       | Dark theme meets WCAG AA for primary text |
| Reduced motion       | Respects `prefers-reduced-motion`         |
