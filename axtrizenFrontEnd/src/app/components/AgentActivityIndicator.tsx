"use client";

import React, { useState, useEffect, useRef } from "react";

// ── Agent Activity Indicator ───────────────────────────────────────────
// Shows live status for each agent: Thinking, Writing, Using Tool, Done

export type AgentActivity =
  | { status: "idle" }
  | { status: "thinking" }
  | { status: "writing" }
  | { status: "tool"; toolName: string }
  | { status: "reviewing" }
  | { status: "done" };

interface AgentActivityBadgeProps {
  agentName: string;
  activity: AgentActivity;
  compact?: boolean;
}

const STATUS_CONFIG: Record<
  AgentActivity["status"],
  { icon: string; label: string; color: string; pulse: boolean }
> = {
  idle: { icon: "⚪", label: "Idle", color: "rgba(255, 255, 255, 0.3)", pulse: false },
  thinking: { icon: "💭", label: "Thinking", color: "rgba(139, 92, 246, 0.8)", pulse: true },
  writing: { icon: "✍️", label: "Writing", color: "rgba(59, 130, 246, 0.8)", pulse: true },
  tool: { icon: "🔧", label: "Using Tool", color: "rgba(251, 191, 36, 0.8)", pulse: true },
  reviewing: { icon: "👀", label: "Reviewing", color: "rgba(34, 197, 94, 0.8)", pulse: true },
  done: { icon: "✅", label: "Done", color: "rgba(34, 197, 94, 0.8)", pulse: false },
};

export function AgentActivityBadge({ agentName, activity, compact }: AgentActivityBadgeProps) {
  const config = STATUS_CONFIG[activity.status];
  const toolLabel = activity.status === "tool" ? (activity as { toolName: string }).toolName : "";

  if (compact) {
    return (
      <span
        title={`${agentName}: ${config.label}${toolLabel ? ` (${toolLabel})` : ""}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "11px",
          color: config.color,
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: config.color,
            animation: config.pulse ? "pulse-dot 1.5s ease-in-out infinite" : undefined,
          }}
        />
        {config.icon}
      </span>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 10px",
        borderRadius: "6px",
        background: "rgba(255, 255, 255, 0.03)",
        border: `1px solid ${config.color.replace("0.8", "0.15")}`,
        fontSize: "12px",
        transition: "all 0.3s ease",
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: config.color,
          animation: config.pulse ? "pulse-dot 1.5s ease-in-out infinite" : undefined,
          flexShrink: 0,
        }}
      />
      <span style={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.8)" }}>{agentName}</span>
      <span style={{ color: config.color }}>
        {config.icon} {config.label}
        {toolLabel && (
          <span style={{ fontFamily: "monospace", marginLeft: "4px", opacity: 0.7 }}>
            {toolLabel}
          </span>
        )}
      </span>
    </div>
  );
}

// ── Activity Bar — Shows all agents in a horizontal strip ──────────────

interface ActivityBarProps {
  agents: Array<{ id: string; name: string; activity: AgentActivity }>;
}

export function ActivityBar({ agents }: ActivityBarProps) {
  const activeAgents = agents.filter((a) => a.activity.status !== "idle");

  if (activeAgents.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        padding: "8px 16px",
        overflowX: "auto",
        borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
        background: "rgba(255, 255, 255, 0.02)",
      }}
    >
      {activeAgents.map((agent) => (
        <AgentActivityBadge key={agent.id} agentName={agent.name} activity={agent.activity} />
      ))}
    </div>
  );
}

// ── Activity Tracker Hook — manages agent states from orchestration events

export type ActivityEvent =
  | { type: "agent_thinking"; agentId: string; agentName: string }
  | { type: "agent_response"; agentId: string; agentName: string }
  | { type: "tool_start"; agentId: string; agentName: string; tool: string }
  | { type: "tool_result"; agentId: string; agentName: string }
  | { type: "text_delta"; agentId: string; agentName: string }
  | { type: "review_thinking"; agentId: string; agentName: string }
  | { type: "complete" };

export function useAgentActivity() {
  const [activities, setActivities] = useState<
    Map<string, { name: string; activity: AgentActivity }>
  >(new Map());
  const clearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const updateActivity = (agentId: string, agentName: string, activity: AgentActivity) => {
    // Clear any pending auto-clear timer
    const existing = clearTimers.current.get(agentId);
    if (existing) clearTimeout(existing);

    setActivities((prev) => {
      const next = new Map(prev);
      next.set(agentId, { name: agentName, activity });
      return next;
    });

    // Auto-clear to "done" after 5s of inactivity for active states
    if (activity.status !== "idle" && activity.status !== "done") {
      const timer = setTimeout(() => {
        setActivities((prev) => {
          const next = new Map(prev);
          const current = next.get(agentId);
          if (current && current.activity.status !== "idle") {
            next.set(agentId, { ...current, activity: { status: "done" } });
          }
          return next;
        });
      }, 5000);
      clearTimers.current.set(agentId, timer);
    }
  };

  const handleEvent = (event: ActivityEvent) => {
    switch (event.type) {
      case "agent_thinking":
        updateActivity(event.agentId, event.agentName, { status: "thinking" });
        break;
      case "text_delta":
        updateActivity(event.agentId, event.agentName, { status: "writing" });
        break;
      case "tool_start":
        updateActivity(event.agentId, event.agentName, { status: "tool", toolName: event.tool });
        break;
      case "tool_result":
      case "agent_response":
        updateActivity(event.agentId, event.agentName, { status: "done" });
        break;
      case "review_thinking":
        updateActivity(event.agentId, event.agentName, { status: "reviewing" });
        break;
      case "complete":
        setActivities(new Map());
        break;
    }
  };

  const agentList = Array.from(activities.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    activity: data.activity,
  }));

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of clearTimers.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return { agentList, handleEvent };
}

// ── CSS Keyframes (inject once) ────────────────────────────────────────

if (typeof document !== "undefined") {
  const styleId = "agent-activity-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes pulse-dot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.3); }
      }
    `;
    document.head.appendChild(style);
  }
}
