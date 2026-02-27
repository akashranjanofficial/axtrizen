// Unified Skills Commands — Sprint S1
//
// Provides local-DB-backed skill management replacing the old Gateway-proxied
// skills.  The catalog (950+ antigravity skills) is indexed on first launch,
// and per-agent skills live in agent_skills with full CRUD.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use crate::db;

// ── Types ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct CatalogSearchResult {
    pub skills: Vec<db::DbSkillCatalogEntry>,
    pub total: i64,
    pub categories: Vec<CategoryCount>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CategoryCount {
    pub category: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstallSkillRequest {
    pub skill_key: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub tags: Option<String>,
    pub risk_level: String,
    pub source: String,
    pub version: Option<String>,
    pub config: Option<String>,
}

// ── Catalog Commands ───────────────────────────────────────────────

/// Seed the skill catalog from a JSON array (antigravity skills_index.json)
#[tauri::command]
pub fn catalog_seed(entries_json: String) -> Result<Value, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;

    let entries: Vec<Value> = serde_json::from_str(&entries_json)
        .map_err(|e| format!("JSON parse error: {}", e))?;

    let db_entries: Vec<db::DbSkillCatalogEntry> = entries
        .iter()
        .filter_map(|e| {
            Some(db::DbSkillCatalogEntry {
                id: e.get("id")?.as_str()?.to_string(),
                name: e.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                description: e.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
                category: e.get("category").and_then(|v| v.as_str()).unwrap_or("uncategorized").to_string(),
                tags: e.get("tags").map(|v| v.to_string()),
                risk_level: e.get("risk").and_then(|v| v.as_str()).unwrap_or("unknown").to_string(),
                source: e.get("source").and_then(|v| v.as_str()).map(|s| s.to_string()),
                source_path: e.get("path").and_then(|v| v.as_str()).map(|s| s.to_string()),
                date_added: e.get("date_added").and_then(|v| v.as_str()).map(|s| s.to_string()),
            })
        })
        .collect();

    let count = db::bulk_insert_catalog(&conn, &db_entries)
        .map_err(|e| format!("Insert error: {}", e))?;

    Ok(json!({ "indexed": count, "skipped": entries.len() - db_entries.len() }))
}

/// Get catalog count (check if indexing has been done)
#[tauri::command]
pub fn catalog_count() -> Result<Value, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    let count = db::get_catalog_count(&conn)
        .map_err(|e| format!("DB error: {}", e))?;
    Ok(json!({ "count": count }))
}

/// Search the skill catalog
#[tauri::command]
pub fn catalog_search(
    query: String,
    category: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<CatalogSearchResult, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;

    let skills = db::search_skill_catalog(
        &conn,
        &query,
        category.as_deref(),
        limit,
        offset,
    ).map_err(|e| format!("Search error: {}", e))?;

    // Filtered count for accurate pagination (not total catalog count)
    let total = db::search_skill_catalog_count(&conn, &query, category.as_deref())
        .map_err(|e| format!("Count error: {}", e))?;

    let cat_rows = db::get_catalog_categories(&conn)
        .map_err(|e| format!("Category error: {}", e))?;

    let categories: Vec<CategoryCount> = cat_rows
        .into_iter()
        .map(|(category, count)| CategoryCount { category, count })
        .collect();

    Ok(CatalogSearchResult { skills, total, categories })
}

/// Get all categories with counts
#[tauri::command]
pub fn catalog_categories() -> Result<Vec<CategoryCount>, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    let rows = db::get_catalog_categories(&conn)
        .map_err(|e| format!("DB error: {}", e))?;
    Ok(rows.into_iter().map(|(category, count)| CategoryCount { category, count }).collect())
}

/// Get a single catalog entry
#[tauri::command]
pub fn catalog_get_entry(skill_id: String) -> Result<Option<db::DbSkillCatalogEntry>, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    db::get_catalog_entry(&conn, &skill_id)
        .map_err(|e| format!("DB error: {}", e))
}

