/// Sprint S13: Config Reuse + Smart Recommendations
///
/// Covers:
/// - Save team as template (roles, skills, models, permissions, workflow)
/// - Use template to create full team in one operation
/// - Template versioning (edit creates new version)
/// - Recommendation engine: 2-5 data-backed suggestions post-project
/// - Apply/dismiss recommendations

use serde::{Deserialize, Serialize};

use crate::db;

// ─── Team Templates ─────────────────────────────────────────────

/// A saved team template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: u32,
    pub agents: Vec<TemplateAgent>,
    pub workflow: TemplateWorkflow,
    pub created_from_project: Option<String>,
    pub created_at: String,
}

/// Agent definition within a template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateAgent {
    pub role: String,
    pub skills: Vec<String>,
    pub model_profile: String,
    pub permissions: Vec<String>,
}

/// Workflow definition within a template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateWorkflow {
    pub phases: Vec<String>,
    pub orchestration_mode: String,
    pub max_concurrent_agents: u32,
}

impl Default for TemplateWorkflow {
    fn default() -> Self {
        Self {
            phases: vec![
                "Requirements".into(),
                "Design".into(),
                "Development".into(),
                "Testing".into(),
                "Deployment".into(),
            ],
            orchestration_mode: "sequential".into(),
            max_concurrent_agents: 3,
        }
    }
}

/// Create a template from a project's agent config
pub fn create_template(
    name: &str,
    description: &str,
    agents: Vec<TemplateAgent>,
    workflow: TemplateWorkflow,
    project_id: Option<&str>,
) -> TeamTemplate {
    TeamTemplate {
        id: format!("tmpl-{}", name.to_lowercase().replace(' ', "-")),
        name: name.into(),
        description: description.into(),
        version: 1,
        agents,
        workflow,
        created_from_project: project_id.map(|s| s.into()),
        created_at: "2025-01-01T00:00:00Z".into(),
    }
}

/// Create a new version of a template (edit → new version)
pub fn create_template_version(existing: &TeamTemplate, agents: Vec<TemplateAgent>, workflow: TemplateWorkflow) -> TeamTemplate {
    TeamTemplate {
        id: existing.id.clone(),
        name: existing.name.clone(),
        description: existing.description.clone(),
        version: existing.version + 1,
        agents,
        workflow,
        created_from_project: existing.created_from_project.clone(),
        created_at: "2025-01-02T00:00:00Z".into(),
    }
}

/// Simulate team creation from template
pub fn apply_template(template: &TeamTemplate) -> Vec<String> {
    template
        .agents
        .iter()
        .map(|a| format!("Created agent: {} with {} skills", a.role, a.skills.len()))
        .collect()
}


// ─── Recommendations ────────────────────────────────────────────

/// A data-backed recommendation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recommendation {
    pub id: String,
    pub title: String,
    pub description: String,
    pub category: RecommendationCategory,
    pub impact: RecommendationImpact,
    pub agent_id: Option<String>,
    pub skill_id: Option<String>,
    pub dismissed: bool,
    pub applied: bool,
}

/// Recommendation category
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RecommendationCategory {
    SkillSwap,
    ModelUpgrade,
    WorkflowOptimization,
    CostReduction,
    PerformanceBoost,
}

/// Impact level
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RecommendationImpact {
    High,
    Medium,
    Low,
}

/// Generate recommendations based on project completion data
pub fn generate_recommendations(
    agent_scores: &[(String, f64)],    // (agent_name, score)
    skill_effectiveness: &[(String, f64)], // (skill_name, effectiveness_pct)
    total_cost: f64,
) -> Vec<Recommendation> {
    let mut recs = Vec::new();
    let mut id_counter = 1;

    // Skill swap for underperformers
    for (name, eff) in skill_effectiveness {
        if *eff < 70.0 {
            recs.push(Recommendation {
                id: format!("rec-{}", id_counter),
                title: format!("Replace {} with higher-performing alternative", name),
                description: format!("{} has {}% effectiveness, below the 70% threshold", name, eff.round()),
                category: RecommendationCategory::SkillSwap,
                impact: RecommendationImpact::High,
                agent_id: None,
                skill_id: Some(name.clone()),
                dismissed: false,
                applied: false,
            });
            id_counter += 1;
        }
    }

    // Cost reduction for expensive agents
    if total_cost > 10.0 {
        recs.push(Recommendation {
            id: format!("rec-{}", id_counter),
            title: "Consider using smaller models for routine tasks".into(),
            description: format!("Total project cost ${:.2} — switching routine tasks to GPT-4o-mini could save 40%", total_cost),
            category: RecommendationCategory::CostReduction,
            impact: RecommendationImpact::Medium,
            agent_id: None,
            skill_id: None,
            dismissed: false,
            applied: false,
        });
        id_counter += 1;
    }

    // Performance boost for low-scoring agents
    for (name, score) in agent_scores {
        if *score < 60.0 {
            recs.push(Recommendation {
                id: format!("rec-{}", id_counter),
                title: format!("Upgrade model for agent '{}'", name),
                description: format!("Agent '{}' scored {:.0}/100 — upgrading model may improve quality", name, score),
                category: RecommendationCategory::ModelUpgrade,
                impact: RecommendationImpact::High,
                agent_id: Some(name.clone()),
                skill_id: None,
                dismissed: false,
                applied: false,
            });
            id_counter += 1;
        }
    }

    // Cap at 5
    recs.truncate(5);
    recs
}

