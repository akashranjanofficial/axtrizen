/**
 * SmartProjectSetupWizard — AI-suggested team composition for projects.
 *
 * Sprint S5 — US-5.1.1, US-5.1.2
 *
 * Flow:
 *   1. User enters project description
 *   2. AI analyzes → suggests agents (roles, models, skills)
 *   3. User can adjust: add/remove agents, change models, swap existing agents
 *   4. Cost estimation updates in real-time
 *   5. User confirms → creates project + agents
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles,
  Users,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Loader2,
  AlertTriangle,
  Check,
  RefreshCw,
  Cpu,
  Zap,
} from "lucide-react";
import {
  suggestTeamForProject,
  getModelPricing,
  recalculateTeamCost,
  type TeamSuggestion,
  type SuggestedAgent,
  type CostEstimate,
  type ModelPricing,
} from "../../tauri-api";

interface SmartProjectSetupWizardProps {
  description: string;
  existingAgents?: { id: string; name: string; role: string }[];
  onTeamConfirmed?: (agents: SuggestedAgent[]) => void;
}

export function SmartProjectSetupWizard({
  description,
  existingAgents = [],
  onTeamConfirmed,
}: SmartProjectSetupWizardProps) {
  // ── State ──────────────────────────────────────────────────────

  const [suggestion, setSuggestion] = useState<TeamSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelPricing[]>([]);
  const [editingAgents, setEditingAgents] = useState<SuggestedAgent[]>([]);
  const [costEstimates, setCostEstimates] = useState<CostEstimate[]>([]);
  const [totalLow, setTotalLow] = useState(0);
  const [totalMid, setTotalMid] = useState(0);
  const [totalHigh, setTotalHigh] = useState(0);
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);
  const [swappedAgents, setSwappedAgents] = useState<Map<number, string>>(new Map());
  const lastDescRef = useRef("");

  // ── Effects ────────────────────────────────────────────────────

  useEffect(() => {
    void loadModels();
  }, []);

  useEffect(() => {
    if (description.trim().length > 10 && description !== lastDescRef.current) {
      lastDescRef.current = description;
      void analyzDescription(description);
    }
  }, [description]);

  // ── Loaders ────────────────────────────────────────────────────

  async function loadModels() {
    try {
      const m = await getModelPricing();
      setModels(m);
    } catch {
      // Silently use empty models — costs will show "Unknown"
    }
  }

  async function analyzDescription(desc: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await suggestTeamForProject(desc);
      setSuggestion(result);
      setEditingAgents([...result.suggested_agents]);
      setCostEstimates([...result.cost_estimates]);
      setTotalLow(result.total_cost_low);
      setTotalMid(result.total_cost_mid);
      setTotalHigh(result.total_cost_high);
      setSwappedAgents(new Map());
    } catch (err: any) {
      setError(typeof err === "string" ? err : err?.message ?? "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Actions ────────────────────────────────────────────────────

  async function recalcCosts(agents: SuggestedAgent[]) {
    try {
      const [estimates, low, mid, high] = await recalculateTeamCost(agents);
      setCostEstimates(estimates);
      setTotalLow(low);
      setTotalMid(mid);
      setTotalHigh(high);
    } catch {
      // Keep existing estimates
    }
  }

  function handleChangeModel(index: number, modelId: string) {
    const updated = [...editingAgents];
    updated[index] = { ...updated[index], suggested_model: modelId };
    setEditingAgents(updated);
    void recalcCosts(updated);
  }

  function handleRemoveAgent(index: number) {
    const updated = editingAgents.filter((_, i) => i !== index);
    setEditingAgents(updated);
    void recalcCosts(updated);
  }

  function handleAddAgent() {
    const newAgent: SuggestedAgent = {
      role: "Custom Agent",
      suggested_model: "claude-sonnet-4-20250514",
      agent_type: "worker",
      skill_categories: [],
      recommended_skills: [],
      confidence: 1.0,
      estimated_tokens: 500_000,
    };
    const updated = [...editingAgents, newAgent];
    setEditingAgents(updated);
    void recalcCosts(updated);
  }

  function handleSwapExisting(index: number, agentId: string) {
    const next = new Map(swappedAgents);
    if (agentId) {
      next.set(index, agentId);
    } else {
      next.delete(index);
    }
    setSwappedAgents(next);
  }

  function handleChangeRole(index: number, role: string) {
    const updated = [...editingAgents];
    updated[index] = { ...updated[index], role };
    setEditingAgents(updated);
  }

  function handleConfirm() {
    onTeamConfirmed?.(editingAgents);
  }

  function formatCost(cost: number): string {
    if (cost < 0.01) return "<$0.01";
    if (cost < 1) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(2)}`;
  }

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return String(n);
  }

  // ── Render ─────────────────────────────────────────────────────

  if (!description.trim() || description.trim().length <= 10) {
    return null; // Don't show until description is meaningful
  }

  if (loading) {
    return (
      <div className="p-4 rounded-xl border border-border bg-card/50 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Analyzing project description…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5">
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4" />
          <span>{error}</span>
        </div>
        <button
          onClick={() => void analyzDescription(description)}
          className="mt-2 text-xs text-primary hover:underline"
        >
          Retry analysis
        </button>
      </div>
    );
  }

  if (!suggestion || editingAgents.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">AI Team Suggestion</span>
        </div>
        <button
          onClick={() => void analyzDescription(description)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Re-analyze
        </button>
      </div>

      {/* Cost Summary */}
      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Estimated Cost</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Low</p>
            <p className="text-sm font-mono text-muted-foreground">{formatCost(totalLow)}</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-[10px] text-primary font-medium">Estimate</p>
            <p className="text-lg font-mono font-bold text-primary">{formatCost(totalMid)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">High</p>
            <p className="text-sm font-mono text-muted-foreground">{formatCost(totalHigh)}</p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 text-center">
          ±30% range • {formatTokens(suggestion.total_estimated_tokens)} estimated tokens
        </p>
      </div>

      {/* Agent List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-foreground" />
            <span className="text-sm font-medium text-foreground">
              Suggested Team ({editingAgents.length} agents)
            </span>
          </div>
          <button
            onClick={handleAddAgent}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add Agent
          </button>
        </div>

        {editingAgents.map((agent, idx) => {
          const cost = costEstimates[idx];
          const isExpanded = expandedAgent === idx;
          const swappedId = swappedAgents.get(idx);
          const swappedExisting = existingAgents.find((a) => a.id === swappedId);

          return (
            <div
              key={idx}
              className="rounded-lg border border-border bg-muted/30 overflow-hidden"
            >
              {/* Agent row */}
              <div className="flex items-center gap-3 p-3">
                <button
                  onClick={() => setExpandedAgent(isExpanded ? null : idx)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4" />
                    : <ChevronRight className="h-4 w-4" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {swappedExisting ? (
                      <span className="text-sm font-medium text-green-400">
                        {swappedExisting.name}
                        <span className="text-[10px] text-muted-foreground ml-1">(existing)</span>
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={agent.role}
                        onChange={(e) => handleChangeRole(idx, e.target.value)}
                        className="text-sm font-medium text-foreground bg-transparent border-none focus:outline-none focus:ring-0 p-0 w-full"
                      />
                    )}
                    <span className="px-1.5 py-0.5 text-[9px] rounded bg-muted text-muted-foreground flex-shrink-0">
                      {agent.agent_type}
                    </span>
                    {agent.confidence >= 0.5 && (
                      <span className="px-1.5 py-0.5 text-[9px] rounded bg-green-500/10 text-green-400 flex-shrink-0">
                        {Math.round(agent.confidence * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Cpu className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">
                      {models.find((m) => m.model_id === agent.suggested_model)?.display_name ?? agent.suggested_model}
                    </span>
                    {cost && (
                      <>
                        <span className="text-[11px] text-muted-foreground">•</span>
                        <span className="text-[11px] font-mono text-primary">
                          {formatCost(cost.total_cost)}
                        </span>
                      </>
                    )}
                    <span className="text-[11px] text-muted-foreground">•</span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatTokens(agent.estimated_tokens)} tokens
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleRemoveAgent(idx)}
                  className="p-1 rounded text-muted-foreground hover:text-red-400 transition-colors"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-border p-3 bg-muted/20 space-y-3">
                  {/* Model selector */}
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Model</label>
                    <select
                      value={agent.suggested_model}
                      onChange={(e) => handleChangeModel(idx, e.target.value)}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                    >
                      {models.map((m) => (
                        <option key={m.model_id} value={m.model_id}>
                          {m.display_name} ({m.provider}) — ${m.input_cost_per_m}/${m.output_cost_per_m} per 1M tokens
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Use existing agent dropdown */}
                  {existingAgents.length > 0 && (
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                        Use Existing Agent
                      </label>
                      <select
                        value={swappedId ?? ""}
                        onChange={(e) => handleSwapExisting(idx, e.target.value)}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                      >
                        <option value="">Create new agent</option>
                        {existingAgents.map((ea) => (
                          <option key={ea.id} value={ea.id}>
                            {ea.name} — {ea.role}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Skill categories */}
                  {agent.skill_categories.length > 0 && (
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                        Skill Categories
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {agent.skill_categories.map((cat) => (
                          <span
                            key={cat}
                            className="px-2 py-0.5 text-[10px] rounded-full bg-primary/10 text-primary"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cost breakdown */}
                  {cost && (
                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      <p>Input: {formatTokens(Math.round(agent.estimated_tokens * 0.6))} × ${cost.input_cost > 0 ? (cost.input_cost / (agent.estimated_tokens * 0.6 / 1_000_000)).toFixed(2) : "?"}/1M = {formatCost(cost.input_cost)}</p>
                      <p>Output: {formatTokens(Math.round(agent.estimated_tokens * 0.4))} × ${cost.output_cost > 0 ? (cost.output_cost / (agent.estimated_tokens * 0.4 / 1_000_000)).toFixed(2) : "?"}/1M = {formatCost(cost.output_cost)}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirm button */}
      {onTeamConfirmed && (
        <button
          onClick={handleConfirm}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
        >
          <Check className="h-4 w-4" />
          Confirm Team ({editingAgents.length} agents • {formatCost(totalMid)})
        </button>
      )}
    </div>
  );
}
