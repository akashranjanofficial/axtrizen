use serde::{Deserialize, Serialize};
use crate::db::{self, DbTeam, DbTeamMember};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Team {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub manager_id: Option<String>,
    pub created_at: String,
}

impl From<DbTeam> for Team {
    fn from(db_team: DbTeam) -> Self {
        Team {
            id: db_team.id,
            name: db_team.name,
            description: db_team.description,
            manager_id: db_team.manager_id,
            created_at: db_team.created_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TeamMember {
    pub team_id: String,
    pub agent_id: String,
    pub manager_id: Option<String>,
    pub joined_at: String,
}

impl From<DbTeamMember> for TeamMember {
    fn from(db_member: DbTeamMember) -> Self {
        TeamMember {
            team_id: db_member.team_id,
            agent_id: db_member.agent_id,
            manager_id: db_member.manager_id,
            joined_at: db_member.joined_at,
        }
    }
}

#[tauri::command]
pub async fn get_teams() -> Result<Vec<Team>, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let db_teams = db::get_all_teams(&conn).map_err(|e| e.to_string())?;
    
    Ok(db_teams.into_iter().map(Team::from).collect())
}

#[tauri::command]
pub async fn create_team(name: String, description: Option<String>, manager_id: Option<String>) -> Result<Team, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    
    let db_team = DbTeam {
        id,
        name,
        description,
        manager_id,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    
    db::insert_team(&conn, &db_team).map_err(|e| e.to_string())?;
    Ok(Team::from(db_team))
}

#[tauri::command]
pub async fn delete_team(id: String) -> Result<(), String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    db::delete_team(&conn, &id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_team(id: String, name: String, description: Option<String>, manager_id: Option<String>) -> Result<Team, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    db::update_team(&conn, &id, &name, description.as_deref(), manager_id.as_deref()).map_err(|e| e.to_string())?;
    // Fetch and return the updated team
    let teams = db::get_all_teams(&conn).map_err(|e| e.to_string())?;
    teams.into_iter()
        .find(|t| t.id == id)
        .map(Team::from)
        .ok_or_else(|| "Team not found after update".to_string())
}

#[tauri::command]
pub async fn get_team_members(team_id: String) -> Result<Vec<TeamMember>, String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let members = db::get_team_members(&conn, &team_id).map_err(|e| e.to_string())?;
    Ok(members.into_iter().map(TeamMember::from).collect())
}

#[tauri::command]
pub async fn add_team_member(team_id: String, agent_id: String) -> Result<(), String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    let db_member = DbTeamMember {
        team_id,
        agent_id,
        manager_id: None,
        joined_at: chrono::Utc::now().to_rfc3339(),
    };
    db::insert_team_member(&conn, &db_member).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn remove_team_member(team_id: String, agent_id: String) -> Result<(), String> {
    let conn = db::init_db().map_err(|e| e.to_string())?;
    db::delete_team_member(&conn, &team_id, &agent_id).map_err(|e| e.to_string())?;
    Ok(())
}