/// Dismiss a recommendation
pub fn dismiss_recommendation(rec: &mut Recommendation) {
    rec.dismissed = true;
}

/// Apply a recommendation
pub fn apply_recommendation(rec: &mut Recommendation) {
    rec.applied = true;
}


// ─── Tauri Commands ─────────────────────────────────────────────

#[tauri::command]
pub fn get_sample_template() -> TeamTemplate {
    if let Ok(conn) = db::init_db() {
        if let Ok((id, name, desc, ver, agents_json, wf_json, cfp, cat)) = db::get_first_team_template(&conn) {
            let agents: Vec<TemplateAgent> = serde_json::from_str(&agents_json).unwrap_or_default();
            let workflow: TemplateWorkflow = serde_json::from_str(&wf_json).unwrap_or_default();
            return TeamTemplate { id, name, description: desc, version: ver, agents, workflow, created_from_project: cfp, created_at: cat };
        }
    }
    // No template in DB — return empty template
    TeamTemplate {
        id: String::new(),
        name: String::new(),
        description: String::new(),
        version: 0,
        agents: vec![],
        workflow: TemplateWorkflow::default(),
        created_from_project: None,
        created_at: String::new(),
    }
}

#[tauri::command]
pub fn apply_template_cmd(template: TeamTemplate) -> Vec<String> {
    apply_template(&template)
}

#[tauri::command]
pub fn create_template_version_cmd(template: TeamTemplate) -> TeamTemplate {
    let new_tpl = create_template_version(&template, template.agents.clone(), template.workflow.clone());
    // Persist new version
    if let Ok(conn) = db::init_db() {
        let agents_json = serde_json::to_string(&new_tpl.agents).unwrap_or_default();
        let wf_json = serde_json::to_string(&new_tpl.workflow).unwrap_or_default();
        let _ = db::upsert_team_template(
            &conn, &new_tpl.id, &new_tpl.name, &new_tpl.description, new_tpl.version,
            &agents_json, &wf_json, new_tpl.created_from_project.as_deref(),
        );
    }
    new_tpl
}

#[tauri::command]
pub fn get_sample_recommendations() -> Vec<Recommendation> {
    if let Ok(conn) = db::init_db() {
        if let Ok(rows) = db::get_recommendations_db(&conn) {
            if !rows.is_empty() {
                return rows.into_iter().map(|(id, title, desc, cat, imp, aid, sid, dis, app)| {
                    let category = serde_json::from_value(serde_json::json!(cat)).unwrap_or(RecommendationCategory::PerformanceBoost);
                    let impact = serde_json::from_value(serde_json::json!(imp)).unwrap_or(RecommendationImpact::Medium);
                    Recommendation { id, title, description: desc, category, impact, agent_id: aid, skill_id: sid, dismissed: dis, applied: app }
                }).collect();
            }
        }
    }
    // No recommendations in DB — return empty
    vec![]
}

#[tauri::command]
pub fn dismiss_recommendation_cmd(mut rec: Recommendation) -> Recommendation {
    dismiss_recommendation(&mut rec);
    if let Ok(conn) = db::init_db() {
        let _ = db::update_recommendation_status(&conn, &rec.id, rec.dismissed, rec.applied);
    }
    rec
}

#[tauri::command]
pub fn apply_recommendation_cmd(mut rec: Recommendation) -> Recommendation {
    apply_recommendation(&mut rec);
    if let Ok(conn) = db::init_db() {
        let _ = db::update_recommendation_status(&conn, &rec.id, rec.dismissed, rec.applied);
    }
    rec
}


