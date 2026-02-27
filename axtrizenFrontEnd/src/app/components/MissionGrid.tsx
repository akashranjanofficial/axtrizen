/**
 * MissionGrid — Dense agent status overview for 30+ agents.
 *
 * Shows every agent as a compact badge grouped by team.
 * Click an agent to open the detail panel. At-a-glance
 * status: idle, thinking, building, done, error, needs-review.
 */

import { useState, useMemo } from "react";
import type { EventPriority } from "../services/orchestration-engine";

// ── Types ──────────────────────────────────────────────────────────────

export type AgentStatus = "idle" | "thinking" | "building" | "done" | "error" | "needs-review";

export interface MissionAgent {
  id: string;
  name: string;
  teamId?: string;
  teamName?: string;
  status: AgentStatus;
  currentTask?: string;
  lastUpdate?: number;
  priority?: EventPriority;
}

export interface MissionTeam {
  id: string;
  name: string;
  agents: MissionAgent[];
  progress: number; // 0-100
}

interface MissionGridProps {
  teams: MissionTeam[];
  onAgentClick?: (agent: MissionAgent) => void;
  onTeamClick?: (team: MissionTeam) => void;
  compact?: boolean;
}

// ── Status Config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  AgentStatus,
  { icon: string; color: string; bg: string; pulse: boolean }
> = {
  idle: { icon: "💤", color: "#94a3b8", bg: "rgba(148,163,184,0.1)", pulse: false },
  thinking: { icon: "⚡", color: "#f59e0b", bg: "rgba(245,158,11,0.15)", pulse: true },
  building: { icon: "🔨", color: "#3b82f6", bg: "rgba(59,130,246,0.15)", pulse: true },
  done: { icon: "✅", color: "#22c55e", bg: "rgba(34,197,94,0.15)", pulse: false },
  error: { icon: "🔴", color: "#ef4444", bg: "rgba(239,68,68,0.15)", pulse: true },
  "needs-review": { icon: "👀", color: "#a855f7", bg: "rgba(168,85,247,0.15)", pulse: true },
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
  stats: {
    display: "flex",
    gap: "12px",
    fontSize: "12px",
    color: "#94a3b8",
  } as React.CSSProperties,
  statBadge: (color: string) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "2px 8px",
      borderRadius: "10px",
      background: `${color}20`,
      color,
      fontSize: "11px",
      fontWeight: 600,
    }) as React.CSSProperties,
  teamSection: {
    marginBottom: "16px",
  } as React.CSSProperties,
  teamHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
    cursor: "pointer",
  } as React.CSSProperties,
  teamName: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#cbd5e1",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  } as React.CSSProperties,
  progressBar: {
    width: "80px",
    height: "4px",
    borderRadius: "2px",
    background: "rgba(148,163,184,0.2)",
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
  agentGrid: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "6px",
  } as React.CSSProperties,
  agentBadge: (status: AgentStatus) => {
    const cfg = STATUS_CONFIG[status];
    return {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 10px",
      borderRadius: "8px",
      background: cfg.bg,
      border: `1px solid ${cfg.color}30`,
      cursor: "pointer",
      fontSize: "12px",
      fontWeight: 500,
      color: cfg.color,
      transition: "all 0.2s ease",
      animation: cfg.pulse ? "missionPulse 2s ease-in-out infinite" : "none",
    } as React.CSSProperties;
  },
};

// ── Component ──────────────────────────────────────────────────────────

export function MissionGrid({ teams, onAgentClick, onTeamClick, compact }: MissionGridProps) {
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set(teams.map((t) => t.id)));

  const allAgents = useMemo(() => teams.flatMap((t) => t.agents), [teams]);
  const activeCount = allAgents.filter(
    (a) => a.status === "thinking" || a.status === "building",
  ).length;
  const errorCount = allAgents.filter((a) => a.status === "error").length;
  const doneCount = allAgents.filter((a) => a.status === "done").length;

  const toggleTeam = (teamId: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes missionPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .mission-badge:hover {
          transform: scale(1.05);
          filter: brightness(1.2);
        }
      `}</style>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>
          <span>📡</span> Agent Status
        </div>
        <div style={styles.stats}>
          <span style={styles.statBadge("#3b82f6")}>⚡ {activeCount} active</span>
          {errorCount > 0 && (
            <span style={styles.statBadge("#ef4444")}>🔴 {errorCount} errors</span>
          )}
          <span style={styles.statBadge("#22c55e")}>✅ {doneCount} done</span>
          <span style={{ color: "#64748b", fontSize: "11px" }}>{allAgents.length} total</span>
        </div>
      </div>

      {/* Team Sections */}
      {teams.map((team) => (
        <div key={team.id} style={styles.teamSection}>
          <div
            style={styles.teamHeader}
            onClick={() => (onTeamClick ? onTeamClick(team) : toggleTeam(team.id))}
          >
            <div style={styles.teamName}>
              <span>{expandedTeams.has(team.id) ? "▾" : "▸"}</span>
              {team.name}
              <span style={{ color: "#64748b", fontWeight: 400 }}>({team.agents.length})</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11px", color: "#64748b" }}>{team.progress}%</span>
              <div style={styles.progressBar}>
                <div style={styles.progressFill(team.progress)} />
              </div>
            </div>
          </div>

          {expandedTeams.has(team.id) && (
            <div style={styles.agentGrid}>
              {team.agents.map((agent) => (
                <div
                  key={agent.id}
                  className="mission-badge"
                  style={styles.agentBadge(agent.status)}
                  onClick={() => onAgentClick?.(agent)}
                  title={agent.currentTask || agent.status}
                >
                  {STATUS_CONFIG[agent.status].icon} {compact ? "" : agent.name}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {teams.length === 0 && (
        <div style={{ textAlign: "center", color: "#64748b", padding: "20px", fontSize: "13px" }}>
          No active teams. Create a team and start a mission to see agent status here.
        </div>
      )}
    </div>
  );
}

// ── Hook: Convert orchestration events to MissionAgent state ─────────

export function useMissionAgents() {
  const [agents, setAgents] = useState<Map<string, MissionAgent>>(new Map());

  const handleEvent = (event: {
    type: string;
    agentId?: string;
    agentName?: string;
    [key: string]: unknown;
  }) => {
    if (!event.agentId) return;

    setAgents((prev) => {
      const next = new Map(prev);
      const existing = next.get(event.agentId as string) || {
        id: event.agentId as string,
        name: (event.agentName as string) || (event.agentId as string),
        status: "idle" as AgentStatus,
      };

      switch (event.type) {
        case "agent_thinking":
          existing.status = "thinking";
          break;
        case "tool_start":
          existing.status = "building";
          existing.currentTask = `Using ${event.tool}`;
          break;
        case "agent_response":
        case "delegation_result":
          existing.status = "done";
          break;
        case "agent_error":
          existing.status = "error";
          existing.currentTask = event.error as string;
          break;
        case "review_result":
          if ("approved" in event && !(event as unknown as { approved: boolean }).approved) {
            existing.status = "needs-review";
          }
          break;
      }

      existing.lastUpdate = Date.now();
      next.set(event.agentId as string, existing);
      return next;
    });
  };

  const agentList = Array.from(agents.values());
  return { agents: agentList, handleEvent };
}
