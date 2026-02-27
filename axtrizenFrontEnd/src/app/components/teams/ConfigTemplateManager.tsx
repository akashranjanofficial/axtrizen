import React, { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Lightbulb,
  Play,
  GitBranch,
  Check,
  X,
  Loader2,
  AlertCircle,
  Users,
  Workflow,
  Sparkles,
  TrendingUp,
  DollarSign,
  Zap,
  ArrowUpCircle,
  Shuffle,
} from "lucide-react";
import type {
  TeamTemplate,
  Recommendation,
  RecommendationCategory,
  RecommendationImpact,
} from "../../tauri-api";
import {
  getSampleTemplate,
  applyTemplate,
  createTemplateVersion,
  getSampleRecommendations,
  dismissRecommendation,
  applyRecommendation,
} from "../../tauri-api";

type Tab = "templates" | "recommendations";

const categoryConfig: Record<RecommendationCategory, { icon: React.ReactNode; color: string }> = {
  SkillSwap: { icon: <Shuffle className="w-3 h-3" />, color: "bg-blue-500/15 text-blue-400" },
  ModelUpgrade: { icon: <ArrowUpCircle className="w-3 h-3" />, color: "bg-purple-500/15 text-purple-400" },
  WorkflowOptimization: { icon: <Sparkles className="w-3 h-3" />, color: "bg-amber-500/15 text-amber-400" },
  CostReduction: { icon: <DollarSign className="w-3 h-3" />, color: "bg-green-500/15 text-green-400" },
  PerformanceBoost: { icon: <Zap className="w-3 h-3" />, color: "bg-red-500/15 text-red-400" },
};

const impactColor: Record<RecommendationImpact, string> = {
  High: "bg-red-500/15 text-red-400",
  Medium: "bg-amber-500/15 text-amber-400",
  Low: "bg-green-500/15 text-green-400",
};

