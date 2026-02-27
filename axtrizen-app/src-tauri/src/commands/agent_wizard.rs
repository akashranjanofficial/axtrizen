// Sprint S3: Agent creation wizard backend — create-agent-with-config, recommendations, templates

use serde::{Deserialize, Serialize};
use rusqlite::Connection;

use crate::db;

// ── Recommendation Engine ────────────────────────────────────────

/// Keywords → category mapping for skill recommendations
const ROLE_KEYWORD_MAP: &[(&str, &[&str])] = &[
    ("app-builder",   &["developer", "engineer", "programmer", "coder", "dev", "coding", "software", "fullstack", "full-stack", "frontend", "backend", "web", "mobile", "app"]),
    ("security",      &["security", "pentest", "vulnerability", "audit", "compliance", "soc", "infosec", "devsecops"]),
    ("devops",        &["devops", "infrastructure", "cloud", "deploy", "ci/cd", "cicd", "pipeline", "kubernetes", "docker", "terraform", "aws", "gcp", "azure"]),
    ("automation",    &["test", "qa", "quality", "e2e", "automation", "script", "workflow", "bot"]),
    ("database-processing", &["data", "analytics", "ml", "machine learning", "ai", "database", "sql", "etl", "pipeline"]),
    ("content",       &["doc", "documentation", "technical writer", "readme", "api docs", "content", "writing"]),
    ("framework",     &["framework", "library", "tool", "sdk", "api"]),
    ("game-development", &["game", "unity", "unreal", "3d", "2d", "graphics"]),
    ("graphics-processing", &["design", "ui", "ux", "css", "tailwind", "figma", "image", "svg"]),
];

#[derive(Debug, Serialize, Deserialize)]
pub struct SkillRecommendation {
    pub skill_id: String,
    pub skill_name: String,
    pub category: String,
    pub relevance_score: f32, // 0.0–1.0
    pub reason: String,
}

/// Analyze role text and return matching categories with weights
fn extract_categories_from_role(role: &str) -> Vec<(String, f32)> {
    let role_lower = role.to_lowercase();
    let mut category_scores: std::collections::HashMap<String, f32> = std::collections::HashMap::new();

    for (category, keywords) in ROLE_KEYWORD_MAP {
        for keyword in *keywords {
            if role_lower.contains(keyword) {
                let entry = category_scores.entry(category.to_string()).or_insert(0.0);
                *entry += 1.0;
            }
        }
    }

    // Normalize scores to 0.0–1.0
    let max = category_scores.values().cloned().fold(0.0f32, f32::max);
    if max > 0.0 {
        for val in category_scores.values_mut() {
            *val /= max;
        }
    }

    let mut result: Vec<(String, f32)> = category_scores.into_iter().collect();
    result.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    result
}

/// Get skill recommendations based on agent role, name, and type
fn get_recommendations(
    conn: &Connection,
    role: &str,
    name: &str,
    limit: usize,
) -> Result<Vec<SkillRecommendation>, String> {
    let combined = format!("{} {}", role, name);
    let category_scores = extract_categories_from_role(&combined);

    if category_scores.is_empty() {
        // Fallback: return popular skills from top categories
        let entries = db::search_skill_catalog(conn, "", None, Some(limit as i64), Some(0))
            .map_err(|e| format!("DB error: {}", e))?;
        return Ok(entries.into_iter().map(|e| SkillRecommendation {
            skill_name: e.name.clone(),
            skill_id: e.id,
            category: e.category,
            relevance_score: 0.3,
            reason: "Popular skill".to_string(),
        }).collect());
    }

    let mut recommendations = Vec::new();

    for (category, score) in &category_scores {
        let skills = db::search_skill_catalog(conn, "", Some(category), Some(8), Some(0))
            .map_err(|e| format!("DB error: {}", e))?;
        for skill in skills {
            recommendations.push(SkillRecommendation {
                skill_name: skill.name.clone(),
                skill_id: skill.id,
                category: skill.category,
                relevance_score: *score,
                reason: format!("Matches role keyword → {}", category),
            });
        }
    }

    // Sort by relevance then name, take top N
    recommendations.sort_by(|a, b| {
        b.relevance_score.partial_cmp(&a.relevance_score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.skill_name.cmp(&b.skill_name))
    });
    recommendations.truncate(limit);
    Ok(recommendations)
}

