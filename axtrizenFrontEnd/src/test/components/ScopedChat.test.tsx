/**
 * ScopedChat — Unit tests for the filtered chat view component.
 *
 * Tests cover:
 *  - Rendering messages with priority indicators
 *  - Scope filtering (all, team, agent, priority)
 *  - Scope selector buttons from availableTeams/availableAgents
 *  - Debug messages collapsed by default
 *  - Send message functionality
 *  - Empty state
 *  - useScopedChat hook
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  ScopedChat,
  useScopedChat,
  type ChatScope,
  type ScopedMessage,
} from "../../app/components/ScopedChat";
import type { OrchestrationEvent, EventPriority } from "../../app/services/orchestration-engine";

// ── Test Data ──────────────────────────────────────────────────────────

const makeScopedMessage = (
  id: string,
  priority: EventPriority,
  event: OrchestrationEvent,
  opts: { teamId?: string; teamName?: string; agentId?: string; agentName?: string } = {},
): ScopedMessage => ({
  id,
  event,
  priority,
  timestamp: Date.now() - Math.random() * 60000,
  ...opts,
});

const sampleMessages: ScopedMessage[] = [
  makeScopedMessage("m1", "critical", {
    type: "agent_error",
    agentId: "a1",
    agentName: "Coder",
    error: "Token limit exceeded",
  }, { teamId: "t1", teamName: "Frontend", agentId: "a1", agentName: "Coder" }),

  makeScopedMessage("m2", "info", {
    type: "agent_response",
    agentId: "a2",
    agentName: "Reviewer",
    text: "LGTM, looks good",
  }, { teamId: "t1", teamName: "Frontend", agentId: "a2", agentName: "Reviewer" }),

  makeScopedMessage("m3", "debug", {
    type: "agent_thinking",
    agentId: "b1",
    agentName: "Architect",
  }, { teamId: "t2", teamName: "Backend", agentId: "b1", agentName: "Architect" }),

  makeScopedMessage("m4", "review", {
    type: "product_ready",
    workspacePath: "/out",
    summary: "Done",
  }, { teamId: "t2", teamName: "Backend" }),

  makeScopedMessage("m5", "info", {
    type: "delegation_result",
    agentName: "Builder",
    text: "API ready",
  }, { teamId: "t2", teamName: "Backend", agentId: "b2", agentName: "Builder" }),
];

const availableTeams = [
  { id: "t1", name: "Frontend" },
  { id: "t2", name: "Backend" },
];

const availableAgents = [
  { id: "a1", name: "Coder" },
  { id: "a2", name: "Reviewer" },
  { id: "b1", name: "Architect" },
];

const defaultProps = {
  messages: sampleMessages,
  scope: { type: "all" } as ChatScope,
  onScopeChange: vi.fn(),
  availableTeams,
  availableAgents,
};

// ── Component Tests ────────────────────────────────────────────────────

describe("ScopedChat", () => {
  it("renders with All scope label", () => {
    render(<ScopedChat {...defaultProps} />);
    expect(screen.getByText("All Teams")).toBeInTheDocument();
  });

  it("shows message count", () => {
    render(<ScopedChat {...defaultProps} />);
    expect(screen.getByText(`${sampleMessages.length} messages`)).toBeInTheDocument();
  });

  it("renders scope selector buttons", () => {
    render(<ScopedChat {...defaultProps} />);
    expect(screen.getByText("🌐 All")).toBeInTheDocument();
    expect(screen.getByText("🔔 Important Only")).toBeInTheDocument();
    expect(screen.getByText("👥 Frontend")).toBeInTheDocument();
    expect(screen.getByText("👥 Backend")).toBeInTheDocument();
    expect(screen.getByText("🤖 Coder")).toBeInTheDocument();
    expect(screen.getByText("🤖 Reviewer")).toBeInTheDocument();
    expect(screen.getByText("🤖 Architect")).toBeInTheDocument();
  });

  it("calls onScopeChange when team scope is clicked", () => {
    const onScopeChange = vi.fn();
    render(<ScopedChat {...defaultProps} onScopeChange={onScopeChange} />);

    fireEvent.click(screen.getByText("👥 Frontend"));

    expect(onScopeChange).toHaveBeenCalledWith({
      type: "team",
      teamId: "t1",
      teamName: "Frontend",
    });
  });

  it("calls onScopeChange when agent scope is clicked", () => {
    const onScopeChange = vi.fn();
    render(<ScopedChat {...defaultProps} onScopeChange={onScopeChange} />);

    fireEvent.click(screen.getByText("🤖 Coder"));

    expect(onScopeChange).toHaveBeenCalledWith({
      type: "agent",
      agentId: "a1",
      agentName: "Coder",
    });
  });

  it("calls onScopeChange when All scope is clicked", () => {
    const onScopeChange = vi.fn();
    render(<ScopedChat {...defaultProps} onScopeChange={onScopeChange} />);

    fireEvent.click(screen.getByText("🌐 All"));

    expect(onScopeChange).toHaveBeenCalledWith({ type: "all" });
  });

  it("calls onScopeChange for priority scope", () => {
    const onScopeChange = vi.fn();
    render(<ScopedChat {...defaultProps} onScopeChange={onScopeChange} />);

    fireEvent.click(screen.getByText("🔔 Important Only"));

    expect(onScopeChange).toHaveBeenCalledWith({
      type: "priority",
      minPriority: "review",
    });
  });

  it("renders priority indicators for messages", () => {
    render(<ScopedChat {...defaultProps} />);
    // Critical: 🔴, Info: 🟢, Review: 🟡
    expect(screen.getAllByText("🔴").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("🟢").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("🟡").length).toBeGreaterThanOrEqual(1);
  });

  it("collapses debug messages by default", () => {
    render(<ScopedChat {...defaultProps} />);
    // Debug messages should be collapsed — look for the collapse toggle
    expect(screen.getByText(/1 routine updates/)).toBeInTheDocument();
  });

  it("expands debug messages when clicked", () => {
    render(<ScopedChat {...defaultProps} />);

    fireEvent.click(screen.getByText(/1 routine updates/));

    // After expand, debug messages should show ⚪ indicators
    expect(screen.getAllByText("⚪").length).toBeGreaterThanOrEqual(1);
  });

  it("filters by team scope", () => {
    render(
      <ScopedChat
        {...defaultProps}
        scope={{ type: "team", teamId: "t1", teamName: "Frontend" }}
      />,
    );

    // Should show the team scope label
    expect(screen.getByText("Frontend")).toBeInTheDocument();
  });

  it("filters by agent scope", () => {
    render(
      <ScopedChat
        {...defaultProps}
        scope={{ type: "agent", agentId: "a1", agentName: "Coder" }}
      />,
    );

    // Should show agent scope label — contains @Coder
    expect(screen.getAllByText(/@Coder/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state when no messages match scope", () => {
    render(
      <ScopedChat
        {...defaultProps}
        messages={[]}
      />,
    );
    expect(screen.getByText("No messages in this scope yet")).toBeInTheDocument();
  });

  it("renders send input when onSendMessage is provided", () => {
    const onSendMessage = vi.fn();
    render(
      <ScopedChat {...defaultProps} onSendMessage={onSendMessage} />,
    );

    expect(screen.getByPlaceholderText("Message All Teams...")).toBeInTheDocument();
    expect(screen.getByText("Send")).toBeInTheDocument();
  });

  it("does not render send input when onSendMessage is not provided", () => {
    render(<ScopedChat {...defaultProps} />);
    expect(screen.queryByText("Send")).not.toBeInTheDocument();
  });

  it("sends message on button click", () => {
    const onSendMessage = vi.fn();
    render(
      <ScopedChat {...defaultProps} onSendMessage={onSendMessage} />,
    );

    const input = screen.getByPlaceholderText("Message All Teams...");
    fireEvent.change(input, { target: { value: "Hello team!" } });
    fireEvent.click(screen.getByText("Send"));

    expect(onSendMessage).toHaveBeenCalledWith("Hello team!", { type: "all" });
  });

  it("sends message on Enter key", () => {
    const onSendMessage = vi.fn();
    render(
      <ScopedChat {...defaultProps} onSendMessage={onSendMessage} />,
    );

    const input = screen.getByPlaceholderText("Message All Teams...");
    fireEvent.change(input, { target: { value: "Enter message" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSendMessage).toHaveBeenCalledWith("Enter message", { type: "all" });
  });

  it("clears input after sending", () => {
    const onSendMessage = vi.fn();
    render(
      <ScopedChat {...defaultProps} onSendMessage={onSendMessage} />,
    );

    const input = screen.getByPlaceholderText("Message All Teams...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.click(screen.getByText("Send"));

    expect(input.value).toBe("");
  });

  it("does not send empty messages", () => {
    const onSendMessage = vi.fn();
    render(
      <ScopedChat {...defaultProps} onSendMessage={onSendMessage} />,
    );

    fireEvent.click(screen.getByText("Send"));
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});

// ── useScopedChat Hook Tests ───────────────────────────────────────────

describe("useScopedChat", () => {
  it("starts with empty messages", () => {
    const { result } = renderHook(() => useScopedChat());
    expect(result.current.messages).toEqual([]);
  });

  it("adds message on event", () => {
    const { result } = renderHook(() => useScopedChat());

    act(() => {
      result.current.handleEvent(
        { type: "agent_error", agentId: "a1", agentName: "Coder", error: "fail" } as OrchestrationEvent,
        "team-1",
        "Frontend",
      );
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].priority).toBe("critical");
    expect(result.current.messages[0].teamId).toBe("team-1");
    expect(result.current.messages[0].teamName).toBe("Frontend");
    expect(result.current.messages[0].agentId).toBe("a1");
    expect(result.current.messages[0].agentName).toBe("Coder");
  });

  it("appends new messages (oldest first)", () => {
    const { result } = renderHook(() => useScopedChat());

    act(() => {
      result.current.handleEvent(
        { type: "agent_error", agentId: "a1", agentName: "First", error: "err" } as OrchestrationEvent,
      );
    });

    act(() => {
      result.current.handleEvent(
        { type: "agent_response", agentId: "a2", agentName: "Second", text: "ok" } as OrchestrationEvent,
      );
    });

    // Messages appended in order
    expect(result.current.messages[0].priority).toBe("critical");
    expect(result.current.messages[1].priority).toBe("info");
  });

  it("limits to 500 messages max", () => {
    const { result } = renderHook(() => useScopedChat());

    act(() => {
      for (let i = 0; i < 510; i++) {
        result.current.handleEvent(
          { type: "agent_thinking", agentId: `a${i}`, agentName: `Agent ${i}` } as OrchestrationEvent,
        );
      }
    });

    expect(result.current.messages.length).toBeLessThanOrEqual(500);
  });

  it("clears all messages", () => {
    const { result } = renderHook(() => useScopedChat());

    act(() => {
      result.current.handleEvent(
        { type: "agent_error", agentId: "a1", agentName: "X", error: "err" } as OrchestrationEvent,
      );
    });

    expect(result.current.messages).toHaveLength(1);

    act(() => {
      result.current.clear();
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it("extracts agentId from event", () => {
    const { result } = renderHook(() => useScopedChat());

    act(() => {
      result.current.handleEvent(
        { type: "tool_start", agentId: "a1", agentName: "Coder", tool: "bash", input: "ls" } as OrchestrationEvent,
      );
    });

    expect(result.current.messages[0].agentId).toBe("a1");
  });

  it("classifies priorities correctly", () => {
    const { result } = renderHook(() => useScopedChat());

    const cases: Array<{ event: OrchestrationEvent; expected: EventPriority }> = [
      { event: { type: "agent_error", agentId: "a1", agentName: "X", error: "e" }, expected: "critical" },
      { event: { type: "product_ready", workspacePath: "/o", summary: "d" }, expected: "review" },
      { event: { type: "agent_response", agentId: "a1", agentName: "X", text: "t" }, expected: "info" },
      { event: { type: "agent_thinking", agentId: "a1", agentName: "X" }, expected: "debug" },
    ];

    for (const { event, expected } of cases) {
      act(() => {
        result.current.handleEvent(event);
      });
      const last = result.current.messages[result.current.messages.length - 1];
      expect(last.priority).toBe(expected);
    }
  });
});
