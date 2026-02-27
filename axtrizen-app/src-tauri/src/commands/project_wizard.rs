// Sprint S5: Smart Project Setup — team suggestion engine + cost estimation
//
// US-5.1.1: Project Description Analysis → team suggestions
// US-5.1.2: Cost Estimation Engine

use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Mutex;
use rusqlite::Connection;

use crate::db;

// ── Model Pricing Table ──────────────────────────────────────────

/// Per-model cost rates (USD per 1M tokens)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricing {
    pub model_id: String,
    pub display_name: String,
    pub provider: String,
    pub input_cost_per_m: f64,   // $ per 1M input tokens
    pub output_cost_per_m: f64,  // $ per 1M output tokens
    pub context_window: i64,     // max tokens
}

/// Built-in pricing table — updated manually, covers common models
const MODEL_PRICING: &[(&str, &str, &str, f64, f64, i64)] = &[
    // (id, display_name, provider, input_$/1M, output_$/1M, context_window)
    ("claude-sonnet-4-20250514",  "Claude Sonnet 4",   "anthropic", 3.0,  15.0,  200_000),
    ("claude-opus-4-20250514",    "Claude Opus 4",     "anthropic", 15.0, 75.0,  200_000),
    ("claude-3-5-haiku-20241022", "Claude 3.5 Haiku",  "anthropic", 0.80, 4.0,   200_000),
    ("gpt-4o",                    "GPT-4o",            "openai",    2.50, 10.0,  128_000),
    ("gpt-4o-mini",               "GPT-4o Mini",       "openai",    0.15, 0.60,  128_000),
    ("gpt-4.1",                   "GPT-4.1",           "openai",    2.0,  8.0,   1_047_576),
    ("gpt-4.1-mini",              "GPT-4.1 Mini",      "openai",    0.40, 1.60,  1_047_576),
    ("deepseek-r1",               "DeepSeek R1",       "deepseek",  0.55, 2.19,  64_000),
    ("deepseek-v3",               "DeepSeek V3",       "deepseek",  0.27, 1.10,  64_000),
    ("gemini-2.5-pro",            "Gemini 2.5 Pro",    "google",    1.25, 10.0,  1_048_576),
    ("gemini-2.5-flash",          "Gemini 2.5 Flash",  "google",    0.15, 0.60,  1_048_576),
];

fn get_model_pricing_table() -> Vec<ModelPricing> {
    MODEL_PRICING.iter().map(|(id, name, provider, inp, out, ctx)| ModelPricing {
        model_id: id.to_string(),
        display_name: name.to_string(),
        provider: provider.to_string(),
        input_cost_per_m: *inp,
        output_cost_per_m: *out,
        context_window: *ctx,
    }).collect()
}

// ── Role Templates for Team Suggestion ───────────────────────────

