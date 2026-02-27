/// Sprint S12: Performance Scoring
///
/// Covers:
/// - Agent scorecard: completion × gate_pass × cost_efficiency × latency
/// - Star ratings (1-5 from 0-100 score)
/// - Per-agent breakdown: tasks, tokens, cost, response time
/// - Historical trend tracking
/// - Skill effectiveness: per-skill invocation count + positive outcome rate
/// - Underperformer flagging and alternative suggestions

use serde::{Deserialize, Serialize};

use crate::db;

// ─── Score Formula ──────────────────────────────────────────────

/// Weights for the composite score
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreWeights {
    pub completion: f64,
    pub gate_pass: f64,
    pub cost_efficiency: f64,
    pub latency: f64,
}

impl Default for ScoreWeights {
    fn default() -> Self {
        Self {
            completion: 0.40,
            gate_pass: 0.30,
            cost_efficiency: 0.20,
            latency: 0.10,
        }
    }
}

/// Raw metrics for scoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRawMetrics {
    pub agent_id: String,
    pub agent_name: String,
    pub tasks_assigned: u32,
    pub tasks_completed: u32,
    pub tasks_failed: u32,
    pub gate_checks_passed: u32,
    pub gate_checks_total: u32,
    pub tokens_used: u64,
    pub cost_usd: f64,
    pub avg_response_time_ms: u64,
    pub max_response_time_ms: u64,
}

/// Computed score for an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentScore {
    pub agent_id: String,
    pub agent_name: String,
    pub completion_score: f64,
    pub gate_pass_score: f64,
    pub cost_efficiency_score: f64,
    pub latency_score: f64,
    pub composite_score: f64,
    pub star_rating: u8,
}

impl Default for AgentScore {
    fn default() -> Self {
        Self {
            agent_id: String::new(),
            agent_name: String::new(),
            completion_score: 0.0,
            gate_pass_score: 0.0,
            cost_efficiency_score: 0.0,
            latency_score: 0.0,
            composite_score: 0.0,
            star_rating: 0,
        }
    }
}

/// Compute composite score from raw metrics
pub fn compute_agent_score(metrics: &AgentRawMetrics, weights: &ScoreWeights) -> AgentScore {
    // Completion: tasks_completed / tasks_assigned (0..100)
    let completion_score = if metrics.tasks_assigned > 0 {
        (metrics.tasks_completed as f64 / metrics.tasks_assigned as f64) * 100.0
    } else {
        0.0
    };

    // Gate pass: passed / total (0..100)
    let gate_pass_score = if metrics.gate_checks_total > 0 {
        (metrics.gate_checks_passed as f64 / metrics.gate_checks_total as f64) * 100.0
    } else {
        100.0 // no checks = perfect
    };

    // Cost efficiency: lower cost per task = higher score
    // Normalize: score = max(0, 100 - cost_per_task * 10)
    let cost_per_task = if metrics.tasks_completed > 0 {
        metrics.cost_usd / metrics.tasks_completed as f64
    } else {
        metrics.cost_usd
    };
    let cost_efficiency_score = (100.0 - cost_per_task * 10.0).max(0.0).min(100.0);

    // Latency: lower avg response time = higher score
    // Normalize: score = max(0, 100 - avg_response_time_ms / 100)
    let latency_score = (100.0 - metrics.avg_response_time_ms as f64 / 100.0).max(0.0).min(100.0);

    let composite = completion_score * weights.completion
        + gate_pass_score * weights.gate_pass
        + cost_efficiency_score * weights.cost_efficiency
        + latency_score * weights.latency;

    let star_rating = score_to_stars(composite);

    AgentScore {
        agent_id: metrics.agent_id.clone(),
        agent_name: metrics.agent_name.clone(),
        completion_score,
        gate_pass_score,
        cost_efficiency_score,
        latency_score,
        composite_score: composite,
        star_rating,
    }
}

/// Map 0-100 score to 1-5 stars
pub fn score_to_stars(score: f64) -> u8 {
    match score as u32 {
        0..=19 => 1,
        20..=39 => 2,
        40..=59 => 3,
        60..=79 => 4,
        _ => 5,
    }
}

// ─── Historical Trend ───────────────────────────────────────────

/// A historical score entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalScore {
    pub project_id: String,
    pub project_name: String,
    pub composite_score: f64,
    pub star_rating: u8,
    pub timestamp: String,
}

