/**
 * TeamLanes — Kanban-style team progress visualization.
 *
 * Each team gets a vertical lane with task cards showing
 * milestones tracked from orchestration events. Cards show
 * assignment → in-progress → review → done states.
 */

import { useState, useMemo } from "react";

// ── Types ──────────────────────────────────────────────────────────────

export type TaskStatus = "queued" | "in-progress" | "review" | "done" | "error";

export interface TaskCard {
  id: string;
  title: string;
  assignee: string;
  agentId: string;
  status: TaskStatus;
  description?: string;
  startedAt?: number;
  completedAt?: number;
  filesCreated?: string[];
}

export interface TeamLane {
  id: string;
  name: string;
  tasks: TaskCard[];
}

interface TeamLanesProps {
  lanes: TeamLane[];
  onTaskClick?: (task: TaskCard, laneId: string) => void;
  onTaskDragEnd?: (taskId: string, fromLane: string, toLane: string) => void;
}

// ── Status Config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  TaskStatus,
  { icon: string; color: string; bg: string; label: string }
> = {
  queued: { icon: "📋", color: "#94a3b8", bg: "rgba(148,163,184,0.08)", label: "Queued" },
  "in-progress": {
    icon: "⚡",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    label: "In Progress",
  },
  review: { icon: "👀", color: "#a855f7", bg: "rgba(168,85,247,0.12)", label: "Review" },
  done: { icon: "✅", color: "#22c55e", bg: "rgba(34,197,94,0.12)", label: "Done" },
  error: { icon: "🔴", color: "#ef4444", bg: "rgba(239,68,68,0.12)", label: "Error" },
};

// ── Styles ──────────────────────────────────────────────────────────────

const styles = {
  container: {
    background: "rgba(15, 23, 42, 0.6)",
    backdropFilter: "blur(12px)",
    borderRadius: "16px",
    border: "1px solid rgba(148, 163, 184, 0.1)",
    padding: "20px",
    color: "#e2e8f0",
  } as React.CSSProperties,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  } as React.CSSProperties,
  title: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#f1f5f9",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  } as React.CSSProperties,
  lanesContainer: {
    display: "flex",
    gap: "16px",
    overflowX: "auto" as const,
    paddingBottom: "8px",
  } as React.CSSProperties,
  lane: {
    minWidth: "260px",
    maxWidth: "320px",
    flex: "1 0 260px",
    background: "rgba(30, 41, 59, 0.5)",
    borderRadius: "12px",
    padding: "12px",
    border: "1px solid rgba(148,163,184,0.08)",
  } as React.CSSProperties,
  laneHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
    paddingBottom: "8px",
    borderBottom: "1px solid rgba(148,163,184,0.1)",
  } as React.CSSProperties,
  laneName: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#e2e8f0",
  } as React.CSSProperties,
  laneCount: {
    fontSize: "11px",
    color: "#64748b",
    background: "rgba(148,163,184,0.1)",
    padding: "2px 8px",
    borderRadius: "8px",
  } as React.CSSProperties,
  progressMini: {
    width: "100%",
    height: "3px",
    borderRadius: "2px",
    background: "rgba(148,163,184,0.1)",
    marginBottom: "10px",
    overflow: "hidden",
  } as React.CSSProperties,
  progressFill: (pct: number) =>
    ({
      width: `${pct}%`,
      height: "100%",
      borderRadius: "2px",
      background: pct === 100 ? "#22c55e" : "linear-gradient(90deg, #3b82f6, #8b5cf6)",
      transition: "width 0.5s ease",
    }) as React.CSSProperties,
  card: (status: TaskStatus) => {
    const cfg = STATUS_CONFIG[status];
    return {
      background: cfg.bg,
      border: `1px solid ${cfg.color}25`,
      borderRadius: "10px",
      padding: "10px 12px",
      marginBottom: "8px",
      cursor: "pointer",
      transition: "all 0.2s ease",
    } as React.CSSProperties;
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "8px",
  } as React.CSSProperties,
  cardTitle: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#e2e8f0",
    lineHeight: 1.3,
    flex: 1,
  } as React.CSSProperties,
  cardStatus: (color: string) =>
    ({
      fontSize: "10px",
      fontWeight: 700,
      color,
      whiteSpace: "nowrap" as const,
      flexShrink: 0,
    }) as React.CSSProperties,
  cardAssignee: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    color: "#94a3b8",
    marginTop: "6px",
  } as React.CSSProperties,
  cardDesc: {
    fontSize: "11px",
    color: "#64748b",
    marginTop: "4px",
    lineHeight: 1.3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
  } as React.CSSProperties,
  cardFiles: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "3px",
    marginTop: "6px",
  } as React.CSSProperties,
  fileBadge: {
    fontSize: "9px",
    padding: "1px 5px",
    borderRadius: "4px",
    background: "rgba(59,130,246,0.15)",
    color: "#93c5fd",
    fontFamily: "monospace",
  } as React.CSSProperties,
  cardTime: {
    fontSize: "10px",
    color: "#475569",
    marginTop: "4px",
  } as React.CSSProperties,
  emptyLane: {
    textAlign: "center" as const,
    color: "#475569",
    fontSize: "12px",
    padding: "20px 0",
    fontStyle: "italic",
  } as React.CSSProperties,
  statusFilter: {
    display: "flex",
    gap: "4px",
    marginBottom: "12px",
    flexWrap: "wrap" as const,
  } as React.CSSProperties,
  filterBtn: (active: boolean, color: string) =>
    ({
      padding: "2px 8px",
      borderRadius: "6px",
      border: `1px solid ${active ? color : "rgba(148,163,184,0.15)"}`,
      background: active ? `${color}15` : "transparent",
      color: active ? color : "#64748b",
      fontSize: "10px",
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.15s ease",
    }) as React.CSSProperties,
};

