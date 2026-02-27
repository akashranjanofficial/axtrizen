/**
 * ProjectBoard — Jira-like Kanban + List views for project management.
 *
 * Shows epics, stories, and tasks in two view modes:
 * 1. Kanban — columns by status (Backlog → Todo → In Progress → Review → Done)
 * 2. List — hierarchical tree (Epic → Story → Tasks)
 *
 * Tasks are updated by agents in real-time during orchestration.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { ProjectBoard as ProjectBoardData, BoardLabels } from "../tauri-api";
import { getProjectBoard } from "../tauri-api";

// ── Types ──────────────────────────────────────────────────────────────

type ViewMode = "kanban" | "list";

const STATUS_COLUMNS = ["backlog", "todo", "in_progress", "review", "done"] as const;

const STATUS_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  backlog: { icon: "📋", color: "#94a3b8", label: "Backlog" },
  todo: { icon: "📝", color: "#60a5fa", label: "Todo" },
  in_progress: { icon: "⚡", color: "#f59e0b", label: "In Progress" },
  review: { icon: "👀", color: "#a855f7", label: "Review" },
  done: { icon: "✅", color: "#22c55e", label: "Done" },
  blocked: { icon: "🚫", color: "#ef4444", label: "Blocked" },
  active: { icon: "⚡", color: "#f59e0b", label: "Active" },
};

const PRIORITY_COLORS: Record<number, string> = {
  0: "#64748b",
  1: "#3b82f6",
  2: "#f59e0b",
  3: "#ef4444",
};
const PRIORITY_LABELS: Record<number, string> = {
  0: "Low",
  1: "Medium",
  2: "High",
  3: "Critical",
};

// ── Styles ──────────────────────────────────────────────────────────────

const s = {
  container: {
    background: "rgba(15, 23, 42, 0.6)",
    backdropFilter: "blur(12px)",
    borderRadius: "16px",
    border: "1px solid rgba(148, 163, 184, 0.1)",
    color: "#e2e8f0",
    overflow: "hidden",
  } as React.CSSProperties,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(148,163,184,0.08)",
  } as React.CSSProperties,
  title: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#f1f5f9",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  } as React.CSSProperties,
  viewToggle: {
    display: "flex",
    gap: "2px",
    background: "rgba(30,41,59,0.5)",
    borderRadius: "8px",
    padding: "2px",
  } as React.CSSProperties,
  viewBtn: (active: boolean) =>
    ({
      padding: "4px 12px",
      borderRadius: "6px",
      border: "none",
      background: active ? "rgba(139,92,246,0.3)" : "transparent",
      color: active ? "#c4b5fd" : "#94a3b8",
      fontSize: "11px",
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.15s",
    }) as React.CSSProperties,
  // ── Kanban ──
  kanban: {
    display: "flex",
    gap: "12px",
    padding: "16px",
    overflowX: "auto" as const,
    minHeight: "400px",
  } as React.CSSProperties,
  column: {
    minWidth: "220px",
    flex: "1 0 220px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
  } as React.CSSProperties,
  colHeader: (color: string) =>
    ({
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "8px 10px",
      borderRadius: "8px",
      background: `${color}10`,
      borderLeft: `3px solid ${color}`,
    }) as React.CSSProperties,
  colTitle: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#e2e8f0",
  } as React.CSSProperties,
  colCount: (color: string) =>
    ({
      fontSize: "10px",
      fontWeight: 700,
      color,
      background: `${color}15`,
      padding: "1px 6px",
      borderRadius: "6px",
    }) as React.CSSProperties,
  card: {
    padding: "10px 12px",
    borderRadius: "8px",
    background: "rgba(30,41,59,0.6)",
    border: "1px solid rgba(148,163,184,0.08)",
    cursor: "pointer",
    transition: "all 0.15s",
  } as React.CSSProperties,
  cardTitle: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#e2e8f0",
    lineHeight: 1.3,
    marginBottom: "4px",
  } as React.CSSProperties,
  cardMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "4px",
    fontSize: "10px",
    color: "#64748b",
  } as React.CSSProperties,
  badge: (color: string) =>
    ({
      fontSize: "9px",
      padding: "1px 5px",
      borderRadius: "4px",
      background: `${color}15`,
      color,
      fontWeight: 600,
    }) as React.CSSProperties,
  agentBadge: {
    fontSize: "9px",
    padding: "1px 5px",
    borderRadius: "4px",
    background: "rgba(59,130,246,0.15)",
    color: "#93c5fd",
    fontWeight: 600,
  } as React.CSSProperties,
  // ── List View ──
  list: {
    padding: "16px",
  } as React.CSSProperties,
  epicRow: {
    marginBottom: "16px",
  } as React.CSSProperties,
  epicHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    borderRadius: "8px",
    background: "rgba(139,92,246,0.08)",
    border: "1px solid rgba(139,92,246,0.15)",
    cursor: "pointer",
    marginBottom: "4px",
  } as React.CSSProperties,
  storyRow: {
    marginLeft: "20px",
    marginBottom: "4px",
  } as React.CSSProperties,
  storyHeader: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 10px",
    borderRadius: "6px",
    background: "rgba(59,130,246,0.06)",
    border: "1px solid rgba(59,130,246,0.1)",
    cursor: "pointer",
    marginBottom: "2px",
  } as React.CSSProperties,
  taskRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginLeft: "40px",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "12px",
    color: "#cbd5e1",
    borderLeft: "2px solid rgba(148,163,184,0.1)",
  } as React.CSSProperties,
  progressBar: (_pct: number, _color: string) => ({
    height: "4px",
    borderRadius: "2px",
    background: "rgba(148,163,184,0.1)",
    flex: 1,
    overflow: "hidden",
    position: "relative" as const,
  }),
  progressFill: (pct: number, color: string) =>
    ({
      width: `${pct}%`,
      height: "100%",
      borderRadius: "2px",
      background: color,
      transition: "width 0.5s ease",
    }) as React.CSSProperties,
  // ── Sprint bar ──
  sprintBar: {
    display: "flex",
    gap: "8px",
    padding: "8px 16px",
    borderBottom: "1px solid rgba(148,163,184,0.06)",
    overflowX: "auto" as const,
  } as React.CSSProperties,
  sprintBtn: (active: boolean) =>
    ({
      padding: "4px 10px",
      borderRadius: "6px",
      border: active ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(148,163,184,0.1)",
      background: active ? "rgba(34,197,94,0.1)" : "transparent",
      color: active ? "#86efac" : "#94a3b8",
      fontSize: "11px",
      fontWeight: 600,
      cursor: "pointer",
      whiteSpace: "nowrap" as const,
    }) as React.CSSProperties,
  empty: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 20px",
    color: "#64748b",
    gap: "10px",
  } as React.CSSProperties,
};

// ── Helpers ────────────────────────────────────────────────────────────

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.backlog;
}

// ── Component ──────────────────────────────────────────────────────────

interface ProjectBoardProps {
  projectId: string;
  refreshTrigger?: number;
  /** Domain-specific labels for the 3-level hierarchy. Defaults to Epics/Stories/Tasks/Sprints. */
  boardLabels?: BoardLabels;
}