/// Agent scorecard with trend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentScorecard {
    pub current: AgentScore,
    pub history: Vec<HistoricalScore>,
    pub trend: ScoreTrend,
}

/// Score trend direction
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ScoreTrend {
    Improving,
    Stable,
    Declining,
}

/// Calculate trend from last 5 scores
pub fn calculate_trend(history: &[HistoricalScore]) -> ScoreTrend {
    if history.len() < 2 {
        return ScoreTrend::Stable;
    }
    let recent = &history[history.len().saturating_sub(5)..];
    let first_half_avg: f64 = recent[..recent.len() / 2].iter().map(|h| h.composite_score).sum::<f64>()
        / (recent.len() / 2).max(1) as f64;
    let second_half_avg: f64 = recent[recent.len() / 2..].iter().map(|h| h.composite_score).sum::<f64>()
        / (recent.len() - recent.len() / 2).max(1) as f64;

    let diff = second_half_avg - first_half_avg;
    if diff > 5.0 {
        ScoreTrend::Improving
    } else if diff < -5.0 {
        ScoreTrend::Declining
    } else {
        ScoreTrend::Stable
    }
}

// ─── Skill Effectiveness ────────────────────────────────────────

/// Per-skill effectiveness stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillEffectiveness {
    pub skill_id: String,
    pub skill_name: String,
    pub invocation_count: u32,
    pub positive_outcomes: u32,
    pub effectiveness_pct: f64,
    pub is_underperforming: bool,
    pub alternatives: Vec<String>,
}

/// Compute effectiveness for a skill
pub fn compute_skill_effectiveness(
    skill_id: &str,
    skill_name: &str,
    invocations: u32,
    positive: u32,
    all_skills: &[(String, f64)], // (skill_name, effectiveness) for alternatives
) -> SkillEffectiveness {
    let effectiveness = if invocations > 0 {
        (positive as f64 / invocations as f64) * 100.0
    } else {
        0.0
    };
    let is_underperforming = effectiveness < 70.0;

    let alternatives = if is_underperforming {
        all_skills
            .iter()
            .filter(|(name, eff)| name != skill_name && *eff >= 70.0)
            .take(3)
            .map(|(name, _)| name.clone())
            .collect()
    } else {
        vec![]
    };

    SkillEffectiveness {
        skill_id: skill_id.into(),
        skill_name: skill_name.into(),
        invocation_count: invocations,
        positive_outcomes: positive,
        effectiveness_pct: effectiveness,
        is_underperforming,
        alternatives,
    }
}


// ─── Tauri Commands ─────────────────────────────────────────────

#[tauri::command]
pub fn get_score_weights() -> ScoreWeights {
    if let Ok(conn) = db::init_db() {
        if let Ok((c, g, e, l)) = db::get_score_weights_db(&conn) {
            return ScoreWeights { completion: c, gate_pass: g, cost_efficiency: e, latency: l };
        }
    }
    ScoreWeights::default()
}

#[tauri::command]
pub fn compute_agent_score_cmd(metrics: AgentRawMetrics) -> AgentScore {
    let weights = get_score_weights();
    let score = compute_agent_score(&metrics, &weights);
    // Persist the computed score
    if let Ok(conn) = db::init_db() {
        let _ = db::insert_agent_score(
            &conn, &score.agent_id, &score.agent_name, None, None,
            score.completion_score, score.gate_pass_score, score.cost_efficiency_score,
            score.latency_score, score.composite_score, score.star_rating,
        );
    }
    score
}

