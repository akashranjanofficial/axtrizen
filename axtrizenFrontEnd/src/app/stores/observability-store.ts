/**
 * Observability Store — Enterprise agent metrics with caching.
 *
 * Architecture:
 *   - Fetches metrics lazily per agent (not all at once)
 *   - Caches with 30s TTL for fast re-renders
 *   - Supports manual refresh
 *   - Event-driven updates for React subscribers
 */

import {
  getAgentUsage,
  getAgentSessionStats,
  getAgentActivity,
  getAgentToolCalls,
  type AgentUsageData,
  type AgentSessionStats,
  type ActivityEntry,
  type ToolCallEntry,
} from "../tauri-api";

// ── Types ──────────────────────────────────────────────────────────────

export interface AgentMetrics {
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  costUsd: number;
  contextPct: number;
  contextMaxTokens: number;
  messageCount: number;
  recentTools: ToolCallEntry[];
  recentActivity: ActivityEntry[];
  lastUpdated: number; // Unix ms
  loading: boolean;
  error: string | null;
}

const EMPTY_METRICS: AgentMetrics = {
  tokensIn: 0,
  tokensOut: 0,
  totalTokens: 0,
  costUsd: 0,
  contextPct: 0,
  contextMaxTokens: 128_000,
  messageCount: 0,
  recentTools: [],
  recentActivity: [],
  lastUpdated: 0,
  loading: false,
  error: null,
};

const CACHE_TTL_MS = 30_000; // 30 seconds

type Listener = () => void;

// ── Store Class ────────────────────────────────────────────────────────

class ObservabilityStore {
  private cache = new Map<string, AgentMetrics>();
  private listeners = new Set<Listener>();
  private inflight = new Set<string>(); // prevent duplicate fetches

  /** Get cached metrics for an agent (returns empty if not fetched yet) */
  getMetrics(agentId: string): AgentMetrics {
    return this.cache.get(agentId) || { ...EMPTY_METRICS };
  }

  /** Check if cached data is still fresh */
  isFresh(agentId: string): boolean {
    const cached = this.cache.get(agentId);
    if (!cached || !cached.lastUpdated) return false;
    return Date.now() - cached.lastUpdated < CACHE_TTL_MS;
  }

  /** Fetch metrics for a single agent. Deduplicates concurrent requests. */
  async fetchMetrics(agentId: string, force = false): Promise<AgentMetrics> {
    // Return cache if fresh and not forced
    if (!force && this.isFresh(agentId)) {
      return this.getMetrics(agentId);
    }

    // Prevent duplicate in-flight requests
    if (this.inflight.has(agentId)) {
      return this.getMetrics(agentId);
    }

    this.inflight.add(agentId);

    // Set loading state
    this.updateCache(agentId, { loading: true, error: null });

    try {
      // Fetch all data in parallel
      const [usage, sessionStats, tools, activity] = await Promise.allSettled([
        getAgentUsage(agentId),
        getAgentSessionStats(agentId),
        getAgentToolCalls(agentId, 10),
        getAgentActivity(agentId, 20),
      ]);

      const usageData: AgentUsageData =
        usage.status === "fulfilled"
          ? usage.value
          : {
              tokens_in: 0,
              tokens_out: 0,
              total_tokens: 0,
              cost_usd: 0,
              model: null,
              last_updated: null,
            };

      const statsData: AgentSessionStats =
        sessionStats.status === "fulfilled"
          ? sessionStats.value
          : { message_count: 0, context_pct: 0, context_max_tokens: 128_000 };

      const toolsData: ToolCallEntry[] = tools.status === "fulfilled" ? tools.value : [];

      const activityData: ActivityEntry[] = activity.status === "fulfilled" ? activity.value : [];

      const metrics: AgentMetrics = {
        tokensIn: usageData.tokens_in,
        tokensOut: usageData.tokens_out,
        totalTokens: usageData.total_tokens,
        costUsd: usageData.cost_usd,
        contextPct: statsData.context_pct,
        contextMaxTokens: statsData.context_max_tokens,
        messageCount: statsData.message_count,
        recentTools: toolsData,
        recentActivity: activityData,
        lastUpdated: Date.now(),
        loading: false,
        error: null,
      };

      this.cache.set(agentId, metrics);
      this.notify();
      return metrics;
    } catch (err: any) {
      const errorMsg = typeof err === "string" ? err : err?.message || "Failed to fetch metrics";
      this.updateCache(agentId, { loading: false, error: errorMsg });
      return this.getMetrics(agentId);
    } finally {
      this.inflight.delete(agentId);
    }
  }

  /** Invalidate cache for a single agent */
  invalidate(agentId: string) {
    this.cache.delete(agentId);
    this.notify();
  }

  /** Invalidate all cached metrics */
  invalidateAll() {
    this.cache.clear();
    this.notify();
  }

  /** Subscribe to changes */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ── Internal ────────────────────────────────────────────────────────

  private updateCache(agentId: string, partial: Partial<AgentMetrics>) {
    const current = this.cache.get(agentId) || { ...EMPTY_METRICS };
    this.cache.set(agentId, { ...current, ...partial });
    this.notify();
  }

  private notify() {
    for (const fn of this.listeners) {
      fn();
    }
  }
}

// ── Singleton Export ──────────────────────────────────────────────────

export const observabilityStore = new ObservabilityStore();