// ── Agent Templates ──────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentTemplate {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub agent_type: String,
    pub role: String,
    pub model_profile: String,
    pub soul_md: String,
    pub identity_md: String,
    pub skill_ids: Vec<String>,
    pub bundle_ids: Vec<String>,
    pub tool_permissions: Option<String>, // JSON
    pub security_level: String,
    pub context_budget: Option<i64>,
    pub created_at: Option<String>,
}

// ── Create Agent With Config ─────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateAgentWithConfigRequest {
    pub name: String,
    pub role: String,
    pub agent_type: String,
    pub folder_path: String,
    pub model_profile: String,
    pub soul_md: String,
    pub identity_md: String,
    pub skill_ids: Vec<String>,
    pub bundle_ids: Vec<String>,
    pub tool_permissions: Option<String>,
    pub security_level: String,
    pub context_budget: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateAgentResult {
    pub agent_id: String,
    pub skills_installed: usize,
    pub skills_failed: Vec<String>,
    pub success: bool,
}

// ── Tauri Commands ───────────────────────────────────────────────

#[tauri::command]
pub async fn skill_recommendations(
    role: String,
    name: String,
    limit: Option<usize>,
) -> Result<Vec<SkillRecommendation>, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    get_recommendations(&conn, &role, &name, limit.unwrap_or(8))
}

#[tauri::command]
pub async fn create_agent_with_config(
    config: CreateAgentWithConfigRequest,
) -> Result<CreateAgentResult, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    let agent_id = uuid::Uuid::new_v4().to_string();

    // 1. Insert the agent
    let agent = db::DbAgent {
        id: agent_id.clone(),
        name: config.name.clone(),
        role: config.role.clone(),
        status: "idle".to_string(),
        model: if config.model_profile == "default" { None } else { Some(config.model_profile.clone()) },
        workspace: if config.folder_path.is_empty() { None } else { Some(config.folder_path.clone()) },
        avatar: None,
    };
    db::insert_agent(&conn, &agent).map_err(|e| format!("Failed to create agent: {}", e))?;

    // 2. Install selected skills
    let mut installed_count = 0;
    let mut failed_skills = Vec::new();

    // Collect skill IDs from explicit selection + bundle expansion
    let mut all_skill_ids: Vec<String> = config.skill_ids.clone();

    // Expand bundles to skill IDs
    for bundle_id in &config.bundle_ids {
        let bundles = db::get_skill_bundles(&conn).map_err(|e| format!("DB error: {}", e))?;
        if let Some(bundle) = bundles.iter().find(|b| b.id == *bundle_id) {
            if let Ok(keys) = serde_json::from_str::<Vec<String>>(&bundle.skill_keys) {
                for key in keys {
                    if !all_skill_ids.contains(&key) {
                        all_skill_ids.push(key);
                    }
                }
            }
        }
    }

    // Install each skill
    for skill_id in &all_skill_ids {
        match db::get_catalog_entry(&conn, skill_id) {
            Ok(Some(entry)) => {
                let agent_skill = db::DbAgentSkill {
                    id: format!("{}-{}", agent_id, skill_id),
                    agent_id: agent_id.clone(),
                    skill_key: skill_id.clone(),
                    name: entry.name,
                    description: entry.description,
                    category: entry.category,
                    tags: entry.tags,
                    risk_level: entry.risk_level,
                    source: entry.source.unwrap_or_else(|| "catalog".to_string()),
                    version: None,
                    installed: true,
                    enabled: true,
                    config: None,
                    installed_at: Some(chrono::Utc::now().to_rfc3339()),
                    updated_at: None,
                };
                match db::install_agent_skill(&conn, &agent_skill) {
                    Ok(()) => installed_count += 1,
                    Err(e) => {
                        eprintln!("Failed to install skill {}: {}", skill_id, e);
                        failed_skills.push(skill_id.clone());
                    }
                }
            }
            Ok(None) => {
                // Skill not in catalog — record as failed but continue
                failed_skills.push(skill_id.clone());
            }
            Err(e) => {
                eprintln!("Failed to lookup skill {}: {}", skill_id, e);
                failed_skills.push(skill_id.clone());
            }
        }
    }

    // 3. Store agent config metadata as settings
    let meta_key = format!("agent_config:{}", agent_id);
    let meta = serde_json::json!({
        "model_profile": config.model_profile,
        "soul_md": config.soul_md,
        "identity_md": config.identity_md,
        "tool_permissions": config.tool_permissions,
        "security_level": config.security_level,
        "context_budget": config.context_budget,
    });
    let _ = db::set_setting(&conn, &meta_key, &meta.to_string());

    Ok(CreateAgentResult {
        agent_id,
        skills_installed: installed_count,
        skills_failed: failed_skills.clone(),
        success: failed_skills.is_empty(),
    })
}