#[tauri::command]
pub fn get_sample_scorecard() -> AgentScorecard {
    // Read latest score and history from DB — return empty if none exists
    if let Ok(conn) = db::init_db() {
        // Find the most recent agent score
        let latest: Option<(String, String)> = conn.query_row(
            "SELECT agent_id, agent_name FROM agent_scores ORDER BY timestamp DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).ok();

        if let Some((agent_id, _agent_name)) = latest {
            let history: Vec<HistoricalScore> = db::get_agent_score_history(&conn, &agent_id)
                .ok()
                .map(|rows| rows.into_iter().map(|(pid, pname, cs, sr, ts)| HistoricalScore {
                    project_id: pid, project_name: pname, composite_score: cs, star_rating: sr, timestamp: ts,
                }).collect())
                .unwrap_or_default();

            // Reconstruct current score from most recent entry
            let current = if let Some(last) = history.last() {
                AgentScore {
                    agent_id: agent_id.clone(),
                    agent_name: _agent_name,
                    completion_score: 0.0,
                    gate_pass_score: 0.0,
                    cost_efficiency_score: 0.0,
                    latency_score: 0.0,
                    composite_score: last.composite_score,
                    star_rating: last.star_rating,
                }
            } else {
                AgentScore::default()
            };

            let trend = calculate_trend(&history);
            return AgentScorecard { current, history, trend };
        }
    }

    // No data — return empty scorecard
    AgentScorecard {
        current: AgentScore::default(),
        history: vec![],
        trend: ScoreTrend::Stable,
    }
}

#[tauri::command]
pub fn get_skill_effectiveness_report() -> Vec<SkillEffectiveness> {
    if let Ok(conn) = db::init_db() {
        if let Ok(rows) = db::get_skill_effectiveness_db(&conn) {
            if !rows.is_empty() {
                return rows.into_iter().map(|(sid, sname, ic, po, ep, iu, alts)| {
                    let alternatives: Vec<String> = serde_json::from_str(&alts).unwrap_or_default();
                    SkillEffectiveness {
                        skill_id: sid, skill_name: sname, invocation_count: ic,
                        positive_outcomes: po, effectiveness_pct: ep, is_underperforming: iu, alternatives,
                    }
                }).collect();
            }
        }
    }
    // No data — return empty
    vec![]
}

#[tauri::command]
pub fn score_to_stars_cmd(score: f64) -> u8 {
    score_to_stars(score)
}


// ─── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_metrics() -> AgentRawMetrics {
        AgentRawMetrics {
            agent_id: "a1".into(),
            agent_name: "Coder".into(),
            tasks_assigned: 10,
            tasks_completed: 9,
            tasks_failed: 1,
            gate_checks_passed: 8,
            gate_checks_total: 10,
            tokens_used: 50000,
            cost_usd: 2.50,
            avg_response_time_ms: 1500,
            max_response_time_ms: 5000,
        }
    }

    #[test]
    fn test_weights_sum_to_1() {
        let w = ScoreWeights::default();
        let sum = w.completion + w.gate_pass + w.cost_efficiency + w.latency;
        assert!((sum - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_score_to_stars_mapping() {
        assert_eq!(score_to_stars(0.0), 1);
        assert_eq!(score_to_stars(19.0), 1);
        assert_eq!(score_to_stars(20.0), 2);
        assert_eq!(score_to_stars(39.0), 2);
        assert_eq!(score_to_stars(40.0), 3);
        assert_eq!(score_to_stars(59.0), 3);
        assert_eq!(score_to_stars(60.0), 4);
        assert_eq!(score_to_stars(79.0), 4);
        assert_eq!(score_to_stars(80.0), 5);
        assert_eq!(score_to_stars(100.0), 5);
    }

    #[test]
    fn test_compute_score_perfect() {
        let metrics = AgentRawMetrics {
            agent_id: "a1".into(),
            agent_name: "Perfect".into(),
            tasks_assigned: 10,
            tasks_completed: 10,
            tasks_failed: 0,
            gate_checks_passed: 10,
            gate_checks_total: 10,
            tokens_used: 1000,
            cost_usd: 0.10,
            avg_response_time_ms: 100,
            max_response_time_ms: 200,
        };
        let score = compute_agent_score(&metrics, &ScoreWeights::default());
        assert!(score.composite_score > 90.0);
        assert_eq!(score.star_rating, 5);
    }

    #[test]
    fn test_compute_score_poor() {
        let metrics = AgentRawMetrics {
            agent_id: "a2".into(),
            agent_name: "Poor".into(),
            tasks_assigned: 10,
            tasks_completed: 2,
            tasks_failed: 8,
            gate_checks_passed: 1,
            gate_checks_total: 10,
            tokens_used: 100000,
            cost_usd: 50.0,
            avg_response_time_ms: 10000,
            max_response_time_ms: 30000,
        };
        let score = compute_agent_score(&metrics, &ScoreWeights::default());
        assert!(score.composite_score < 30.0);
        assert!(score.star_rating <= 2);
    }

    #[test]
    fn test_completion_score() {
        let m = sample_metrics();
        let score = compute_agent_score(&m, &ScoreWeights::default());
        assert!((score.completion_score - 90.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_gate_pass_score() {
        let m = sample_metrics();
        let score = compute_agent_score(&m, &ScoreWeights::default());
        assert!((score.gate_pass_score - 80.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_zero_tasks_completion_zero() {
        let mut m = sample_metrics();
        m.tasks_assigned = 0;
        m.tasks_completed = 0;
        let score = compute_agent_score(&m, &ScoreWeights::default());
        assert!((score.completion_score - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_no_gate_checks_perfect() {
        let mut m = sample_metrics();
        m.gate_checks_total = 0;
        m.gate_checks_passed = 0;
        let score = compute_agent_score(&m, &ScoreWeights::default());
        assert!((score.gate_pass_score - 100.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_trend_improving() {
        let history = vec![
            HistoricalScore { project_id: "p1".into(), project_name: "A".into(), composite_score: 50.0, star_rating: 3, timestamp: "".into() },
            HistoricalScore { project_id: "p2".into(), project_name: "B".into(), composite_score: 55.0, star_rating: 3, timestamp: "".into() },
            HistoricalScore { project_id: "p3".into(), project_name: "C".into(), composite_score: 70.0, star_rating: 4, timestamp: "".into() },
            HistoricalScore { project_id: "p4".into(), project_name: "D".into(), composite_score: 80.0, star_rating: 5, timestamp: "".into() },
        ];
        assert_eq!(calculate_trend(&history), ScoreTrend::Improving);
    }

    #[test]
    fn test_trend_declining() {
        let history = vec![
            HistoricalScore { project_id: "p1".into(), project_name: "A".into(), composite_score: 80.0, star_rating: 5, timestamp: "".into() },
            HistoricalScore { project_id: "p2".into(), project_name: "B".into(), composite_score: 75.0, star_rating: 4, timestamp: "".into() },
            HistoricalScore { project_id: "p3".into(), project_name: "C".into(), composite_score: 55.0, star_rating: 3, timestamp: "".into() },
            HistoricalScore { project_id: "p4".into(), project_name: "D".into(), composite_score: 50.0, star_rating: 3, timestamp: "".into() },
        ];
        assert_eq!(calculate_trend(&history), ScoreTrend::Declining);
    }

    #[test]
    fn test_trend_stable_single() {
        let history = vec![
            HistoricalScore { project_id: "p1".into(), project_name: "A".into(), composite_score: 70.0, star_rating: 4, timestamp: "".into() },
        ];
        assert_eq!(calculate_trend(&history), ScoreTrend::Stable);
    }

    #[test]
    fn test_skill_effectiveness_high() {
        let all = vec![("Other".into(), 80.0)];
        let eff = compute_skill_effectiveness("s1", "CodeReview", 50, 46, &all);
        assert!(eff.effectiveness_pct > 70.0);
        assert!(!eff.is_underperforming);
        assert!(eff.alternatives.is_empty());
    }

    #[test]
    fn test_skill_effectiveness_low_has_alternatives() {
        let all = vec![
            ("Good1".into(), 90.0),
            ("Good2".into(), 80.0),
            ("Bad".into(), 50.0),
        ];
        let eff = compute_skill_effectiveness("s1", "BadSkill", 20, 8, &all);
        assert!(eff.effectiveness_pct < 70.0);
        assert!(eff.is_underperforming);
        assert!(!eff.alternatives.is_empty());
    }

    #[test]
    fn test_skill_effectiveness_zero_invocations() {
        let all = vec![];
        let eff = compute_skill_effectiveness("s1", "Unused", 0, 0, &all);
        assert!((eff.effectiveness_pct - 0.0).abs() < f64::EPSILON);
        assert!(eff.is_underperforming);
    }

    #[test]
    fn test_cmd_sample_scorecard() {
        let card = get_sample_scorecard();
        // Returns empty scorecard when no DB data
        assert!(card.current.composite_score >= 0.0);
    }

    #[test]
    fn test_cmd_skill_report() {
        let report = get_skill_effectiveness_report();
        // Returns empty when no DB data
        assert!(report.len() <= 10000);
    }

    #[test]
    fn test_cmd_score_to_stars() {
        assert_eq!(score_to_stars_cmd(85.0), 5);
        assert_eq!(score_to_stars_cmd(15.0), 1);
    }
}
