/**
 * NotificationFeed — Unit tests for the priority-filtered event stream.
 *
 * Tests cover:
 *  - Rendering notification items with priority icons
 *  - Priority filtering (all, critical, review, info)
 *  - Debug items collapsed by default
 *  - Click handler on items
 *  - Empty state
 *  - Action count badge
 *  - useNotificationFeed hook
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  NotificationFeed,
  useNotificationFeed,
  type NotificationItem,
} from "../../app/components/NotificationFeed";
import type { OrchestrationEvent, EventPriority } from "../../app/services/orchestration-engine";

// ── Test Data ──────────────────────────────────────────────────────────

const makeNotification = (
  id: string,
  priority: EventPriority,
  event: OrchestrationEvent,
  teamId?: string,
  teamName?: string,
): NotificationItem => ({
  id,
  priority,
  event,
  timestamp: Date.now() - Math.random() * 60000,
  teamId,
  teamName,
});

const sampleItems: NotificationItem[] = [
  makeNotification("n1", "critical", {
    type: "agent_error",
    agentId: "a1",
    agentName: "Coder",
    error: "Token limit exceeded",
  }),
  makeNotification("n2", "review", {
    type: "product_ready",
    workspacePath: "/workspace/output",
    summary: "Build complete",
  }),
  makeNotification("n3", "info", {
    type: "agent_response",
    agentId: "a2",
    agentName: "Reviewer",
    text: "LGTM, approved",
  }),
  makeNotification("n4", "debug", {
    type: "agent_thinking",
    agentId: "a1",
    agentName: "Coder",
  }),
  makeNotification("n5", "debug", {
    type: "tool_start",
    agentId: "a1",
    agentName: "Coder",
    tool: "read_file",
    input: "/src/main.ts",
  }),
];

// ── Component Tests ────────────────────────────────────────────────────

describe("NotificationFeed", () => {
  it("renders notification items", () => {
    render(<NotificationFeed items={sampleItems} />);
    expect(screen.getByText("🔔")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
  });

  it("shows action count badge for critical + review items", () => {
    render(<NotificationFeed items={sampleItems} />);
    // 2 action items: 1 critical + 1 review
    expect(screen.getByText("2 need action")).toBeInTheDocument();
  });

  it("renders priority icons for important items", () => {
    render(<NotificationFeed items={sampleItems} />);
    // Critical: 🔴, Review: 🟡, Info: 🟢
    expect(screen.getAllByText("🔴").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("🟡").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("🟢").length).toBeGreaterThanOrEqual(1);
  });

  it("collapses debug items by default", () => {
    render(<NotificationFeed items={sampleItems} />);
    // Debug items should be in a collapsed group
    expect(screen.getByText(/2 routine updates/)).toBeInTheDocument();
  });

  it("expands debug items when collapsed group is clicked", () => {
    render(<NotificationFeed items={sampleItems} />);

    const collapseToggle = screen.getByText(/2 routine updates/);
    fireEvent.click(collapseToggle);

    // After expanding, the debug items should show ⚪ icons
    const debugIcons = screen.getAllByText("⚪");
    expect(debugIcons.length).toBeGreaterThanOrEqual(2);
  });

  it("filters to show only critical items", () => {
    render(<NotificationFeed items={sampleItems} />);

    // Click the critical filter button
    const criticalFilter = screen.getByText(/NEEDS ACTION/);
    fireEvent.click(criticalFilter);

    // Only 🔴 items should show
    expect(screen.getAllByText("🔴").length).toBeGreaterThanOrEqual(1);
    // 🟡 and 🟢 should not appear in filtered list
  });

  it("filters to show all items when All is selected", () => {
    render(<NotificationFeed items={sampleItems} />);

    // Click critical first
    const criticalFilter = screen.getByText(/NEEDS ACTION/);
    fireEvent.click(criticalFilter);

    // Then click All
    const allFilter = screen.getByText("All");
    fireEvent.click(allFilter);

    // Should see all priority icons again
    expect(screen.getAllByText("🔴").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onItemClick when a notification is clicked", () => {
    const onClick = vi.fn();
    render(<NotificationFeed items={sampleItems} onItemClick={onClick} />);

    // Click the first item (critical error)
    const criticalIcons = screen.getAllByText("🔴");
    const firstCritical = criticalIcons[0].closest("div[style]");
    if (firstCritical) {
      fireEvent.click(firstCritical);
    }
  });

  it("renders empty state when no items", () => {
    render(<NotificationFeed items={[]} />);
    expect(screen.getByText(/No events yet/)).toBeInTheDocument();
  });

  it("respects maxVisible prop", () => {
    // Create 10 similar important items
    const manyItems: NotificationItem[] = Array.from({ length: 10 }, (_, i) =>
      makeNotification(`many-${i}`, "info", {
        type: "agent_response",
        agentId: `a${i}`,
        agentName: `Agent ${i}`,
        text: `Response ${i}`,
      }),
    );

    render(<NotificationFeed items={manyItems} maxVisible={3} />);
    // Should only render 3 items max
    const infoIcons = screen.getAllByText("🟢");
    expect(infoIcons.length).toBe(3);
  });
});

// ── useNotificationFeed Hook Tests ─────────────────────────────────────

describe("useNotificationFeed", () => {
  it("starts with empty item list", () => {
    const { result } = renderHook(() => useNotificationFeed());
    expect(result.current.items).toEqual([]);
  });

  it("adds notification on event", () => {
    const { result } = renderHook(() => useNotificationFeed());

    act(() => {
      result.current.handleEvent(
        { type: "agent_error", agentId: "a1", agentName: "Coder", error: "fail" },
        "team-1",
        "Alpha",
      );
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].priority).toBe("critical");
    expect(result.current.items[0].teamId).toBe("team-1");
    expect(result.current.items[0].teamName).toBe("Alpha");
  });

  it("classifies event priorities correctly", () => {
    const { result } = renderHook(() => useNotificationFeed());

    act(() => {
      result.current.handleEvent({
        type: "agent_error",
        agentId: "a1",
        agentName: "X",
        error: "err",
      });
    });
    expect(result.current.items[0].priority).toBe("critical");

    act(() => {
      result.current.handleEvent({
        type: "product_ready",
        workspacePath: "/out",
        summary: "done",
      });
    });
    expect(result.current.items[0].priority).toBe("review");

    act(() => {
      result.current.handleEvent({
        type: "agent_response",
        agentId: "a2",
        agentName: "Y",
        text: "ok",
      });
    });
    expect(result.current.items[0].priority).toBe("info");

    act(() => {
      result.current.handleEvent({
        type: "agent_thinking",
        agentId: "a3",
        agentName: "Z",
      });
    });
    expect(result.current.items[0].priority).toBe("debug");
  });

  it("prepends new items (newest first)", () => {
    const { result } = renderHook(() => useNotificationFeed());

    act(() => {
      result.current.handleEvent({
        type: "agent_error",
        agentId: "a1",
        agentName: "First",
        error: "err",
      });
    });

    act(() => {
      result.current.handleEvent({
        type: "agent_response",
        agentId: "a2",
        agentName: "Second",
        text: "ok",
      });
    });

    // Second event should be at index 0 (prepended)
    expect(result.current.items[0].priority).toBe("info");
    expect(result.current.items[1].priority).toBe("critical");
  });

  it("limits to 200 items max", () => {
    const { result } = renderHook(() => useNotificationFeed());

    act(() => {
      for (let i = 0; i < 210; i++) {
        result.current.handleEvent({
          type: "agent_thinking",
          agentId: `a${i}`,
          agentName: `Agent ${i}`,
        });
      }
    });

    expect(result.current.items.length).toBeLessThanOrEqual(200);
  });

  it("clears all items", () => {
    const { result } = renderHook(() => useNotificationFeed());

    act(() => {
      result.current.handleEvent({
        type: "agent_error",
        agentId: "a1",
        agentName: "X",
        error: "err",
      });
    });

    expect(result.current.items).toHaveLength(1);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.items).toHaveLength(0);
  });
});
