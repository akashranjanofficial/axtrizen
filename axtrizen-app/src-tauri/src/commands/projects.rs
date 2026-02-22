use serde::{Deserialize, Serialize};
use crate::db::{self, DbProject};
use uuid::Uuid;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub team_id: Option<String>,
    pub status: String,
    pub phase: String,
    pub workspace_path: Option<String>,
    pub created_at: String,
}

impl From<DbProject> for Project {
    fn from(db_proj: DbProject) -> Self {
        Project {
            id: db_proj.id,
            name: db_proj.name,
            description: db_proj.description,
            team_id: db_proj.team_id,
            status: db_proj.status,
            phase: db_proj.phase,
            workspace_path: db_proj.workspace_path,
            created_at: db_proj.created_at,
        }
    }
}

fn get_projects_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".axtrizen")
        .join("projects")
}

#[tauri::command]
pub async fn get_projects() -> Result<Vec<Project>, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let db_projects = db::get_all_projects(&conn).map_err(|e| e.to_string())?;
    
    Ok(db_projects.into_iter().map(Project::from).collect())
}

#[tauri::command]
pub async fn create_project(name: String, description: Option<String>, team_id: Option<String>) -> Result<Project, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    
    let id = Uuid::new_v4().to_string();
    
    // Create workspace directory
    let workspace_path = get_projects_dir().join(&id);
    if let Err(e) = std::fs::create_dir_all(&workspace_path) {
        return Err(format!("Failed to create project workspace: {}", e));
    }
    
    let db_project = DbProject {
        id: id.clone(),
        name,
        description,
        team_id,
        status: "draft".to_string(),
        phase: "requirements".to_string(),
        workspace_path: Some(workspace_path.to_string_lossy().to_string()),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    
    db::insert_project(&conn, &db_project).map_err(|e| e.to_string())?;
    
    Ok(Project::from(db_project))
}

#[tauri::command]
pub async fn delete_project(id: String) -> Result<(), String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    
    // Attempt to delete workspace directory (ignore errors)
    let workspace_path = get_projects_dir().join(&id);
    let _ = std::fs::remove_dir_all(workspace_path);
    
    db::delete_project(&conn, &id).map_err(|e| e.to_string())?;
    
    Ok(())
}
