// Database module for Axtrizen
// SQLite-based local storage for agents, teams, projects, and settings

use rusqlite::{Connection, Result as SqliteResult, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Get the database file path
pub fn get_db_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".axtrizen").join("axtrizen.db"))
}

/// Initialize the database with all required tables
pub fn init_db() -> SqliteResult<Connection> {
    let db_path = get_db_path().expect("Could not determine home directory");
    
    // Create parent directory if it doesn't exist
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    
    let conn = Connection::open(&db_path)?;
    
    // Run migrations
    run_migrations(&conn)?;
    
    Ok(conn)
}

/// Run database migrations
fn run_migrations(conn: &Connection) -> SqliteResult<()> {
    // Create migrations table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY,
            version INTEGER NOT NULL UNIQUE,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;
    
    // Get current version
    let current_version: i32 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) FROM migrations", [], |row| row.get(0))
        .unwrap_or(0);
    
    // Apply migrations
    let migrations = get_migrations();
    for (version, sql) in migrations {
        if version > current_version {
            conn.execute_batch(sql)?;
            conn.execute("INSERT INTO migrations (version) VALUES (?)", [version])?;
        }
    }
    
    Ok(())
}

/// Get all migrations as (version, sql) tuples
fn get_migrations() -> Vec<(i32, &'static str)> {
    vec![
        (1, r#"
            -- Agents table
            CREATE TABLE agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'idle',
                model TEXT,
                workspace TEXT,
                avatar TEXT,
                system_prompt TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            
            -- Teams table
            CREATE TABLE teams (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            
            -- Team members (many-to-many)
            -- agent_id references Gateway-managed agents (no local agents table)
            CREATE TABLE team_members (
                team_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                manager_id TEXT,
                joined_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (team_id, agent_id),
                FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
            );
            
            -- Projects table
            CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                team_id TEXT,
                status TEXT NOT NULL DEFAULT 'draft',
                phase TEXT NOT NULL DEFAULT 'requirements',
                workspace_path TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
            );
            
            -- Messages table
            CREATE TABLE messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT,
                from_agent_id TEXT,
                to_agent_id TEXT,
                content TEXT NOT NULL,
                message_type TEXT NOT NULL DEFAULT 'info',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (from_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
                FOREIGN KEY (to_agent_id) REFERENCES agents(id) ON DELETE SET NULL
            );
            
            -- Settings table (key-value store)
            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            
            -- Insert default settings
            INSERT INTO settings (key, value) VALUES 
                ('theme', 'dark'),
                ('gateway_url', 'ws://127.0.0.1:18789'),
                ('debug_mode', 'false'),
                ('auto_reconnect', 'true');
        "#),
        (2, r#"
            -- Agent activity log
            CREATE TABLE agent_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                description TEXT,
                metadata TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
            );
            
            -- Create indexes for performance
            CREATE INDEX idx_messages_project ON messages(project_id);
            CREATE INDEX idx_messages_from ON messages(from_agent_id);
            CREATE INDEX idx_activity_agent ON agent_activity(agent_id);
            CREATE INDEX idx_activity_created ON agent_activity(created_at);
        "#),
        (2, r#"
            -- Add Manager ID to teams
            ALTER TABLE teams ADD COLUMN manager_id TEXT;
        "#),
    ]
}

// ==================== Agent CRUD ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbAgent {
    pub id: String,
    pub name: String,
    pub role: String,
    pub status: String,
    pub model: Option<String>,
    pub workspace: Option<String>,
    pub avatar: Option<String>,
}

/// Get all agents from database
pub fn get_all_agents(conn: &Connection) -> SqliteResult<Vec<DbAgent>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, role, status, model, workspace, avatar FROM agents ORDER BY name"
    )?;
    
    let agents = stmt.query_map([], |row| {
        Ok(DbAgent {
            id: row.get(0)?,
            name: row.get(1)?,
            role: row.get(2)?,
            status: row.get(3)?,
            model: row.get(4)?,
            workspace: row.get(5)?,
            avatar: row.get(6)?,
        })
    })?;
    
    agents.collect()
}

/// Insert a new agent
pub fn insert_agent(conn: &Connection, agent: &DbAgent) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO agents (id, name, role, status, model, workspace, avatar) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            &agent.id,
            &agent.name,
            &agent.role,
            &agent.status,
            &agent.model,
            &agent.workspace,
            &agent.avatar,
        ),
    )?;
    Ok(())
}

/// Update agent status
pub fn update_agent_status(conn: &Connection, id: &str, status: &str) -> SqliteResult<()> {
    conn.execute(
        "UPDATE agents SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
        (status, id),
    )?;
    Ok(())
}

/// Delete an agent
pub fn delete_agent(conn: &Connection, id: &str) -> SqliteResult<()> {
    conn.execute("DELETE FROM agents WHERE id = ?1", [id])?;
    Ok(())
}

// ==================== Project CRUD ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbProject {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub team_id: Option<String>,
    pub status: String,
    pub phase: String,
    pub workspace_path: Option<String>,
    pub created_at: String,
}

/// Get all projects from database
pub fn get_all_projects(conn: &Connection) -> SqliteResult<Vec<DbProject>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, team_id, status, phase, workspace_path, created_at 
         FROM projects ORDER BY created_at DESC"
    )?;
    
    let projects = stmt.query_map([], |row| {
        Ok(DbProject {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            team_id: row.get(3)?,
            status: row.get(4)?,
            phase: row.get(5)?,
            workspace_path: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
    
    projects.collect()
}

/// Insert a new project
pub fn insert_project(conn: &Connection, project: &DbProject) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO projects (id, name, description, team_id, status, phase, workspace_path) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            &project.id,
            &project.name,
            &project.description,
            &project.team_id,
            &project.status,
            &project.phase,
            &project.workspace_path,
        ),
    )?;
    Ok(())
}