/// Maps project keywords → suggested agent roles
const PROJECT_ROLE_TEMPLATES: &[(&str, &[&str], &str, &str, &[&str])] = &[
    // (role_name, trigger_keywords, default_model, recommended_type, skill_categories)
    ("Backend Developer",    &["backend", "api", "server", "rest", "graphql", "microservice", "database"],
     "claude-sonnet-4-20250514", "worker", &["app-builder", "database-processing"]),
    ("Frontend Developer",   &["frontend", "ui", "ux", "react", "vue", "angular", "css", "web", "interface"],
     "claude-sonnet-4-20250514", "worker", &["app-builder", "graphics-processing"]),
    ("Full-Stack Developer", &["fullstack", "full-stack", "full stack", "webapp", "web app"],
     "claude-sonnet-4-20250514", "worker", &["app-builder", "framework"]),
    ("DevOps Engineer",      &["devops", "deploy", "ci/cd", "cicd", "docker", "kubernetes", "infrastructure", "cloud", "aws", "gcp", "azure"],
     "claude-sonnet-4-20250514", "worker", &["devops", "automation"]),
    ("QA Engineer",          &["test", "qa", "quality", "e2e", "testing", "automation"],
     "gpt-4o-mini", "worker", &["automation"]),
    ("Security Engineer",    &["security", "pentest", "vulnerability", "audit", "compliance"],
     "claude-sonnet-4-20250514", "worker", &["security"]),
    ("Data Engineer",        &["data", "analytics", "ml", "machine learning", "ai", "etl", "pipeline"],
     "claude-sonnet-4-20250514", "worker", &["database-processing"]),
    ("Technical Writer",     &["doc", "documentation", "readme", "api docs", "content"],
     "gpt-4o-mini", "worker", &["content"]),
    ("Project Manager",      &["manage", "project", "plan", "coordinate", "lead", "team"],
     "claude-sonnet-4-20250514", "manager", &[]),
    ("Game Developer",       &["game", "unity", "unreal", "3d", "2d", "graphics", "gameplay"],
     "claude-sonnet-4-20250514", "worker", &["game-development", "graphics-processing"]),
    ("Mobile Developer",     &["mobile", "ios", "android", "react native", "flutter", "swift", "kotlin"],
     "claude-sonnet-4-20250514", "worker", &["app-builder"]),
];

// ── Team Suggestion Structs ──────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestedAgent {
    pub role: String,
    pub suggested_model: String,
    pub agent_type: String,       // "worker" or "manager"
    pub skill_categories: Vec<String>,
    pub recommended_skills: Vec<String>,  // skill IDs from catalog
    pub confidence: f32,          // 0.0–1.0 match confidence
    pub estimated_tokens: i64,    // estimated tokens for this agent
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostEstimate {
    pub agent_role: String,
    pub model_id: String,
    pub model_name: String,
    pub estimated_tokens: i64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub total_cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamSuggestion {
    pub project_description: String,
    pub suggested_agents: Vec<SuggestedAgent>,
    pub cost_estimates: Vec<CostEstimate>,
    pub total_cost_low: f64,    // -30% estimate
    pub total_cost_mid: f64,    // mid estimate
    pub total_cost_high: f64,   // +30% estimate
    pub total_estimated_tokens: i64,
}

// ── Analysis Engine ──────────────────────────────────────────────

/// Analyze project description and suggest team composition
fn analyze_project_description(
    conn: &Connection,
    description: &str,
) -> Result<TeamSuggestion, String> {
    let desc_lower = description.to_lowercase();
    let mut suggested_agents: Vec<SuggestedAgent> = Vec::new();
    let mut matched_roles: std::collections::HashSet<String> = std::collections::HashSet::new();

    // Score each role template against the description
    for (role, keywords, model, agent_type, skill_cats) in PROJECT_ROLE_TEMPLATES {
        let mut match_count = 0;
        for kw in *keywords {
            if desc_lower.contains(kw) {
                match_count += 1;
            }
        }
        if match_count > 0 {
            let confidence = (match_count as f32 / keywords.len() as f32).min(1.0);
            if confidence >= 0.1 && !matched_roles.contains(*role) {
                // Get top skills from matched categories
                let mut skill_ids = Vec::new();
                for cat in *skill_cats {
                    let skills = db::search_skill_catalog(conn, "", Some(cat), Some(3), Some(0))
                        .unwrap_or_default();
                    for s in skills {
                        skill_ids.push(s.id);
                    }
                }

                // Estimate tokens based on complexity
                let estimated_tokens = estimate_agent_tokens(&desc_lower, *role);

                suggested_agents.push(SuggestedAgent {
                    role: role.to_string(),
                    suggested_model: model.to_string(),
                    agent_type: agent_type.to_string(),
                    skill_categories: skill_cats.iter().map(|s| s.to_string()).collect(),
                    recommended_skills: skill_ids,
                    confidence,
                    estimated_tokens,
                });
                matched_roles.insert(role.to_string());
            }
        }
    }

    // If no matches, suggest a generic Full-Stack Developer + PM
    if suggested_agents.is_empty() {
        suggested_agents.push(SuggestedAgent {
            role: "Full-Stack Developer".to_string(),
            suggested_model: "claude-sonnet-4-20250514".to_string(),
            agent_type: "worker".to_string(),
            skill_categories: vec!["app-builder".to_string()],
            recommended_skills: Vec::new(),
            confidence: 0.3,
            estimated_tokens: 500_000,
        });
        suggested_agents.push(SuggestedAgent {
            role: "Project Manager".to_string(),
            suggested_model: "claude-sonnet-4-20250514".to_string(),
            agent_type: "manager".to_string(),
            skill_categories: Vec::new(),
            recommended_skills: Vec::new(),
            confidence: 0.3,
            estimated_tokens: 200_000,
        });
    }

    // Sort by confidence (highest first)
    suggested_agents.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));

    // Compute cost estimates
    let pricing = get_model_pricing_table();
    let cost_estimates: Vec<CostEstimate> = suggested_agents.iter().map(|agent| {
        compute_cost_estimate(&pricing, &agent.suggested_model, &agent.role, agent.estimated_tokens)
    }).collect();

    let total_mid: f64 = cost_estimates.iter().map(|c| c.total_cost).sum();
    let total_tokens: i64 = suggested_agents.iter().map(|a| a.estimated_tokens).sum();

    Ok(TeamSuggestion {
        project_description: description.to_string(),
        suggested_agents,
        cost_estimates,
        total_cost_low: total_mid * 0.7,
        total_cost_mid: total_mid,
        total_cost_high: total_mid * 1.3,
        total_estimated_tokens: total_tokens,
    })
}

