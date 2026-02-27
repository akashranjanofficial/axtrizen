use serde::{Deserialize, Serialize};
use crate::db;
use crate::workflow_templates::{self, WorkflowTemplate};

// ── Response types ───────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkflowTemplateSummary {
    pub id: String,
    pub name: String,
    pub domain: String,
    pub description: String,
    pub icon: String,
    pub phase_count: usize,
    pub phase_names: Vec<String>,
    pub board_labels: workflow_templates::BoardLabels,
    pub is_builtin: bool,
}

// ── Tauri Commands ───────────────────────────────────────────────────

/// Get all available workflow templates (built-in + custom).
#[tauri::command]
pub async fn get_workflow_templates() -> Result<Vec<WorkflowTemplateSummary>, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let db_templates = db::get_all_workflow_templates(&conn).map_err(|e| e.to_string())?;
    
    let summaries: Vec<WorkflowTemplateSummary> = db_templates
        .into_iter()
        .filter_map(|dbt| {
            let template: WorkflowTemplate = serde_json::from_str(&dbt.template_data).ok()?;
            Some(WorkflowTemplateSummary {
                id: dbt.id,
                name: dbt.name,
                domain: dbt.domain,
                description: dbt.description.unwrap_or_default(),
                icon: dbt.icon.unwrap_or_else(|| "📁".to_string()),
                phase_count: template.phases.len(),
                phase_names: template.phases.iter().map(|p| p.name.clone()).collect(),
                board_labels: template.board_labels,
                is_builtin: dbt.is_builtin,
            })
        })
        .collect();
    
    Ok(summaries)
}

/// Get the full workflow template data by ID.
#[tauri::command]
pub async fn get_workflow_template(template_id: String) -> Result<WorkflowTemplate, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let dbt = db::get_workflow_template(&conn, &template_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Workflow template '{}' not found", template_id))?;
    
    serde_json::from_str(&dbt.template_data)
        .map_err(|e| format!("Failed to parse template data: {}", e))
}

/// Get the workflow template assigned to a project (or the default).
#[tauri::command]
pub async fn get_project_workflow_template(project_id: String) -> Result<WorkflowTemplate, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    
    // Try to get the project's assigned template
    if let Some(dbt) = db::get_project_workflow_template(&conn, &project_id).map_err(|e| e.to_string())? {
        return serde_json::from_str(&dbt.template_data)
            .map_err(|e| format!("Failed to parse template: {}", e));
    }
    
    // Fall back to default software development template
    workflow_templates::get_builtin_template(workflow_templates::DEFAULT_TEMPLATE_ID)
        .ok_or_else(|| "Default template not found".to_string())
}

/// Assign a workflow template to a project.
#[tauri::command]
pub async fn set_project_workflow_template(project_id: String, template_id: String) -> Result<(), String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    db::set_project_workflow_template(&conn, &project_id, &template_id)
        .map_err(|e| e.to_string())?;
    Ok(())
}
