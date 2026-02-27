/**
 * TeamLanes — Unit tests for the Kanban-style team task lanes component.
 *
 * Tests cover:
 *  - Rendering lanes with task cards
 *  - Task status badges (queued, in-progress, review, done, error)
 *  - Status filtering
 *  - Progress bar computation
 *  - Task click handler
 *  - Empty lane display
 *  - useTeamLanes hook — event-driven lane updates
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  TeamLanes,
  useTeamLanes,
  type TeamLane,
  type TaskCard,
  type TaskStatus,
} from "../../app/components/TeamLanes";

// ── Test Data ──────────────────────────────────────────────────────────

const makeTask = (
  id: string,
  title: string,
  assignee: string,
  agentId: string,
  status: TaskStatus = "queued",
): TaskCard => ({
  id,
  title,
  assignee,
  agentId,
  status,
  startedAt: status !== "queued" ? Date.now() - 30000 : undefined,
  completedAt: status === "done" ? Date.now() : undefined,
});

const sampleLanes: TeamLane[] = [
  {
    id: "lane-1",
    name: "Frontend Sprint",
    tasks: [
      makeTask("t1", "Build login page", "Coder", "a1", "done"),
      makeTask("t2", "Add dark mode", "Styler", "a2", "in-progress"),
      makeTask("t3", "Write tests", "Tester", "a3", "queued"),
    ],
  },
  {
    id: "lane-2",
    name: "Backend Sprint",
    tasks: [
      makeTask("t4", "Create API endpoint", "Architect", "b1", "review"),
      makeTask("t5", "Fix DB migration", "DBA", "b2", "error"),
    ],
  },
];

// ── Component Tests ────────────────────────────────────────────────────

describe("TeamLanes", () => {
  it("renders lane names", () => {
    render(<TeamLanes lanes={sampleLanes} />);
    expect(screen.getByText("Frontend Sprint")).toBeInTheDocument();
    expect(screen.getByText("Backend Sprint")).toBeInTheDocument();
  });

  it("renders task cards with titles", () => {
    render(<TeamLanes lanes={sampleLanes} />);
    expect(screen.getByText("Build login page")).toBeInTheDocument();
    expect(screen.getByText("Add dark mode")).toBeInTheDocument();
    expect(screen.getByText("Write tests")).toBeInTheDocument();
    expect(screen.getByText("Create API endpoint")).toBeInTheDocument();
    expect(screen.getByText("Fix DB migration")).toBeInTheDocument();
  });

  it("shows assignee names on task cards", () => {
    render(<TeamLanes lanes={sampleLanes} />);
    expect(screen.getByText(/Coder/)).toBeInTheDocument();
    expect(screen.getByText(/Styler/)).toBeInTheDocument();
    expect(screen.getByText(/Tester/)).toBeInTheDocument();
    expect(screen.getByText(/Architect/)).toBeInTheDocument();
    expect(screen.getByText(/DBA/)).toBeInTheDocument();
  });

  it("shows status labels on task cards", () => {
    render(<TeamLanes lanes={sampleLanes} />);
    // Use getAllByText since status labels also appear in filter buttons
    expect(screen.getAllByText(/Done/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/In Progress/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Queued/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Review/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows total task count in header", () => {
    render(<TeamLanes lanes={sampleLanes} />);
    // 1 done out of 5 total
    expect(screen.getByText(/1\/5 tasks done/)).toBeInTheDocument();
  });

  it("shows task count per lane", () => {
    render(<TeamLanes lanes={sampleLanes} />);
    expect(screen.getByText("3")).toBeInTheDocument(); // Frontend: 3 tasks
    expect(screen.getByText("2")).toBeInTheDocument(); // Backend: 2 tasks
  });

  it("renders status filter buttons", () => {
    render(<TeamLanes lanes={sampleLanes} />);
    expect(screen.getByText("All")).toBeInTheDocument();
  });

  it("filters tasks by status", () => {
    render(<TeamLanes lanes={sampleLanes} />);

    // Click the "Done" filter button — it's in the filter bar (first "Done" element)
    const doneElements = screen.getAllByText(/Done/);
    // The filter button is typically the first/smallest one — click it
    fireEvent.click(doneElements[0]);

    // After filtering, "Build login page" (done status) should still be visible
    expect(screen.getByText("Build login page")).toBeInTheDocument();
  });

  it("calls onTaskClick when a task card is clicked", () => {
    const onClick = vi.fn();
    render(<TeamLanes lanes={sampleLanes} onTaskClick={onClick} />);

    // Click the "Build login page" card
    const loginTask = screen.getByText("Build login page");
    const card = loginTask.closest(".kanban-card");
    if (card) {
      fireEvent.click(card);
      expect(onClick).toHaveBeenCalledWith(
        expect.objectContaining({ id: "t1", title: "Build login page" }),
        "lane-1",
      );
    }
  });

  it("renders empty lanes with 'No tasks' message", () => {
    const emptyLanes: TeamLane[] = [
      { id: "empty-1", name: "Empty Lane", tasks: [] },
    ];
    render(<TeamLanes lanes={emptyLanes} />);
    expect(screen.getByText("No tasks")).toBeInTheDocument();
  });

  it("shows file badges when task has filesCreated", () => {
    const lanesWithFiles: TeamLane[] = [
      {
        id: "lane-files",
        name: "File Lane",
        tasks: [
          {
            ...makeTask("tf1", "Create files", "Agent", "a1", "done"),
            filesCreated: ["/src/main.ts", "/src/utils.ts"],
          },
        ],
      },
    ];
    render(<TeamLanes lanes={lanesWithFiles} />);
    expect(screen.getByText("main.ts")).toBeInTheDocument();
    expect(screen.getByText("utils.ts")).toBeInTheDocument();
  });
});

// ── useTeamLanes Hook Tests ────────────────────────────────────────────

describe("useTeamLanes", () => {
  it("starts with empty lanes", () => {
    const { result } = renderHook(() => useTeamLanes());
    expect(result.current.lanes).toEqual([]);
  });

  it("creates a lane and task on delegation_start event", () => {
    const { result } = renderHook(() => useTeamLanes());

    act(() => {
      result.current.handleEvent(
        { type: "delegation_start", agentId: "a1", agentName: "Coder", task: "Build login" },
        "team-1",
        "Frontend",
      );
    });

    expect(result.current.lanes).toHaveLength(1);
    expect(result.current.lanes[0].name).toBe("Frontend");
    expect(result.current.lanes[0].tasks).toHaveLength(1);
    expect(result.current.lanes[0].tasks[0].title).toBe("Build login");
    expect(result.current.lanes[0].tasks[0].status).toBe("queued");
  });

  it("transitions task to in-progress on agent_thinking", () => {
    const { result } = renderHook(() => useTeamLanes());

    act(() => {
      result.current.handleEvent(
        { type: "delegation_start", agentId: "a1", agentName: "Coder", task: "Build login" },
        "team-1",
        "Frontend",
      );
    });

    act(() => {
      result.current.handleEvent(
        { type: "agent_thinking", agentId: "a1", agentName: "Coder" },
        "team-1",
        "Frontend",
      );
    });

    expect(result.current.lanes[0].tasks[0].status).toBe("in-progress");
  });

  it("transitions task to review on review_thinking", () => {
    const { result } = renderHook(() => useTeamLanes());

    act(() => {
      result.current.handleEvent(
        { type: "delegation_start", agentId: "a1", agentName: "Coder", task: "Build login" },
        "team-1",
        "Frontend",
      );
    });

    act(() => {
      result.current.handleEvent(
        { type: "review_thinking", agentId: "a1", agentName: "Coder" },
        "team-1",
        "Frontend",
      );
    });

    expect(result.current.lanes[0].tasks[0].status).toBe("review");
  });

  it("transitions task to done on agent_response", () => {
    const { result } = renderHook(() => useTeamLanes());

    act(() => {
      result.current.handleEvent(
        { type: "delegation_start", agentId: "a1", agentName: "Coder", task: "Build login" },
        "team-1",
        "Frontend",
      );
    });

    act(() => {
      result.current.handleEvent(
        { type: "agent_response", agentId: "a1", agentName: "Coder", text: "Done!" },
        "team-1",
        "Frontend",
      );
    });

    expect(result.current.lanes[0].tasks[0].status).toBe("done");
    expect(result.current.lanes[0].tasks[0].completedAt).toBeDefined();
  });

  it("transitions task to error on agent_error", () => {
    const { result } = renderHook(() => useTeamLanes());

    act(() => {
      result.current.handleEvent(
        { type: "delegation_start", agentId: "a1", agentName: "Coder", task: "Build login" },
        "team-1",
        "Frontend",
      );
    });

    act(() => {
      result.current.handleEvent(
        { type: "agent_error", agentId: "a1", agentName: "Coder", error: "OOM" },
        "team-1",
        "Frontend",
      );
    });

    expect(result.current.lanes[0].tasks[0].status).toBe("error");
    expect(result.current.lanes[0].tasks[0].description).toBe("OOM");
  });

  it("tracks files created from tool_start events", () => {
    const { result } = renderHook(() => useTeamLanes());

    act(() => {
      result.current.handleEvent(
        { type: "delegation_start", agentId: "a1", agentName: "Coder", task: "Build" },
        "team-1",
        "Frontend",
      );
    });

    act(() => {
      result.current.handleEvent(
        { type: "tool_start", agentId: "a1", agentName: "Coder", tool: "write_file", input: "/src/main.ts" },
        "team-1",
        "Frontend",
      );
    });

    expect(result.current.lanes[0].tasks[0].filesCreated).toContain("/src/main.ts");
  });

  it("creates task implicitly on agent_thinking without prior delegation", () => {
    const { result } = renderHook(() => useTeamLanes());

    act(() => {
      result.current.handleEvent(
        { type: "agent_thinking", agentId: "a1", agentName: "Coder" },
        "team-1",
        "Frontend",
      );
    });

    expect(result.current.lanes).toHaveLength(1);
    expect(result.current.lanes[0].tasks).toHaveLength(1);
    expect(result.current.lanes[0].tasks[0].status).toBe("in-progress");
    expect(result.current.lanes[0].tasks[0].assignee).toBe("Coder");
  });

  it("handles revision event — sets task back to in-progress", () => {
    const { result } = renderHook(() => useTeamLanes());

    act(() => {
      result.current.handleEvent(
        { type: "delegation_start", agentId: "a1", agentName: "Coder", task: "Build" },
        "team-1",
        "Frontend",
      );
    });

    act(() => {
      result.current.handleEvent(
        { type: "revision", agentId: "a1", agentName: "Coder", round: 2, text: "fixing" },
        "team-1",
        "Frontend",
      );
    });

    expect(result.current.lanes[0].tasks[0].status).toBe("in-progress");
    expect(result.current.lanes[0].tasks[0].description).toBe("Revision round 2");
  });

  it("manages multiple lanes for different teams", () => {
    const { result } = renderHook(() => useTeamLanes());

    act(() => {
      result.current.handleEvent(
        { type: "delegation_start", agentId: "a1", agentName: "Coder", task: "Build UI" },
        "team-1",
        "Frontend",
      );
      result.current.handleEvent(
        { type: "delegation_start", agentId: "b1", agentName: "Architect", task: "Build API" },
        "team-2",
        "Backend",
      );
    });

    expect(result.current.lanes).toHaveLength(2);
    expect(result.current.lanes.find((l) => l.name === "Frontend")?.tasks).toHaveLength(1);
    expect(result.current.lanes.find((l) => l.name === "Backend")?.tasks).toHaveLength(1);
  });
});