/// Delete a project
pub fn delete_project(conn: &Connection, id: &str) -> SqliteResult<()> {
    conn.execute("DELETE FROM projects WHERE id = ?1", [id])?;
    Ok(())
}

// ==================== Team CRUD ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbTeam {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub manager_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbTeamMember {
    pub team_id: String,
    pub agent_id: String,
    pub manager_id: Option<String>,
    pub joined_at: String,
}

/// Get all teams from database
pub fn get_all_teams(conn: &Connection) -> SqliteResult<Vec<DbTeam>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, manager_id, created_at 
         FROM teams ORDER BY created_at DESC"
    )?;
    
    let teams = stmt.query_map([], |row| {
        Ok(DbTeam {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            manager_id: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    
    teams.collect()
}

/// Insert a new team
pub fn insert_team(conn: &Connection, team: &DbTeam) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO teams (id, name, description, manager_id) 
         VALUES (?1, ?2, ?3, ?4)",
        (&team.id, &team.name, &team.description, &team.manager_id),
    )?;
    Ok(())
}

/// Delete a team
pub fn delete_team(conn: &Connection, id: &str) -> SqliteResult<()> {
    conn.execute("DELETE FROM teams WHERE id = ?1", [id])?;
    Ok(())
}

/// Update a team's name and description and manager
pub fn update_team(conn: &Connection, id: &str, name: &str, description: Option<&str>, manager_id: Option<&str>) -> SqliteResult<()> {
    conn.execute(
        "UPDATE teams SET name = ?1, description = ?2, manager_id = ?3 WHERE id = ?4",
        rusqlite::params![name, description, manager_id, id],
    )?;
    Ok(())
}

/// Get members of a team
pub fn get_team_members(conn: &Connection, team_id: &str) -> SqliteResult<Vec<DbTeamMember>> {
    let mut stmt = conn.prepare(
        "SELECT team_id, agent_id, manager_id, joined_at 
         FROM team_members WHERE team_id = ?1 ORDER BY joined_at ASC"
    )?;
    
    let members = stmt.query_map([team_id], |row| {
        Ok(DbTeamMember {
            team_id: row.get(0)?,
            agent_id: row.get(1)?,
            manager_id: row.get(2)?,
            joined_at: row.get(3)?,
        })
    })?;
    
    members.collect()
}

/// Add an agent to a team
pub fn insert_team_member(conn: &Connection, member: &DbTeamMember) -> SqliteResult<()> {
    conn.execute(
        "INSERT OR IGNORE INTO team_members (team_id, agent_id, manager_id) 
         VALUES (?1, ?2, ?3)",
        (&member.team_id, &member.agent_id, &member.manager_id),
    )?;
    Ok(())
}

/// Remove an agent from a team
pub fn delete_team_member(conn: &Connection, team_id: &str, agent_id: &str) -> SqliteResult<()> {
    conn.execute(
        "DELETE FROM team_members WHERE team_id = ?1 AND agent_id = ?2",
        (team_id, agent_id),
    )?;
    Ok(())
}

// ==================== Settings ====================

/// Get a setting value
pub fn get_setting(conn: &Connection, key: &str) -> SqliteResult<Option<String>> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |row| row.get(0),
    ).optional()
}

/// Set a setting value
pub fn set_setting(conn: &Connection, key: &str, value: &str) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')",
        (key, value),
    )?;
    Ok(())
}

/// Get all settings as a map
pub fn get_all_settings(conn: &Connection) -> SqliteResult<std::collections::HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let mut settings = std::collections::HashMap::new();
    
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    
    for row in rows {
        let (key, value) = row?;
        settings.insert(key, value);
    }
    
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_migrations_run_successfully() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        
        // Verify tables exist
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='agents'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
    
    #[test]
    fn test_agent_crud() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        
        let agent = DbAgent {
            id: "test-1".to_string(),
            name: "Test Agent".to_string(),
            role: "Developer".to_string(),
            status: "idle".to_string(),
            model: Some("claude-4-sonnet".to_string()),
            workspace: None,
            avatar: Some("🤖".to_string()),
        };
        
        // Insert
        insert_agent(&conn, &agent).unwrap();
        
        // Read
        let agents = get_all_agents(&conn).unwrap();
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].name, "Test Agent");
        
        // Update
        update_agent_status(&conn, "test-1", "active").unwrap();
        let agents = get_all_agents(&conn).unwrap();
        assert_eq!(agents[0].status, "active");
        
        // Delete
        delete_agent(&conn, "test-1").unwrap();
        let agents = get_all_agents(&conn).unwrap();
        assert_eq!(agents.len(), 0);
    }
    
    #[test]
    fn test_settings() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        
        // Default setting should exist
        let theme = get_setting(&conn, "theme").unwrap();
        assert_eq!(theme, Some("dark".to_string()));
        
        // Update setting
        set_setting(&conn, "theme", "light").unwrap();
        let theme = get_setting(&conn, "theme").unwrap();
        assert_eq!(theme, Some("light".to_string()));
        
        // New setting
        set_setting(&conn, "custom_key", "custom_value").unwrap();
        let value = get_setting(&conn, "custom_key").unwrap();
        assert_eq!(value, Some("custom_value".to_string()));
    }
}
