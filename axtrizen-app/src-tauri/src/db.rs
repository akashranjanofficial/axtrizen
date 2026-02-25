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
    
    // Defensive: ensure the manager_id column exists on teams table.
    // Migration v2 may have been recorded but the ALTER TABLE could have 
    // failed silently on some systems, leaving the column missing.
    let has_manager_id: bool = conn
        .prepare("PRAGMA table_info(teams)")
        .and_then(|mut stmt| {
            let cols: Vec<String> = stmt
                .query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();
            Ok(cols.iter().any(|c| c == "manager_id"))
        })
        .unwrap_or(false);

    if !has_manager_id {
        conn.execute_batch("ALTER TABLE teams ADD COLUMN manager_id TEXT;")?;
        println!("[db] Defensive fix: added missing manager_id column to teams");
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

            -- Add Manager ID to teams
            ALTER TABLE teams ADD COLUMN manager_id TEXT;
        "#),
        (3, r#"
            -- Execution logs for project orchestration
            CREATE TABLE IF NOT EXISTS execution_logs (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                phase TEXT NOT NULL,
                agent_id TEXT,
                agent_name TEXT,
                event_type TEXT NOT NULL,
                content TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_exec_logs_project ON execution_logs(project_id);
            CREATE INDEX IF NOT EXISTS idx_exec_logs_created ON execution_logs(created_at);
        "#),
        (4, r#"
            -- Chat conversations (one per agent session / team group chat)
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                session_key TEXT NOT NULL UNIQUE,
                title TEXT,
                conversation_type TEXT NOT NULL DEFAULT 'direct',
                agent_id TEXT,
                team_id TEXT,
                last_message_at TEXT,
                message_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Individual chat messages
            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                sender_agent_id TEXT,
                sender_agent_name TEXT,
                label TEXT,
                metadata TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );

            -- Indexes
            CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_messages(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_chat_msg_created ON chat_messages(created_at);
            CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_key);
            CREATE INDEX IF NOT EXISTS idx_conv_last_msg ON conversations(last_message_at);
        "#),
        (5, r#"
            -- Agent usage snapshots (periodic cache of Gateway usage data)
            CREATE TABLE IF NOT EXISTS agent_usage_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                tokens_in INTEGER NOT NULL DEFAULT 0,
                tokens_out INTEGER NOT NULL DEFAULT 0,
                cost_usd REAL NOT NULL DEFAULT 0.0,
                model TEXT,
                snapshot_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_usage_agent ON agent_usage_snapshots(agent_id);
            CREATE INDEX IF NOT EXISTS idx_usage_time ON agent_usage_snapshots(snapshot_at);

            -- Agent tool invocations (logged from Gateway events)
            CREATE TABLE IF NOT EXISTS agent_tool_calls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                arguments TEXT,
                result_summary TEXT,
                duration_ms INTEGER,
                status TEXT NOT NULL DEFAULT 'success',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_tool_agent ON agent_tool_calls(agent_id);
            CREATE INDEX IF NOT EXISTS idx_tool_created ON agent_tool_calls(created_at);
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

/// Update a project
pub fn update_project(
    conn: &Connection,
    id: &str,
    name: &str,
    description: Option<&str>,
    team_id: Option<&str>,
    status: &str,
    phase: &str,
    workspace_path: Option<&str>,
) -> SqliteResult<()> {
    conn.execute(
        "UPDATE projects 
         SET name = ?1, description = ?2, team_id = ?3, status = ?4, phase = ?5, workspace_path = ?6
         WHERE id = ?7",
        rusqlite::params![name, description, team_id, status, phase, workspace_path, id],
    )?;
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

// ==================== Execution Logs ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbExecutionLog {
    pub id: String,
    pub project_id: String,
    pub phase: String,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub event_type: String,
    pub content: Option<String>,
    pub created_at: String,
}

/// Insert an execution log entry
pub fn insert_execution_log(conn: &Connection, log: &DbExecutionLog) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO execution_logs (id, project_id, phase, agent_id, agent_name, event_type, content, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            log.id, log.project_id, log.phase, log.agent_id,
            log.agent_name, log.event_type, log.content, log.created_at
        ],
    )?;
    Ok(())
}

/// Get execution logs for a project (most recent first)
pub fn get_execution_logs(conn: &Connection, project_id: &str, limit: Option<u32>) -> SqliteResult<Vec<DbExecutionLog>> {
    let limit_val = limit.unwrap_or(100);
    let mut stmt = conn.prepare(
        "SELECT id, project_id, phase, agent_id, agent_name, event_type, content, created_at
         FROM execution_logs WHERE project_id = ?1
         ORDER BY created_at DESC LIMIT ?2"
    )?;
    let logs = stmt.query_map(rusqlite::params![project_id, limit_val], |row| {
        Ok(DbExecutionLog {
            id: row.get(0)?,
            project_id: row.get(1)?,
            phase: row.get(2)?,
            agent_id: row.get(3)?,
            agent_name: row.get(4)?,
            event_type: row.get(5)?,
            content: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
    logs.collect()
}

/// Delete all execution logs for a project
pub fn delete_execution_logs(conn: &Connection, project_id: &str) -> SqliteResult<()> {
    conn.execute("DELETE FROM execution_logs WHERE project_id = ?1", [project_id])?;
    Ok(())
}

// ==================== Conversations & Chat Messages ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbConversation {
    pub id: String,
    pub session_key: String,
    pub title: Option<String>,
    pub conversation_type: String,
    pub agent_id: Option<String>,
    pub team_id: Option<String>,
    pub last_message_at: Option<String>,
    pub message_count: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbChatMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub sender_agent_id: Option<String>,
    pub sender_agent_name: Option<String>,
    pub label: Option<String>,
    pub metadata: Option<String>,
    pub created_at: String,
}

/// Get or create a conversation for a session key.
/// Returns the conversation ID.
pub fn get_or_create_conversation(
    conn: &Connection,
    session_key: &str,
    conversation_type: &str,
    agent_id: Option<&str>,
    team_id: Option<&str>,
    title: Option<&str>,
) -> SqliteResult<String> {
    // Try to find existing
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM conversations WHERE session_key = ?1",
            [session_key],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(id) = existing {
        return Ok(id);
    }

    // Create new
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO conversations (id, session_key, title, conversation_type, agent_id, team_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        rusqlite::params![id, session_key, title, conversation_type, agent_id, team_id],
    )?;
    Ok(id)
}

/// Get all conversations, sorted by last message time (most recent first)
pub fn get_all_conversations(conn: &Connection) -> SqliteResult<Vec<DbConversation>> {
    let mut stmt = conn.prepare(
        "SELECT id, session_key, title, conversation_type, agent_id, team_id,
                last_message_at, message_count, created_at
         FROM conversations
         ORDER BY COALESCE(last_message_at, created_at) DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DbConversation {
            id: row.get(0)?,
            session_key: row.get(1)?,
            title: row.get(2)?,
            conversation_type: row.get(3)?,
            agent_id: row.get(4)?,
            team_id: row.get(5)?,
            last_message_at: row.get(6)?,
            message_count: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

/// Insert a chat message and update conversation metadata
pub fn insert_chat_message(conn: &Connection, msg: &DbChatMessage) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO chat_messages (id, conversation_id, role, content, sender_agent_id, sender_agent_name, label, metadata, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            msg.id, msg.conversation_id, msg.role, msg.content,
            msg.sender_agent_id, msg.sender_agent_name, msg.label, msg.metadata, msg.created_at
        ],
    )?;
    // Update conversation's last_message_at and message_count
    conn.execute(
        "UPDATE conversations SET last_message_at = ?1, message_count = message_count + 1 WHERE id = ?2",
        rusqlite::params![msg.created_at, msg.conversation_id],
    )?;
    Ok(())
}

/// Get chat messages for a conversation (oldest first, with pagination)
pub fn get_chat_messages(
    conn: &Connection,
    conversation_id: &str,
    limit: Option<u32>,
    before_id: Option<&str>,
) -> SqliteResult<Vec<DbChatMessage>> {
    let limit_val = limit.unwrap_or(100);

    let (query, params): (&str, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(bid) = before_id {
        (
            "SELECT id, conversation_id, role, content, sender_agent_id, sender_agent_name, label, metadata, created_at
             FROM chat_messages
             WHERE conversation_id = ?1 AND created_at < (SELECT created_at FROM chat_messages WHERE id = ?2)
             ORDER BY created_at DESC LIMIT ?3",
            vec![Box::new(conversation_id.to_string()), Box::new(bid.to_string()), Box::new(limit_val)],
        )
    } else {
        (
            "SELECT id, conversation_id, role, content, sender_agent_id, sender_agent_name, label, metadata, created_at
             FROM chat_messages
             WHERE conversation_id = ?1
             ORDER BY created_at DESC LIMIT ?2",
            vec![Box::new(conversation_id.to_string()), Box::new(limit_val)],
        )
    };

    let mut stmt = conn.prepare(query)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(DbChatMessage {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            sender_agent_id: row.get(4)?,
            sender_agent_name: row.get(5)?,
            label: row.get(6)?,
            metadata: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;
    // Collect and reverse to get chronological order
    let mut messages: Vec<DbChatMessage> = rows.collect::<SqliteResult<Vec<_>>>()?;
    messages.reverse();
    Ok(messages)
}

/// Get messages for a conversation by session_key
pub fn get_chat_messages_by_session(
    conn: &Connection,
    session_key: &str,
    limit: Option<u32>,
) -> SqliteResult<Vec<DbChatMessage>> {
    let conv_id: Option<String> = conn
        .query_row(
            "SELECT id FROM conversations WHERE session_key = ?1",
            [session_key],
            |row| row.get(0),
        )
        .optional()?;

    match conv_id {
        Some(id) => get_chat_messages(conn, &id, limit, None),
        None => Ok(vec![]),
    }
}

/// Search chat messages across all conversations
pub fn search_chat_messages(
    conn: &Connection,
    query: &str,
    limit: Option<u32>,
) -> SqliteResult<Vec<DbChatMessage>> {
    let limit_val = limit.unwrap_or(50);
    let search_pattern = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, sender_agent_id, sender_agent_name, label, metadata, created_at
         FROM chat_messages
         WHERE content LIKE ?1
         ORDER BY created_at DESC LIMIT ?2"
    )?;
    let rows = stmt.query_map(rusqlite::params![search_pattern, limit_val], |row| {
        Ok(DbChatMessage {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            sender_agent_id: row.get(4)?,
            sender_agent_name: row.get(5)?,
            label: row.get(6)?,
            metadata: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

/// Delete a conversation and all its messages
pub fn delete_conversation(conn: &Connection, conversation_id: &str) -> SqliteResult<()> {
    conn.execute("DELETE FROM conversations WHERE id = ?1", [conversation_id])?;
    Ok(())
}

/// Delete a single chat message
pub fn delete_chat_message(conn: &Connection, message_id: &str) -> SqliteResult<()> {
    // Get conversation_id before deleting
    let conv_id: Option<String> = conn
        .query_row(
            "SELECT conversation_id FROM chat_messages WHERE id = ?1",
            [message_id],
            |row| row.get(0),
        )
        .optional()?;

    conn.execute("DELETE FROM chat_messages WHERE id = ?1", [message_id])?;

    // Decrement message_count
    if let Some(cid) = conv_id {
        conn.execute(
            "UPDATE conversations SET message_count = MAX(0, message_count - 1) WHERE id = ?1",
            [&cid],
        )?;
    }
    Ok(())
}

// ==================== Agent Usage Snapshots ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbUsageSnapshot {
    pub id: Option<i64>,
    pub agent_id: String,
    pub tokens_in: i64,
    pub tokens_out: i64,
    pub cost_usd: f64,
    pub model: Option<String>,
    pub snapshot_at: Option<String>,
}

/// Insert a usage snapshot for an agent
pub fn insert_usage_snapshot(conn: &Connection, snap: &DbUsageSnapshot) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO agent_usage_snapshots (agent_id, tokens_in, tokens_out, cost_usd, model) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![snap.agent_id, snap.tokens_in, snap.tokens_out, snap.cost_usd, snap.model],
    )?;
    Ok(())
}

/// Get the latest usage snapshot for an agent
pub fn get_latest_usage_snapshot(conn: &Connection, agent_id: &str) -> SqliteResult<Option<DbUsageSnapshot>> {
    conn.query_row(
        "SELECT id, agent_id, tokens_in, tokens_out, cost_usd, model, snapshot_at FROM agent_usage_snapshots WHERE agent_id = ?1 ORDER BY snapshot_at DESC LIMIT 1",
        [agent_id],
        |row| Ok(DbUsageSnapshot {
            id: Some(row.get(0)?),
            agent_id: row.get(1)?,
            tokens_in: row.get(2)?,
            tokens_out: row.get(3)?,
            cost_usd: row.get(4)?,
            model: row.get(5)?,
            snapshot_at: row.get(6)?,
        }),
    ).optional()
}

/// Get aggregate usage for an agent (sum of all snapshots)
pub fn get_agent_usage_aggregate(conn: &Connection, agent_id: &str) -> SqliteResult<DbUsageSnapshot> {
    conn.query_row(
        "SELECT COALESCE(SUM(tokens_in), 0), COALESCE(SUM(tokens_out), 0), COALESCE(SUM(cost_usd), 0.0) FROM agent_usage_snapshots WHERE agent_id = ?1",
        [agent_id],
        |row| Ok(DbUsageSnapshot {
            id: None,
            agent_id: agent_id.to_string(),
            tokens_in: row.get(0)?,
            tokens_out: row.get(1)?,
            cost_usd: row.get(2)?,
            model: None,
            snapshot_at: None,
        }),
    )
}

// ==================== Agent Tool Calls ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbToolCall {
    pub id: Option<i64>,
    pub agent_id: String,
    pub tool_name: String,
    pub arguments: Option<String>,
    pub result_summary: Option<String>,
    pub duration_ms: Option<i64>,
    pub status: String,
    pub created_at: Option<String>,
}

/// Insert a tool call record
pub fn insert_tool_call(conn: &Connection, tc: &DbToolCall) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO agent_tool_calls (agent_id, tool_name, arguments, result_summary, duration_ms, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![tc.agent_id, tc.tool_name, tc.arguments, tc.result_summary, tc.duration_ms, tc.status],
    )?;
    Ok(())
}

/// Get recent tool calls for an agent
pub fn get_recent_tool_calls(conn: &Connection, agent_id: &str, limit: u32) -> SqliteResult<Vec<DbToolCall>> {
    let mut stmt = conn.prepare(
        "SELECT id, agent_id, tool_name, arguments, result_summary, duration_ms, status, created_at FROM agent_tool_calls WHERE agent_id = ?1 ORDER BY created_at DESC LIMIT ?2"
    )?;
    let rows = stmt.query_map(rusqlite::params![agent_id, limit], |row| {
        Ok(DbToolCall {
            id: Some(row.get(0)?),
            agent_id: row.get(1)?,
            tool_name: row.get(2)?,
            arguments: row.get(3)?,
            result_summary: row.get(4)?,
            duration_ms: row.get(5)?,
            status: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
    rows.collect()
}

/// Get tool call count for an agent
pub fn get_tool_call_count(conn: &Connection, agent_id: &str) -> SqliteResult<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM agent_tool_calls WHERE agent_id = ?1",
        [agent_id],
        |row| row.get(0),
    )
}

/// Get recent agent activity entries
pub fn get_recent_activity(conn: &Connection, agent_id: &str, limit: u32) -> SqliteResult<Vec<(i64, String, String, Option<String>, Option<String>, String)>> {
    let mut stmt = conn.prepare(
        "SELECT id, agent_id, action_type, description, metadata, created_at FROM agent_activity WHERE agent_id = ?1 ORDER BY created_at DESC LIMIT ?2"
    )?;
    let rows = stmt.query_map(rusqlite::params![agent_id, limit], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, String>(5)?,
        ))
    })?;
    rows.collect()
}

/// Insert an agent activity entry
pub fn insert_agent_activity(conn: &Connection, agent_id: &str, action_type: &str, description: Option<&str>, metadata: Option<&str>) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO agent_activity (agent_id, action_type, description, metadata) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![agent_id, action_type, description, metadata],
    )?;
    Ok(())
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

    #[test]
    fn test_execution_logs_table_created() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Verify execution_logs table exists
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='execution_logs'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_execution_log_insert_and_get() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Insert a project first (required by FK)
        conn.execute(
            "INSERT INTO projects (id, name, status, phase) VALUES (?1, ?2, ?3, ?4)",
            ("proj-1", "Test Project", "active", "planning"),
        ).unwrap();

        // Insert execution log
        let log = DbExecutionLog {
            id: "log-1".to_string(),
            project_id: "proj-1".to_string(),
            phase: "planning".to_string(),
            agent_id: Some("agent-1".to_string()),
            agent_name: Some("Manager Bot".to_string()),
            event_type: "message_sent".to_string(),
            content: Some("📤 Sending requirements to manager".to_string()),
            created_at: "2026-02-24T22:00:00Z".to_string(),
        };
        insert_execution_log(&conn, &log).unwrap();

        // Retrieve logs
        let logs = get_execution_logs(&conn, "proj-1", None).unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].id, "log-1");
        assert_eq!(logs[0].project_id, "proj-1");
        assert_eq!(logs[0].phase, "planning");
        assert_eq!(logs[0].agent_id, Some("agent-1".to_string()));
        assert_eq!(logs[0].agent_name, Some("Manager Bot".to_string()));
        assert_eq!(logs[0].event_type, "message_sent");
        assert_eq!(logs[0].content, Some("📤 Sending requirements to manager".to_string()));
    }

    #[test]
    fn test_execution_log_multiple_and_ordering() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO projects (id, name, status, phase) VALUES (?1, ?2, ?3, ?4)",
            ("proj-1", "Test Project", "active", "planning"),
        ).unwrap();

        // Insert 3 logs with increasing timestamps
        for i in 0..3 {
            let log = DbExecutionLog {
                id: format!("log-{}", i),
                project_id: "proj-1".to_string(),
                phase: "planning".to_string(),
                agent_id: None,
                agent_name: None,
                event_type: format!("event_{}", i),
                content: Some(format!("Log entry {}", i)),
                created_at: format!("2026-02-24T22:00:0{}Z", i),
            };
            insert_execution_log(&conn, &log).unwrap();
        }

        // Get all should return 3 (ordered by created_at DESC)
        let logs = get_execution_logs(&conn, "proj-1", None).unwrap();
        assert_eq!(logs.len(), 3);
        // Most recent first
        assert_eq!(logs[0].id, "log-2");
        assert_eq!(logs[1].id, "log-1");
        assert_eq!(logs[2].id, "log-0");
    }

    #[test]
    fn test_execution_log_limit() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO projects (id, name, status, phase) VALUES (?1, ?2, ?3, ?4)",
            ("proj-1", "Test Project", "active", "planning"),
        ).unwrap();

        // Insert 5 logs
        for i in 0..5 {
            let log = DbExecutionLog {
                id: format!("log-{}", i),
                project_id: "proj-1".to_string(),
                phase: "planning".to_string(),
                agent_id: None,
                agent_name: None,
                event_type: "test".to_string(),
                content: None,
                created_at: format!("2026-02-24T22:00:0{}Z", i),
            };
            insert_execution_log(&conn, &log).unwrap();
        }

        // Limit to 2
        let logs = get_execution_logs(&conn, "proj-1", Some(2)).unwrap();
        assert_eq!(logs.len(), 2);
    }

    #[test]
    fn test_execution_log_delete_all() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO projects (id, name, status, phase) VALUES (?1, ?2, ?3, ?4)",
            ("proj-1", "Test Project", "active", "planning"),
        ).unwrap();

        // Insert 3 logs
        for i in 0..3 {
            let log = DbExecutionLog {
                id: format!("log-{}", i),
                project_id: "proj-1".to_string(),
                phase: "planning".to_string(),
                agent_id: None,
                agent_name: None,
                event_type: "test".to_string(),
                content: None,
                created_at: format!("2026-02-24T22:00:0{}Z", i),
            };
            insert_execution_log(&conn, &log).unwrap();
        }

        // Delete all
        delete_execution_logs(&conn, "proj-1").unwrap();
        let logs = get_execution_logs(&conn, "proj-1", None).unwrap();
        assert_eq!(logs.len(), 0);
    }

    #[test]
    fn test_execution_log_project_isolation() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Insert 2 projects
        conn.execute(
            "INSERT INTO projects (id, name, status, phase) VALUES (?1, ?2, ?3, ?4)",
            ("proj-1", "Project 1", "active", "planning"),
        ).unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, status, phase) VALUES (?1, ?2, ?3, ?4)",
            ("proj-2", "Project 2", "active", "design"),
        ).unwrap();

        // Insert logs for both projects
        let log1 = DbExecutionLog {
            id: "log-p1".to_string(),
            project_id: "proj-1".to_string(),
            phase: "planning".to_string(),
            agent_id: None,
            agent_name: None,
            event_type: "phase_started".to_string(),
            content: Some("Project 1 log".to_string()),
            created_at: "2026-02-24T22:00:00Z".to_string(),
        };
        insert_execution_log(&conn, &log1).unwrap();

        let log2 = DbExecutionLog {
            id: "log-p2".to_string(),
            project_id: "proj-2".to_string(),
            phase: "design".to_string(),
            agent_id: None,
            agent_name: None,
            event_type: "phase_started".to_string(),
            content: Some("Project 2 log".to_string()),
            created_at: "2026-02-24T22:00:01Z".to_string(),
        };
        insert_execution_log(&conn, &log2).unwrap();

        // Each project should only see its own logs
        let logs_p1 = get_execution_logs(&conn, "proj-1", None).unwrap();
        assert_eq!(logs_p1.len(), 1);
        assert_eq!(logs_p1[0].content, Some("Project 1 log".to_string()));

        let logs_p2 = get_execution_logs(&conn, "proj-2", None).unwrap();
        assert_eq!(logs_p2.len(), 1);
        assert_eq!(logs_p2[0].content, Some("Project 2 log".to_string()));

        // Delete only proj-1 logs
        delete_execution_logs(&conn, "proj-1").unwrap();
        let logs_p1 = get_execution_logs(&conn, "proj-1", None).unwrap();
        assert_eq!(logs_p1.len(), 0);
        // proj-2 logs remain
        let logs_p2 = get_execution_logs(&conn, "proj-2", None).unwrap();
        assert_eq!(logs_p2.len(), 1);
    }

    #[test]
    fn test_execution_log_cascade_on_project_delete() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Enable FK enforcement (SQLite default is off)
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

        conn.execute(
            "INSERT INTO projects (id, name, status, phase) VALUES (?1, ?2, ?3, ?4)",
            ("proj-1", "Test Project", "active", "planning"),
        ).unwrap();

        let log = DbExecutionLog {
            id: "log-cascade".to_string(),
            project_id: "proj-1".to_string(),
            phase: "planning".to_string(),
            agent_id: None,
            agent_name: None,
            event_type: "test".to_string(),
            content: None,
            created_at: "2026-02-24T22:00:00Z".to_string(),
        };
        insert_execution_log(&conn, &log).unwrap();

        // Verify log exists
        let logs = get_execution_logs(&conn, "proj-1", None).unwrap();
        assert_eq!(logs.len(), 1);

        // Delete the project — logs should cascade-delete
        conn.execute("DELETE FROM projects WHERE id = ?1", ["proj-1"]).unwrap();
        let logs = get_execution_logs(&conn, "proj-1", None).unwrap();
        assert_eq!(logs.len(), 0);
    }

    // ==================== Chat Persistence Tests ====================

    #[test]
    fn test_conversation_tables_created() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let conv_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='conversations'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(conv_count, 1);

        let msg_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='chat_messages'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(msg_count, 1);
    }

    #[test]
    fn test_get_or_create_conversation() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // First call creates
        let id1 = get_or_create_conversation(
            &conn, "agent:test-1:main", "direct", Some("test-1"), None, Some("Test Chat"),
        ).unwrap();
        assert!(!id1.is_empty());

        // Second call returns same ID (idempotent)
        let id2 = get_or_create_conversation(
            &conn, "agent:test-1:main", "direct", Some("test-1"), None, Some("Different Title"),
        ).unwrap();
        assert_eq!(id1, id2);

        // Different session key creates new conversation
        let id3 = get_or_create_conversation(
            &conn, "team:team-1:group", "group", None, Some("team-1"), Some("Team Chat"),
        ).unwrap();
        assert_ne!(id1, id3);
    }

    #[test]
    fn test_insert_and_get_chat_messages() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let conv_id = get_or_create_conversation(
            &conn, "agent:a1:main", "direct", Some("a1"), None, None,
        ).unwrap();

        // Insert 3 messages
        for i in 0..3 {
            let msg = DbChatMessage {
                id: format!("msg-{}", i),
                conversation_id: conv_id.clone(),
                role: if i % 2 == 0 { "user".to_string() } else { "assistant".to_string() },
                content: format!("Message {}", i),
                sender_agent_id: None,
                sender_agent_name: None,
                label: None,
                metadata: None,
                created_at: format!("2026-02-25T10:00:0{}Z", i),
            };
            insert_chat_message(&conn, &msg).unwrap();
        }

        // Retrieve — should be in chronological order
        let messages = get_chat_messages(&conn, &conv_id, None, None).unwrap();
        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0].content, "Message 0");
        assert_eq!(messages[1].content, "Message 1");
        assert_eq!(messages[2].content, "Message 2");
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].role, "assistant");
    }

    #[test]
    fn test_conversation_metadata_updates() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let conv_id = get_or_create_conversation(
            &conn, "agent:a1:main", "direct", Some("a1"), None, None,
        ).unwrap();

        // Before any messages
        let convs = get_all_conversations(&conn).unwrap();
        assert_eq!(convs[0].message_count, 0);
        assert!(convs[0].last_message_at.is_none());

        // After inserting a message
        let msg = DbChatMessage {
            id: "msg-1".to_string(),
            conversation_id: conv_id.clone(),
            role: "user".to_string(),
            content: "Hello".to_string(),
            sender_agent_id: None,
            sender_agent_name: None,
            label: None,
            metadata: None,
            created_at: "2026-02-25T10:00:00Z".to_string(),
        };
        insert_chat_message(&conn, &msg).unwrap();

        let convs = get_all_conversations(&conn).unwrap();
        assert_eq!(convs[0].message_count, 1);
        assert_eq!(convs[0].last_message_at, Some("2026-02-25T10:00:00Z".to_string()));
    }

    #[test]
    fn test_chat_messages_pagination() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let conv_id = get_or_create_conversation(
            &conn, "agent:a1:main", "direct", Some("a1"), None, None,
        ).unwrap();

        // Insert 10 messages
        for i in 0..10 {
            let msg = DbChatMessage {
                id: format!("msg-{}", i),
                conversation_id: conv_id.clone(),
                role: "user".to_string(),
                content: format!("Message {}", i),
                sender_agent_id: None,
                sender_agent_name: None,
                label: None,
                metadata: None,
                created_at: format!("2026-02-25T10:00:{:02}Z", i),
            };
            insert_chat_message(&conn, &msg).unwrap();
        }

        // Get with limit
        let messages = get_chat_messages(&conn, &conv_id, Some(3), None).unwrap();
        assert_eq!(messages.len(), 3);
        // Should be the LAST 3 in chronological order
        assert_eq!(messages[0].content, "Message 7");
        assert_eq!(messages[2].content, "Message 9");
    }

    #[test]
    fn test_get_chat_messages_by_session() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let session_key = "agent:backend:main";
        let conv_id = get_or_create_conversation(
            &conn, session_key, "direct", Some("backend"), None, None,
        ).unwrap();

        let msg = DbChatMessage {
            id: "msg-session-1".to_string(),
            conversation_id: conv_id,
            role: "user".to_string(),
            content: "Hello Backend!".to_string(),
            sender_agent_id: None,
            sender_agent_name: None,
            label: None,
            metadata: None,
            created_at: "2026-02-25T10:00:00Z".to_string(),
        };
        insert_chat_message(&conn, &msg).unwrap();

        // Lookup by session key
        let messages = get_chat_messages_by_session(&conn, session_key, None).unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].content, "Hello Backend!");

        // Non-existent session returns empty
        let messages = get_chat_messages_by_session(&conn, "agent:nonexistent:main", None).unwrap();
        assert_eq!(messages.len(), 0);
    }

    #[test]
    fn test_search_chat_messages() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let conv_id = get_or_create_conversation(
            &conn, "team:t1:group", "group", None, Some("t1"), None,
        ).unwrap();

        let messages_data = vec![
            ("Planning the portfolio website architecture", "system"),
            ("I propose using React with Tailwind CSS", "assistant"),
            ("APPROVED - the portfolio design looks great", "assistant"),
            ("Starting development phase now", "system"),
        ];
        for (i, (content, role)) in messages_data.iter().enumerate() {
            let msg = DbChatMessage {
                id: format!("msg-search-{}", i),
                conversation_id: conv_id.clone(),
                role: role.to_string(),
                content: content.to_string(),
                sender_agent_id: None,
                sender_agent_name: None,
                label: None,
                metadata: None,
                created_at: format!("2026-02-25T10:00:{:02}Z", i),
            };
            insert_chat_message(&conn, &msg).unwrap();
        }

        // Search for "portfolio"
        let results = search_chat_messages(&conn, "portfolio", None).unwrap();
        assert_eq!(results.len(), 2); // matches "portfolio website" and "portfolio design"

        // Search for "React"
        let results = search_chat_messages(&conn, "React", None).unwrap();
        assert_eq!(results.len(), 1);

        // Search with no matches
        let results = search_chat_messages(&conn, "nonexistent_term", None).unwrap();
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_delete_conversation_cascades() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

        let conv_id = get_or_create_conversation(
            &conn, "agent:a1:main", "direct", Some("a1"), None, None,
        ).unwrap();

        // Insert messages
        for i in 0..3 {
            let msg = DbChatMessage {
                id: format!("msg-del-{}", i),
                conversation_id: conv_id.clone(),
                role: "user".to_string(),
                content: format!("Message {}", i),
                sender_agent_id: None,
                sender_agent_name: None,
                label: None,
                metadata: None,
                created_at: format!("2026-02-25T10:00:0{}Z", i),
            };
            insert_chat_message(&conn, &msg).unwrap();
        }

        // Verify messages exist
        let messages = get_chat_messages(&conn, &conv_id, None, None).unwrap();
        assert_eq!(messages.len(), 3);

        // Delete conversation — messages should cascade
        delete_conversation(&conn, &conv_id).unwrap();

        // Conversation gone
        let convs = get_all_conversations(&conn).unwrap();
        assert_eq!(convs.len(), 0);

        // Messages also gone
        let msg_count: i32 = conn
            .query_row("SELECT COUNT(*) FROM chat_messages", [], |row| row.get(0))
            .unwrap();
        assert_eq!(msg_count, 0);
    }

    #[test]
    fn test_delete_single_message() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let conv_id = get_or_create_conversation(
            &conn, "agent:a1:main", "direct", Some("a1"), None, None,
        ).unwrap();

        for i in 0..3 {
            let msg = DbChatMessage {
                id: format!("msg-single-{}", i),
                conversation_id: conv_id.clone(),
                role: "user".to_string(),
                content: format!("Message {}", i),
                sender_agent_id: None,
                sender_agent_name: None,
                label: None,
                metadata: None,
                created_at: format!("2026-02-25T10:00:0{}Z", i),
            };
            insert_chat_message(&conn, &msg).unwrap();
        }

        // Delete one message
        delete_chat_message(&conn, "msg-single-1").unwrap();

        let messages = get_chat_messages(&conn, &conv_id, None, None).unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].id, "msg-single-0");
        assert_eq!(messages[1].id, "msg-single-2");

        // Message count decremented
        let convs = get_all_conversations(&conn).unwrap();
        assert_eq!(convs[0].message_count, 2);
    }

    #[test]
    fn test_conversations_sorted_by_activity() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Create 3 conversations
        let c1 = get_or_create_conversation(&conn, "agent:a1:main", "direct", Some("a1"), None, Some("Agent 1")).unwrap();
        let c2 = get_or_create_conversation(&conn, "agent:a2:main", "direct", Some("a2"), None, Some("Agent 2")).unwrap();
        let c3 = get_or_create_conversation(&conn, "team:t1:group", "group", None, Some("t1"), Some("Team")).unwrap();

        // Add messages in order: c1 first, c3 last
        for (i, cid) in [&c1, &c2, &c3].iter().enumerate() {
            let msg = DbChatMessage {
                id: format!("msg-sort-{}", i),
                conversation_id: cid.to_string(),
                role: "user".to_string(),
                content: "test".to_string(),
                sender_agent_id: None,
                sender_agent_name: None,
                label: None,
                metadata: None,
                created_at: format!("2026-02-25T10:00:0{}Z", i),
            };
            insert_chat_message(&conn, &msg).unwrap();
        }

        // Most recent first: c3, c2, c1
        let convs = get_all_conversations(&conn).unwrap();
        assert_eq!(convs.len(), 3);
        assert_eq!(convs[0].title, Some("Team".to_string()));
        assert_eq!(convs[1].title, Some("Agent 2".to_string()));
        assert_eq!(convs[2].title, Some("Agent 1".to_string()));
    }
}
