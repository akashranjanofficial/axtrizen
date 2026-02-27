import { useState, useEffect, useCallback } from "react";
import {
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type {
  AgentScorecard as AgentScorecardData,
  ScoreWeights,
  SkillEffectiveness,
  ScoreTrend,
} from "../../tauri-api";
import {
  getSampleScorecard,
  getScoreWeights,
  getSkillEffectivenessReport,
} from "../../tauri-api";

const TREND_CONFIG: Record<ScoreTrend, { icon: typeof TrendingUp; color: string; bg: string }> = {
  Improving: { icon: TrendingUp, color: "text-green-500", bg: "bg-green-500/10 text-green-500" },
  Stable: { icon: Minus, color: "text-yellow-500", bg: "bg-yellow-500/10 text-yellow-500" },
  Declining: { icon: TrendingDown, color: "text-red-500", bg: "bg-red-500/10 text-red-500" },
};

const SUB_SCORE_LABELS: { key: string; label: string; color: string }[] = [
  { key: "completion_score", label: "Completion", color: "bg-blue-500" },
  { key: "gate_pass_score", label: "Gate Pass", color: "bg-emerald-500" },
  { key: "cost_efficiency_score", label: "Cost Efficiency", color: "bg-violet-500" },
  { key: "latency_score", label: "Latency", color: "bg-amber-500" },
];

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5" data-testid="star-rating">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={18}
          className={i < rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}
        />
      ))}
    </span>
  );
}

function TrendBadge({ trend }: { trend: ScoreTrend }) {
  const cfg = TREND_CONFIG[trend];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg}`}
      data-testid="trend-badge"
    >
      <Icon size={14} />
      {trend}
    </span>
  );
}

function ProgressBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div className="space-y-1" data-testid={`subscore-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function AgentScorecard() {
  const [scorecard, setScorecard] = useState<AgentScorecardData | null>(null);
  const [weights, setWeights] = useState<ScoreWeights | null>(null);
  const [skills, setSkills] = useState<SkillEffectiveness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sc, w, sk] = await Promise.all([
        getSampleScorecard(),
        getScoreWeights(),
        getSkillEffectivenessReport(),
      ]);
      setScorecard(sc);
      setWeights(w);
      setSkills(sk);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scorecard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12" data-testid="scorecard-loading">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-12 text-center" data-testid="scorecard-error">
        <AlertTriangle className="h-8 w-8 text-red-500" />
        <p className="text-sm text-red-500">{error}</p>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-primary/20 transition"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (!scorecard) return null;

  const { current, history, trend } = scorecard;

  return (
    <div className="space-y-6" data-testid="agent-scorecard">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-6" data-testid="scorecard-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-foreground">{current.agent_name}</h2>
            <div className="flex items-center gap-3">
              <StarRating rating={current.star_rating} />
              <TrendBadge trend={trend} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold text-foreground" data-testid="composite-score">
              {current.composite_score.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">Composite Score</p>
          </div>
        </div>
      </div>

      {/* Sub-scores + Weights */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6" data-testid="sub-scores">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Score Breakdown
          </h3>
          <div className="space-y-4">
            {SUB_SCORE_LABELS.map(({ key, label, color }) => (
              <ProgressBar
                key={key}
                value={(current as unknown as Record<string, number>)[key]}
                color={color}
                label={label}
              />
            ))}
          </div>
        </div>

        {weights && (
          <div className="rounded-xl border border-border bg-card p-6" data-testid="score-weights">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Score Weights
            </h3>
            <ul className="space-y-3">
              {(
                [
                  ["Completion", weights.completion],
                  ["Gate Pass", weights.gate_pass],
                  ["Cost Efficiency", weights.cost_efficiency],
                  ["Latency", weights.latency],
                ] as const
              ).map(([label, value]) => (
                <li key={label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-foreground">
                    {(value * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Historical Scores */}
      {history.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6" data-testid="historical-scores">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Historical Scores
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Project</th>
                  <th className="pb-2 pr-4 font-medium">Score</th>
                  <th className="pb-2 pr-4 font-medium">Stars</th>
                  <th className="pb-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.project_id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4 text-foreground">{h.project_name}</td>
                    <td className="py-2 pr-4 font-medium text-foreground">
                      {h.composite_score.toFixed(1)}
                    </td>
                    <td className="py-2 pr-4">
                      <StarRating rating={h.star_rating} />
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(h.timestamp).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Skill Effectiveness */}
      {skills.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6" data-testid="skill-effectiveness">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Skill Effectiveness
          </h3>
          <div className="space-y-3">
            {skills.map((skill) => (
              <div
                key={skill.skill_id}
                className={`rounded-lg border p-4 transition ${
                  skill.is_underperforming
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-border bg-card"
                }`}
                data-testid={`skill-${skill.skill_id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {skill.is_underperforming && (
                      <AlertTriangle size={16} className="text-red-500" data-testid="underperforming-icon" />
                    )}
                    <span className="font-medium text-foreground">{skill.skill_name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      {skill.invocation_count} invocations
                    </span>
                    <span
                      className={`font-semibold ${
                        skill.effectiveness_pct >= 70
                          ? "text-green-500"
                          : skill.effectiveness_pct >= 40
                            ? "text-yellow-500"
                            : "text-red-500"
                      }`}
                    >
                      {skill.effectiveness_pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                {/* Effectiveness bar */}
                <div className="mt-2 h-1.5 w-full rounded-full bg-border">
                  <div
                    className={`h-full rounded-full transition-all ${
                      skill.effectiveness_pct >= 70
                        ? "bg-green-500"
                        : skill.effectiveness_pct >= 40
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(skill.effectiveness_pct, 100)}%` }}
                  />
                </div>
                {skill.alternatives.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Alternatives:{" "}
                    <span className="font-medium text-foreground">
                      {skill.alternatives.join(", ")}
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
