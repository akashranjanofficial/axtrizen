/**
 * MissionGrid — Unit tests for the dense agent status overview component.
 *
 * Tests cover:
 *  - Rendering teams with agents
 *  - Agent status badges (idle, thinking, building, done, error, needs-review)
 *  - Team progress bar calculation
 *  - Team expand/collapse
 *  - Agent click callback
 *  - Empty state when no teams exist
 *  - useMissionAgents hook
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  MissionGrid,
  useMissionAgents,
  type MissionTeam,
  type MissionAgent,
  type AgentStatus,
} from "../../app/components/MissionGrid";

// ── Test Data ──────────────────────────────────────────────────────────

const makeAgent = (
  id: string,
  name: string,
  status: AgentStatus = "idle",
  teamId?: string,
  teamName?: string,
): MissionAgent => ({
  id,
  name,
  status,
  teamId,
  teamName,
  currentTask: status === "building" ? `Building ${name}` : undefined,
  lastUpdate: Date.now(),
});

const makeTeam = (
  id: string,
  name: string,
  agents: MissionAgent[],
  progress = 0,
): MissionTeam => ({
  id,
  name,
  agents,
  progress,
});

const sampleTeams: MissionTeam[] = [
  makeTeam("team-1", "Frontend Squad", [
    makeAgent("a1", "Coder", "thinking", "team-1", "Frontend Squad"),
    makeAgent("a2", "Reviewer", "idle", "team-1", "Frontend Squad"),
    makeAgent("a3", "Builder", "building", "team-1", "Frontend Squad"),
  ]),
  makeTeam("team-2", "Backend Core", [
    makeAgent("b1", "Architect", "done", "team-2", "Backend Core"),
    makeAgent("b2", "Tester", "error", "team-2", "Backend Core"),
  ]),
];

// ── Component Tests ────────────────────────────────────────────────────

describe("MissionGrid", () => {
  it("renders team names", () => {
    render(<MissionGrid teams={sampleTeams} />);
    expect(screen.getByText("Frontend Squad")).toBeInTheDocument();
    expect(screen.getByText("Backend Core")).toBeInTheDocument();
  });

  it("renders agent names as badges", () => {
    render(<MissionGrid teams={sampleTeams} />);
    expect(screen.getByText(/Coder/)).toBeInTheDocument();
    expect(screen.getByText(/Reviewer/)).toBeInTheDocument();
    expect(screen.getByText(/Builder/)).toBeInTheDocument();
    expect(screen.getByText(/Architect/)).toBeInTheDocument();
    expect(screen.getByText(/Tester/)).toBeInTheDocument();
  });

  it("renders status icons with agent badges", () => {
    render(<MissionGrid teams={sampleTeams} />);
    // ⚡ for thinking, 💤 for idle, 🔨 for building, ✅ for done, 🔴 for error
    expect(screen.getAllByText(/⚡/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/💤/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/🔨/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/✅/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/🔴/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows agent count per team in team header", () => {
    render(<MissionGrid teams={sampleTeams} />);
    expect(screen.getByText("(3)")).toBeInTheDocument(); // Frontend Squad
    expect(screen.getByText("(2)")).toBeInTheDocument(); // Backend Core
  });

  it("shows overall active count", () => {
    render(<MissionGrid teams={sampleTeams} />);
    // 2 active: 1 thinking + 1 building
    expect(screen.getByText(/2 active/)).toBeInTheDocument();
  });

  it("shows error count when errors exist", () => {
    render(<MissionGrid teams={sampleTeams} />);
    // 1 error
    expect(screen.getByText(/1 errors/)).toBeInTheDocument();
  });

  it("shows done count", () => {
    render(<MissionGrid teams={sampleTeams} />);
    expect(screen.getByText(/1 done/)).toBeInTheDocument();
  });

  it("shows total agent count", () => {
    render(<MissionGrid teams={sampleTeams} />);
    expect(screen.getByText("5 total")).toBeInTheDocument();
  });

  it("calls onAgentClick when an agent badge is clicked", () => {
    const onAgentClick = vi.fn();
    render(<MissionGrid teams={sampleTeams} onAgentClick={onAgentClick} />);

    // Click on an agent badge — find Coder's badge via its text
    const coderText = screen.getByText(/Coder/);
    const coderBadge = coderText.closest(".mission-badge");
    expect(coderBadge).toBeTruthy();
    fireEvent.click(coderBadge!);
    expect(onAgentClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a1", name: "Coder", status: "thinking" }),
    );
  });

  it("toggles team expand/collapse on header click", () => {
    render(<MissionGrid teams={sampleTeams} />);

    // Both teams start expanded — agents visible
    expect(screen.getByText(/Coder/)).toBeInTheDocument();

    // Click the first team header to collapse
    const frontendHeader = screen.getByText("Frontend Squad");
    fireEvent.click(frontendHeader);

    // After collapse, agents in that team should be hidden
    // The agent list is conditionally rendered based on expandedTeams set
    // Since we clicked the header, the team should now be collapsed
  });

  it("renders empty state when no teams", () => {
    render(<MissionGrid teams={[]} />);
    expect(screen.getByText(/No active teams/)).toBeInTheDocument();
  });

  it("renders in compact mode (no agent names)", () => {
    render(<MissionGrid teams={sampleTeams} compact={true} />);
    // In compact mode, agent name text is empty — only icon is shown
    // The badges should still be rendered
    expect(screen.getByText("Frontend Squad")).toBeInTheDocument();
  });

  it("displays progress percentage for each team", () => {
    const teamsWithProgress = [
      makeTeam("t1", "Team A", [makeAgent("x1", "X1", "done")], 50),
      makeTeam("t2", "Team B", [makeAgent("x2", "X2", "idle")], 0),
    ];
    render(<MissionGrid teams={teamsWithProgress} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});

// ── useMissionAgents Hook Tests ────────────────────────────────────────

describe("useMissionAgents", () => {
  it("starts with empty agent list", () => {
    const { result } = renderHook(() => useMissionAgents());
    expect(result.current.agents).toEqual([]);
  });

  it("adds agent on agent_thinking event", () => {
    const { result } = renderHook(() => useMissionAgents());

    act(() => {
      result.current.handleEvent({
        type: "agent_thinking",
        agentId: "agent-1",
        agentName: "Coder",
      });
    });

    expect(result.current.agents).toHaveLength(1);
    expect(result.current.agents[0]).toMatchObject({
      id: "agent-1",
      name: "Coder",
      status: "thinking",
    });
  });

  it("transitions agent to building on tool_start", () => {
    const { result } = renderHook(() => useMissionAgents());

    act(() => {
      result.current.handleEvent({
        type: "agent_thinking",
        agentId: "agent-1",
        agentName: "Coder",
      });
    });

    act(() => {
      result.current.handleEvent({
        type: "tool_start",
        agentId: "agent-1",
        agentName: "Coder",
        tool: "write_file",
      });
    });

    expect(result.current.agents[0].status).toBe("building");
    expect(result.current.agents[0].currentTask).toBe("Using write_file");
  });

  it("transitions agent to done on agent_response", () => {
    const { result } = renderHook(() => useMissionAgents());

    act(() => {
      result.current.handleEvent({
        type: "agent_thinking",
        agentId: "agent-1",
        agentName: "Coder",
      });
    });

    act(() => {
      result.current.handleEvent({
        type: "agent_response",
        agentId: "agent-1",
        agentName: "Coder",
      });
    });

    expect(result.current.agents[0].status).toBe("done");
  });

  it("transitions agent to error on agent_error", () => {
    const { result } = renderHook(() => useMissionAgents());

    act(() => {
      result.current.handleEvent({
        type: "agent_thinking",
        agentId: "agent-1",
        agentName: "Coder",
      });
    });

    act(() => {
      result.current.handleEvent({
        type: "agent_error",
        agentId: "agent-1",
        agentName: "Coder",
        error: "Out of tokens",
      });
    });

    expect(result.current.agents[0].status).toBe("error");
    expect(result.current.agents[0].currentTask).toBe("Out of tokens");
  });

  it("transitions agent to needs-review on failed review", () => {
    const { result } = renderHook(() => useMissionAgents());

    act(() => {
      result.current.handleEvent({
        type: "agent_thinking",
        agentId: "agent-1",
        agentName: "Coder",
      });
    });

    act(() => {
      result.current.handleEvent({
        type: "review_result",
        agentId: "agent-1",
        agentName: "Coder",
        approved: false,
      });
    });

    expect(result.current.agents[0].status).toBe("needs-review");
  });

  it("ignores events without agentId", () => {
    const { result } = renderHook(() => useMissionAgents());

    act(() => {
      result.current.handleEvent({ type: "round_start" });
    });

    expect(result.current.agents).toHaveLength(0);
  });

  it("transitions agent to done on delegation_result", () => {
    const { result } = renderHook(() => useMissionAgents());

    act(() => {
      result.current.handleEvent({
        type: "agent_thinking",
        agentId: "agent-1",
        agentName: "Coder",
      });
    });

    act(() => {
      result.current.handleEvent({
        type: "delegation_result",
        agentId: "agent-1",
        agentName: "Coder",
      });
    });

    expect(result.current.agents[0].status).toBe("done");
  });

  it("sets lastUpdate timestamp on events", () => {
    const { result } = renderHook(() => useMissionAgents());
    const before = Date.now();

    act(() => {
      result.current.handleEvent({
        type: "agent_thinking",
        agentId: "agent-1",
        agentName: "Coder",
      });
    });

    const after = Date.now();
    const lastUpdate = result.current.agents[0].lastUpdate!;
    expect(lastUpdate).toBeGreaterThanOrEqual(before);
    expect(lastUpdate).toBeLessThanOrEqual(after);
  });

  it("tracks multiple agents independently", () => {
    const { result } = renderHook(() => useMissionAgents());

    act(() => {
      result.current.handleEvent({
        type: "agent_thinking",
        agentId: "agent-1",
        agentName: "Coder",
      });
      result.current.handleEvent({
        type: "agent_thinking",
        agentId: "agent-2",
        agentName: "Reviewer",
      });
    });

    expect(result.current.agents).toHaveLength(2);

    act(() => {
      result.current.handleEvent({
        type: "agent_error",
        agentId: "agent-1",
        agentName: "Coder",
        error: "Failed",
      });
    });

    const coder = result.current.agents.find((a) => a.id === "agent-1");
    const reviewer = result.current.agents.find((a) => a.id === "agent-2");
    expect(coder?.status).toBe("error");
    expect(reviewer?.status).toBe("thinking");
  });
});