// ── Agent Skill Commands ───────────────────────────────────────────

/// Install a skill for an agent
#[tauri::command]
pub fn agent_skill_install(
    agent_id: String,
    req: InstallSkillRequest,
) -> Result<Value, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;

    let skill = db::DbAgentSkill {
        id: uuid::Uuid::new_v4().to_string(),
        agent_id: agent_id.clone(),
        skill_key: req.skill_key.clone(),
        name: req.name,
        description: req.description,
        category: req.category,
        tags: req.tags,
        risk_level: req.risk_level,
        source: req.source,
        version: req.version,
        installed: true,
        enabled: true,
        config: req.config,
        installed_at: None,
        updated_at: None,
    };

    db::install_agent_skill(&conn, &skill)
        .map_err(|e| format!("Install error: {}", e))?;

    Ok(json!({
        "success": true,
        "skill_id": skill.id,
        "skill_key": req.skill_key,
        "agent_id": agent_id,
    }))
}

/// Get all installed skills for an agent
#[tauri::command]
pub fn agent_skills_list(agent_id: String) -> Result<Vec<db::DbAgentSkill>, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    db::get_agent_skills(&conn, &agent_id)
        .map_err(|e| format!("DB error: {}", e))
}

/// Remove a skill from an agent
#[tauri::command]
pub fn agent_skill_remove(agent_id: String, skill_key: String) -> Result<Value, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    db::remove_agent_skill(&conn, &agent_id, &skill_key)
        .map_err(|e| format!("DB error: {}", e))?;
    Ok(json!({ "success": true, "removed": skill_key }))
}

/// Update skill config or enabled state
#[tauri::command]
pub fn agent_skill_update_config(
    agent_id: String,
    skill_key: String,
    config: Option<String>,
    enabled: Option<bool>,
) -> Result<Value, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    db::update_agent_skill_config(&conn, &agent_id, &skill_key, config.as_deref(), enabled)
        .map_err(|e| format!("DB error: {}", e))?;
    Ok(json!({ "success": true }))
}

/// Batch install multiple skills (for bundles)
#[tauri::command]
pub fn agent_skills_batch_install(
    agent_id: String,
    skills: Vec<InstallSkillRequest>,
) -> Result<Value, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;

    let mut installed = 0;
    let mut failed: Vec<String> = Vec::new();

    for req in &skills {
        let skill = db::DbAgentSkill {
            id: uuid::Uuid::new_v4().to_string(),
            agent_id: agent_id.clone(),
            skill_key: req.skill_key.clone(),
            name: req.name.clone(),
            description: req.description.clone(),
            category: req.category.clone(),
            tags: req.tags.clone(),
            risk_level: req.risk_level.clone(),
            source: req.source.clone(),
            version: req.version.clone(),
            installed: true,
            enabled: true,
            config: req.config.clone(),
            installed_at: None,
            updated_at: None,
        };

        match db::install_agent_skill(&conn, &skill) {
            Ok(_) => installed += 1,
            Err(e) => {
                failed.push(format!("{}: {}", req.skill_key, e));
            }
        }
    }

    Ok(json!({
        "installed": installed,
        "failed": failed.len(),
        "failed_details": failed,
        "total": skills.len(),
    }))
}

// ── Bundle Commands ────────────────────────────────────────────────

/// Get all skill bundles
#[tauri::command]
pub fn get_skill_bundles() -> Result<Vec<db::DbSkillBundle>, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    db::get_skill_bundles(&conn)
        .map_err(|e| format!("DB error: {}", e))
}