/// Estimate how many tokens an agent will consume based on project complexity and role
fn estimate_agent_tokens(description: &str, role: &str) -> i64 {
    let word_count = description.split_whitespace().count();

    // Base tokens by role complexity
    let base = match role {
        "Project Manager" => 200_000,
        "QA Engineer" => 300_000,
        "Technical Writer" => 250_000,
        _ => 500_000, // developers
    };

    // Scale by description length (proxy for complexity)
    let complexity_mult = if word_count > 100 { 1.5 } else if word_count > 50 { 1.2 } else { 1.0 };

    (base as f64 * complexity_mult) as i64
}

/// Compute cost for a single agent based on model pricing
fn compute_cost_estimate(
    pricing: &[ModelPricing],
    model_id: &str,
    role: &str,
    estimated_tokens: i64,
) -> CostEstimate {
    let model = pricing.iter().find(|p| p.model_id == model_id);

    let (model_name, input_per_m, output_per_m) = match model {
        Some(m) => (m.display_name.clone(), m.input_cost_per_m, m.output_cost_per_m),
        None => ("Unknown".to_string(), 3.0, 15.0), // default to Sonnet pricing
    };

    // Assume 60% input / 40% output token split
    let input_tokens = (estimated_tokens as f64 * 0.6) as i64;
    let output_tokens = (estimated_tokens as f64 * 0.4) as i64;

    let input_cost = (input_tokens as f64 / 1_000_000.0) * input_per_m;
    let output_cost = (output_tokens as f64 / 1_000_000.0) * output_per_m;

    CostEstimate {
        agent_role: role.to_string(),
        model_id: model_id.to_string(),
        model_name,
        estimated_tokens,
        input_cost,
        output_cost,
        total_cost: input_cost + output_cost,
    }
}

// ── Tauri Commands ───────────────────────────────────────────────

/// Analyze project description and suggest team composition + cost
#[tauri::command]
pub async fn suggest_team_for_project(
    db: State<'_, Mutex<Connection>>,
    description: String,
) -> Result<TeamSuggestion, String> {
    let conn = db.lock().map_err(|e| format!("DB lock: {}", e))?;
    analyze_project_description(&conn, &description)
}

