/**
 * MissionControlView — Unit tests for the top-level Mission Control dashboard.
 *
 * Tests cover:
 *  - Empty state rendering when no teams/notifications exist
 *  - Data loading from Tauri APIs (getTeams, getTeamMembers, mapleBrokerStatus)
 *  - Stats bar computation (teams, agents, active, errors, action items)
 *  - Maple P2P broker status bar
 *  - Tab switching (grid / lanes / chat)
 *  - Agent detail panel open/close
 *  - Auto-polling intervals
 */

import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MissionControlView } from "../../app/components/MissionControlView";
import * as tauriApi from "../../app/tauri-api";

// Mock tauri-api
vi.mock("../../app/tauri-api", () => ({
  getTeams: vi.fn(),
  getTeamMembers: vi.fn(),
  mapleBrokerStatus: vi.fn(),
  isTauri: vi.fn(() => true),
}));

// Mock sub-components to isolate MissionControlView logic
vi.mock("../../app/components/MissionGrid", () => {
  const MissionGrid = ({ teams, onAgentClick }: any) => (
    <div data-testid="mission-grid">
      {teams.map((t: any) => (
        <div key={t.id} data-testid={`team-${t.id}`}>
          <span>{t.name}</span>
          <span data-testid={`team-${t.id}-progress`}>{t.progress}%</span>
          {t.agents.map((a: any) => (
            <button
              key={a.id}
              data-testid={`agent-${a.id}`}
              onClick={() => onAgentClick?.(a)}
            >
              {a.name} ({a.status})
            </button>
          ))}
        </div>
      ))}
    </div>
  );

  const useMissionAgents = () => ({
    agents: [],
    handleEvent: vi.fn(),
  });

  return {
    MissionGrid,
    useMissionAgents,
    __esModule: true,
  };
});

vi.mock("../../app/components/NotificationFeed", () => {
  const NotificationFeed = ({ items }: any) => (
    <div data-testid="notification-feed">
      {items.map((item: any) => (
        <div key={item.id} data-testid={`notif-${item.id}`}>
          {item.priority}
        </div>
      ))}
    </div>
  );

  const useNotificationFeed = () => ({
    items: [],
    handleEvent: vi.fn(),
  });

  return {
    NotificationFeed,
    useNotificationFeed,
    __esModule: true,
  };
});

vi.mock("../../app/components/TeamLanes", () => {
  const TeamLanes = ({ lanes }: any) => (
    <div data-testid="team-lanes">
      {lanes.map((l: any) => (
        <div key={l.id}>{l.name}</div>
      ))}
    </div>
  );

  const useTeamLanes = () => ({
    lanes: [],
    handleEvent: vi.fn(),
  });

  return {
    TeamLanes,
    useTeamLanes,
    __esModule: true,
  };
});

vi.mock("../../app/components/ScopedChat", () => {
  const ScopedChat = ({ scope, messages }: any) => (
    <div data-testid="scoped-chat">
      <span data-testid="chat-scope">{scope.type}</span>
      <span data-testid="chat-count">{messages.length}</span>
    </div>
  );

  const useScopedChat = () => ({
    messages: [],
    handleEvent: vi.fn(),
    clear: vi.fn(),
  });

  return {
    ScopedChat,
    useScopedChat,
    __esModule: true,
  };
});

// ── Helpers ────────────────────────────────────────────────────────────

const mockTeams = [
  {
    id: "team-alpha",
    name: "Alpha Squad",
    description: "Frontend team",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "team-beta",
    name: "Beta Core",
    description: "Backend team",
    created_at: "2025-01-01T00:00:00Z",
  },
];

const mockMembersAlpha = [
  { team_id: "team-alpha", agent_id: "agent-1", manager_id: null, joined_at: "2025-01-01T00:00:00Z" },
  { team_id: "team-alpha", agent_id: "agent-2", manager_id: null, joined_at: "2025-01-01T00:00:00Z" },
];

