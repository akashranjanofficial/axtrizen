/**
 * ScopedChat — Filtered chat view for Mission Control.
 *
 * Instead of a global fire hose, shows messages filtered by:
 * - Team scope (only messages from one team)
 * - Agent scope (1:1 with a specific agent)
 * - Priority scope (only critical/review events)
 *
 * Designed for 30+ agent scenarios where the global chat is unusable.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import type { OrchestrationEvent, EventPriority } from "../services/orchestration-engine";
import { classifyEventPriority } from "../services/orchestration-engine";

// ── Types ──────────────────────────────────────────────────────────────

export type ChatScope =
  | { type: "all" }
  | { type: "team"; teamId: string; teamName: string }
  | { type: "agent"; agentId: string; agentName: string }
  | { type: "priority"; minPriority: EventPriority };

export interface ScopedMessage {
  id: string;
  event: OrchestrationEvent;
  priority: EventPriority;
  timestamp: number;
  teamId?: string;
  teamName?: string;
  agentId?: string;
  agentName?: string;
}

interface ScopedChatProps {
  messages: ScopedMessage[];
  scope: ChatScope;
  onScopeChange: (scope: ChatScope) => void;
  availableTeams: Array<{ id: string; name: string }>;
  availableAgents: Array<{ id: string; name: string }>;
  onSendMessage?: (text: string, scope: ChatScope) => void;
}

// ── Priority Config ────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<EventPriority, { color: string; indicator: string }> = {
  critical: { color: "#fca5a5", indicator: "🔴" },
  review: { color: "#fde68a", indicator: "🟡" },
  info: { color: "#86efac", indicator: "🟢" },
  debug: { color: "#94a3b8", indicator: "⚪" },
};

const PRIORITY_ORDER: Record<EventPriority, number> = {
  critical: 0,
  review: 1,
  info: 2,
  debug: 3,
};

// ── Styles ──────────────────────────────────────────────────────────────

const styles = {
  container: {
    background: "rgba(15, 23, 42, 0.6)",
    backdropFilter: "blur(12px)",
    borderRadius: "16px",
    border: "1px solid rgba(148, 163, 184, 0.1)",
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    minHeight: "400px",
    color: "#e2e8f0",
  } as React.CSSProperties,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px 12px",
    borderBottom: "1px solid rgba(148,163,184,0.08)",
  } as React.CSSProperties,
  title: {
    fontSize: "15px",
    fontWeight: 700,
    color: "#f1f5f9",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  } as React.CSSProperties,
  scopeSelector: {
    display: "flex",
    gap: "4px",
    padding: "8px 16px",
    overflowX: "auto" as const,
    borderBottom: "1px solid rgba(148,163,184,0.06)",
  } as React.CSSProperties,
  scopeBtn: (active: boolean) =>
    ({
      padding: "4px 12px",
      borderRadius: "8px",
      border: active ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(148,163,184,0.12)",
      background: active ? "rgba(139,92,246,0.15)" : "transparent",
      color: active ? "#c4b5fd" : "#94a3b8",
      fontSize: "11px",
      fontWeight: 600,
      cursor: "pointer",
      whiteSpace: "nowrap" as const,
      transition: "all 0.15s ease",
    }) as React.CSSProperties,
  messagesArea: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "12px 16px",
  } as React.CSSProperties,
  message: (priority: EventPriority) =>
    ({
      display: "flex",
      gap: "10px",
      padding: "8px 10px",
      borderRadius: "8px",
      marginBottom: "4px",
      background: priority === "debug" ? "transparent" : `${PRIORITY_STYLES[priority].color}08`,
      borderLeft: `3px solid ${PRIORITY_STYLES[priority].color}40`,
      transition: "all 0.15s ease",
    }) as React.CSSProperties,
  msgIndicator: {
    flexShrink: 0,
    fontSize: "10px",
    marginTop: "3px",
  } as React.CSSProperties,
  msgContent: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  msgHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
  } as React.CSSProperties,
  msgAgent: (color: string) =>
    ({
      fontSize: "12px",
      fontWeight: 700,
      color,
    }) as React.CSSProperties,
  msgTime: {
    fontSize: "10px",
    color: "#475569",
    flexShrink: 0,
  } as React.CSSProperties,
  msgText: {
    fontSize: "12px",
    color: "#cbd5e1",
    lineHeight: 1.4,
    marginTop: "2px",
    wordBreak: "break-word" as const,
  } as React.CSSProperties,
  msgTool: {
    fontSize: "11px",
    color: "#64748b",
    fontFamily: "monospace",
    background: "rgba(148,163,184,0.05)",
    padding: "2px 6px",
    borderRadius: "4px",
    marginTop: "4px",
    display: "inline-block",
  } as React.CSSProperties,
  inputArea: {
    display: "flex",
    gap: "8px",
    padding: "12px 16px",
    borderTop: "1px solid rgba(148,163,184,0.08)",
  } as React.CSSProperties,
  input: {
    flex: 1,
    background: "rgba(30, 41, 59, 0.5)",
    border: "1px solid rgba(148,163,184,0.15)",
    borderRadius: "8px",
    padding: "8px 12px",
    color: "#e2e8f0",
    fontSize: "12px",
    outline: "none",
  } as React.CSSProperties,
  sendBtn: {
    padding: "8px 16px",
    borderRadius: "8px",
    background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
    border: "none",
    color: "white",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s ease",
  } as React.CSSProperties,
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    color: "#64748b",
    gap: "8px",
    fontSize: "13px",
  } as React.CSSProperties,
  collapsedDebug: {
    textAlign: "center" as const,
    color: "#475569",
    fontSize: "11px",
    padding: "4px 0",
    cursor: "pointer",
    borderRadius: "4px",
  } as React.CSSProperties,
};

// ── Helpers ─────────────────────────────────────────────────────────────

function getMessageText(event: OrchestrationEvent): string {
  switch (event.type) {
    case "agent_response":
    case "delegation_result":
    case "summary":
      return event.text;
    case "agent_error":
      return `❌ ${event.error}`;
    case "review_result":
      return `${event.approved ? "✅ Approved" : "🔄 Revision needed"}: ${event.text}`;
    case "revision":
      return `📝 Revision round ${event.round}: ${event.text.slice(0, 200)}...`;
    case "agent_thinking":
      return `Thinking${event.position ? ` (${event.position})` : ""}...`;
    case "tool_start":
      return `Using \`${event.tool}\``;
    case "tool_result":
      return `Tool result: ${event.output.slice(0, 100)}${event.error ? ` [Error: ${event.error}]` : ""}`;
    case "product_ready":
      return `🎉 Product ready at \`${event.workspacePath}\``;
    case "complete":
      return `✅ Orchestration complete (${event.strategy})`;
    case "delegation_start":
      return `📋 Task assigned: ${event.task}`;
    default:
      return event.type;
  }
}

function getAgentName(event: OrchestrationEvent): string {
  if ("agentName" in event) return (event as { agentName: string }).agentName;
  if ("reviewerName" in event) return (event as { reviewerName: string }).reviewerName;
  return "System";
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ── Component ──────────────────────────────────────────────────────────

export function ScopedChat({
  messages,
  scope,
  onScopeChange,
  availableTeams,
  availableAgents,
  onSendMessage,
}: ScopedChatProps) {
  const [inputText, setInputText] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Filter messages based on scope
  const filteredMessages = useMemo(() => {
    let result = messages;
    switch (scope.type) {
      case "team":
        result = result.filter((m) => m.teamId === scope.teamId);
        break;
      case "agent":
        result = result.filter((m) => m.agentId === scope.agentId);
        break;
      case "priority":
        result = result.filter(
          (m) => PRIORITY_ORDER[m.priority] <= PRIORITY_ORDER[scope.minPriority],
        );
        break;
    }
    return result;
  }, [messages, scope]);

  // Separate debug messages
  const importantMessages = filteredMessages.filter((m) => m.priority !== "debug");
  const debugCount = filteredMessages.filter((m) => m.priority === "debug").length;
  const debugMessages = showDebug ? filteredMessages.filter((m) => m.priority === "debug") : [];

  const handleSend = () => {
    if (inputText.trim() && onSendMessage) {
      onSendMessage(inputText.trim(), scope);
      setInputText("");
    }
  };

  const scopeLabel =
    scope.type === "all"
      ? "All Teams"
      : scope.type === "team"
        ? scope.teamName
        : scope.type === "agent"
          ? `@${scope.agentName}`
          : `Priority: ${scope.minPriority}+`;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>
          <span>💬</span> {scopeLabel}
          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 400 }}>
            {filteredMessages.length} messages
          </span>
        </div>
      </div>

      {/* Scope Selector */}
      <div style={styles.scopeSelector}>
        <button
          style={styles.scopeBtn(scope.type === "all")}
          onClick={() => onScopeChange({ type: "all" })}
        >
          🌐 All
        </button>
        <button
          style={styles.scopeBtn(scope.type === "priority")}
          onClick={() => onScopeChange({ type: "priority", minPriority: "review" })}
        >
          🔔 Important Only
        </button>
        {availableTeams.map((team) => (
          <button
            key={team.id}
            style={styles.scopeBtn(scope.type === "team" && scope.teamId === team.id)}
            onClick={() => onScopeChange({ type: "team", teamId: team.id, teamName: team.name })}
          >
            👥 {team.name}
          </button>
        ))}
        {availableAgents.slice(0, 8).map((agent) => (
          <button
            key={agent.id}
            style={styles.scopeBtn(scope.type === "agent" && scope.agentId === agent.id)}
            onClick={() =>
              onScopeChange({ type: "agent", agentId: agent.id, agentName: agent.name })
            }
          >
            🤖 {agent.name}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={styles.messagesArea}>
        {importantMessages.length === 0 && debugCount === 0 ? (
          <div style={styles.emptyState}>
            <span style={{ fontSize: "32px", opacity: 0.5 }}>💬</span>
            <span>No messages in this scope yet</span>
          </div>
        ) : (
          <>
            {importantMessages.map((msg) => {
              const pStyle = PRIORITY_STYLES[msg.priority];
              return (
                <div key={msg.id} style={styles.message(msg.priority)}>
                  <span style={styles.msgIndicator}>{pStyle.indicator}</span>
                  <div style={styles.msgContent}>
                    <div style={styles.msgHeader}>
                      <span style={styles.msgAgent(pStyle.color)}>@{getAgentName(msg.event)}</span>
                      <span style={styles.msgTime}>{formatTime(msg.timestamp)}</span>
                    </div>
                    <div style={styles.msgText}>{getMessageText(msg.event)}</div>
                    {msg.event.type === "tool_start" && (
                      <div style={styles.msgTool}>{msg.event.input.slice(0, 100)}</div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Collapsed debug group */}
            {debugCount > 0 && (
              <div style={styles.collapsedDebug} onClick={() => setShowDebug(!showDebug)}>
                {showDebug ? "▾" : "▸"} {debugCount} routine updates
              </div>
            )}

            {debugMessages.map((msg) => (
              <div key={msg.id} style={styles.message("debug")}>
                <span style={styles.msgIndicator}>⚪</span>
                <div style={styles.msgContent}>
                  <div style={styles.msgHeader}>
                    <span style={styles.msgAgent("#64748b")}>@{getAgentName(msg.event)}</span>
                    <span style={styles.msgTime}>{formatTime(msg.timestamp)}</span>
                  </div>
                  <div style={{ ...styles.msgText, color: "#64748b" }}>
                    {getMessageText(msg.event)}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {onSendMessage && (
        <div style={styles.inputArea}>
          <input
            style={styles.input}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={`Message ${scopeLabel}...`}
          />
          <button style={styles.sendBtn} onClick={handleSend}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}

// ── Hook: Convert orchestration events to ScopedMessages ─────────────

export function useScopedChat() {
  const [messages, setMessages] = useState<ScopedMessage[]>([]);
  let counter = 0;

  const handleEvent = (event: OrchestrationEvent, teamId?: string, teamName?: string) => {
    const priority = classifyEventPriority(event);
    const agentId = "agentId" in event ? (event as { agentId: string }).agentId : undefined;
    const agentName = getAgentName(event);

    const msg: ScopedMessage = {
      id: `scoped-${Date.now()}-${counter++}`,
      event,
      priority,
      timestamp: Date.now(),
      teamId,
      teamName,
      agentId,
      agentName,
    };

    setMessages((prev) => [...prev, msg].slice(-500)); // Keep last 500
  };

  const clear = () => setMessages([]);
  return { messages, handleEvent, clear };
}
