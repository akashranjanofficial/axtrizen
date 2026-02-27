// Skill Sources — Sprint S1 (US-1.1.3)
//
// Handles skill installation from external sources:
//   - GitHub shorthand (owner/repo)
//   - Full URL (https://github.com/owner/repo)
//   - Local path (./my-skills/custom-skill)
//   - Catalog ID (lookup from embedded catalog)
//
// In future this will delegate to a Vercel `skills` CLI sidecar.
// For now it resolves metadata and registers into local DB.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use crate::db;

// ── Types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SkillSourceType {
    Catalog,       // From embedded 950+ catalog
    GitHub,        // GitHub shorthand: owner/repo
    Url,           // Full URL to a skill repo
    LocalPath,     // Local filesystem path
}

impl std::fmt::Display for SkillSourceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SkillSourceType::Catalog => write!(f, "catalog"),
            SkillSourceType::GitHub => write!(f, "github"),
            SkillSourceType::Url => write!(f, "url"),
            SkillSourceType::LocalPath => write!(f, "local"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedSkill {
    pub skill_key: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub tags: Option<String>,
    pub risk_level: String,
    pub source: String,
    pub source_type: SkillSourceType,
    pub version: Option<String>,
    pub source_path: Option<String>,
}

// ── Source detection ───────────────────────────────────────────────

fn detect_source_type(source: &str) -> SkillSourceType {
    let trimmed = source.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        SkillSourceType::Url
    } else if trimmed.starts_with("./") || trimmed.starts_with("/") || trimmed.starts_with("~") {
        SkillSourceType::LocalPath
    } else if trimmed.contains('/') && !trimmed.contains(' ') {
        // Looks like owner/repo GitHub shorthand
        SkillSourceType::GitHub
    } else {
        SkillSourceType::Catalog
    }
}

// ── Resolver ──────────────────────────────────────────────────────

fn resolve_from_catalog(source: &str) -> Result<ResolvedSkill, String> {
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    let entry = db::get_catalog_entry(&conn, source)
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or_else(|| format!("Skill '{}' not found in catalog", source))?;
    Ok(ResolvedSkill {
        skill_key: entry.id.clone(),
        name: entry.name,
        description: entry.description,
        category: entry.category,
        tags: entry.tags,
        risk_level: entry.risk_level,
        source: format!("catalog:{}", entry.id),
        source_type: SkillSourceType::Catalog,
        version: Some("1.0.0".to_string()),
        source_path: entry.source_path,
    })
}

fn resolve_from_github(shorthand: &str) -> Result<ResolvedSkill, String> {
    // Parse owner/repo (optionally owner/repo/path)
    let parts: Vec<&str> = shorthand.trim().split('/').collect();
    if parts.len() < 2 {
        return Err(format!("Invalid GitHub shorthand: '{}'. Expected 'owner/repo'", shorthand));
    }
    let owner = parts[0];
    let repo = parts[1];
    let skill_key = format!("github-{}-{}", owner, repo);
    let repo_url = format!("https://github.com/{}/{}", owner, repo);

    Ok(ResolvedSkill {
        skill_key,
        name: repo.to_string(),
        description: Some(format!("Skill from GitHub: {}", repo_url)),
        category: "custom".to_string(),
        tags: Some(json!(["github", owner]).to_string()),
        risk_level: "unknown".to_string(),
        source: repo_url,
        source_type: SkillSourceType::GitHub,
        version: Some("latest".to_string()),
        source_path: Some(shorthand.to_string()),
    })
}

fn resolve_from_url(url: &str) -> Result<ResolvedSkill, String> {
    let url = url.trim();
    // Extract a reasonable name from the URL
    let name = url
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("custom-skill")
        .to_string();
    let skill_key = format!("url-{}", name);

    Ok(ResolvedSkill {
        skill_key,
        name,
        description: Some(format!("Skill from URL: {}", url)),
        category: "custom".to_string(),
        tags: Some(json!(["url", "external"]).to_string()),
        risk_level: "unknown".to_string(),
        source: url.to_string(),
        source_type: SkillSourceType::Url,
        version: Some("latest".to_string()),
        source_path: Some(url.to_string()),
    })
}