export function ConfigTemplateManager() {
  const [tab, setTab] = useState<Tab>("templates");
  const [template, setTemplate] = useState<TeamTemplate | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyStatus, setApplyStatus] = useState<string | null>(null);
  const [versionStatus, setVersionStatus] = useState<string | null>(null);
  const [busyRecId, setBusyRecId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tpl, recs] = await Promise.all([getSampleTemplate(), getSampleRecommendations()]);
      setTemplate(tpl);
      setRecommendations(recs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApplyTemplate = useCallback(async () => {
    if (!template) return;
    setApplyStatus("applying");
    try {
      const changes = await applyTemplate(template);
      setApplyStatus(`Applied ${changes.length} change(s)`);
      setTimeout(() => setApplyStatus(null), 3000);
    } catch {
      setApplyStatus("error");
      setTimeout(() => setApplyStatus(null), 3000);
    }
  }, [template]);

  const handleCreateVersion = useCallback(async () => {
    if (!template) return;
    setVersionStatus("creating");
    try {
      const updated = await createTemplateVersion(template);
      setTemplate(updated);
      setVersionStatus(`v${updated.version} created`);
      setTimeout(() => setVersionStatus(null), 3000);
    } catch {
      setVersionStatus("error");
      setTimeout(() => setVersionStatus(null), 3000);
    }
  }, [template]);

  const handleApplyRec = useCallback(async (rec: Recommendation) => {
    setBusyRecId(rec.id);
    try {
      const updated = await applyRecommendation(rec);
      setRecommendations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } finally {
      setBusyRecId(null);
    }
  }, []);

  const handleDismissRec = useCallback(async (rec: Recommendation) => {
    setBusyRecId(rec.id);
    try {
      const updated = await dismissRecommendation(rec);
      setRecommendations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } finally {
      setBusyRecId(null);
    }
  }, []);

  const active = recommendations.filter((r) => !r.applied && !r.dismissed).length;
  const applied = recommendations.filter((r) => r.applied).length;
  const dismissed = recommendations.filter((r) => r.dismissed).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground" data-testid="config-template-loading">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading configuration…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12 text-red-400 gap-2" data-testid="config-template-error">
        <AlertCircle className="w-5 h-5" /> {error}
        <button onClick={load} className="ml-2 underline text-sm">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="config-template-manager">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border pb-px">
        <button
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t transition-colors ${tab === "templates" ? "bg-card text-foreground border border-b-0 border-border" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setTab("templates")}
          data-testid="tab-templates"
        >
          <FileText className="w-4 h-4" /> Templates
        </button>
        <button
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t transition-colors ${tab === "recommendations" ? "bg-card text-foreground border border-b-0 border-border" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setTab("recommendations")}
          data-testid="tab-recommendations"
        >
          <Lightbulb className="w-4 h-4" /> Recommendations
          {active > 0 && <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{active}</span>}
        </button>
      </div>

      {/* Templates tab */}
      {tab === "templates" && template && (
        <div className="space-y-4" data-testid="templates-panel">
          {/* Header */}
          <div className="bg-card border border-border rounded-lg p-5" data-testid="template-header">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{template.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                {template.created_from_project && (
                  <p className="text-xs text-muted-foreground mt-1">From project: {template.created_from_project}</p>
                )}
              </div>
              <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded" data-testid="template-version">
                v{template.version}
              </span>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleApplyTemplate}
                disabled={applyStatus === "applying"}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors disabled:opacity-50"
                data-testid="apply-template-btn"
              >
                {applyStatus === "applying" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {applyStatus && applyStatus !== "applying" && applyStatus !== "error" ? applyStatus : "Apply Template"}
              </button>
              <button
                onClick={handleCreateVersion}
                disabled={versionStatus === "creating"}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-card border border-border text-foreground rounded hover:bg-primary/5 transition-colors disabled:opacity-50"
                data-testid="create-version-btn"
              >
                {versionStatus === "creating" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
                {versionStatus && versionStatus !== "creating" && versionStatus !== "error" ? versionStatus : "Create New Version"}
              </button>
              {(applyStatus === "error" || versionStatus === "error") && (
                <span className="text-xs text-red-400 self-center">Operation failed</span>
              )}
            </div>
          </div>

          {/* Agents */}
          <div className="bg-card border border-border rounded-lg p-5" data-testid="template-agents">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
              <Users className="w-4 h-4 text-muted-foreground" /> Agents ({template.agents.length})
            </h3>
            <div className="space-y-3">
              {template.agents.map((agent, i) => (
                <div key={i} className="border border-border rounded-md p-3 bg-background/50" data-testid={`agent-card-${i}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm text-foreground">{agent.role}</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{agent.model_profile}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {agent.skills.map((s) => (
                      <span key={s} className="text-xs bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">{s}</span>
                    ))}
                  </div>
                  {agent.permissions.length > 0 && (
                    <p className="text-xs text-muted-foreground">Permissions: {agent.permissions.join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Workflow */}
          <div className="bg-card border border-border rounded-lg p-5" data-testid="template-workflow">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
              <Workflow className="w-4 h-4 text-muted-foreground" /> Workflow
            </h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-1">Phases</p>
                <div className="flex flex-wrap gap-1">
                  {template.workflow.phases.map((p) => (
                    <span key={p} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{p}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Orchestration</p>
                <p className="text-foreground">{template.workflow.orchestration_mode}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Max Concurrent</p>
                <p className="text-foreground">{template.workflow.max_concurrent_agents}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations tab */}
      {tab === "recommendations" && (
        <div className="space-y-4" data-testid="recommendations-panel">
          {/* Filter counts */}
          <div className="flex gap-3 text-xs text-muted-foreground" data-testid="rec-filter-counts">
            <span><TrendingUp className="w-3 h-3 inline mr-1" />Active: {active}</span>
            <span><Check className="w-3 h-3 inline mr-1 text-green-400" />Applied: {applied}</span>
            <span><X className="w-3 h-3 inline mr-1" />Dismissed: {dismissed}</span>
          </div>

          {recommendations.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No recommendations available.</p>
          )}

          <div className="space-y-3">
            {recommendations.map((rec) => {
              const cat = categoryConfig[rec.category];
              const impact = impactColor[rec.impact];
              const busy = busyRecId === rec.id;

              return (
                <div
                  key={rec.id}
                  className={`bg-card border border-border rounded-lg p-4 transition-opacity ${rec.dismissed ? "opacity-60" : ""}`}
                  data-testid={`rec-card-${rec.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${cat.color}`}>
                          {cat.icon} {rec.category}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${impact}`}>{rec.impact}</span>
                      </div>
                      <h4 className={`text-sm font-medium text-foreground ${rec.dismissed ? "line-through" : ""}`}>
                        {rec.applied && <Check className="w-3.5 h-3.5 inline mr-1 text-green-400" />}
                        {rec.title}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">{rec.description}</p>
                    </div>

                    {!rec.applied && !rec.dismissed && (
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => handleApplyRec(rec)}
                          disabled={busy}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-green-500/10 text-green-400 rounded hover:bg-green-500/20 transition-colors disabled:opacity-50"
                          data-testid={`rec-apply-${rec.id}`}
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Apply
                        </button>
                        <button
                          onClick={() => handleDismissRec(rec)}
                          disabled={busy}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-card border border-border text-muted-foreground rounded hover:text-foreground transition-colors disabled:opacity-50"
                          data-testid={`rec-dismiss-${rec.id}`}
                        >
                          <X className="w-3 h-3" /> Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