const DEFAULT_LABELS: BoardLabels = {
  level1: "Epics",
  level2: "Stories",
  level3: "Tasks",
  iteration: "Sprints",
};

export function ProjectBoard({ projectId, refreshTrigger, boardLabels }: ProjectBoardProps) {
  const labels = boardLabels ?? DEFAULT_LABELS;
  const [board, setBoard] = useState<ProjectBoardData | null>(null);
  const [view, setView] = useState<ViewMode>("kanban");
  const [selectedSprint, setSelectedSprint] = useState<string | null>(null);
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const hasAutoExpanded = useRef(false);

  const loadBoard = useCallback(async () => {
    try {
      const data = await getProjectBoard(projectId);
      setBoard(data);
      // Auto-expand all epics on first load only (use ref to avoid stale closure)
      if (!hasAutoExpanded.current && data.epics.length > 0) {
        hasAutoExpanded.current = true;
        setExpandedEpics(new Set(data.epics.map((e) => e.id)));
      }
    } catch (err) {
      console.warn("[ProjectBoard] Failed to load:", err);
    }
  }, [projectId]);

  useEffect(() => {
    loadBoard();
    const interval = setInterval(loadBoard, 5000);

    // Listen for real-time events from the orchestrator for instant refresh
    let unlistenPlan: (() => void) | undefined;
    let unlistenTask: (() => void) | undefined;

    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");

        unlistenPlan = await listen<{ projectId: string }>("project-plan-ready", (event) => {
          if (event.payload.projectId === projectId) {
            loadBoard();
          }
        });

        unlistenTask = await listen<{ projectId: string }>("project-phase-changed", (event) => {
          if (event.payload.projectId === projectId) {
            loadBoard();
          }
        });
      } catch {
        // Tauri events not available (e.g. running in browser dev mode)
      }
    })();

    return () => {
      clearInterval(interval);
      unlistenPlan?.();
      unlistenTask?.();
    };
  }, [loadBoard, refreshTrigger, projectId]);

  // Filter by sprint
  const filteredTasks = useMemo(() => {
    if (!board) return [];
    if (!selectedSprint) return board.tasks;
    const sprintStoryIds = new Set(
      board.stories.filter((s) => s.sprint_id === selectedSprint).map((s) => s.id),
    );
    return board.tasks.filter((t) => sprintStoryIds.has(t.story_id));
  }, [board, selectedSprint]);

  if (!board) {
    return (
      <div style={s.container}>
        <div style={s.empty}>
          <span style={{ fontSize: "32px", opacity: 0.5 }}>⏳</span>
          <span>Loading board...</span>
        </div>
      </div>
    );
  }

  if (board.epics.length === 0) {
    return (
      <div style={s.container}>
        <div style={s.header}>
          <div style={s.title}>
            <span>📊</span> Project Board
          </div>
        </div>
        <div style={s.empty}>
          <span style={{ fontSize: "48px", opacity: 0.4 }}>📋</span>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#94a3b8" }}>No Plan Yet</div>
          <div
            style={{ fontSize: "13px", textAlign: "center", maxWidth: "350px", lineHeight: 1.5 }}
          >
            Tell the Manager what to work on — it will auto-generate {labels.level1.toLowerCase()}, {labels.level2.toLowerCase()}, and {labels.level3.toLowerCase()} that
            appear here as a live board.
          </div>
        </div>
      </div>
    );
  }

  // Stats
  const totalTasks = filteredTasks.length;
  const doneTasks = filteredTasks.filter((t) => t.status === "done").length;
  const inProgressTasks = filteredTasks.filter((t) => t.status === "in_progress").length;

  const toggleEpic = (id: string) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleStory = (id: string) => {
    setExpandedStories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.title}>
          <span>📊</span> Project Board
          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 400 }}>
            {doneTasks}/{totalTasks} {labels.level3.toLowerCase()} · {inProgressTasks} active
          </span>
        </div>
        <div style={s.viewToggle}>
          <button style={s.viewBtn(view === "kanban")} onClick={() => setView("kanban")}>
            Kanban
          </button>
          <button style={s.viewBtn(view === "list")} onClick={() => setView("list")}>
            List
          </button>
        </div>
      </div>

      {/* Sprint Filter */}
      {board.sprints.length > 0 && (
        <div style={s.sprintBar}>
          <button style={s.sprintBtn(!selectedSprint)} onClick={() => setSelectedSprint(null)}>
            All {labels.iteration}
          </button>
          {board.sprints.map((sprint) => (
            <button
              key={sprint.id}
              style={s.sprintBtn(selectedSprint === sprint.id)}
              onClick={() => setSelectedSprint(sprint.id)}
            >
              🏃 {sprint.name}
            </button>
          ))}
        </div>
      )}

      {/* Kanban View */}
      {view === "kanban" && (
        <div style={s.kanban}>
          {STATUS_COLUMNS.map((col) => {
            const cfg = STATUS_CONFIG[col];
            const colTasks = filteredTasks.filter((t) => t.status === col);
            return (
              <div key={col} style={s.column}>
                <div style={s.colHeader(cfg.color)}>
                  <span style={s.colTitle}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <span style={s.colCount(cfg.color)}>{colTasks.length}</span>
                </div>
                {colTasks.map((task) => {
                  const epic = board.epics.find((e) => e.id === task.epic_id);
                  return (
                    <div key={task.id} style={s.card} className="board-card">
                      <div style={s.cardTitle}>{task.title}</div>
                      <div style={s.cardMeta}>
                        {epic && (
                          <span style={s.badge(PRIORITY_COLORS[epic.priority] || "#64748b")}>
                            {epic.title.slice(0, 20)}
                          </span>
                        )}
                        {task.assigned_agent_id && (
                          <span style={s.agentBadge}>🤖 {task.assigned_agent_id.slice(0, 12)}</span>
                        )}
                        {task.estimated_minutes && <span>{task.estimated_minutes}m</span>}
                      </div>
                    </div>
                  );
                })}
                {colTasks.length === 0 && (
                  <div
                    style={{
                      color: "#475569",
                      fontSize: "11px",
                      textAlign: "center",
                      padding: "16px 0",
                      fontStyle: "italic",
                    }}
                  >
                    Empty
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {view === "list" && (
        <div style={s.list}>
          {board.epics.map((epic) => {
            const epicStories = board.stories.filter((st) => st.epic_id === epic.id);
            const epicTasks = filteredTasks.filter((t) => t.epic_id === epic.id);
            const epicDone = epicTasks.filter((t) => t.status === "done").length;
            const epicPct =
              epicTasks.length > 0 ? Math.round((epicDone / epicTasks.length) * 100) : 0;
            const isExpanded = expandedEpics.has(epic.id);
            const eCfg = getStatusConfig(epic.status);

            return (
              <div key={epic.id} style={s.epicRow}>
                <div style={s.epicHeader} onClick={() => toggleEpic(epic.id)}>
                  <span>{isExpanded ? "▾" : "▸"}</span>
                  <span style={s.badge(PRIORITY_COLORS[epic.priority] || "#64748b")}>
                    {PRIORITY_LABELS[epic.priority] || "Low"}
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", flex: 1 }}>
                    {epic.title}
                  </span>
                  <span style={{ fontSize: "10px", color: eCfg.color }}>
                    {eCfg.icon} {eCfg.label}
                  </span>
                  <div style={{ width: "80px", ...s.progressBar(epicPct, "#8b5cf6") }}>
                    <div style={s.progressFill(epicPct, "#8b5cf6")} />
                  </div>
                  <span style={{ fontSize: "10px", color: "#64748b" }}>{epicPct}%</span>
                </div>

                {isExpanded &&
                  epicStories.map((story) => {
                    const storyTasks = filteredTasks.filter((t) => t.story_id === story.id);
                    const storyDone = storyTasks.filter((t) => t.status === "done").length;
                    const storyPct =
                      storyTasks.length > 0 ? Math.round((storyDone / storyTasks.length) * 100) : 0;
                    const isStoryExpanded = expandedStories.has(story.id);
                    const sCfg = getStatusConfig(story.status);

                    return (
                      <div key={story.id} style={s.storyRow}>
                        <div style={s.storyHeader} onClick={() => toggleStory(story.id)}>
                          <span style={{ fontSize: "10px" }}>{isStoryExpanded ? "▾" : "▸"}</span>
                          <span
                            style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f0", flex: 1 }}
                          >
                            {story.title}
                          </span>
                          {story.assigned_agent_id && (
                            <span style={s.agentBadge}>
                              🤖 {story.assigned_agent_id.slice(0, 10)}
                            </span>
                          )}
                          <span style={{ fontSize: "10px", color: sCfg.color }}>{sCfg.icon}</span>
                          <span style={{ fontSize: "9px", color: "#64748b" }}>
                            {story.story_points}pt
                          </span>
                          <div style={{ width: "60px", ...s.progressBar(storyPct, "#3b82f6") }}>
                            <div style={s.progressFill(storyPct, "#3b82f6")} />
                          </div>
                        </div>

                        {isStoryExpanded &&
                          storyTasks.map((task) => {
                            const tCfg = getStatusConfig(task.status);
                            return (
                              <div key={task.id} style={s.taskRow}>
                                <span style={{ fontSize: "10px" }}>{tCfg.icon}</span>
                                <span style={{ flex: 1 }}>{task.title}</span>
                                {task.assigned_agent_id && (
                                  <span style={s.agentBadge}>
                                    🤖 {task.assigned_agent_id.slice(0, 8)}
                                  </span>
                                )}
                                <span style={{ fontSize: "10px", color: tCfg.color }}>
                                  {tCfg.label}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .board-card:hover {
          border-color: rgba(139,92,246,0.3) !important;
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}