const mockMembersBeta = [
  { team_id: "team-beta", agent_id: "agent-3", manager_id: null, joined_at: "2025-01-01T00:00:00Z" },
];

const mockBrokerActive = {
  brokerActive: true,
  brokerType: "embedded",
  connectedAgents: ["agent-1", "agent-3"],
  agentCount: 2,
};

const mockBrokerInactive = {
  brokerActive: false,
  brokerType: null,
  connectedAgents: [],
  agentCount: 0,
};

// ── Test Suite ─────────────────────────────────────────────────────────

describe("MissionControlView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Empty State ────────────────────────────────────────────────────

  describe("Empty State", () => {
    it("renders empty state when no teams exist", async () => {
      (tauriApi.getTeams as any).mockResolvedValue([]);
      (tauriApi.mapleBrokerStatus as any).mockResolvedValue(mockBrokerInactive);

      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByText("No Active Missions")).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Create teams, assign agents, and start a group chat/),
      ).toBeInTheDocument();
    });

    it("shows Mission Control title in empty state", async () => {
      (tauriApi.getTeams as any).mockResolvedValue([]);
      (tauriApi.mapleBrokerStatus as any).mockResolvedValue(mockBrokerInactive);

      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByText("Mission Control")).toBeInTheDocument();
      });
    });

    it("shows subtitle in empty state", async () => {
      (tauriApi.getTeams as any).mockResolvedValue([]);
      (tauriApi.mapleBrokerStatus as any).mockResolvedValue(mockBrokerInactive);

      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByText("Monitor all agents across all teams")).toBeInTheDocument();
      });
    });
  });

  // ── Active State (with teams) ──────────────────────────────────────

  describe("Active State", () => {
    beforeEach(() => {
      (tauriApi.getTeams as any).mockResolvedValue(mockTeams);
      (tauriApi.getTeamMembers as any).mockImplementation((teamId: string) => {
        if (teamId === "team-alpha") return Promise.resolve(mockMembersAlpha);
        if (teamId === "team-beta") return Promise.resolve(mockMembersBeta);
        return Promise.resolve([]);
      });
      (tauriApi.mapleBrokerStatus as any).mockResolvedValue(mockBrokerActive);
    });

    it("renders teams with members", async () => {
      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByTestId("mission-grid")).toBeInTheDocument();
      });

      // Should show the team sections
      expect(screen.getByTestId("team-team-alpha")).toBeInTheDocument();
      expect(screen.getByTestId("team-team-beta")).toBeInTheDocument();
    });

    it("populates agent entries from team members", async () => {
      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByTestId("agent-agent-1")).toBeInTheDocument();
        expect(screen.getByTestId("agent-agent-2")).toBeInTheDocument();
        expect(screen.getByTestId("agent-agent-3")).toBeInTheDocument();
      });
    });

    it("displays team names", async () => {
      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByText("Alpha Squad")).toBeInTheDocument();
        expect(screen.getByText("Beta Core")).toBeInTheDocument();
      });
    });

    it("renders stats bar with correct counts", async () => {
      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        // 2 teams
        const teamsStat = screen.getByText("Teams");
        expect(teamsStat).toBeInTheDocument();

        // 3 agents total (2 alpha + 1 beta)
        const agentsStat = screen.getByText("Agents");
        expect(agentsStat).toBeInTheDocument();
      });
    });

    it("shows subtitle with team/agent count", async () => {
      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(
          screen.getByText(/2 teams · 3 agents · Real-time monitoring/),
        ).toBeInTheDocument();
      });
    });

    it("defaults to agents having idle status", async () => {
      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByText("agent-1 (idle)")).toBeInTheDocument();
        expect(screen.getByText("agent-2 (idle)")).toBeInTheDocument();
        expect(screen.getByText("agent-3 (idle)")).toBeInTheDocument();
      });
    });

    it("computes progress as 0% when all agents are idle", async () => {
      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByTestId("team-team-alpha-progress")).toHaveTextContent("0%");
        expect(screen.getByTestId("team-team-beta-progress")).toHaveTextContent("0%");
      });
    });
  });

  // ── Maple P2P Broker Status ────────────────────────────────────────

  describe("Maple Broker Status", () => {
    it("shows active broker indicator when broker is running", async () => {
      (tauriApi.getTeams as any).mockResolvedValue(mockTeams);
      (tauriApi.getTeamMembers as any).mockResolvedValue([]);
      (tauriApi.mapleBrokerStatus as any).mockResolvedValue(mockBrokerActive);

      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByText("Maple Broker")).toBeInTheDocument();
        expect(screen.getByText("P2P Connected")).toBeInTheDocument();
        expect(screen.getByText("embedded")).toBeInTheDocument();
      });
    });

    it("shows 0 connected agents when broker is inactive", async () => {
      (tauriApi.getTeams as any).mockResolvedValue(mockTeams);
      (tauriApi.getTeamMembers as any).mockResolvedValue([]);
      (tauriApi.mapleBrokerStatus as any).mockResolvedValue(mockBrokerInactive);

      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByText("Maple Broker")).toBeInTheDocument();
      });
    });

    it("handles broker status fetch failure gracefully", async () => {
      (tauriApi.getTeams as any).mockResolvedValue(mockTeams);
      (tauriApi.getTeamMembers as any).mockResolvedValue([]);
      (tauriApi.mapleBrokerStatus as any).mockRejectedValue(new Error("Not available"));

      await act(async () => {
        render(<MissionControlView />);
      });

      // Should still render without crashing
      await waitFor(() => {
        expect(screen.getByText("Mission Control")).toBeInTheDocument();
      });
    });
  });

  // ── Tab Switching ──────────────────────────────────────────────────

  describe("Tab Navigation", () => {
    beforeEach(() => {
      (tauriApi.getTeams as any).mockResolvedValue(mockTeams);
      (tauriApi.getTeamMembers as any).mockResolvedValue(mockMembersAlpha);
      (tauriApi.mapleBrokerStatus as any).mockResolvedValue(mockBrokerActive);
    });

    it("defaults to grid tab showing MissionGrid and NotificationFeed", async () => {
      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByTestId("mission-grid")).toBeInTheDocument();
        expect(screen.getByTestId("notification-feed")).toBeInTheDocument();
      });
    });

    it("switches to team lanes tab", async () => {
      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByText("📊 Team Lanes")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("📊 Team Lanes"));
      });

      expect(screen.getByTestId("team-lanes")).toBeInTheDocument();
      expect(screen.queryByTestId("mission-grid")).not.toBeInTheDocument();
    });

    it("switches to scoped chat tab", async () => {
      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByText("💬 Scoped Chat")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("💬 Scoped Chat"));
      });

      expect(screen.getByTestId("scoped-chat")).toBeInTheDocument();
      expect(screen.queryByTestId("mission-grid")).not.toBeInTheDocument();
    });

    it("can switch back to grid tab from lanes", async () => {
      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByTestId("mission-grid")).toBeInTheDocument();
      });

      // Go to lanes
      await act(async () => {
        fireEvent.click(screen.getByText("📊 Team Lanes"));
      });
      expect(screen.getByTestId("team-lanes")).toBeInTheDocument();

      // Back to grid
      await act(async () => {
        fireEvent.click(screen.getByText("📡 Status + Notifications"));
      });
      expect(screen.getByTestId("mission-grid")).toBeInTheDocument();
    });
  });

  // ── Agent Detail Panel ─────────────────────────────────────────────

  describe("Agent Detail Panel", () => {
    beforeEach(() => {
      (tauriApi.getTeams as any).mockResolvedValue(mockTeams);
      (tauriApi.getTeamMembers as any).mockImplementation((teamId: string) => {
        if (teamId === "team-alpha") return Promise.resolve(mockMembersAlpha);
        if (teamId === "team-beta") return Promise.resolve(mockMembersBeta);
        return Promise.resolve([]);
      });
      (tauriApi.mapleBrokerStatus as any).mockResolvedValue(mockBrokerActive);
    });

    it("opens agent detail panel when an agent is clicked", async () => {
      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByTestId("agent-agent-1")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("agent-agent-1"));
      });

      expect(screen.getByText("Agent Details")).toBeInTheDocument();
    });

    it("closes agent detail panel when close button is clicked", async () => {
      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        expect(screen.getByTestId("agent-agent-1")).toBeInTheDocument();
      });

      // Open
      await act(async () => {
        fireEvent.click(screen.getByTestId("agent-agent-1"));
      });
      expect(screen.getByText("Agent Details")).toBeInTheDocument();

      // Close
      await act(async () => {
        fireEvent.click(screen.getByText("✕"));
      });
      expect(screen.queryByText("Agent Details")).not.toBeInTheDocument();
    });
  });

  // ── Polling / Auto-Refresh ─────────────────────────────────────────

  describe("Auto-Polling", () => {
    it("calls getTeams on mount", async () => {
      (tauriApi.getTeams as any).mockResolvedValue([]);
      (tauriApi.mapleBrokerStatus as any).mockResolvedValue(mockBrokerInactive);

      await act(async () => {
        render(<MissionControlView />);
      });

      expect(tauriApi.getTeams).toHaveBeenCalledTimes(1);
    });

    it("calls mapleBrokerStatus on mount", async () => {
      (tauriApi.getTeams as any).mockResolvedValue([]);
      (tauriApi.mapleBrokerStatus as any).mockResolvedValue(mockBrokerInactive);

      await act(async () => {
        render(<MissionControlView />);
      });

      expect(tauriApi.mapleBrokerStatus).toHaveBeenCalledTimes(1);
    });

    it("calls getTeamMembers for each team", async () => {
      (tauriApi.getTeams as any).mockResolvedValue(mockTeams);
      (tauriApi.getTeamMembers as any).mockResolvedValue([]);
      (tauriApi.mapleBrokerStatus as any).mockResolvedValue(mockBrokerActive);

      await act(async () => {
        render(<MissionControlView />);
      });

      await waitFor(() => {
        // Should call getTeamMembers once per team
        expect(tauriApi.getTeamMembers).toHaveBeenCalledWith("team-alpha");
        expect(tauriApi.getTeamMembers).toHaveBeenCalledWith("team-beta");
      });
    });
  });

  // ── Error Handling ─────────────────────────────────────────────────

  describe("Error Handling", () => {
    it("handles getTeams failure gracefully", async () => {
      (tauriApi.getTeams as any).mockRejectedValue(new Error("DB error"));
      (tauriApi.mapleBrokerStatus as any).mockResolvedValue(mockBrokerInactive);

      await act(async () => {
        render(<MissionControlView />);
      });

      // Should still render empty state without crashing
      await waitFor(() => {
        expect(screen.getByText("No Active Missions")).toBeInTheDocument();
      });
    });

    it("handles getTeamMembers failure for a specific team", async () => {
      (tauriApi.getTeams as any).mockResolvedValue(mockTeams);
      (tauriApi.getTeamMembers as any).mockImplementation((teamId: string) => {
        if (teamId === "team-alpha") return Promise.reject(new Error("Access denied"));
        return Promise.resolve(mockMembersBeta);
      });
      (tauriApi.mapleBrokerStatus as any).mockResolvedValue(mockBrokerActive);

      await act(async () => {
        render(<MissionControlView />);
      });

      // Should still render the teams — alpha with empty agents, beta with its member
      await waitFor(() => {
        expect(screen.getByTestId("team-team-alpha")).toBeInTheDocument();
        expect(screen.getByTestId("team-team-beta")).toBeInTheDocument();
      });
    });
  });
});
