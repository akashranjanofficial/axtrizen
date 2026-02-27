/**
 * MissionControlView — Top-level view for monitoring 30+ agents across teams.
 *
 * Combines MissionGrid (agent status overview) with NotificationFeed
 * (priority-filtered event stream). Designed to replace the flat chat
 * when working with large teams.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { MissionGrid, useMissionAgents, type MissionTeam, type MissionAgent } from "./MissionGrid";
import { NotificationFeed, useNotificationFeed } from "./NotificationFeed";
import { TeamLanes, useTeamLanes } from "./TeamLanes";
import { ScopedChat, useScopedChat, type ChatScope } from "./ScopedChat";
import { getTeams, getTeamMembers, mapleBrokerStatus, type MapleBrokerStatus } from "../tauri-api";

// ── Styles ──────────────────────────────────────────────────────────────

const styles = {
  container: {
    height: "100vh",
    padding: "24px",
    overflowY: "auto" as const,
    background: "transparent",
  } as React.CSSProperties,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
  } as React.CSSProperties,
  title: {
    fontSize: "28px",
    fontWeight: 800,
    background: "linear-gradient(135deg, #8b5cf6, #06b6d4)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  } as React.CSSProperties,
  subtitle: {
    fontSize: "13px",
    color: "#94a3b8",
    marginTop: "4px",
  } as React.CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    marginBottom: "24px",
  } as React.CSSProperties,
  fullWidth: {
    gridColumn: "1 / -1",
  } as React.CSSProperties,
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    height: "60vh",
    gap: "16px",
    color: "#64748b",
  } as React.CSSProperties,
  emptyIcon: {
    fontSize: "64px",
    opacity: 0.4,
  } as React.CSSProperties,
  emptyTitle: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#94a3b8",
  } as React.CSSProperties,
  emptySubtext: {
    fontSize: "14px",
    textAlign: "center" as const,
    lineHeight: 1.5,
    maxWidth: "400px",
  } as React.CSSProperties,
  statsBar: {
    display: "flex",
    gap: "16px",
    marginBottom: "20px",
  } as React.CSSProperties,
  statCard: (color: string) =>
    ({
      flex: 1,
      padding: "16px",
      borderRadius: "12px",
      background: `${color}10`,
      border: `1px solid ${color}25`,
      textAlign: "center" as const,
    }) as React.CSSProperties,
  statNumber: (color: string) =>
    ({
      fontSize: "32px",
      fontWeight: 800,
      color,
      lineHeight: 1,
    }) as React.CSSProperties,
  statLabel: {
    fontSize: "11px",
    color: "#94a3b8",
    fontWeight: 600,
    marginTop: "4px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  } as React.CSSProperties,
};

// ── Component ──────────────────────────────────────────────────────────

export function MissionControlView() {
  const [missionTeams, setMissionTeams] = useState<MissionTeam[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<MissionAgent | null>(null);
  const { agents: missionAgents, handleEvent: _handleMissionEvent } = useMissionAgents();
  const missionAgentsRef = useRef(missionAgents);
  useEffect(() => {
    missionAgentsRef.current = missionAgents;
  }, [missionAgents]);
  const { items: notifications, handleEvent: _handleNotifEvent } = useNotificationFeed();
  const { lanes: teamLanes } = useTeamLanes();
  const { messages: scopedMessages } = useScopedChat();
  const [activeTab, setActiveTab] = useState<"grid" | "lanes" | "chat">("grid");
  const [chatScope, setChatScope] = useState<ChatScope>({ type: "all" });
  const [brokerInfo, setBrokerInfo] = useState<MapleBrokerStatus | null>(null);

  // Poll Maple broker status
  useEffect(() => {
    const fetchBroker = async () => {
      try {
        const status = await mapleBrokerStatus();
        setBrokerInfo(status);
      } catch {
        setBrokerInfo(null);
      }
    };
    fetchBroker();
    const interval = setInterval(fetchBroker, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load teams from DB — use ref for missionAgents to avoid interval reset loop
  const loadMissionData = useCallback(async () => {
    try {
      const teams = await getTeams();
      const currentAgents = missionAgentsRef.current;
      const teamsWithMembers: MissionTeam[] = await Promise.all(
        teams.map(async (team) => {
          try {
            const members = await getTeamMembers(team.id);
            const teamAgents: MissionAgent[] = members.map((m) => {
              const existing = currentAgents.find((a) => a.id === m.agent_id);
              return (
                existing || {
                  id: m.agent_id,
                  name: m.agent_id,
                  teamId: team.id,
                  teamName: team.name,
                  status: "idle" as const,
                }
              );
            });

            const doneCount = teamAgents.filter((a) => a.status === "done").length;
            const progress =
              teamAgents.length > 0 ? Math.round((doneCount / teamAgents.length) * 100) : 0;

            return {
              id: team.id,
              name: team.name,
              agents: teamAgents,
              progress,
            };
          } catch {
            return { id: team.id, name: team.name, agents: [], progress: 0 };
          }
        }),
      );
      setMissionTeams(teamsWithMembers);
    } catch (err) {
      console.warn("[MissionControl] Failed to load teams:", err);
    }
  }, []);

  useEffect(() => {
    loadMissionData();
    const interval = setInterval(loadMissionData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [loadMissionData]);

  // Counts
  const totalAgents = missionTeams.reduce((sum, t) => sum + t.agents.length, 0);
  const activeAgents = missionAgents.filter(
    (a) => a.status === "thinking" || a.status === "building",
  ).length;
  const errorAgents = missionAgents.filter((a) => a.status === "error").length;
  const actionItems = notifications.filter(
    (n) => n.priority === "critical" || n.priority === "review",
  ).length;

  if (missionTeams.length === 0 && notifications.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>
              <span>🎯</span> Mission Control
            </div>
            <div style={styles.subtitle}>Monitor all agents across all teams</div>
          </div>
        </div>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📡</div>
          <div style={styles.emptyTitle}>No Active Missions</div>
          <div style={styles.emptySubtext}>
            Create teams, assign agents, and start a group chat to see real-time mission progress
            here. Mission Control activates when you have multiple teams working together.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>
            <span>🎯</span> Mission Control
          </div>
          <div style={styles.subtitle}>
            {missionTeams.length} teams · {totalAgents} agents · Real-time monitoring
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={styles.statsBar}>
        <div style={styles.statCard("#8b5cf6")}>
          <div style={styles.statNumber("#8b5cf6")}>{missionTeams.length}</div>
          <div style={styles.statLabel}>Teams</div>
        </div>
        <div style={styles.statCard("#3b82f6")}>
          <div style={styles.statNumber("#3b82f6")}>{totalAgents}</div>
          <div style={styles.statLabel}>Agents</div>
        </div>
        <div style={styles.statCard("#22c55e")}>
          <div style={styles.statNumber("#22c55e")}>{activeAgents}</div>
          <div style={styles.statLabel}>Active</div>
        </div>
        {errorAgents > 0 && (
          <div style={styles.statCard("#ef4444")}>
            <div style={styles.statNumber("#ef4444")}>{errorAgents}</div>
            <div style={styles.statLabel}>Errors</div>
          </div>
        )}
        {actionItems > 0 && (
          <div style={styles.statCard("#f59e0b")}>
            <div style={styles.statNumber("#f59e0b")}>{actionItems}</div>
            <div style={styles.statLabel}>Need Action</div>
          </div>
        )}
      </div>

      {/* Maple P2P Broker Bar */}
      <div style={styles.statsBar}>
        <div style={styles.statCard(brokerInfo?.brokerActive ? "#22c55e" : "#64748b")}>
          <div style={styles.statNumber(brokerInfo?.brokerActive ? "#22c55e" : "#64748b")}>
            {brokerInfo?.brokerActive ? "●" : "○"}
          </div>
          <div style={styles.statLabel}>Maple Broker</div>
        </div>
        <div style={styles.statCard("#06b6d4")}>
          <div style={styles.statNumber("#06b6d4")}>{brokerInfo?.agentCount ?? 0}</div>
          <div style={styles.statLabel}>P2P Connected</div>
        </div>
        <div style={styles.statCard("#a855f7")}>
          <div style={styles.statNumber("#a855f7")}>{brokerInfo?.brokerType ?? "—"}</div>
          <div style={styles.statLabel}>Broker Type</div>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
        {(["grid", "lanes", "chat"] as const).map((tab) => {
          const labels = {
            grid: "📡 Status + Notifications",
            lanes: "📊 Team Lanes",
            chat: "💬 Scoped Chat",
          };
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 16px",
                borderRadius: "10px",
                border: isActive
                  ? "1px solid rgba(139,92,246,0.5)"
                  : "1px solid rgba(148,163,184,0.12)",
                background: isActive ? "rgba(139,92,246,0.15)" : "rgba(30,41,59,0.3)",
                color: isActive ? "#c4b5fd" : "#94a3b8",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "grid" && (
        <div style={styles.grid}>
          <div>
            <MissionGrid teams={missionTeams} onAgentClick={(agent) => setSelectedAgent(agent)} />
          </div>
          <div>
            <NotificationFeed items={notifications} />
          </div>
        </div>
      )}

      {activeTab === "lanes" && <TeamLanes lanes={teamLanes} />}

      {activeTab === "chat" && (
        <div style={{ height: "calc(100vh - 300px)" }}>
          <ScopedChat
            messages={scopedMessages}
            scope={chatScope}
            onScopeChange={setChatScope}
            availableTeams={missionTeams.map((t) => ({ id: t.id, name: t.name }))}
            availableAgents={missionAgents.map((a) => ({ id: a.id, name: a.name }))}
          />
        </div>
      )}

      {/* Selected Agent Detail Panel */}
      {selectedAgent && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            width: "400px",
            height: "100vh",
            background: "rgba(15, 23, 42, 0.95)",
            backdropFilter: "blur(20px)",
            borderLeft: "1px solid rgba(148,163,184,0.15)",
            padding: "24px",
            zIndex: 50,
            overflowY: "auto",
            color: "#e2e8f0",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
            }}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 700 }}>Agent Details</h3>
            <button
              onClick={() => setSelectedAgent(null)}
              style={{
                background: "rgba(148,163,184,0.1)",
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: "8px",
                color: "#94a3b8",
                padding: "4px 12px",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#f1f5f9" }}>
              {selectedAgent.name}
            </div>
            <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "4px" }}>
              Status: {selectedAgent.status}
            </div>
            {selectedAgent.currentTask && (
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "8px" }}>
                Current: {selectedAgent.currentTask}
              </div>
            )}
            {selectedAgent.teamName && (
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                Team: {selectedAgent.teamName}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