/// Get the model pricing table
#[tauri::command]
pub async fn get_model_pricing() -> Result<Vec<ModelPricing>, String> {
    Ok(get_model_pricing_table())
}

/// Compute cost estimate for a specific model + token amount
#[tauri::command]
pub async fn estimate_cost(
    model_id: String,
    role: String,
    estimated_tokens: i64,
) -> Result<CostEstimate, String> {
    let pricing = get_model_pricing_table();
    Ok(compute_cost_estimate(&pricing, &model_id, &role, estimated_tokens))
}

/// Re-estimate costs when user changes a model for one agent
#[tauri::command]
pub async fn recalculate_team_cost(
    agents: Vec<SuggestedAgent>,
) -> Result<(Vec<CostEstimate>, f64, f64, f64), String> {
    let pricing = get_model_pricing_table();
    let estimates: Vec<CostEstimate> = agents.iter().map(|a| {
        compute_cost_estimate(&pricing, &a.suggested_model, &a.role, a.estimated_tokens)
    }).collect();
    let total_mid: f64 = estimates.iter().map(|c| c.total_cost).sum();
    Ok((estimates, total_mid * 0.7, total_mid, total_mid * 1.3))
}

// ── Tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::run_migrations;

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_model_pricing_table() {
        let pricing = get_model_pricing_table();
        assert!(pricing.len() >= 10, "Should have at least 10 models");
        let sonnet = pricing.iter().find(|p| p.model_id.contains("sonnet")).unwrap();
        assert_eq!(sonnet.input_cost_per_m, 3.0);
        assert_eq!(sonnet.output_cost_per_m, 15.0);
    }

    #[test]
    fn test_cost_estimate_computation() {
        let pricing = get_model_pricing_table();
        let est = compute_cost_estimate(&pricing, "claude-sonnet-4-20250514", "Backend Developer", 1_000_000);
        // 600k input @ $3/1M = $1.80, 400k output @ $15/1M = $6.00 → total $7.80
        assert!((est.input_cost - 1.80).abs() < 0.01);
        assert!((est.output_cost - 6.00).abs() < 0.01);
        assert!((est.total_cost - 7.80).abs() < 0.01);
    }

    #[test]
    fn test_cost_estimate_gpt4o_mini() {
        let pricing = get_model_pricing_table();
        let est = compute_cost_estimate(&pricing, "gpt-4o-mini", "QA Engineer", 300_000);
        // 180k input @ $0.15/1M = $0.027, 120k output @ $0.60/1M = $0.072 → total $0.099
        assert!(est.total_cost < 0.15);
        assert!(est.total_cost > 0.05);
    }

    #[test]
    fn test_cost_estimate_unknown_model() {
        let pricing = get_model_pricing_table();
        let est = compute_cost_estimate(&pricing, "unknown-model-xyz", "Dev", 500_000);
        // Falls back to $3/$15 (Sonnet pricing)
        assert_eq!(est.model_name, "Unknown");
        assert!(est.total_cost > 0.0);
    }

    #[test]
    fn test_estimate_agent_tokens_developer() {
        let tokens = estimate_agent_tokens("Build a REST API backend with authentication", "Backend Developer");
        assert_eq!(tokens, 500_000); // short description → base tokens
    }

    #[test]
    fn test_estimate_agent_tokens_complex() {
        let long_desc = (0..60).map(|i| format!("word{}", i)).collect::<Vec<_>>().join(" ");
        let tokens = estimate_agent_tokens(&long_desc, "Backend Developer");
        assert_eq!(tokens, 600_000); // 60 words → 1.2x multiplier
    }

    #[test]
    fn test_estimate_agent_tokens_very_complex() {
        let long_desc = (0..120).map(|i| format!("word{}", i)).collect::<Vec<_>>().join(" ");
        let tokens = estimate_agent_tokens(&long_desc, "Backend Developer");
        assert_eq!(tokens, 750_000); // 120 words → 1.5x multiplier
    }

    #[test]
    fn test_analyze_backend_project() {
        let conn = test_db();
        let result = analyze_project_description(&conn, "Build a REST API backend with authentication and database integration").unwrap();
        assert!(!result.suggested_agents.is_empty());
        let roles: Vec<&str> = result.suggested_agents.iter().map(|a| a.role.as_str()).collect();
        assert!(roles.contains(&"Backend Developer"), "Should suggest Backend Developer, got: {:?}", roles);
    }

    #[test]
    fn test_analyze_fullstack_project() {
        let conn = test_db();
        let result = analyze_project_description(&conn, "Build a web app with React frontend and Node.js backend with Docker deployment").unwrap();
        let roles: Vec<&str> = result.suggested_agents.iter().map(|a| a.role.as_str()).collect();
        assert!(roles.contains(&"Frontend Developer") || roles.contains(&"Full-Stack Developer"),
                "Should have frontend role, got: {:?}", roles);
    }

    #[test]
    fn test_analyze_empty_description() {
        let conn = test_db();
        let result = analyze_project_description(&conn, "Something vague").unwrap();
        assert!(!result.suggested_agents.is_empty(), "Should suggest default team");
        // Fallback: Full-Stack Dev + PM
        let roles: Vec<&str> = result.suggested_agents.iter().map(|a| a.role.as_str()).collect();
        assert!(roles.contains(&"Full-Stack Developer"));
        assert!(roles.contains(&"Project Manager"));
    }

    #[test]
    fn test_cost_range_30_percent() {
        let conn = test_db();
        let result = analyze_project_description(&conn, "Build a REST API backend").unwrap();
        let mid = result.total_cost_mid;
        assert!((result.total_cost_low - mid * 0.7).abs() < 0.001);
        assert!((result.total_cost_high - mid * 1.3).abs() < 0.001);
    }

    #[test]
    fn test_model_change_recalculate() {
        let agents = vec![
            SuggestedAgent {
                role: "Backend Developer".to_string(),
                suggested_model: "gpt-4o-mini".to_string(), // cheap model
                agent_type: "worker".to_string(),
                skill_categories: vec![],
                recommended_skills: vec![],
                confidence: 0.9,
                estimated_tokens: 500_000,
            },
        ];
        let pricing = get_model_pricing_table();
        let estimates: Vec<CostEstimate> = agents.iter().map(|a| {
            compute_cost_estimate(&pricing, &a.suggested_model, &a.role, a.estimated_tokens)
        }).collect();
        // GPT-4o-mini: 300k in @ $0.15/M = $0.045, 200k out @ $0.60/M = $0.12 → $0.165
        assert!(estimates[0].total_cost < 0.25);
    }

    #[test]
    fn test_analyze_game_project() {
        let conn = test_db();
        let result = analyze_project_description(&conn, "Create a 2D game with Unity and multiplayer support").unwrap();
        let roles: Vec<&str> = result.suggested_agents.iter().map(|a| a.role.as_str()).collect();
        assert!(roles.contains(&"Game Developer"), "Should suggest Game Developer, got: {:?}", roles);
    }

    #[test]
    fn test_multiple_role_suggestions() {
        let conn = test_db();
        let result = analyze_project_description(
            &conn,
            "Build a web app with React frontend, Node.js backend, Docker deployment, and comprehensive testing suite with documentation",
        ).unwrap();
        // Should suggest multiple agents
        assert!(result.suggested_agents.len() >= 3, "Complex project should suggest 3+ agents, got {}", result.suggested_agents.len());
    }

    #[test]
    fn test_total_cost_is_sum() {
        let conn = test_db();
        let result = analyze_project_description(&conn, "Build a REST API backend with Docker").unwrap();
        let sum: f64 = result.cost_estimates.iter().map(|c| c.total_cost).sum();
        assert!((result.total_cost_mid - sum).abs() < 0.001);
    }
}