#[tauri::command]
pub async fn save_agent_template(
    template: AgentTemplate,
) -> Result<String, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    let template_id = if template.id.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        template.id.clone()
    };

    let json = serde_json::to_string(&template).map_err(|e| format!("JSON error: {}", e))?;
    let key = format!("agent_template:{}", template_id);
    db::set_setting(&conn, &key, &json).map_err(|e| format!("DB error: {}", e))?;
    Ok(template_id)
}

#[tauri::command]
pub async fn list_agent_templates(
) -> Result<Vec<AgentTemplate>, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    let all_settings = db::get_all_settings(&conn).map_err(|e| format!("DB error: {}", e))?;

    let mut templates = Vec::new();
    for (key, value) in all_settings {
        if key.starts_with("agent_template:") {
            if let Ok(template) = serde_json::from_str::<AgentTemplate>(&value) {
                templates.push(template);
            }
        }
    }

    Ok(templates)
}

#[tauri::command]
pub async fn delete_agent_template(
    template_id: String,
) -> Result<(), String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    let key = format!("agent_template:{}", template_id);
    db::set_setting(&conn, &key, "").map_err(|e| format!("DB error: {}", e))?;
    Ok(())
}

// ── Tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_categories_from_developer_role() {
        let cats = extract_categories_from_role("Full-Stack Developer");
        assert!(!cats.is_empty());
        assert_eq!(cats[0].0, "app-builder");
        assert!(cats[0].1 > 0.0);
    }

    #[test]
    fn test_extract_categories_from_security_role() {
        let cats = extract_categories_from_role("Security Auditor");
        assert!(!cats.is_empty());
        assert!(cats.iter().any(|(c, _)| c == "security"));
    }

    #[test]
    fn test_extract_categories_from_devops_role() {
        let cats = extract_categories_from_role("DevOps Engineer managing AWS and Kubernetes");
        assert!(!cats.is_empty());
        assert!(cats.iter().any(|(c, _)| c == "devops"));
    }

    #[test]
    fn test_extract_categories_multi_match() {
        let cats = extract_categories_from_role("DevOps Security Engineer who writes automation");
        let cat_names: Vec<&str> = cats.iter().map(|(c, _)| c.as_str()).collect();
        assert!(cat_names.contains(&"devops"));
        assert!(cat_names.contains(&"security"));
        assert!(cat_names.contains(&"automation"));
    }

    #[test]
    fn test_extract_categories_empty_role() {
        let cats = extract_categories_from_role("");
        assert!(cats.is_empty());
    }

    #[test]
    fn test_extract_categories_unknown_role() {
        let cats = extract_categories_from_role("Astronaut");
        assert!(cats.is_empty());
    }

    #[test]
    fn test_recommendations_with_db() {
        let conn = Connection::open_in_memory().unwrap();
        db::run_migrations(&conn).unwrap();
        db::seed_catalog_if_empty(&conn).unwrap();

        let recs = get_recommendations(&conn, "Developer", "", 8).unwrap();
        assert!(!recs.is_empty());
        assert!(recs.len() <= 8);
        // Most relevant should be development category
        assert!(recs[0].relevance_score > 0.0);
    }

    #[test]
    fn test_recommendations_fallback_for_unknown_role() {
        let conn = Connection::open_in_memory().unwrap();
        db::run_migrations(&conn).unwrap();
        db::seed_catalog_if_empty(&conn).unwrap();

        let recs = get_recommendations(&conn, "Astronaut", "Explorer", 5).unwrap();
        // Should still return some skills as fallback
        assert!(!recs.is_empty());
    }

    #[test]
    fn test_recommendations_limit() {
        let conn = Connection::open_in_memory().unwrap();
        db::run_migrations(&conn).unwrap();
        db::seed_catalog_if_empty(&conn).unwrap();

        let recs = get_recommendations(&conn, "Full-Stack Developer DevOps Cloud", "", 3).unwrap();
        assert!(recs.len() <= 3);
    }

    #[test]
    fn test_relevance_scores_bounded() {
        let conn = Connection::open_in_memory().unwrap();
        db::run_migrations(&conn).unwrap();
        db::seed_catalog_if_empty(&conn).unwrap();

        let recs = get_recommendations(&conn, "Security Engineer", "", 10).unwrap();
        for rec in &recs {
            assert!(rec.relevance_score >= 0.0 && rec.relevance_score <= 1.0);
        }
    }
}