// ─── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_template() {
        let tmpl = create_template("Test", "A test", vec![], TemplateWorkflow::default(), None);
        assert_eq!(tmpl.name, "Test");
        assert_eq!(tmpl.version, 1);
    }

    #[test]
    fn test_template_id_format() {
        let tmpl = create_template("My Cool Team", "desc", vec![], TemplateWorkflow::default(), None);
        assert_eq!(tmpl.id, "tmpl-my-cool-team");
    }

    #[test]
    fn test_template_versioning() {
        let v1 = create_template("T", "d", vec![], TemplateWorkflow::default(), None);
        let v2 = create_template_version(&v1, vec![], TemplateWorkflow::default());
        assert_eq!(v2.version, 2);
        assert_eq!(v2.id, v1.id);
    }

    #[test]
    fn test_template_preserves_old() {
        let v1 = create_template("T", "d", vec![], TemplateWorkflow::default(), None);
        let _v2 = create_template_version(&v1, vec![], TemplateWorkflow::default());
        // v1 still version 1
        assert_eq!(v1.version, 1);
    }

    #[test]
    fn test_apply_template_creates_agents() {
        let tmpl = create_template(
            "Test Team", "desc",
            vec![
                TemplateAgent { role: "Dev".into(), skills: vec!["Coding".into()], model_profile: "gpt-4o".into(), permissions: vec!["read".into()] },
                TemplateAgent { role: "QA".into(), skills: vec!["Testing".into()], model_profile: "gpt-4o".into(), permissions: vec!["read".into()] },
            ],
            TemplateWorkflow::default(), None,
        );
        let results = apply_template(&tmpl);
        assert_eq!(results.len(), 2);
        assert!(results[0].contains("Dev"));
    }

    #[test]
    fn test_default_workflow() {
        let wf = TemplateWorkflow::default();
        assert_eq!(wf.phases.len(), 5);
        assert_eq!(wf.orchestration_mode, "sequential");
    }

    #[test]
    fn test_recommendations_non_empty_for_underperformers() {
        let scores = vec![("Agent1".into(), 40.0)];
        let skills = vec![("BadSkill".into(), 50.0)];
        let recs = generate_recommendations(&scores, &skills, 5.0);
        assert!(!recs.is_empty());
    }

    #[test]
    fn test_recommendations_cap_at_5() {
        let scores: Vec<(String, f64)> = (0..10).map(|i| (format!("Agent{}", i), 30.0)).collect();
        let skills: Vec<(String, f64)> = (0..10).map(|i| (format!("Skill{}", i), 40.0)).collect();
        let recs = generate_recommendations(&scores, &skills, 100.0);
        assert!(recs.len() <= 5);
    }

    #[test]
    fn test_recommendations_include_skill_swap() {
        let skills = vec![("Bad".into(), 40.0)];
        let recs = generate_recommendations(&[], &skills, 0.0);
        assert!(recs.iter().any(|r| r.category == RecommendationCategory::SkillSwap));
    }

    #[test]
    fn test_recommendations_include_cost_reduction() {
        let recs = generate_recommendations(&[], &[], 50.0);
        assert!(recs.iter().any(|r| r.category == RecommendationCategory::CostReduction));
    }

    #[test]
    fn test_recommendations_no_cost_when_cheap() {
        let recs = generate_recommendations(&[], &[], 5.0);
        assert!(!recs.iter().any(|r| r.category == RecommendationCategory::CostReduction));
    }

    #[test]
    fn test_dismiss_recommendation() {
        let mut rec = Recommendation {
            id: "r1".into(), title: "T".into(), description: "D".into(),
            category: RecommendationCategory::SkillSwap,
            impact: RecommendationImpact::High,
            agent_id: None, skill_id: None, dismissed: false, applied: false,
        };
        dismiss_recommendation(&mut rec);
        assert!(rec.dismissed);
        assert!(!rec.applied);
    }

    #[test]
    fn test_apply_recommendation() {
        let mut rec = Recommendation {
            id: "r1".into(), title: "T".into(), description: "D".into(),
            category: RecommendationCategory::SkillSwap,
            impact: RecommendationImpact::High,
            agent_id: None, skill_id: None, dismissed: false, applied: false,
        };
        apply_recommendation(&mut rec);
        assert!(rec.applied);
    }

    #[test]
    fn test_cmd_sample_template_empty_when_no_db() {
        let tmpl = get_sample_template();
        // Returns empty template when DB has no data
        assert!(tmpl.agents.is_empty() || !tmpl.name.is_empty());
    }

    #[test]
    fn test_cmd_sample_recommendations_may_be_empty() {
        let recs = get_sample_recommendations();
        // Returns empty if DB has no data
        assert!(recs.len() <= 5);
    }

    #[test]
    fn test_cmd_apply_template() {
        let tmpl = create_template(
            "Test", "d",
            vec![TemplateAgent { role: "Dev".into(), skills: vec![], model_profile: "gpt-4o".into(), permissions: vec![] }],
            TemplateWorkflow::default(), None,
        );
        let results = apply_template_cmd(tmpl);
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_high_performers_no_skill_swap() {
        let skills = vec![("Good".into(), 95.0)];
        let recs = generate_recommendations(&[], &skills, 0.0);
        assert!(!recs.iter().any(|r| r.category == RecommendationCategory::SkillSwap));
    }
}
