/**
 * NotificationFeed — Priority-filtered event stream for Mission Control.
 *
 * Only shows events that need human attention. Debug-level events
 * are collapsed by default. Critical events get highlighted.
 * Replaces the flat chat fire hose for large-scale orchestration.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import type { OrchestrationEvent, EventPriority } from "../services/orchestration-engine";
import { classifyEventPriority } from "../services/orchestration-engine";

// ── Types ──────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  event: OrchestrationEvent;
  priority: EventPriority;
  timestamp: number;
  teamId?: string;
  teamName?: string;
}

interface NotificationFeedProps {
  items: NotificationItem[];
  onItemClick?: (item: NotificationItem) => void;
  maxVisible?: number;
}

// ── Priority Config ────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<
  EventPriority,
  {
    icon: string;
    color: string;
    bg: string;
    label: string;
    borderColor: string;
  }
> = {
  critical: {
    icon: "🔴",
    color: "#fca5a5",
    bg: "rgba(239, 68, 68, 0.12)",
    label: "NEEDS ACTION",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  review: {
    icon: "🟡",
    color: "#fde68a",
    bg: "rgba(245, 158, 11, 0.12)",
    label: "REVIEW",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  info: {
    icon: "🟢",
    color: "#86efac",
    bg: "rgba(34, 197, 94, 0.08)",
    label: "INFO",
    borderColor: "rgba(34, 197, 94, 0.15)",
  },
  debug: {
    icon: "⚪",
    color: "#94a3b8",
    bg: "rgba(148, 163, 184, 0.05)",
    label: "DEBUG",
    borderColor: "rgba(148, 163, 184, 0.1)",
  },
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
    maxHeight: "600px",
    overflowY: "auto" as const,
  } as React.CSSProperties,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    position: "sticky" as const,
    top: 0,
    background: "rgba(15, 23, 42, 0.95)",
    padding: "4px 0",
    zIndex: 1,
  } as React.CSSProperties,
  title: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#f1f5f9",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  } as React.CSSProperties,
  filterBar: {
    display: "flex",
    gap: "6px",
  } as React.CSSProperties,
  filterBtn: (active: boolean, color: string) =>
    ({
      padding: "3px 10px",
      borderRadius: "10px",
      border: `1px solid ${active ? color : "rgba(148,163,184,0.2)"}`,
      background: active ? `${color}20` : "transparent",
      color: active ? color : "#64748b",
      fontSize: "11px",
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.2s ease",
    }) as React.CSSProperties,
  item: (priority: EventPriority) => {
    const cfg = PRIORITY_CONFIG[priority];
    return {
      display: "flex",
      alignItems: "flex-start",
      gap: "10px",
      padding: "10px 12px",
      borderRadius: "10px",
      background: cfg.bg,
      border: `1px solid ${cfg.borderColor}`,
      marginBottom: "6px",
      cursor: "pointer",
      transition: "all 0.2s ease",
    } as React.CSSProperties;
  },
  itemIcon: {
    fontSize: "14px",
    marginTop: "2px",
    flexShrink: 0,
  } as React.CSSProperties,
  itemContent: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  itemTitle: {
    fontSize: "13px",
    fontWeight: 600,
    marginBottom: "2px",
    lineHeight: 1.3,
  } as React.CSSProperties,
  itemSubtext: {
    fontSize: "11px",
    color: "#94a3b8",
    lineHeight: 1.4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,
  itemTime: {
    fontSize: "10px",
    color: "#64748b",
    flexShrink: 0,
    marginTop: "2px",
  } as React.CSSProperties,
  collapsedGroup: {
    padding: "8px 12px",
    borderRadius: "8px",
    background: "rgba(148,163,184,0.05)",
    border: "1px solid rgba(148,163,184,0.08)",
    color: "#64748b",
    fontSize: "12px",
    cursor: "pointer",
    textAlign: "center" as const,
    margin: "4px 0",
  } as React.CSSProperties,
  actionBadge: {
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: "4px",
    fontSize: "9px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    marginLeft: "6px",
  } as React.CSSProperties,
};

// ── Helpers ─────────────────────────────────────────────────────────────

function getEventTitle(event: OrchestrationEvent): string {
  switch (event.type) {
    case "agent_error":
      return `@${event.agentName} encountered an error`;
    case "product_ready":
      return "🎉 Product ready for review";
    case "review_result":
      return event.approved
        ? `✅ @${event.reviewerName} approved work`
        : `🔄 @${event.reviewerName} requested revision`;
    case "summary":
      return `📋 @${event.agentName} — Final Summary`;
    case "agent_response":
      return `💬 @${event.agentName} responded`;
    case "delegation_result":
      return `📦 @${event.agentName} completed task`;
    case "revision":
      return `🔄 @${event.agentName} revised (round ${event.round})`;
    case "pivot_gate_verdict":
      return `🚦 Pivot Gate: ${event.verdict.type}`;
    case "complete":
      return `✅ Orchestration complete (${event.strategy})`;
    case "agent_thinking":
      return `⚡ @${event.agentName} thinking...`;
    case "tool_start":
      return `🔧 @${event.agentName} using ${event.tool}`;
    case "tool_result":
      return `📎 @${event.agentName} tool result (${event.tool})`;
    default:
      return `Event: ${event.type}`;
  }
}

function getEventSubtext(event: OrchestrationEvent): string {
  switch (event.type) {
    case "agent_error":
      return event.error;
    case "product_ready":
      return event.summary.slice(0, 120) + (event.summary.length > 120 ? "..." : "");
    case "agent_response":
    case "delegation_result":
    case "summary":
      return event.text.slice(0, 120) + (event.text.length > 120 ? "..." : "");
    case "revision":
      return event.text.slice(0, 100) + "...";
    case "review_result":
      return event.text.slice(0, 100) + "...";
    case "tool_start":
      return event.input.slice(0, 80);
    default:
      return "";
  }
}

function formatTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return "now";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

// ── Component ──────────────────────────────────────────────────────────

export function NotificationFeed({ items, onItemClick, maxVisible = 50 }: NotificationFeedProps) {
  const [filter, setFilter] = useState<EventPriority | "all">("all");
  const [showDebug, setShowDebug] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top on new critical/review items
  useEffect(() => {
    if (items.length > 0 && (items[0].priority === "critical" || items[0].priority === "review")) {
      feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [items.length]);

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "all") {
      result = result.filter((item) => item.priority === filter);
    }
    return result;
  }, [items, filter]);

  // Split debug vs non-debug
  const importantItems = filtered.filter((i) => i.priority !== "debug");
  const debugItems = filtered.filter((i) => i.priority === "debug");
  const visibleItems = importantItems.slice(0, maxVisible);

  const actionCount = items.filter(
    (i) => i.priority === "critical" || i.priority === "review",
  ).length;

  return (
    <div style={styles.container} ref={feedRef}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>
          <span>🔔</span> Notifications
          {actionCount > 0 && (
            <span
              style={{
                ...styles.actionBadge,
                background: "rgba(239,68,68,0.2)",
                color: "#fca5a5",
              }}
            >
              {actionCount} need action
            </span>
          )}
        </div>
        <div style={styles.filterBar}>
          {(["all", "critical", "review", "info"] as const).map((f) => {
            const color = f === "all" ? "#8b5cf6" : PRIORITY_CONFIG[f].color;
            return (
              <button
                key={f}
                style={styles.filterBtn(filter === f, color)}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : PRIORITY_CONFIG[f].icon + " " + PRIORITY_CONFIG[f].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Important Items */}
      {visibleItems.map((item) => {
        const cfg = PRIORITY_CONFIG[item.priority];
        return (
          <div key={item.id} style={styles.item(item.priority)} onClick={() => onItemClick?.(item)}>
            <span style={styles.itemIcon}>{cfg.icon}</span>
            <div style={styles.itemContent}>
              <div style={{ ...styles.itemTitle, color: cfg.color }}>
                {getEventTitle(item.event)}
              </div>
              {getEventSubtext(item.event) && (
                <div style={styles.itemSubtext}>{getEventSubtext(item.event)}</div>
              )}
            </div>
            <span style={styles.itemTime}>{formatTimeAgo(item.timestamp)}</span>
          </div>
        );
      })}

      {/* Collapsed Debug Group */}
      {debugItems.length > 0 && filter === "all" && (
        <div style={styles.collapsedGroup} onClick={() => setShowDebug(!showDebug)}>
          {showDebug ? "▾" : "▸"} {debugItems.length} routine updates
          {showDebug ? " (click to collapse)" : " (click to expand)"}
        </div>
      )}

      {showDebug &&
        filter === "all" &&
        debugItems.slice(0, 30).map((item) => (
          <div key={item.id} style={styles.item("debug")} onClick={() => onItemClick?.(item)}>
            <span style={styles.itemIcon}>⚪</span>
            <div style={styles.itemContent}>
              <div style={{ ...styles.itemTitle, color: "#94a3b8" }}>
                {getEventTitle(item.event)}
              </div>
            </div>
            <span style={styles.itemTime}>{formatTimeAgo(item.timestamp)}</span>
          </div>
        ))}

      {items.length === 0 && (
        <div style={{ textAlign: "center", color: "#64748b", padding: "30px", fontSize: "13px" }}>
          No events yet. Start a mission to see notifications here.
        </div>
      )}
    </div>
  );
}

// ── Hook: Convert orchestration events to NotificationItems ──────────

export function useNotificationFeed() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  let counter = 0;

  const handleEvent = (event: OrchestrationEvent, teamId?: string, teamName?: string) => {
    const priority = classifyEventPriority(event);
    const item: NotificationItem = {
      id: `notif-${Date.now()}-${counter++}`,
      event,
      priority,
      timestamp: Date.now(),
      teamId,
      teamName,
    };

    setItems((prev) => [item, ...prev].slice(0, 200)); // Keep last 200
  };

  const clearAll = () => setItems([]);

  return { items, handleEvent, clearAll };
}
