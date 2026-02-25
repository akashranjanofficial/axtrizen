/**
 * useAgentMetrics — React hook for agent observability data.
 *
 * Lazily fetches metrics for the selected agent with:
 *   - Automatic cache-first loading
 *   - 30s background refresh
 *   - Manual refresh support
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { observabilityStore, type AgentMetrics } from "../stores/observability-store";

interface UseAgentMetricsResult {
  metrics: AgentMetrics | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAgentMetrics(agentId: string | undefined): UseAgentMetricsResult {
  const [, forceUpdate] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to store changes
  useEffect(() => {
    const unsub = observabilityStore.subscribe(() => {
      forceUpdate((n) => n + 1);
    });
    return unsub;
  }, []);

  // Fetch on mount and when agentId changes
  useEffect(() => {
    if (!agentId) {
      return;
    }

    // Initial fetch
    observabilityStore.fetchMetrics(agentId);

    // Auto-refresh every 30s
    intervalRef.current = setInterval(() => {
      observabilityStore.fetchMetrics(agentId, true);
    }, 30_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [agentId]);

  const refresh = useCallback(() => {
    if (agentId) {
      observabilityStore.fetchMetrics(agentId, true);
    }
  }, [agentId]);

  if (!agentId) {
    return { metrics: null, loading: false, error: null, refresh: () => {} };
  }

  const metrics = observabilityStore.getMetrics(agentId);

  return {
    metrics,
    loading: metrics.loading,
    error: metrics.error,
    refresh,
  };
}