/// Seed default skill bundles
#[tauri::command]
pub fn seed_default_bundles() -> Result<Value, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;

    let bundles = vec![
        db::DbSkillBundle {
            id: "bundle-security-engineer".to_string(),
            name: "Security Engineer".to_string(),
            description: Some("Comprehensive security auditing, penetration testing, and compliance skills".to_string()),
            icon: Some("🛡️".to_string()),
            skill_keys: serde_json::to_string(&vec![
                "owasp-top-10", "secure-code-review", "security-headers",
                "cve-analysis", "penetration-testing-methodology",
                "security-compliance-soc2-audit", "api-security-testing",
                "dependency-vulnerability-scan", "network-security-audit",
            ]).unwrap_or_default(),
            is_builtin: true,
        },
        db::DbSkillBundle {
            id: "bundle-fullstack-dev".to_string(),
            name: "Full-Stack Developer".to_string(),
            description: Some("Complete web development stack with frontend, backend, and deployment".to_string()),
            icon: Some("🚀".to_string()),
            skill_keys: serde_json::to_string(&vec![
                "react-nextjs", "nodejs-backend", "typescript-strict",
                "database-design", "rest-api-design", "docker-compose",
                "tailwind-css", "testing-strategy", "git-workflow",
            ]).unwrap_or_default(),
            is_builtin: true,
        },
        db::DbSkillBundle {
            id: "bundle-devops-cloud".to_string(),
            name: "DevOps & Cloud".to_string(),
            description: Some("Infrastructure, CI/CD, containers, and cloud deployment automation".to_string()),
            icon: Some("☁️".to_string()),
            skill_keys: serde_json::to_string(&vec![
                "docker-compose", "kubernetes-deployment", "terraform-iac",
                "github-actions-ci", "aws-cloud-architecture",
                "monitoring-observability", "nginx-configuration",
            ]).unwrap_or_default(),
            is_builtin: true,
        },
        db::DbSkillBundle {
            id: "bundle-data-engineer".to_string(),
            name: "Data Engineer".to_string(),
            description: Some("Data pipelines, analytics, ML model deployment, and visualization".to_string()),
            icon: Some("📊".to_string()),
            skill_keys: serde_json::to_string(&vec![
                "python-data-science", "sql-optimization", "etl-pipeline",
                "data-visualization", "machine-learning-deployment",
                "spark-processing", "data-quality-testing",
            ]).unwrap_or_default(),
            is_builtin: true,
        },
        db::DbSkillBundle {
            id: "bundle-agent-architect".to_string(),
            name: "Agent Architect".to_string(),
            description: Some("Design and build AI agent systems with proper orchestration patterns".to_string()),
            icon: Some("🤖".to_string()),
            skill_keys: serde_json::to_string(&vec![
                "prompt-engineering", "agent-orchestration", "tool-use-design",
                "memory-management", "context-engineering",
                "eval-and-testing", "multi-agent-patterns",
            ]).unwrap_or_default(),
            is_builtin: true,
        },
        db::DbSkillBundle {
            id: "bundle-web-designer".to_string(),
            name: "Web Designer".to_string(),
            description: Some("UI/UX design, responsive layouts, animations, and design systems".to_string()),
            icon: Some("🎨".to_string()),
            skill_keys: serde_json::to_string(&vec![
                "tailwind-css", "responsive-design", "accessibility-audit",
                "design-system", "svg-animation", "color-theory",
                "typography-web", "figma-to-code",
            ]).unwrap_or_default(),
            is_builtin: true,
        },
        db::DbSkillBundle {
            id: "bundle-oss-maintainer".to_string(),
            name: "OSS Maintainer".to_string(),
            description: Some("Open source project management, code review, community, and releases".to_string()),
            icon: Some("🌐".to_string()),
            skill_keys: serde_json::to_string(&vec![
                "code-review-best-practices", "semantic-versioning",
                "changelog-generation", "license-compliance",
                "contributing-guide", "issue-triage", "release-automation",
            ]).unwrap_or_default(),
            is_builtin: true,
        },
    ];

    db::seed_skill_bundles(&conn, &bundles)
        .map_err(|e| format!("Seed error: {}", e))?;

    Ok(json!({ "seeded": bundles.len() }))
}