fn resolve_from_local_path(path: &str) -> Result<ResolvedSkill, String> {
    let path = path.trim();
    let abs_path = if path.starts_with("~") {
        dirs::home_dir()
            .ok_or_else(|| "Cannot resolve home directory".to_string())?
            .join(&path[2..])
    } else {
        std::path::PathBuf::from(path)
    };

    if !abs_path.exists() {
        return Err(format!("Local path does not exist: {}", abs_path.display()));
    }

    // Try to read a SKILL.md or skill.json for metadata
    let skill_json_path = abs_path.join("skill.json");
    let name = abs_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("local-skill")
        .to_string();
    let skill_key = format!("local-{}", name);

    let (description, tags) = if skill_json_path.exists() {
        // Read metadata from skill.json if it exists
        match std::fs::read_to_string(&skill_json_path) {
            Ok(content) => {
                let meta: serde_json::Value =
                    serde_json::from_str(&content).unwrap_or(json!({}));
                (
                    meta.get("description")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    meta.get("tags").map(|v| v.to_string()),
                )
            }
            Err(_) => (None, None),
        }
    } else {
        (
            Some(format!("Local skill from: {}", abs_path.display())),
            Some(json!(["local"]).to_string()),
        )
    };

    Ok(ResolvedSkill {
        skill_key,
        name,
        description,
        category: "custom".to_string(),
        tags,
        risk_level: "unknown".to_string(),
        source: format!("local:{}", abs_path.display()),
        source_type: SkillSourceType::LocalPath,
        version: Some("1.0.0".to_string()),
        source_path: Some(abs_path.to_string_lossy().to_string()),
    })
}

// ── Public API ─────────────────────────────────────────────────────

/// Resolve a skill source string into metadata that can be installed.
pub fn resolve_skill_source(source: &str) -> Result<ResolvedSkill, String> {
    let source_type = detect_source_type(source);
    match source_type {
        SkillSourceType::Catalog => resolve_from_catalog(source),
        SkillSourceType::GitHub => resolve_from_github(source),
        SkillSourceType::Url => resolve_from_url(source),
        SkillSourceType::LocalPath => resolve_from_local_path(source),
    }
}

// ── Tauri Commands ─────────────────────────────────────────────────

/// Install a skill from any source (catalog ID, GitHub shorthand, URL, local path)
#[tauri::command]
pub fn skills_resolve_source(source: String) -> Result<ResolvedSkill, String> {
    resolve_skill_source(&source)
}

/// Install a skill from any source and attach it to an agent
#[tauri::command]
pub fn skills_install_from_source(agent_id: String, source: String) -> Result<Value, String> {
    let resolved = resolve_skill_source(&source)?;
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;

    let skill = db::DbAgentSkill {
        id: uuid::Uuid::new_v4().to_string(),
        agent_id: agent_id.clone(),
        skill_key: resolved.skill_key.clone(),
        name: resolved.name.clone(),
        description: resolved.description,
        category: resolved.category,
        tags: resolved.tags,
        risk_level: resolved.risk_level,
        source: resolved.source,
        version: resolved.version,
        installed: true,
        enabled: true,
        config: None,
        installed_at: None,
        updated_at: None,
    };

    db::install_agent_skill(&conn, &skill)
        .map_err(|e| format!("Install error: {}", e))?;

    Ok(json!({
        "success": true,
        "skill_key": resolved.skill_key,
        "name": resolved.name,
        "source_type": format!("{}", resolved.source_type),
        "agent_id": agent_id,
    }))
}

/// Search skills.sh API (stub — will use CLI sidecar when available)
#[tauri::command]
pub fn skills_search_remote(query: String) -> Result<Value, String> {
    // For now, search local catalog. In future, this calls the skills.sh API via sidecar.
    let conn = db::init_db().map_err(|e| format!("DB error: {}", e))?;
    let results = db::search_skill_catalog(&conn, &query, None, Some(20), Some(0))
        .map_err(|e| format!("Search error: {}", e))?;

    Ok(json!({
        "source": "local_catalog",
        "results": results,
        "note": "Remote skills.sh search will be available when CLI sidecar is integrated",
    }))
}
