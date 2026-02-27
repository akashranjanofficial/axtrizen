/**
 * ContextHealthBar — Visual context window usage indicator.
 *
 * Shows a colored progress bar with health thresholds:
 *   - Green:  > 50% remaining (Healthy)
 *   - Yellow: 35-50% remaining (Warning)
 *   - Orange: 25-35% remaining (Critical)
 *   - Red:    < 25% remaining (Exhausted)
 *
 * Includes WARNING/CRITICAL banners at appropriate thresholds.
 *
 * Sprint S4 — US-3.1.2: Context Health Bar UI
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, Activity, Cpu, RefreshCw } from "lucide-react";
import {
  getContextHealth,
  type ContextHealthReport,
  type ContextHealthLevel,
} from "../../tauri-api";

interface ContextHealthBarProps {
  agentId: string;
  /** Polling interval in ms (default: 5000) */
  pollInterval?: number;
  /** Compact mode — just the bar, no labels */
  compact?: boolean;
}

const HEALTH_COLORS: Record<ContextHealthLevel, string> = {
  Healthy: "bg-green-500",
  Warning: "bg-yellow-500",
  Critical: "bg-orange-500",
  Exhausted: "bg-red-500",
};

const HEALTH_TEXT_COLORS: Record<ContextHealthLevel, string> = {
  Healthy: "text-green-400",
  Warning: "text-yellow-400",
  Critical: "text-orange-400",
  Exhausted: "text-red-400",
};

const HEALTH_BG_COLORS: Record<ContextHealthLevel, string> = {
  Healthy: "bg-green-500/10",
  Warning: "bg-yellow-500/10",
  Critical: "bg-orange-500/10",
  Exhausted: "bg-red-500/10",
};

export function ContextHealthBar({ agentId, pollInterval = 5000, compact = false }: ContextHealthBarProps) {
  const [health, setHealth] = useState<ContextHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const report = await getContextHealth(agentId);
      setHealth(report);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch context health:", err);
      setError(typeof err === "string" ? err : "Failed to load");
    }
  }, [agentId]);

  useEffect(() => {
    void fetchHealth();
    intervalRef.current = setInterval(fetchHealth, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchHealth, pollInterval]);

  if (error) {
    return compact ? null : (
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Activity className="h-3 w-3" />
        <span>Context: unavailable</span>
      </div>
    );
  }

  if (!health) {
    return compact ? (
      <div className="h-1.5 w-20 rounded-full bg-muted animate-pulse" />
    ) : (
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Activity className="h-3 w-3 animate-pulse" />
        <span>Loading context…</span>
      </div>
    );
  }

  const level = health.health_level;
  const barColor = HEALTH_COLORS[level];
  const textColor = HEALTH_TEXT_COLORS[level];
  const bgColor = HEALTH_BG_COLORS[level];
  const pct = Math.min(100, Math.max(0, health.usage_pct));

  if (compact) {
    return (
      <div
        className="relative h-1.5 w-20 rounded-full bg-muted overflow-hidden"
        title={`Context: ${pct.toFixed(0)}% used (${health.label})`}
      >
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Health bar with label */}
      <div className="flex items-center gap-3">
        <Cpu className={`h-4 w-4 ${textColor}`} />
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-foreground">Context Window</span>
            <span className={`text-xs font-medium ${textColor}`}>
              {pct.toFixed(0)}% used · {health.label}
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out ${barColor}`}
              style={{ width: `${pct}%` }}
            />
            {/* Threshold markers */}
            <div className="absolute inset-y-0 left-[50%] w-px bg-border/50" title="50% warning threshold" />
            <div className="absolute inset-y-0 left-[65%] w-px bg-border/50" title="65% critical threshold" />
            <div className="absolute inset-y-0 left-[75%] w-px bg-border/50" title="75% exhausted threshold" />
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {formatTokens(health.tokens_used)} / {formatTokens(health.tokens_max)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {health.remaining_pct.toFixed(0)}% remaining
            </span>
          </div>
        </div>
      </div>

      {/* Warning banner */}
      {health.should_warn && !health.should_block && (
        <div className={`flex items-center gap-2 p-2 rounded-lg ${bgColor} border border-yellow-500/30`}>
          <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-yellow-400">Context Running Low</p>
            <p className="text-[10px] text-muted-foreground">
              {health.remaining_pct.toFixed(0)}% remaining. Consider summarizing the conversation.
            </p>
          </div>
        </div>
      )}

      {/* Critical banner */}
      {health.should_block && (
        <div className={`flex items-center gap-2 p-2 rounded-lg ${bgColor} border border-red-500/30`}>
          <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-red-400">Context Nearly Exhausted</p>
            <p className="text-[10px] text-muted-foreground">
              Only {health.remaining_pct.toFixed(0)}% remaining. Agent may lose earlier context.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Format token count for display */
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}k`;
  return `${tokens}`;
}