// ── Helpers ─────────────────────────────────────────────────────────────

function formatDuration(startMs: number, endMs?: number): string {
  const ms = (endMs || Date.now()) - startMs;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

// ── Component ──────────────────────────────────────────────────────────

export function TeamLanes({ lanes, onTaskClick }: TeamLanesProps) {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");

  const filteredLanes = useMemo(() => {
    if (statusFilter === "all") return lanes;
    return lanes.map((lane) => ({
      ...lane,
      tasks: lane.tasks.filter((t) => t.status === statusFilter),
    }));
  }, [lanes, statusFilter]);

  const totalTasks = lanes.reduce((sum, l) => sum + l.tasks.length, 0);
  const doneTasks = lanes.reduce(
    (sum, l) => sum + l.tasks.filter((t) => t.status === "done").length,
    0,
  );

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>
          <span>📊</span> Team Lanes
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 400 }}>
            {doneTasks}/{totalTasks} tasks done
          </span>
        </div>
      </div>

      {/* Status Filter */}
      <div style={styles.statusFilter}>
        {(["all", "queued", "in-progress", "review", "done", "error"] as const).map((s) => {
          const color = s === "all" ? "#8b5cf6" : STATUS_CONFIG[s].color;
          const label = s === "all" ? "All" : STATUS_CONFIG[s].label;
          return (
            <button
              key={s}
              style={styles.filterBtn(statusFilter === s, color)}
              onClick={() => setStatusFilter(s)}
            >
              {s !== "all" && STATUS_CONFIG[s].icon + " "}
              {label}
            </button>
          );
        })}
      </div>

      {/* Lanes */}
      <div style={styles.lanesContainer}>
        {filteredLanes.map((lane) => {
          const doneCount = lane.tasks.filter((t) => t.status === "done").length;
          const progress =
            lane.tasks.length > 0 ? Math.round((doneCount / lane.tasks.length) * 100) : 0;

          return (
            <div key={lane.id} style={styles.lane}>
              {/* Lane Header */}
              <div style={styles.laneHeader}>
                <span style={styles.laneName}>{lane.name}</span>
                <span style={styles.laneCount}>{lane.tasks.length}</span>
              </div>

              {/* Mini Progress */}
              <div style={styles.progressMini}>
                <div style={styles.progressFill(progress)} />
              </div>

              {/* Task Cards */}
              {lane.tasks.length === 0 ? (
                <div style={styles.emptyLane}>No tasks</div>
              ) : (
                lane.tasks.map((task) => {
                  const cfg = STATUS_CONFIG[task.status];
                  return (
                    <div
                      key={task.id}
                      style={styles.card(task.status)}
                      onClick={() => onTaskClick?.(task, lane.id)}
                      className="kanban-card"
                    >
                      <div style={styles.cardHeader}>
                        <div style={styles.cardTitle}>{task.title}</div>
                        <div style={styles.cardStatus(cfg.color)}>
                          {cfg.icon} {cfg.label}
                        </div>
                      </div>

                      <div style={styles.cardAssignee}>
                        <span>👤</span> {task.assignee}
                      </div>

                      {task.description && <div style={styles.cardDesc}>{task.description}</div>}

                      {task.filesCreated && task.filesCreated.length > 0 && (
                        <div style={styles.cardFiles}>
                          {task.filesCreated.slice(0, 3).map((f, i) => (
                            <span key={i} style={styles.fileBadge}>
                              {f.split("/").pop()}
                            </span>
                          ))}
                          {task.filesCreated.length > 3 && (
                            <span style={styles.fileBadge}>+{task.filesCreated.length - 3}</span>
                          )}
                        </div>
                      )}

                      {task.startedAt && (
                        <div style={styles.cardTime}>
                          ⏱ {formatDuration(task.startedAt, task.completedAt)}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .kanban-card:hover {
          transform: translateY(-1px);
          filter: brightness(1.1);
        }
      `}</style>
    </div>
  );
}

// ── Hook: Convert orchestration events into TeamLane data ────────────

export function useTeamLanes() {
  const [lanes, setLanes] = useState<Map<string, TeamLane>>(new Map());

  const handleEvent = (
    event: { type: string; agentId?: string; agentName?: string; [key: string]: unknown },
    teamId: string,
    teamName: string,
  ) => {
    setLanes((prev) => {
      const next = new Map(prev);
      const lane = next.get(teamId) || { id: teamId, name: teamName, tasks: [] };

      const agentId = (event.agentId as string) || "";
      const agentName = (event.agentName as string) || agentId;

      // Find or create task for this agent
      let task = lane.tasks.find((t) => t.agentId === agentId);

      switch (event.type) {
        case "delegation_start":
          if (!task) {
            task = {
              id: `task-${agentId}-${Date.now()}`,
              title: (event.task as string) || "Task",
              assignee: agentName,
              agentId,
              status: "queued",
              startedAt: Date.now(),
            };
            lane.tasks.push(task);
          } else {
            task.title = (event.task as string) || task.title;
            task.status = "queued";
          }
          break;

        case "agent_thinking":
          if (task) task.status = "in-progress";
          else {
            task = {
              id: `task-${agentId}-${Date.now()}`,
              title: `${agentName}'s work`,
              assignee: agentName,
              agentId,
              status: "in-progress",
              startedAt: Date.now(),
            };
            lane.tasks.push(task);
          }
          break;

        case "tool_start":
          if (task) {
            task.status = "in-progress";
            const toolName = event.tool as string;
            if (["write_file", "create_file", "edit_file", "bash"].includes(toolName)) {
              if (!task.filesCreated) task.filesCreated = [];
              const input = (event.input as string) || "";
              task.filesCreated.push(input.slice(0, 80));
            }
          }
          break;

        case "review_thinking":
          if (task) task.status = "review";
          break;

        case "agent_response":
        case "delegation_result":
          if (task) {
            task.status = "done";
            task.completedAt = Date.now();
            task.description = ((event.text as string) || "").slice(0, 120);
          }
          break;

        case "agent_error":
          if (task) {
            task.status = "error";
            task.description = (event.error as string) || "Unknown error";
          }
          break;

        case "revision":
          if (task) {
            task.status = "in-progress";
            task.description = `Revision round ${event.round}`;
          }
          break;
      }

      next.set(teamId, lane);
      return next;
    });
  };

  const laneList = Array.from(lanes.values());
  return { lanes: laneList, handleEvent };
}
