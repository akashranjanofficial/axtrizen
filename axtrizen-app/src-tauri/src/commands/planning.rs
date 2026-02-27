use serde::{Deserialize, Serialize};
use crate::db::{self, DbEpic, DbStory, DbTask, DbSprint};
use uuid::Uuid;

// ── Response types (frontend-facing) ─────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct Epic {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: i32,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

impl From<DbEpic> for Epic {
    fn from(e: DbEpic) -> Self {
        Epic {
            id: e.id, project_id: e.project_id, title: e.title,
            description: e.description, status: e.status, priority: e.priority,
            sort_order: e.sort_order, created_at: e.created_at, updated_at: e.updated_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Story {
    pub id: String,
    pub epic_id: String,
    pub project_id: String,
    pub title: String,
    pub description: Option<String>,
    pub acceptance_criteria: Option<String>,
    pub story_points: i32,
    pub status: String,
    pub assigned_agent_id: Option<String>,
    pub sprint_id: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

impl From<DbStory> for Story {
    fn from(s: DbStory) -> Self {
        Story {
            id: s.id, epic_id: s.epic_id, project_id: s.project_id,
            title: s.title, description: s.description,
            acceptance_criteria: s.acceptance_criteria,
            story_points: s.story_points, status: s.status,
            assigned_agent_id: s.assigned_agent_id, sprint_id: s.sprint_id,
            sort_order: s.sort_order, created_at: s.created_at, updated_at: s.updated_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub story_id: String,
    pub epic_id: String,
    pub project_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub assigned_agent_id: Option<String>,
    pub estimated_minutes: Option<i32>,
    pub actual_minutes: Option<i32>,
    pub files_created: Option<String>,
    pub dependencies: Option<String>,
    pub sort_order: i32,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<DbTask> for Task {
    fn from(t: DbTask) -> Self {
        Task {
            id: t.id, story_id: t.story_id, epic_id: t.epic_id,
            project_id: t.project_id, title: t.title, description: t.description,
            status: t.status, assigned_agent_id: t.assigned_agent_id,
            estimated_minutes: t.estimated_minutes, actual_minutes: t.actual_minutes,
            files_created: t.files_created, dependencies: t.dependencies,
            sort_order: t.sort_order, started_at: t.started_at,
            completed_at: t.completed_at, created_at: t.created_at, updated_at: t.updated_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Sprint {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub goal: Option<String>,
    pub status: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub created_at: String,
}

impl From<DbSprint> for Sprint {
    fn from(s: DbSprint) -> Self {
        Sprint {
            id: s.id, project_id: s.project_id, name: s.name,
            goal: s.goal, status: s.status, start_date: s.start_date,
            end_date: s.end_date, created_at: s.created_at,
        }
    }
}

/// Full project board = epics + stories + tasks + sprints
#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectBoard {
    pub epics: Vec<Epic>,
    pub stories: Vec<Story>,
    pub tasks: Vec<Task>,
    pub sprints: Vec<Sprint>,
}

// ── Tauri Commands ───────────────────────────────────────────────────

#[tauri::command]
pub async fn get_project_board(project_id: String) -> Result<ProjectBoard, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let epics = db::get_project_epics(&conn, &project_id).map_err(|e| e.to_string())?;
    let stories = db::get_project_stories(&conn, &project_id).map_err(|e| e.to_string())?;
    let tasks = db::get_project_tasks(&conn, &project_id).map_err(|e| e.to_string())?;
    let sprints = db::get_project_sprints(&conn, &project_id).map_err(|e| e.to_string())?;

    Ok(ProjectBoard {
        epics: epics.into_iter().map(Epic::from).collect(),
        stories: stories.into_iter().map(Story::from).collect(),
        tasks: tasks.into_iter().map(Task::from).collect(),
        sprints: sprints.into_iter().map(Sprint::from).collect(),
    })
}

#[tauri::command]
pub async fn create_epic(
    project_id: String,
    title: String,
    description: Option<String>,
    priority: i32,
    sort_order: i32,
) -> Result<Epic, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let epic = DbEpic {
        id: Uuid::new_v4().to_string(),
        project_id,
        title,
        description,
        status: "backlog".to_string(),
        priority,
        sort_order,
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    db::insert_epic(&conn, &epic).map_err(|e| e.to_string())?;
    Ok(Epic::from(epic))
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn create_story(
    epic_id: String,
    project_id: String,
    title: String,
    description: Option<String>,
    acceptance_criteria: Option<String>,
    story_points: i32,
    assigned_agent_id: Option<String>,
    sprint_id: Option<String>,
    sort_order: i32,
) -> Result<Story, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let story = DbStory {
        id: Uuid::new_v4().to_string(),
        epic_id,
        project_id,
        title,
        description,
        acceptance_criteria,
        story_points,
        status: "backlog".to_string(),
        assigned_agent_id,
        sprint_id,
        sort_order,
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    db::insert_story(&conn, &story).map_err(|e| e.to_string())?;
    Ok(Story::from(story))
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn create_task(
    story_id: String,
    epic_id: String,
    project_id: String,
    title: String,
    description: Option<String>,
    assigned_agent_id: Option<String>,
    estimated_minutes: Option<i32>,
    dependencies: Option<String>,
    sort_order: i32,
) -> Result<Task, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let task = DbTask {
        id: Uuid::new_v4().to_string(),
        story_id,
        epic_id,
        project_id,
        title,
        description,
        status: "todo".to_string(),
        assigned_agent_id,
        estimated_minutes,
        actual_minutes: None,
        files_created: None,
        dependencies,
        sort_order,
        started_at: None,
        completed_at: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    db::insert_task(&conn, &task).map_err(|e| e.to_string())?;
    Ok(Task::from(task))
}

#[tauri::command]
pub async fn update_task_status(
    task_id: String,
    status: String,
    files_created: Option<String>,
) -> Result<(), String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let started = if status == "in_progress" { Some(now.as_str()) } else { None };
    let completed = if status == "done" { Some(now.as_str()) } else { None };
    db::update_task_status(
        &conn, &task_id, &status,
        files_created.as_deref(), started, completed,
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_story_status(story_id: String, status: String) -> Result<(), String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    db::update_story_status(&conn, &story_id, &status).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_epic_status(epic_id: String, status: String) -> Result<(), String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    db::update_epic_status(&conn, &epic_id, &status).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn create_sprint(
    project_id: String,
    name: String,
    goal: Option<String>,
) -> Result<Sprint, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let sprint = DbSprint {
        id: Uuid::new_v4().to_string(),
        project_id,
        name,
        goal,
        status: "planning".to_string(),
        start_date: None,
        end_date: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    db::insert_sprint(&conn, &sprint).map_err(|e| e.to_string())?;
    Ok(Sprint::from(sprint))
}
