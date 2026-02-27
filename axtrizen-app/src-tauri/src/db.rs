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
    
    // === Phase 4: SQLite Performance Optimizations ===
    // WAL mode allows concurrent reads during writes — critical for
    // 100+ agents logging simultaneously from parallel tasks
    conn.execute_batch("
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA wal_autocheckpoint = 1000;
        PRAGMA cache_size = -20000;
        PRAGMA mmap_size = 268435456;
        PRAGMA temp_store = MEMORY;
    ")?;

    // Run migrations
    run_migrations(&conn)?;
    
    Ok(conn)
}

/// Run database migrations
pub fn run_migrations(conn: &Connection) -> SqliteResult<()> {
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
        .map(|mut stmt| {
            let cols: Vec<String> = stmt
                .query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();
            cols.iter().any(|c| c == "manager_id")
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
        (6, r#"
            -- Epics: Large feature groups within a project
            CREATE TABLE IF NOT EXISTS epics (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'backlog',
                priority INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_epics_project ON epics(project_id);

            -- User Stories: Individual requirements within epics
            CREATE TABLE IF NOT EXISTS stories (
                id TEXT PRIMARY KEY,
                epic_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                acceptance_criteria TEXT,
                story_points INTEGER DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'backlog',
                assigned_agent_id TEXT,
                sprint_id TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (assigned_agent_id) REFERENCES agents(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_stories_epic ON stories(epic_id);
            CREATE INDEX IF NOT EXISTS idx_stories_project ON stories(project_id);
            CREATE INDEX IF NOT EXISTS idx_stories_sprint ON stories(sprint_id);

            -- Tasks: Granular work items within stories
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                story_id TEXT NOT NULL,
                epic_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'todo',
                assigned_agent_id TEXT,
                estimated_minutes INTEGER,
                actual_minutes INTEGER,
                files_created TEXT,
                dependencies TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                started_at TEXT,
                completed_at TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (assigned_agent_id) REFERENCES agents(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_story ON tasks(story_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(assigned_agent_id);

            -- Sprints: Time-boxed iterations
            CREATE TABLE IF NOT EXISTS sprints (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                goal TEXT,
                status TEXT NOT NULL DEFAULT 'planning',
                start_date TEXT,
                end_date TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);
        "#),
        (7, r#"
            -- Workflow templates: domain-agnostic workflow definitions
            CREATE TABLE IF NOT EXISTS workflow_templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                domain TEXT NOT NULL DEFAULT 'general',
                description TEXT,
                icon TEXT,
                is_builtin INTEGER NOT NULL DEFAULT 0,
                template_data TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_wf_templates_domain ON workflow_templates(domain);

            -- Add workflow_template_id to projects (nullable for backward compat)
            ALTER TABLE projects ADD COLUMN workflow_template_id TEXT
                REFERENCES workflow_templates(id) ON DELETE SET NULL;
        "#),
        (8, r#"
            -- === Phase 3: Agent Groups (sub-teams, channels) ===

            -- Agent groups: sub-teams within a team for topic-based communication
            CREATE TABLE IF NOT EXISTS agent_groups (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                maple_topic TEXT NOT NULL,
                max_members INTEGER DEFAULT 50,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_agent_groups_team ON agent_groups(team_id);

            -- Many-to-many: agents can be in multiple groups
            CREATE TABLE IF NOT EXISTS agent_group_members (
                group_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                joined_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (group_id, agent_id),
                FOREIGN KEY (group_id) REFERENCES agent_groups(id) ON DELETE CASCADE,
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
            );

            -- Group-scoped messages (for channel-based chat)
            CREATE TABLE IF NOT EXISTS group_messages (
                id TEXT PRIMARY KEY,
                group_id TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                sender_type TEXT NOT NULL DEFAULT 'agent',
                content TEXT NOT NULL,
                message_type TEXT DEFAULT 'chat',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (group_id) REFERENCES agent_groups(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id);
            CREATE INDEX IF NOT EXISTS idx_group_messages_time ON group_messages(created_at);

            -- === Phase 4: Performance (WAL mode + pragmas) ===
            -- Note: PRAGMA statements don't work in execute_batch in some drivers,
            -- so WAL mode is enforced at connection time in init_db()
        "#),
        (9, r#"
            -- === Unified Skill System (Sprint S1) ===

            -- Skill catalog: read-only reference data from antigravity 950+ skills
            CREATE TABLE IF NOT EXISTS skill_catalog (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT NOT NULL DEFAULT 'uncategorized',
                tags TEXT,                  -- JSON array of tag strings
                risk_level TEXT NOT NULL DEFAULT 'unknown',  -- safe | unknown | critical | offensive
                source TEXT,                -- e.g. "community", "personal", "Apache 2.0"
                source_path TEXT,           -- relative path in antigravity repo
                date_added TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_skill_catalog_category ON skill_catalog(category);
            CREATE INDEX IF NOT EXISTS idx_skill_catalog_risk ON skill_catalog(risk_level);

            -- Agent skills: per-agent installed skills (unified from marketplace + settings)
            CREATE TABLE IF NOT EXISTS agent_skills (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                skill_key TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT NOT NULL DEFAULT 'uncategorized',
                tags TEXT,                  -- JSON array
                risk_level TEXT NOT NULL DEFAULT 'unknown',
                source TEXT NOT NULL DEFAULT 'catalog',  -- catalog | custom | builtin
                version TEXT,
                installed INTEGER NOT NULL DEFAULT 1,
                enabled INTEGER NOT NULL DEFAULT 1,
                config TEXT,                -- JSON object for env vars / settings
                installed_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
                UNIQUE(agent_id, skill_key)
            );
            CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id);
            CREATE INDEX IF NOT EXISTS idx_agent_skills_key ON agent_skills(skill_key);
            CREATE INDEX IF NOT EXISTS idx_agent_skills_category ON agent_skills(category);

            -- Skill bundles: pre-defined skill groups (e.g. "Security Engineer")
            CREATE TABLE IF NOT EXISTS skill_bundles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                icon TEXT,
                skill_keys TEXT NOT NULL,    -- JSON array of skill IDs from catalog
                is_builtin INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Feature flag for unified skills rollout
            INSERT OR IGNORE INTO settings (key, value) VALUES ('unified_skills', 'true');
        "#),

        // ─── Migration v10: Sprint S11–S20 persistence tables ───────────
        (10, r##"
            -- S11: Voice Pipeline config (single-row, upsert pattern)
            CREATE TABLE IF NOT EXISTS voice_pipeline_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                stt_provider TEXT NOT NULL DEFAULT 'Deepgram',
                stt_language TEXT NOT NULL DEFAULT 'en-US',
                stt_model TEXT NOT NULL DEFAULT 'nova-2',
                stt_sample_rate_hz INTEGER NOT NULL DEFAULT 16000,
                stt_channels INTEGER NOT NULL DEFAULT 1,
                stt_interim_results INTEGER NOT NULL DEFAULT 1,
                tts_provider TEXT NOT NULL DEFAULT 'ElevenLabs',
                tts_voice_id TEXT NOT NULL DEFAULT 'default',
                tts_speed REAL NOT NULL DEFAULT 1.0,
                tts_stability REAL NOT NULL DEFAULT 0.5,
                tts_similarity_boost REAL NOT NULL DEFAULT 0.75,
                tts_output_format TEXT NOT NULL DEFAULT 'mp3',
                vad_silence_threshold_ms INTEGER NOT NULL DEFAULT 250,
                vad_min_volume REAL NOT NULL DEFAULT 0.01,
                vad_pre_speech_buffer_ms INTEGER NOT NULL DEFAULT 300,
                ptt_mode TEXT NOT NULL DEFAULT 'PushToTalk',
                ptt_keyboard_shortcut TEXT NOT NULL DEFAULT 'Space',
                ptt_show_waveform INTEGER NOT NULL DEFAULT 1,
                ptt_show_pulsing_indicator INTEGER NOT NULL DEFAULT 1,
                ptt_max_recording_seconds INTEGER NOT NULL DEFAULT 120,
                target_latency_ms INTEGER NOT NULL DEFAULT 2000,
                show_transcription_in_chat INTEGER NOT NULL DEFAULT 1,
                show_audio_playback_button INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT OR IGNORE INTO voice_pipeline_config (id) VALUES (1);

            -- S12: Score weights (single-row config)
            CREATE TABLE IF NOT EXISTS score_weights (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                completion REAL NOT NULL DEFAULT 0.35,
                gate_pass REAL NOT NULL DEFAULT 0.25,
                cost_efficiency REAL NOT NULL DEFAULT 0.20,
                latency REAL NOT NULL DEFAULT 0.20,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT OR IGNORE INTO score_weights (id) VALUES (1);

            -- S12: Agent scores (historical, per computation)
            CREATE TABLE IF NOT EXISTS agent_scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                agent_name TEXT NOT NULL,
                project_id TEXT,
                project_name TEXT,
                completion_score REAL NOT NULL DEFAULT 0.0,
                gate_pass_score REAL NOT NULL DEFAULT 0.0,
                cost_efficiency_score REAL NOT NULL DEFAULT 0.0,
                latency_score REAL NOT NULL DEFAULT 0.0,
                composite_score REAL NOT NULL DEFAULT 0.0,
                star_rating INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_agent_scores_agent ON agent_scores(agent_id);

            -- S12: Skill effectiveness
            CREATE TABLE IF NOT EXISTS skill_effectiveness (
                skill_id TEXT PRIMARY KEY,
                skill_name TEXT NOT NULL,
                invocation_count INTEGER NOT NULL DEFAULT 0,
                positive_outcomes INTEGER NOT NULL DEFAULT 0,
                effectiveness_pct REAL NOT NULL DEFAULT 0.0,
                is_underperforming INTEGER NOT NULL DEFAULT 0,
                alternatives TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- S13: Team templates
            CREATE TABLE IF NOT EXISTS team_templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                version INTEGER NOT NULL DEFAULT 1,
                agents_json TEXT NOT NULL DEFAULT '[]',
                workflow_json TEXT NOT NULL DEFAULT '{}',
                created_from_project TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- S13: Recommendations
            CREATE TABLE IF NOT EXISTS recommendations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'PerformanceBoost',
                impact TEXT NOT NULL DEFAULT 'Medium',
                agent_id TEXT,
                skill_id TEXT,
                dismissed INTEGER NOT NULL DEFAULT 0,
                applied INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- S14: Skill policies
            CREATE TABLE IF NOT EXISTS skill_policies (
                skill_id TEXT PRIMARY KEY,
                skill_name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PendingReview',
                risk_level TEXT NOT NULL DEFAULT 'unknown',
                reviewed_by TEXT,
                reviewed_at TEXT
            );

            -- S14: Approval requests
            CREATE TABLE IF NOT EXISTS approval_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                skill_id TEXT NOT NULL,
                requested_by TEXT NOT NULL,
                reason TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'Pending',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- S14: Tenant config (single-row)
            CREATE TABLE IF NOT EXISTS tenant_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                org_id TEXT NOT NULL DEFAULT 'org-001',
                org_name TEXT NOT NULL DEFAULT 'Default Org',
                row_level_isolation INTEGER NOT NULL DEFAULT 1,
                sync_interval_seconds INTEGER NOT NULL DEFAULT 300,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT OR IGNORE INTO tenant_config (id) VALUES (1);

            -- S15: Usage records (fact table)
            CREATE TABLE IF NOT EXISTS usage_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL,
                team_id TEXT NOT NULL,
                team_name TEXT NOT NULL DEFAULT '',
                model_name TEXT NOT NULL DEFAULT '',
                cost_usd REAL NOT NULL DEFAULT 0.0,
                tokens INTEGER NOT NULL DEFAULT 0,
                api_calls INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_usage_month ON usage_records(month);

            -- S15: Budget config (per team)
            CREATE TABLE IF NOT EXISTS budget_configs (
                team_id TEXT PRIMARY KEY,
                monthly_budget_usd REAL NOT NULL DEFAULT 5000.0,
                soft_limit_pct REAL NOT NULL DEFAULT 80.0,
                hard_limit_pct REAL NOT NULL DEFAULT 100.0,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- S16: Cloud deployment config (single-row)
            CREATE TABLE IF NOT EXISTS cloud_deployment_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                target TEXT NOT NULL DEFAULT 'fly_io',
                regions TEXT NOT NULL DEFAULT '["US","EU"]',
                min_pods INTEGER NOT NULL DEFAULT 1,
                max_pods INTEGER NOT NULL DEFAULT 50,
                auto_scale_enabled INTEGER NOT NULL DEFAULT 1,
                cpu_threshold_pct INTEGER NOT NULL DEFAULT 70,
                memory_threshold_pct INTEGER NOT NULL DEFAULT 80,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT OR IGNORE INTO cloud_deployment_config (id) VALUES (1);

            -- S17: Retention policy (single-row)
            CREATE TABLE IF NOT EXISTS retention_policy (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                retention_days INTEGER NOT NULL DEFAULT 90,
                archive_enabled INTEGER NOT NULL DEFAULT 1,
                archive_location TEXT NOT NULL DEFAULT 's3://axtrizen-archive/audit-logs',
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT OR IGNORE INTO retention_policy (id) VALUES (1);

            -- S17: SOC2 evidence items
            CREATE TABLE IF NOT EXISTS soc2_evidence (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                control TEXT NOT NULL,
                evidence_type TEXT NOT NULL,
                collected INTEGER NOT NULL DEFAULT 0
            );
            INSERT OR IGNORE INTO soc2_evidence (id, category, control, evidence_type, collected)
            VALUES
                (1, 'Access Control', 'CC6.1', 'SSO Configuration', 1),
                (2, 'Logging', 'CC7.2', 'Tamper-proof Audit Log', 1),
                (3, 'Encryption', 'CC6.7', 'TLS Certificate Report', 0),
                (4, 'Availability', 'CC8.1', 'Uptime SLA Report', 0);

            -- S17: Audit log entries (immutable append-only)
            CREATE TABLE IF NOT EXISTS audit_log_entries (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL DEFAULT (datetime('now')),
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                target TEXT NOT NULL DEFAULT '',
                result TEXT NOT NULL DEFAULT 'success',
                hash TEXT NOT NULL DEFAULT '',
                prev_hash TEXT NOT NULL DEFAULT ''
            );

            -- S18: SSO config (single-row)
            CREATE TABLE IF NOT EXISTS sso_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                protocol TEXT NOT NULL DEFAULT 'Saml2',
                provider TEXT NOT NULL DEFAULT 'Okta',
                entity_id TEXT NOT NULL DEFAULT 'https://sso.axtrizen.com/saml',
                sso_url TEXT NOT NULL DEFAULT 'https://login.axtrizen.com/sso',
                jit_provisioning INTEGER NOT NULL DEFAULT 1,
                default_role TEXT NOT NULL DEFAULT 'Viewer',
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT OR IGNORE INTO sso_config (id) VALUES (1);

            -- S19: Enterprise configs (single-row each)
            CREATE TABLE IF NOT EXISTS enterprise_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                load_test_concurrent_users INTEGER NOT NULL DEFAULT 100,
                load_test_concurrent_projects INTEGER NOT NULL DEFAULT 20,
                load_test_target_p95_ms INTEGER NOT NULL DEFAULT 500,
                load_test_duration_seconds INTEGER NOT NULL DEFAULT 300,
                uptime_target_pct REAL NOT NULL DEFAULT 99.9,
                uptime_max_downtime_minutes REAL NOT NULL DEFAULT 43.2,
                uptime_health_check_interval INTEGER NOT NULL DEFAULT 30,
                demo_url TEXT NOT NULL DEFAULT 'https://demo.axtrizen.com',
                demo_sample_projects INTEGER NOT NULL DEFAULT 3,
                demo_sample_agents INTEGER NOT NULL DEFAULT 10,
                demo_pre_loaded_data INTEGER NOT NULL DEFAULT 1,
                doc_admin_guide INTEGER NOT NULL DEFAULT 1,
                doc_api_docs INTEGER NOT NULL DEFAULT 1,
                doc_security_whitepaper INTEGER NOT NULL DEFAULT 0,
                doc_user_guide INTEGER NOT NULL DEFAULT 1,
                doc_migration_guide INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT OR IGNORE INTO enterprise_config (id) VALUES (1);

            -- S20: Regression suite results
            CREATE TABLE IF NOT EXISTS regression_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                total_tests INTEGER NOT NULL DEFAULT 0,
                passed INTEGER NOT NULL DEFAULT 0,
                failed INTEGER NOT NULL DEFAULT 0,
                skipped INTEGER NOT NULL DEFAULT 0,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                all_passing INTEGER NOT NULL DEFAULT 0,
                run_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- S20: Security audit reports
            CREATE TABLE IF NOT EXISTS security_audit_reports (
                id TEXT PRIMARY KEY,
                audit_firm TEXT NOT NULL DEFAULT '',
                audit_date TEXT NOT NULL DEFAULT '',
                critical_resolved INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- S20: Security audit findings
            CREATE TABLE IF NOT EXISTS security_audit_findings (
                id TEXT PRIMARY KEY,
                report_id TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'Informational',
                title TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                resolved INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (report_id) REFERENCES security_audit_reports(id) ON DELETE CASCADE
            );

            -- S20: Monitoring config (single-row)
            CREATE TABLE IF NOT EXISTS monitoring_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                alerting_provider TEXT NOT NULL DEFAULT 'PagerDuty',
                health_check_endpoint TEXT NOT NULL DEFAULT '/healthz',
                metrics_endpoint TEXT NOT NULL DEFAULT '/metrics',
                alert_channels TEXT NOT NULL DEFAULT '["#ops-alerts"]',
                escalation_timeout_minutes INTEGER NOT NULL DEFAULT 15,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT OR IGNORE INTO monitoring_config (id) VALUES (1);

            -- S20: Runbook entries
            CREATE TABLE IF NOT EXISTS runbook_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scenario TEXT NOT NULL,
                symptoms TEXT NOT NULL DEFAULT '[]',
                resolution_steps TEXT NOT NULL DEFAULT '[]',
                estimated_resolution_minutes INTEGER NOT NULL DEFAULT 30
            );

            -- S20: GA release metadata (single-row)
            CREATE TABLE IF NOT EXISTS ga_release_metadata (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                version TEXT NOT NULL DEFAULT '1.0.0',
                release_date TEXT NOT NULL DEFAULT '',
                total_sprints INTEGER NOT NULL DEFAULT 20,
                total_features INTEGER NOT NULL DEFAULT 47,
                total_tests INTEGER NOT NULL DEFAULT 889,
                known_issues TEXT NOT NULL DEFAULT '[]',
                marketing_ready INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT OR IGNORE INTO ga_release_metadata (id) VALUES (1);

            -- Feature flag for sprint S11-S20
            INSERT OR IGNORE INTO settings (key, value) VALUES ('sprint_s11_s20', 'true');
        "##),
        // ── Migration v11: Tables for tracked bugs, release notes, doc coverage ──
        (11, r##"
            CREATE TABLE IF NOT EXISTS tracked_bugs (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'P2',
                status TEXT NOT NULL DEFAULT 'Open',
                sprint_origin TEXT NOT NULL DEFAULT '',
                component TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                resolved_in_commit TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS release_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                sprint TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS doc_coverage (
                feature TEXT PRIMARY KEY,
                has_api_docs INTEGER NOT NULL DEFAULT 0,
                has_user_guide INTEGER NOT NULL DEFAULT 0,
                has_examples INTEGER NOT NULL DEFAULT 0,
                last_updated_sprint TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        "##),
    ]
}

/// Down-migration: revert migration v9 (drop skill system tables)
pub fn down_migrate_v9(conn: &Connection) -> SqliteResult<()> {
    conn.execute_batch(
        "DROP TABLE IF EXISTS agent_skills;
         DROP TABLE IF EXISTS skill_catalog;
         DROP TABLE IF EXISTS skill_bundles;
         DELETE FROM settings WHERE key = 'unified_skills';
         DELETE FROM migrations WHERE version = 9;",
    )?;
    Ok(())
}

/// Check if a feature flag is enabled (reads from settings table)
pub fn is_feature_enabled(conn: &Connection, flag: &str) -> bool {
    get_setting(conn, flag)
        .ok()
        .flatten()
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false)
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
#[allow(clippy::too_many_arguments)]
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

// ==================== Epic CRUD ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbEpic {
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

pub fn get_project_epics(conn: &Connection, project_id: &str) -> SqliteResult<Vec<DbEpic>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, description, status, priority, sort_order, created_at, updated_at
         FROM epics WHERE project_id = ?1 ORDER BY sort_order, created_at"
    )?;
    let rows = stmt.query_map([project_id], |row| {
        Ok(DbEpic {
            id: row.get(0)?, project_id: row.get(1)?, title: row.get(2)?,
            description: row.get(3)?, status: row.get(4)?, priority: row.get(5)?,
            sort_order: row.get(6)?, created_at: row.get(7)?, updated_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

pub fn insert_epic(conn: &Connection, epic: &DbEpic) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO epics (id, project_id, title, description, status, priority, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![epic.id, epic.project_id, epic.title, epic.description, epic.status, epic.priority, epic.sort_order],
    )?;
    Ok(())
}

pub fn update_epic_status(conn: &Connection, id: &str, status: &str) -> SqliteResult<()> {
    conn.execute(
        "UPDATE epics SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
        [status, id],
    )?;
    Ok(())
}

pub fn delete_epic(conn: &Connection, id: &str) -> SqliteResult<()> {
    conn.execute("DELETE FROM epics WHERE id = ?1", [id])?;
    Ok(())
}

// ==================== Story CRUD ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbStory {
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

pub fn get_epic_stories(conn: &Connection, epic_id: &str) -> SqliteResult<Vec<DbStory>> {
    let mut stmt = conn.prepare(
        "SELECT id, epic_id, project_id, title, description, acceptance_criteria, story_points,
                status, assigned_agent_id, sprint_id, sort_order, created_at, updated_at
         FROM stories WHERE epic_id = ?1 ORDER BY sort_order, created_at"
    )?;
    let rows = stmt.query_map([epic_id], |row| {
        Ok(DbStory {
            id: row.get(0)?, epic_id: row.get(1)?, project_id: row.get(2)?,
            title: row.get(3)?, description: row.get(4)?, acceptance_criteria: row.get(5)?,
            story_points: row.get(6)?, status: row.get(7)?, assigned_agent_id: row.get(8)?,
            sprint_id: row.get(9)?, sort_order: row.get(10)?, created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    })?;
    rows.collect()
}

pub fn get_project_stories(conn: &Connection, project_id: &str) -> SqliteResult<Vec<DbStory>> {
    let mut stmt = conn.prepare(
        "SELECT id, epic_id, project_id, title, description, acceptance_criteria, story_points,
                status, assigned_agent_id, sprint_id, sort_order, created_at, updated_at
         FROM stories WHERE project_id = ?1 ORDER BY sort_order, created_at"
    )?;
    let rows = stmt.query_map([project_id], |row| {
        Ok(DbStory {
            id: row.get(0)?, epic_id: row.get(1)?, project_id: row.get(2)?,
            title: row.get(3)?, description: row.get(4)?, acceptance_criteria: row.get(5)?,
            story_points: row.get(6)?, status: row.get(7)?, assigned_agent_id: row.get(8)?,
            sprint_id: row.get(9)?, sort_order: row.get(10)?, created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    })?;
    rows.collect()
}

pub fn insert_story(conn: &Connection, story: &DbStory) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO stories (id, epic_id, project_id, title, description, acceptance_criteria,
         story_points, status, assigned_agent_id, sprint_id, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            story.id, story.epic_id, story.project_id, story.title, story.description,
            story.acceptance_criteria, story.story_points, story.status,
            story.assigned_agent_id, story.sprint_id, story.sort_order
        ],
    )?;
    Ok(())
}

pub fn update_story_status(conn: &Connection, id: &str, status: &str) -> SqliteResult<()> {
    conn.execute(
        "UPDATE stories SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
        [status, id],
    )?;
    Ok(())
}

// ==================== Task CRUD ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbTask {
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

pub fn get_story_tasks(conn: &Connection, story_id: &str) -> SqliteResult<Vec<DbTask>> {
    let mut stmt = conn.prepare(
        "SELECT id, story_id, epic_id, project_id, title, description, status,
                assigned_agent_id, estimated_minutes, actual_minutes, files_created,
                dependencies, sort_order, started_at, completed_at, created_at, updated_at
         FROM tasks WHERE story_id = ?1 ORDER BY sort_order, created_at"
    )?;
    let rows = stmt.query_map([story_id], |row| {
        Ok(DbTask {
            id: row.get(0)?, story_id: row.get(1)?, epic_id: row.get(2)?,
            project_id: row.get(3)?, title: row.get(4)?, description: row.get(5)?,
            status: row.get(6)?, assigned_agent_id: row.get(7)?,
            estimated_minutes: row.get(8)?, actual_minutes: row.get(9)?,
            files_created: row.get(10)?, dependencies: row.get(11)?,
            sort_order: row.get(12)?, started_at: row.get(13)?,
            completed_at: row.get(14)?, created_at: row.get(15)?, updated_at: row.get(16)?,
        })
    })?;
    rows.collect()
}

pub fn get_project_tasks(conn: &Connection, project_id: &str) -> SqliteResult<Vec<DbTask>> {
    let mut stmt = conn.prepare(
        "SELECT id, story_id, epic_id, project_id, title, description, status,
                assigned_agent_id, estimated_minutes, actual_minutes, files_created,
                dependencies, sort_order, started_at, completed_at, created_at, updated_at
         FROM tasks WHERE project_id = ?1 ORDER BY sort_order, created_at"
    )?;
    let rows = stmt.query_map([project_id], |row| {
        Ok(DbTask {
            id: row.get(0)?, story_id: row.get(1)?, epic_id: row.get(2)?,
            project_id: row.get(3)?, title: row.get(4)?, description: row.get(5)?,
            status: row.get(6)?, assigned_agent_id: row.get(7)?,
            estimated_minutes: row.get(8)?, actual_minutes: row.get(9)?,
            files_created: row.get(10)?, dependencies: row.get(11)?,
            sort_order: row.get(12)?, started_at: row.get(13)?,
            completed_at: row.get(14)?, created_at: row.get(15)?, updated_at: row.get(16)?,
        })
    })?;
    rows.collect()
}

pub fn insert_task(conn: &Connection, task: &DbTask) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO tasks (id, story_id, epic_id, project_id, title, description, status,
         assigned_agent_id, estimated_minutes, files_created, dependencies, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            task.id, task.story_id, task.epic_id, task.project_id, task.title,
            task.description, task.status, task.assigned_agent_id,
            task.estimated_minutes, task.files_created, task.dependencies, task.sort_order
        ],
    )?;
    Ok(())
}

pub fn update_task_status(
    conn: &Connection, id: &str, status: &str,
    files_created: Option<&str>, started_at: Option<&str>, completed_at: Option<&str>,
) -> SqliteResult<()> {
    conn.execute(
        "UPDATE tasks SET status = ?1, files_created = COALESCE(?2, files_created),
         started_at = COALESCE(?3, started_at), completed_at = COALESCE(?4, completed_at),
         updated_at = datetime('now') WHERE id = ?5",
        rusqlite::params![status, files_created, started_at, completed_at, id],
    )?;
    Ok(())
}

// ==================== Sprint CRUD ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbSprint {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub goal: Option<String>,
    pub status: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub created_at: String,
}

pub fn get_project_sprints(conn: &Connection, project_id: &str) -> SqliteResult<Vec<DbSprint>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, goal, status, start_date, end_date, created_at
         FROM sprints WHERE project_id = ?1 ORDER BY created_at"
    )?;
    let rows = stmt.query_map([project_id], |row| {
        Ok(DbSprint {
            id: row.get(0)?, project_id: row.get(1)?, name: row.get(2)?,
            goal: row.get(3)?, status: row.get(4)?, start_date: row.get(5)?,
            end_date: row.get(6)?, created_at: row.get(7)?,
        })
    })?;
    rows.collect()
}

pub fn insert_sprint(conn: &Connection, sprint: &DbSprint) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO sprints (id, project_id, name, goal, status, start_date, end_date)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            sprint.id, sprint.project_id, sprint.name, sprint.goal,
            sprint.status, sprint.start_date, sprint.end_date
        ],
    )?;
    Ok(())
}

pub fn update_sprint_status(conn: &Connection, id: &str, status: &str) -> SqliteResult<()> {
    conn.execute(
        "UPDATE sprints SET status = ?1 WHERE id = ?2",
        [status, id],
    )?;
    Ok(())
}

// ==================== Skill Catalog & Agent Skills CRUD ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbSkillCatalogEntry {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub tags: Option<String>,
    pub risk_level: String,
    pub source: Option<String>,
    pub source_path: Option<String>,
    pub date_added: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbAgentSkill {
    pub id: String,
    pub agent_id: String,
    pub skill_key: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub tags: Option<String>,
    pub risk_level: String,
    pub source: String,
    pub version: Option<String>,
    pub installed: bool,
    pub enabled: bool,
    pub config: Option<String>,
    pub installed_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbSkillBundle {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub skill_keys: String, // JSON array
    pub is_builtin: bool,
}

/// Embedded skill catalog JSON (antigravity 950+ skills)
const EMBEDDED_SKILLS_CATALOG: &str = include_str!("../data/skills_catalog.json");

/// Auto-seed the skill catalog on first launch (idempotent — skips if already populated)
pub fn seed_catalog_if_empty(conn: &Connection) -> Result<usize, String> {
    let count = get_catalog_count(conn).map_err(|e| format!("DB count error: {}", e))?;
    if count > 0 {
        return Ok(0); // already seeded
    }

    let entries: Vec<serde_json::Value> = serde_json::from_str(EMBEDDED_SKILLS_CATALOG)
        .map_err(|e| format!("JSON parse error: {}", e))?;

    let db_entries: Vec<DbSkillCatalogEntry> = entries
        .iter()
        .filter_map(|e| {
            Some(DbSkillCatalogEntry {
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

    let inserted = bulk_insert_catalog(conn, &db_entries)
        .map_err(|e| format!("Bulk insert error: {}", e))?;
    Ok(inserted)
}

/// Bulk-insert skill catalog entries (used during first-launch indexing)
pub fn bulk_insert_catalog(conn: &Connection, entries: &[DbSkillCatalogEntry]) -> SqliteResult<usize> {
    let mut count = 0;
    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT OR REPLACE INTO skill_catalog (id, name, description, category, tags, risk_level, source, source_path, date_added)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
        )?;
        for entry in entries {
            stmt.execute((
                &entry.id,
                &entry.name,
                &entry.description,
                &entry.category,
                &entry.tags,
                &entry.risk_level,
                &entry.source,
                &entry.source_path,
                &entry.date_added,
            ))?;
            count += 1;
        }
    }
    tx.commit()?;
    Ok(count)
}

/// Get total count of catalog entries
pub fn get_catalog_count(conn: &Connection) -> SqliteResult<i64> {
    conn.query_row("SELECT COUNT(*) FROM skill_catalog", [], |row| row.get(0))
}

/// Search skill catalog by query (name, description, tags)
pub fn search_skill_catalog(
    conn: &Connection,
    query: &str,
    category: Option<&str>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> SqliteResult<Vec<DbSkillCatalogEntry>> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    let search_pattern = format!("%{}%", query.to_lowercase());

    let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(cat) = category {
        (
            "SELECT id, name, description, category, tags, risk_level, source, source_path, date_added
             FROM skill_catalog
             WHERE (LOWER(name) LIKE ?1 OR LOWER(description) LIKE ?1 OR LOWER(tags) LIKE ?1)
               AND category = ?2
             ORDER BY name
             LIMIT ?3 OFFSET ?4".to_string(),
            vec![
                Box::new(search_pattern),
                Box::new(cat.to_string()),
                Box::new(limit),
                Box::new(offset),
            ],
        )
    } else {
        (
            "SELECT id, name, description, category, tags, risk_level, source, source_path, date_added
             FROM skill_catalog
             WHERE LOWER(name) LIKE ?1 OR LOWER(description) LIKE ?1 OR LOWER(tags) LIKE ?1
             ORDER BY name
             LIMIT ?2 OFFSET ?3".to_string(),
            vec![
                Box::new(search_pattern),
                Box::new(limit),
                Box::new(offset),
            ],
        )
    };

    let mut stmt = conn.prepare(&sql)?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt.query_map(params_refs.as_slice(), |row| {
        Ok(DbSkillCatalogEntry {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            category: row.get(3)?,
            tags: row.get(4)?,
            risk_level: row.get(5)?,
            source: row.get(6)?,
            source_path: row.get(7)?,
            date_added: row.get(8)?,
        })
    })?;
    rows.collect()
}

/// Get all categories with counts
pub fn get_catalog_categories(conn: &Connection) -> SqliteResult<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT category, COUNT(*) as cnt FROM skill_catalog GROUP BY category ORDER BY cnt DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    rows.collect()
}

/// Get a single catalog entry by ID
pub fn get_catalog_entry(conn: &Connection, id: &str) -> SqliteResult<Option<DbSkillCatalogEntry>> {
    conn.query_row(
        "SELECT id, name, description, category, tags, risk_level, source, source_path, date_added
         FROM skill_catalog WHERE id = ?1",
        [id],
        |row| Ok(DbSkillCatalogEntry {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            category: row.get(3)?,
            tags: row.get(4)?,
            risk_level: row.get(5)?,
            source: row.get(6)?,
            source_path: row.get(7)?,
            date_added: row.get(8)?,
        }),
    ).optional()
}

/// Install a skill for an agent (from catalog or custom)
pub fn install_agent_skill(conn: &Connection, skill: &DbAgentSkill) -> SqliteResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO agent_skills
         (id, agent_id, skill_key, name, description, category, tags, risk_level, source, version, installed, enabled, config)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        (
            &skill.id,
            &skill.agent_id,
            &skill.skill_key,
            &skill.name,
            &skill.description,
            &skill.category,
            &skill.tags,
            &skill.risk_level,
            &skill.source,
            &skill.version,
            &skill.installed,
            &skill.enabled,
            &skill.config,
        ),
    )?;
    Ok(())
}

/// Get all installed skills for an agent
pub fn get_agent_skills(conn: &Connection, agent_id: &str) -> SqliteResult<Vec<DbAgentSkill>> {
    let mut stmt = conn.prepare(
        "SELECT id, agent_id, skill_key, name, description, category, tags, risk_level, source,
                version, installed, enabled, config, installed_at, updated_at
         FROM agent_skills
         WHERE agent_id = ?1 AND installed = 1
         ORDER BY name"
    )?;
    let rows = stmt.query_map([agent_id], |row| {
        Ok(DbAgentSkill {
            id: row.get(0)?,
            agent_id: row.get(1)?,
            skill_key: row.get(2)?,
            name: row.get(3)?,
            description: row.get(4)?,
            category: row.get(5)?,
            tags: row.get(6)?,
            risk_level: row.get(7)?,
            source: row.get(8)?,
            version: row.get(9)?,
            installed: row.get(10)?,
            enabled: row.get(11)?,
            config: row.get(12)?,
            installed_at: row.get(13)?,
            updated_at: row.get(14)?,
        })
    })?;
    rows.collect()
}

/// Remove a skill from an agent
pub fn remove_agent_skill(conn: &Connection, agent_id: &str, skill_key: &str) -> SqliteResult<()> {
    conn.execute(
        "DELETE FROM agent_skills WHERE agent_id = ?1 AND skill_key = ?2",
        [agent_id, skill_key],
    )?;
    Ok(())
}

/// Update skill configuration (env vars, enabled state)
pub fn update_agent_skill_config(
    conn: &Connection,
    agent_id: &str,
    skill_key: &str,
    config: Option<&str>,
    enabled: Option<bool>,
) -> SqliteResult<()> {
    if let Some(cfg) = config {
        conn.execute(
            "UPDATE agent_skills SET config = ?1, updated_at = datetime('now')
             WHERE agent_id = ?2 AND skill_key = ?3",
            (cfg, agent_id, skill_key),
        )?;
    }
    if let Some(en) = enabled {
        conn.execute(
            "UPDATE agent_skills SET enabled = ?1, updated_at = datetime('now')
             WHERE agent_id = ?2 AND skill_key = ?3",
            (en, agent_id, skill_key),
        )?;
    }
    Ok(())
}

/// Bulk-insert skill bundles
pub fn seed_skill_bundles(conn: &Connection, bundles: &[DbSkillBundle]) -> SqliteResult<()> {
    let mut stmt = conn.prepare(
        "INSERT OR REPLACE INTO skill_bundles (id, name, description, icon, skill_keys, is_builtin)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    )?;
    for bundle in bundles {
        stmt.execute((
            &bundle.id,
            &bundle.name,
            &bundle.description,
            &bundle.icon,
            &bundle.skill_keys,
            &bundle.is_builtin,
        ))?;
    }
    Ok(())
}

/// Get all skill bundles
pub fn get_skill_bundles(conn: &Connection) -> SqliteResult<Vec<DbSkillBundle>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, icon, skill_keys, is_builtin FROM skill_bundles ORDER BY name"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DbSkillBundle {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            icon: row.get(3)?,
            skill_keys: row.get(4)?,
            is_builtin: row.get(5)?,
        })
    })?;
    rows.collect()
}

/// Get the total count of matching skills for a search query (for filtered pagination)
pub fn search_skill_catalog_count(
    conn: &Connection,
    query: &str,
    category: Option<&str>,
) -> SqliteResult<i64> {
    let search_pattern = format!("%{}%", query.to_lowercase());
    if let Some(cat) = category {
        conn.query_row(
            "SELECT COUNT(*) FROM skill_catalog
             WHERE (LOWER(name) LIKE ?1 OR LOWER(description) LIKE ?1 OR LOWER(tags) LIKE ?1)
               AND category = ?2",
            rusqlite::params![search_pattern, cat],
            |row| row.get(0),
        )
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM skill_catalog
             WHERE LOWER(name) LIKE ?1 OR LOWER(description) LIKE ?1 OR LOWER(tags) LIKE ?1",
            [&search_pattern],
            |row| row.get(0),
        )
    }
}

// ==================== Workflow Template CRUD ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbWorkflowTemplate {
    pub id: String,
    pub name: String,
    pub domain: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub is_builtin: bool,
    pub template_data: String, // JSON blob
    pub created_at: String,
    pub updated_at: String,
}

/// Seed built-in workflow templates into the database (idempotent).
pub fn seed_builtin_templates(conn: &Connection) -> SqliteResult<()> {
    use crate::workflow_templates;
    for template in workflow_templates::get_builtin_templates() {
        let data = serde_json::to_string(&template).unwrap_or_default();
        conn.execute(
            "INSERT OR REPLACE INTO workflow_templates (id, name, domain, description, icon, is_builtin, template_data, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, datetime('now'))",
            rusqlite::params![template.id, template.name, template.domain, template.description, template.icon, data],
        )?;
    }
    Ok(())
}

/// Get all workflow templates.
pub fn get_all_workflow_templates(conn: &Connection) -> SqliteResult<Vec<DbWorkflowTemplate>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, domain, description, icon, is_builtin, template_data, created_at, updated_at
         FROM workflow_templates ORDER BY is_builtin DESC, name"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DbWorkflowTemplate {
            id: row.get(0)?,
            name: row.get(1)?,
            domain: row.get(2)?,
            description: row.get(3)?,
            icon: row.get(4)?,
            is_builtin: row.get::<_, i32>(5)? != 0,
            template_data: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

/// Get a single workflow template by ID.
pub fn get_workflow_template(conn: &Connection, id: &str) -> SqliteResult<Option<DbWorkflowTemplate>> {
    conn.query_row(
        "SELECT id, name, domain, description, icon, is_builtin, template_data, created_at, updated_at
         FROM workflow_templates WHERE id = ?1",
        [id],
        |row| {
            Ok(DbWorkflowTemplate {
                id: row.get(0)?,
                name: row.get(1)?,
                domain: row.get(2)?,
                description: row.get(3)?,
                icon: row.get(4)?,
                is_builtin: row.get::<_, i32>(5)? != 0,
                template_data: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    ).optional()
}

/// Get the workflow template assigned to a project.
pub fn get_project_workflow_template(conn: &Connection, project_id: &str) -> SqliteResult<Option<DbWorkflowTemplate>> {
    conn.query_row(
        "SELECT wt.id, wt.name, wt.domain, wt.description, wt.icon, wt.is_builtin, wt.template_data, wt.created_at, wt.updated_at
         FROM workflow_templates wt
         JOIN projects p ON p.workflow_template_id = wt.id
         WHERE p.id = ?1",
        [project_id],
        |row| {
            Ok(DbWorkflowTemplate {
                id: row.get(0)?,
                name: row.get(1)?,
                domain: row.get(2)?,
                description: row.get(3)?,
                icon: row.get(4)?,
                is_builtin: row.get::<_, i32>(5)? != 0,
                template_data: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    ).optional()
}

/// Assign a workflow template to a project.
pub fn set_project_workflow_template(conn: &Connection, project_id: &str, template_id: &str) -> SqliteResult<()> {
    conn.execute(
        "UPDATE projects SET workflow_template_id = ?1, updated_at = datetime('now') WHERE id = ?2",
        [template_id, project_id],
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
#[allow(clippy::type_complexity)]
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

// ==================== Agent Groups CRUD (Phase 3) ====================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbAgentGroup {
    pub id: String,
    pub team_id: String,
    pub name: String,
    pub description: Option<String>,
    pub maple_topic: String,
    pub max_members: i32,
    pub member_count: i32,
    pub created_at: String,
}

/// Create a new agent group (sub-team/channel)
pub fn create_agent_group(
    conn: &Connection,
    id: &str,
    team_id: &str,
    name: &str,
    description: Option<&str>,
    maple_topic: &str,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO agent_groups (id, team_id, name, description, maple_topic) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, team_id, name, description, maple_topic],
    )?;
    Ok(())
}

/// Get all groups for a team
pub fn get_agent_groups(conn: &Connection, team_id: &str) -> SqliteResult<Vec<DbAgentGroup>> {
    let mut stmt = conn.prepare(
        "SELECT g.id, g.team_id, g.name, g.description, g.maple_topic, g.max_members,
                COALESCE((SELECT COUNT(*) FROM agent_group_members WHERE group_id = g.id), 0) as member_count,
                g.created_at
         FROM agent_groups g WHERE g.team_id = ?1 ORDER BY g.name"
    )?;
    let groups = stmt.query_map([team_id], |row| {
        Ok(DbAgentGroup {
            id: row.get(0)?,
            team_id: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            maple_topic: row.get(4)?,
            max_members: row.get(5)?,
            member_count: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?.collect::<SqliteResult<Vec<_>>>()?;
    Ok(groups)
}

/// Add an agent to a group
pub fn add_agent_to_group(conn: &Connection, group_id: &str, agent_id: &str) -> SqliteResult<()> {
    conn.execute(
        "INSERT OR IGNORE INTO agent_group_members (group_id, agent_id) VALUES (?1, ?2)",
        rusqlite::params![group_id, agent_id],
    )?;
    Ok(())
}

/// Remove an agent from a group
pub fn remove_agent_from_group(conn: &Connection, group_id: &str, agent_id: &str) -> SqliteResult<()> {
    conn.execute(
        "DELETE FROM agent_group_members WHERE group_id = ?1 AND agent_id = ?2",
        rusqlite::params![group_id, agent_id],
    )?;
    Ok(())
}

/// Get all agent IDs in a group
pub fn get_group_members(conn: &Connection, group_id: &str) -> SqliteResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT agent_id FROM agent_group_members WHERE group_id = ?1 ORDER BY joined_at"
    )?;
    let ids = stmt.query_map([group_id], |row| row.get(0))?.collect::<SqliteResult<Vec<String>>>()?;
    Ok(ids)
}

/// Insert a message into a group channel
pub fn insert_group_message(
    conn: &Connection,
    id: &str,
    group_id: &str,
    sender_id: &str,
    sender_type: &str,
    content: &str,
    message_type: &str,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO group_messages (id, group_id, sender_id, sender_type, content, message_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, group_id, sender_id, sender_type, content, message_type],
    )?;
    Ok(())
}

/// Get messages for a group (with optional limit)
pub fn get_group_messages(conn: &Connection, group_id: &str, limit: Option<i32>) -> SqliteResult<Vec<serde_json::Value>> {
    let limit = limit.unwrap_or(100);
    let mut stmt = conn.prepare(
        "SELECT id, group_id, sender_id, sender_type, content, message_type, created_at
         FROM group_messages WHERE group_id = ?1 ORDER BY created_at DESC LIMIT ?2"
    )?;
    let msgs = stmt.query_map(rusqlite::params![group_id, limit], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "groupId": row.get::<_, String>(1)?,
            "senderId": row.get::<_, String>(2)?,
            "senderType": row.get::<_, String>(3)?,
            "content": row.get::<_, String>(4)?,
            "messageType": row.get::<_, String>(5)?,
            "createdAt": row.get::<_, String>(6)?,
        }))
    })?.collect::<SqliteResult<Vec<_>>>()?;
    Ok(msgs)
}

/// Delete a group and all its members/messages (cascade)
pub fn delete_agent_group(conn: &Connection, group_id: &str) -> SqliteResult<()> {
    conn.execute("DELETE FROM agent_groups WHERE id = ?1", [group_id])?;
    Ok(())
}


// ==================== Sprint S11–S20 CRUD ====================

/// S11: Load voice pipeline config from DB
pub fn get_voice_pipeline_config_db(conn: &Connection) -> SqliteResult<serde_json::Value> {
    let mut stmt = conn.prepare(
        "SELECT stt_provider, stt_language, stt_model, stt_sample_rate_hz, stt_channels, stt_interim_results,
                tts_provider, tts_voice_id, tts_speed, tts_stability, tts_similarity_boost, tts_output_format,
                vad_silence_threshold_ms, vad_min_volume, vad_pre_speech_buffer_ms,
                ptt_mode, ptt_keyboard_shortcut, ptt_show_waveform, ptt_show_pulsing_indicator, ptt_max_recording_seconds,
                target_latency_ms, show_transcription_in_chat, show_audio_playback_button
         FROM voice_pipeline_config WHERE id = 1"
    )?;
    let row = stmt.query_row([], |r| {
        Ok(serde_json::json!({
            "stt": {
                "provider": r.get::<_, String>(0)?,
                "language": r.get::<_, String>(1)?,
                "model": r.get::<_, String>(2)?,
                "sample_rate_hz": r.get::<_, u32>(3)?,
                "channels": r.get::<_, u8>(4)?,
                "interim_results": r.get::<_, bool>(5)?
            },
            "tts": {
                "provider": r.get::<_, String>(6)?,
                "voice_id": r.get::<_, String>(7)?,
                "speed": r.get::<_, f64>(8)?,
                "stability": r.get::<_, f64>(9)?,
                "similarity_boost": r.get::<_, f64>(10)?,
                "output_format": r.get::<_, String>(11)?
            },
            "vad": {
                "silence_threshold_ms": r.get::<_, u32>(12)?,
                "min_volume": r.get::<_, f64>(13)?,
                "pre_speech_buffer_ms": r.get::<_, u32>(14)?
            },
            "push_to_talk": {
                "mode": r.get::<_, String>(15)?,
                "keyboard_shortcut": r.get::<_, String>(16)?,
                "show_waveform": r.get::<_, bool>(17)?,
                "show_pulsing_indicator": r.get::<_, bool>(18)?,
                "max_recording_seconds": r.get::<_, u32>(19)?
            },
            "target_latency_ms": r.get::<_, i64>(20)?,
            "show_transcription_in_chat": r.get::<_, bool>(21)?,
            "show_audio_playback_button": r.get::<_, bool>(22)?
        }))
    })?;
    Ok(row)
}

/// S12: Load score weights
pub fn get_score_weights_db(conn: &Connection) -> SqliteResult<(f64, f64, f64, f64)> {
    conn.query_row(
        "SELECT completion, gate_pass, cost_efficiency, latency FROM score_weights WHERE id = 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )
}

/// S12: Insert an agent score
pub fn insert_agent_score(
    conn: &Connection,
    agent_id: &str, agent_name: &str, project_id: Option<&str>, project_name: Option<&str>,
    completion: f64, gate_pass: f64, cost_eff: f64, latency: f64, composite: f64, stars: u8,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO agent_scores (agent_id, agent_name, project_id, project_name, completion_score, gate_pass_score, cost_efficiency_score, latency_score, composite_score, star_rating)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![agent_id, agent_name, project_id, project_name, completion, gate_pass, cost_eff, latency, composite, stars],
    )?;
    Ok(())
}

/// S12: Get agent score history
pub fn get_agent_score_history(conn: &Connection, agent_id: &str) -> SqliteResult<Vec<(String, String, f64, u8, String)>> {
    let mut stmt = conn.prepare(
        "SELECT COALESCE(project_id,''), COALESCE(project_name,''), composite_score, star_rating, created_at
         FROM agent_scores WHERE agent_id = ?1 ORDER BY created_at DESC LIMIT 20"
    )?;
    let rows = stmt.query_map([agent_id], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
    })?;
    rows.collect()
}

/// S12: Get all skill effectiveness records
pub fn get_skill_effectiveness_db(conn: &Connection) -> SqliteResult<Vec<(String, String, u32, u32, f64, bool, String)>> {
    let mut stmt = conn.prepare(
        "SELECT skill_id, skill_name, invocation_count, positive_outcomes, effectiveness_pct, is_underperforming, alternatives
         FROM skill_effectiveness ORDER BY effectiveness_pct DESC"
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?))
    })?;
    rows.collect()
}

/// S13: Get a team template by ID
pub fn get_team_template_db(conn: &Connection, id: &str) -> SqliteResult<(String, String, String, u32, String, String, Option<String>, String)> {
    conn.query_row(
        "SELECT id, name, description, version, agents_json, workflow_json, created_from_project, created_at
         FROM team_templates WHERE id = ?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?)),
    )
}

/// S13: Get first team template
pub fn get_first_team_template(conn: &Connection) -> SqliteResult<(String, String, String, u32, String, String, Option<String>, String)> {
    conn.query_row(
        "SELECT id, name, description, version, agents_json, workflow_json, created_from_project, created_at
         FROM team_templates ORDER BY created_at ASC LIMIT 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?)),
    )
}

/// S13: Insert or update a team template
pub fn upsert_team_template(
    conn: &Connection,
    id: &str, name: &str, description: &str, version: u32,
    agents_json: &str, workflow_json: &str, created_from: Option<&str>,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO team_templates (id, name, description, version, agents_json, workflow_json, created_from_project)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, name, description, version, agents_json, workflow_json, created_from],
    )?;
    Ok(())
}

/// S13: Get all recommendations
pub fn get_recommendations_db(conn: &Connection) -> SqliteResult<Vec<(String, String, String, String, String, Option<String>, Option<String>, bool, bool)>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, description, category, impact, agent_id, skill_id, dismissed, applied
         FROM recommendations ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?))
    })?;
    rows.collect()
}

/// S13: Update recommendation dismissed/applied status
pub fn update_recommendation_status(conn: &Connection, id: &str, dismissed: bool, applied: bool) -> SqliteResult<()> {
    conn.execute(
        "UPDATE recommendations SET dismissed = ?2, applied = ?3 WHERE id = ?1",
        rusqlite::params![id, dismissed, applied],
    )?;
    Ok(())
}

/// S14: Get all skill policies
pub fn get_skill_policies_db(conn: &Connection) -> SqliteResult<Vec<(String, String, String, String, Option<String>, Option<String>)>> {
    let mut stmt = conn.prepare(
        "SELECT skill_id, skill_name, status, risk_level, reviewed_by, reviewed_at FROM skill_policies"
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
    })?;
    rows.collect()
}

/// S14: Get tenant config
pub fn get_tenant_config_db(conn: &Connection) -> SqliteResult<(String, String, bool, i64)> {
    conn.query_row(
        "SELECT org_id, org_name, row_level_isolation, sync_interval_seconds FROM tenant_config WHERE id = 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )
}

/// S14: Insert approval request
pub fn insert_approval_request(conn: &Connection, skill_id: &str, user: &str, reason: &str) -> SqliteResult<String> {
    conn.execute(
        "INSERT INTO approval_requests (skill_id, requested_by, reason, status) VALUES (?1, ?2, ?3, 'Pending')",
        rusqlite::params![skill_id, user, reason],
    )?;
    Ok("Pending".to_string())
}

/// S15: Get usage summary for a month
pub fn get_usage_summary_db(conn: &Connection, month: &str) -> SqliteResult<(f64, i64, i64, Vec<(String, String, f64, i64)>, Vec<(String, f64, i64, i64)>)> {
    // Team breakdown
    let mut team_stmt = conn.prepare(
        "SELECT team_id, team_name, SUM(cost_usd), SUM(tokens) FROM usage_records WHERE month = ?1 GROUP BY team_id, team_name"
    )?;
    let teams: Vec<(String, String, f64, i64)> = team_stmt.query_map([month], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
    })?.filter_map(|r| r.ok()).collect();

    // Model breakdown
    let mut model_stmt = conn.prepare(
        "SELECT model_name, SUM(cost_usd), SUM(tokens), SUM(api_calls) FROM usage_records WHERE month = ?1 GROUP BY model_name"
    )?;
    let models: Vec<(String, f64, i64, i64)> = model_stmt.query_map([month], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
    })?.filter_map(|r| r.ok()).collect();

    // Totals
    let (total_cost, total_tokens, total_calls): (f64, i64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(cost_usd),0), COALESCE(SUM(tokens),0), COALESCE(SUM(api_calls),0) FROM usage_records WHERE month = ?1",
        [month],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;

    Ok((total_cost, total_tokens, total_calls, teams, models))
}

/// S15: Get budget config
pub fn get_budget_config_db(conn: &Connection) -> SqliteResult<(String, f64, f64, f64)> {
    conn.query_row(
        "SELECT team_id, monthly_budget_usd, soft_limit_pct, hard_limit_pct FROM budget_configs LIMIT 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )
}

/// S15: Export usage as CSV string
pub fn export_usage_csv_db(conn: &Connection) -> SqliteResult<String> {
    let mut stmt = conn.prepare(
        "SELECT month, team_id, team_name, model_name, cost_usd, tokens, api_calls FROM usage_records ORDER BY month, team_id"
    )?;
    let mut csv = String::from("month,team_id,team_name,model_name,cost_usd,tokens,api_calls\n");
    let rows = stmt.query_map([], |r| {
        Ok(format!("{},{},{},{},{:.2},{},{}\n",
            r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?,
            r.get::<_, String>(3)?, r.get::<_, f64>(4)?, r.get::<_, i64>(5)?, r.get::<_, i64>(6)?
        ))
    })?;
    for row in rows {
        csv.push_str(&row?);
    }
    Ok(csv)
}

/// S16: Get cloud deployment config
pub fn get_cloud_config_db(conn: &Connection) -> SqliteResult<(String, String, u32, u32, bool, u32, u32)> {
    conn.query_row(
        "SELECT target, regions, min_pods, max_pods, auto_scale_enabled, cpu_threshold_pct, memory_threshold_pct
         FROM cloud_deployment_config WHERE id = 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
    )
}

/// S17: Get retention policy
pub fn get_retention_policy_db(conn: &Connection) -> SqliteResult<(u32, bool, String)> {
    conn.query_row(
        "SELECT retention_days, archive_enabled, archive_location FROM retention_policy WHERE id = 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
}

/// S17: Get SOC2 checklist
pub fn get_soc2_checklist_db(conn: &Connection) -> SqliteResult<Vec<(String, String, String, bool)>> {
    let mut stmt = conn.prepare("SELECT category, control, evidence_type, collected FROM soc2_evidence")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
    })?;
    rows.collect()
}

/// S18: Get SSO config
pub fn get_sso_config_db(conn: &Connection) -> SqliteResult<(String, String, String, String, bool, String)> {
    conn.query_row(
        "SELECT protocol, provider, entity_id, sso_url, jit_provisioning, default_role FROM sso_config WHERE id = 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
    )
}

/// S19: Get enterprise config (all sub-configs in one row)
pub fn get_enterprise_config_db(conn: &Connection) -> SqliteResult<serde_json::Value> {
    conn.query_row(
        "SELECT load_test_concurrent_users, load_test_concurrent_projects, load_test_target_p95_ms, load_test_duration_seconds,
                uptime_target_pct, uptime_max_downtime_minutes, uptime_health_check_interval,
                demo_url, demo_sample_projects, demo_sample_agents, demo_pre_loaded_data,
                doc_admin_guide, doc_api_docs, doc_security_whitepaper, doc_user_guide, doc_migration_guide
         FROM enterprise_config WHERE id = 1",
        [],
        |r| {
            Ok(serde_json::json!({
                "load_test": {
                    "concurrent_users": r.get::<_, u32>(0)?,
                    "concurrent_projects": r.get::<_, u32>(1)?,
                    "target_p95_ms": r.get::<_, i64>(2)?,
                    "duration_seconds": r.get::<_, i64>(3)?
                },
                "uptime": {
                    "target_uptime_pct": r.get::<_, f64>(4)?,
                    "max_downtime_minutes_per_month": r.get::<_, f64>(5)?,
                    "health_check_interval_seconds": r.get::<_, u32>(6)?
                },
                "demo": {
                    "url": r.get::<_, String>(7)?,
                    "sample_projects": r.get::<_, u32>(8)?,
                    "sample_agents": r.get::<_, u32>(9)?,
                    "pre_loaded_data": r.get::<_, bool>(10)?
                },
                "docs": {
                    "admin_guide": r.get::<_, bool>(11)?,
                    "api_docs": r.get::<_, bool>(12)?,
                    "security_whitepaper": r.get::<_, bool>(13)?,
                    "user_guide": r.get::<_, bool>(14)?,
                    "migration_guide": r.get::<_, bool>(15)?
                }
            }))
        },
    )
}

/// S20: Get latest regression result
pub fn get_regression_result_db(conn: &Connection) -> SqliteResult<(u32, u32, u32, u32, i64)> {
    conn.query_row(
        "SELECT total_tests, passed, failed, skipped, duration_seconds
         FROM regression_results ORDER BY run_at DESC LIMIT 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    )
}

/// S20: Get security audit report
pub fn get_security_audit_report_db(conn: &Connection) -> SqliteResult<(String, String, String, bool, Vec<(String, String, String, String, bool)>)> {
    let (id, firm, date, crit_resolved): (String, String, String, bool) = conn.query_row(
        "SELECT id, audit_firm, audit_date, critical_resolved FROM security_audit_reports ORDER BY created_at DESC LIMIT 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )?;
    let mut stmt = conn.prepare(
        "SELECT id, severity, title, description, resolved FROM security_audit_findings WHERE report_id = ?1"
    )?;
    let findings: Vec<(String, String, String, String, bool)> = stmt.query_map([&id], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
    })?.filter_map(|r| r.ok()).collect();
    Ok((id, firm, date, crit_resolved, findings))
}

/// S20: Get monitoring config
pub fn get_monitoring_config_db(conn: &Connection) -> SqliteResult<(String, String, String, String, u32)> {
    conn.query_row(
        "SELECT alerting_provider, health_check_endpoint, metrics_endpoint, alert_channels, escalation_timeout_minutes
         FROM monitoring_config WHERE id = 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    )
}

/// S20: Get runbook entries
pub fn get_runbook_db(conn: &Connection) -> SqliteResult<Vec<(String, String, String, u32)>> {
    let mut stmt = conn.prepare(
        "SELECT scenario, symptoms, resolution_steps, estimated_resolution_minutes FROM runbook_entries"
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
    })?;
    rows.collect()
}

/// S20: Get GA release metadata
pub fn get_ga_release_metadata_db(conn: &Connection) -> SqliteResult<(String, String, u32, u32, u32, String, bool)> {
    conn.query_row(
        "SELECT version, release_date, total_sprints, total_features, total_tests, known_issues, marketing_ready
         FROM ga_release_metadata WHERE id = 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
    )
}

// ─── Audit Log Entries CRUD ─────────────────────────────────────

/// Read all audit log entries (newest first)
pub fn get_audit_log_entries_db(conn: &Connection) -> SqliteResult<Vec<(String, String, String, String, String, String, String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT id, timestamp, actor, action, target, result, hash, prev_hash
         FROM audit_log_entries ORDER BY timestamp DESC"
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?))
    })?;
    rows.collect()
}

/// Insert an audit log entry
pub fn insert_audit_log_entry_db(
    conn: &Connection, id: &str, actor: &str, action: &str, target: &str, result: &str, hash: &str, prev_hash: &str,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO audit_log_entries (id, actor, action, target, result, hash, prev_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, actor, action, target, result, hash, prev_hash],
    )?;
    Ok(())
}

// ─── Tracked Bugs CRUD ──────────────────────────────────────────

/// Read all tracked bugs
pub fn get_tracked_bugs_db(conn: &Connection) -> SqliteResult<Vec<(String, String, String, String, String, String, String, Option<String>)>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, severity, status, sprint_origin, component, description, resolved_in_commit
         FROM tracked_bugs ORDER BY id"
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?))
    })?;
    rows.collect()
}

/// Insert a tracked bug
pub fn insert_tracked_bug_db(
    conn: &Connection, id: &str, title: &str, severity: &str, status: &str,
    sprint_origin: &str, component: &str, description: &str, resolved_in_commit: Option<&str>,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO tracked_bugs (id, title, severity, status, sprint_origin, component, description, resolved_in_commit)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, title, severity, status, sprint_origin, component, description, resolved_in_commit],
    )?;
    Ok(())
}

// ─── Release Notes CRUD ─────────────────────────────────────────

/// Read all release notes
pub fn get_release_notes_db(conn: &Connection) -> SqliteResult<Vec<(String, String, String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT category, title, description, sprint FROM release_notes ORDER BY id"
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
    })?;
    rows.collect()
}

/// Insert a release note
pub fn insert_release_note_db(
    conn: &Connection, category: &str, title: &str, description: &str, sprint: &str,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO release_notes (category, title, description, sprint) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![category, title, description, sprint],
    )?;
    Ok(())
}

// ─── Doc Coverage CRUD ──────────────────────────────────────────

/// Read all doc coverage entries
pub fn get_doc_coverage_db(conn: &Connection) -> SqliteResult<Vec<(String, bool, bool, bool, String)>> {
    let mut stmt = conn.prepare(
        "SELECT feature, has_api_docs, has_user_guide, has_examples, last_updated_sprint FROM doc_coverage ORDER BY feature"
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
    })?;
    rows.collect()
}

/// Insert a doc coverage entry
pub fn insert_doc_coverage_db(
    conn: &Connection, feature: &str, has_api_docs: bool, has_user_guide: bool, has_examples: bool, sprint: &str,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO doc_coverage (feature, has_api_docs, has_user_guide, has_examples, last_updated_sprint)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![feature, has_api_docs, has_user_guide, has_examples, sprint],
    )?;
    Ok(())
}

// ─── Insert helpers for usage/budget/policy tables ──────────────

/// Insert a usage record
pub fn insert_usage_record_db(
    conn: &Connection, month: &str, team_id: &str, team_name: &str, model_name: &str,
    cost_usd: f64, tokens: i64, api_calls: i64,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO usage_records (month, team_id, team_name, model_name, cost_usd, tokens, api_calls)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![month, team_id, team_name, model_name, cost_usd, tokens, api_calls],
    )?;
    Ok(())
}

/// Insert a budget config
pub fn insert_budget_config_db(
    conn: &Connection, team_id: &str, monthly_budget: f64, soft_limit: f64, hard_limit: f64,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO budget_configs (team_id, monthly_budget_usd, soft_limit_pct, hard_limit_pct)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![team_id, monthly_budget, soft_limit, hard_limit],
    )?;
    Ok(())
}

/// Insert a skill policy
pub fn insert_skill_policy_db(
    conn: &Connection, skill_id: &str, skill_name: &str, status: &str, risk_level: &str,
    reviewed_by: Option<&str>, reviewed_at: Option<&str>,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO skill_policies (skill_id, skill_name, status, risk_level, reviewed_by, reviewed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![skill_id, skill_name, status, risk_level, reviewed_by, reviewed_at],
    )?;
    Ok(())
}

/// Insert a recommendation
pub fn insert_recommendation_db(
    conn: &Connection, id: &str, title: &str, description: &str, category: &str, impact: &str,
    agent_id: Option<&str>, skill_id: Option<&str>,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO recommendations (id, title, description, category, impact, agent_id, skill_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, title, description, category, impact, agent_id, skill_id],
    )?;
    Ok(())
}

/// Insert a runbook entry
pub fn insert_runbook_entry_db(
    conn: &Connection, scenario: &str, symptoms_json: &str, steps_json: &str, est_minutes: u32,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT INTO runbook_entries (scenario, symptoms, resolution_steps, estimated_resolution_minutes)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![scenario, symptoms_json, steps_json, est_minutes],
    )?;
    Ok(())
}

/// Insert a security audit report
pub fn insert_security_audit_report_db(
    conn: &Connection, id: &str, firm: &str, date: &str, critical_resolved: bool,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO security_audit_reports (id, audit_firm, audit_date, critical_resolved)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, firm, date, critical_resolved],
    )?;
    Ok(())
}

/// Insert a security audit finding
pub fn insert_security_audit_finding_db(
    conn: &Connection, id: &str, report_id: &str, severity: &str, title: &str, description: &str, resolved: bool,
) -> SqliteResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO security_audit_findings (id, report_id, severity, title, description, resolved)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, report_id, severity, title, description, resolved],
    )?;
    Ok(())
}

/// Insert a regression result
pub fn insert_regression_result_db(
    conn: &Connection, total: u32, passed: u32, failed: u32, skipped: u32, duration: i64,
) -> SqliteResult<()> {
    let all_passing = failed == 0 && skipped == 0;
    conn.execute(
        "INSERT OR REPLACE INTO regression_results (id, total_tests, passed, failed, skipped, duration_seconds, all_passing)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![total, passed, failed, skipped, duration, all_passing],
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

    // ==================== Sprint S1-S2: Skill Catalog Tests ====================

    fn make_catalog_entry(id: &str, name: &str, category: &str) -> DbSkillCatalogEntry {
        DbSkillCatalogEntry {
            id: id.to_string(),
            name: name.to_string(),
            description: Some(format!("Description for {}", name)),
            category: category.to_string(),
            tags: Some("[\"test\",\"dev\"]".to_string()),
            risk_level: "low".to_string(),
            source: Some("catalog".to_string()),
            source_path: None,
            date_added: Some("2026-03-01".to_string()),
        }
    }

    fn make_agent_skill(agent_id: &str, skill_key: &str, name: &str) -> DbAgentSkill {
        DbAgentSkill {
            id: format!("{}-{}", agent_id, skill_key),
            agent_id: agent_id.to_string(),
            skill_key: skill_key.to_string(),
            name: name.to_string(),
            description: Some(format!("Skill: {}", name)),
            category: "development".to_string(),
            tags: Some("[\"code\"]".to_string()),
            risk_level: "low".to_string(),
            source: "catalog".to_string(),
            version: Some("1.0.0".to_string()),
            installed: true,
            enabled: true,
            config: None,
            installed_at: Some("2026-03-01T00:00:00Z".to_string()),
            updated_at: None,
        }
    }

    /// Insert a dummy agent row to satisfy FK constraint on agent_skills
    fn ensure_agent(conn: &Connection, agent_id: &str) {
        let agent = DbAgent {
            id: agent_id.to_string(),
            name: format!("Test Agent {}", agent_id),
            role: "tester".to_string(),
            status: "idle".to_string(),
            model: None,
            workspace: None,
            avatar: None,
        };
        let _ = insert_agent(conn, &agent); // ignore duplicate errors
    }

    #[test]
    fn test_migration_v9_tables_created() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        for table in &["skill_catalog", "agent_skills", "skill_bundles"] {
            let count: i32 = conn
                .query_row(
                    &format!("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='{}'", table),
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "Table {} should exist", table);
        }
    }

    #[test]
    fn test_down_migrate_v9() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let entry = make_catalog_entry("sk-1", "Rust Analyzer", "development");
        bulk_insert_catalog(&conn, &[entry]).unwrap();
        assert_eq!(get_catalog_count(&conn).unwrap(), 1);

        down_migrate_v9(&conn).unwrap();

        for table in &["skill_catalog", "agent_skills", "skill_bundles"] {
            let count: i32 = conn
                .query_row(
                    &format!("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='{}'", table),
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 0, "Table {} should be dropped after down_migrate_v9", table);
        }
    }

    #[test]
    fn test_is_feature_enabled() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        assert!(!is_feature_enabled(&conn, "nonexistent_flag"));

        set_setting(&conn, "flag_test_feature", "true").unwrap();
        assert!(is_feature_enabled(&conn, "flag_test_feature"));

        set_setting(&conn, "flag_test_feature", "1").unwrap();
        assert!(is_feature_enabled(&conn, "flag_test_feature"));

        set_setting(&conn, "flag_test_feature", "false").unwrap();
        assert!(!is_feature_enabled(&conn, "flag_test_feature"));

        set_setting(&conn, "flag_test_feature", "0").unwrap();
        assert!(!is_feature_enabled(&conn, "flag_test_feature"));
    }

    #[test]
    fn test_bulk_insert_catalog() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let entries = vec![
            make_catalog_entry("sk-1", "Rust Analyzer", "development"),
            make_catalog_entry("sk-2", "Python Linter", "development"),
            make_catalog_entry("sk-3", "Docker Build", "devops"),
        ];

        let inserted = bulk_insert_catalog(&conn, &entries).unwrap();
        assert_eq!(inserted, 3);
        assert_eq!(get_catalog_count(&conn).unwrap(), 3);
    }

    #[test]
    fn test_bulk_insert_catalog_upsert() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let entry = make_catalog_entry("sk-1", "Original Name", "development");
        bulk_insert_catalog(&conn, &[entry]).unwrap();

        let updated = make_catalog_entry("sk-1", "Updated Name", "development");
        bulk_insert_catalog(&conn, &[updated]).unwrap();

        let result = get_catalog_entry(&conn, "sk-1").unwrap();
        assert!(result.is_some());
        assert_eq!(result.unwrap().name, "Updated Name");
        assert_eq!(get_catalog_count(&conn).unwrap(), 1);
    }

    #[test]
    fn test_get_catalog_entry() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let entry = make_catalog_entry("sk-1", "Code Reviewer", "development");
        bulk_insert_catalog(&conn, &[entry]).unwrap();

        let result = get_catalog_entry(&conn, "sk-1").unwrap();
        assert!(result.is_some());
        let e = result.unwrap();
        assert_eq!(e.name, "Code Reviewer");
        assert_eq!(e.category, "development");
        assert_eq!(e.risk_level, "low");

        let missing = get_catalog_entry(&conn, "nonexistent").unwrap();
        assert!(missing.is_none());
    }

    #[test]
    fn test_get_catalog_count_empty() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        assert_eq!(get_catalog_count(&conn).unwrap(), 0);
    }

    #[test]
    fn test_search_skill_catalog_basic() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let entries = vec![
            make_catalog_entry("sk-1", "Rust Analyzer", "development"),
            make_catalog_entry("sk-2", "Python Debugger", "development"),
            make_catalog_entry("sk-3", "Docker Compose", "devops"),
            make_catalog_entry("sk-4", "Kubernetes Helm", "devops"),
        ];
        bulk_insert_catalog(&conn, &entries).unwrap();

        let results = search_skill_catalog(&conn, "Rust", None, None, None).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Rust Analyzer");

        let all = search_skill_catalog(&conn, "", None, None, None).unwrap();
        assert_eq!(all.len(), 4);
    }

    #[test]
    fn test_search_skill_catalog_with_category() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let entries = vec![
            make_catalog_entry("sk-1", "Rust Analyzer", "development"),
            make_catalog_entry("sk-2", "Docker Compose", "devops"),
            make_catalog_entry("sk-3", "Kubernetes Helm", "devops"),
        ];
        bulk_insert_catalog(&conn, &entries).unwrap();

        let results = search_skill_catalog(&conn, "", Some("devops"), None, None).unwrap();
        assert_eq!(results.len(), 2);

        let results = search_skill_catalog(&conn, "Docker", Some("devops"), None, None).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Docker Compose");

        let results = search_skill_catalog(&conn, "Rust", Some("devops"), None, None).unwrap();
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_search_skill_catalog_pagination() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let entries: Vec<_> = (0..20)
            .map(|i| make_catalog_entry(&format!("sk-{}", i), &format!("Skill {}", i), "dev"))
            .collect();
        bulk_insert_catalog(&conn, &entries).unwrap();

        let page1 = search_skill_catalog(&conn, "", None, Some(5), Some(0)).unwrap();
        assert_eq!(page1.len(), 5);

        let page2 = search_skill_catalog(&conn, "", None, Some(5), Some(5)).unwrap();
        assert_eq!(page2.len(), 5);

        let p1_ids: Vec<_> = page1.iter().map(|e| &e.id).collect();
        let p2_ids: Vec<_> = page2.iter().map(|e| &e.id).collect();
        for id in &p2_ids {
            assert!(!p1_ids.contains(id), "Page 2 should not overlap with page 1");
        }
    }

    #[test]
    fn test_search_skill_catalog_count() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let entries = vec![
            make_catalog_entry("sk-1", "Rust Analyzer", "development"),
            make_catalog_entry("sk-2", "Rust Formatter", "development"),
            make_catalog_entry("sk-3", "Python Linter", "development"),
            make_catalog_entry("sk-4", "Docker Build", "devops"),
        ];
        bulk_insert_catalog(&conn, &entries).unwrap();

        assert_eq!(search_skill_catalog_count(&conn, "", None).unwrap(), 4);
        assert_eq!(search_skill_catalog_count(&conn, "Rust", None).unwrap(), 2);
        assert_eq!(search_skill_catalog_count(&conn, "", Some("devops")).unwrap(), 1);
        assert_eq!(search_skill_catalog_count(&conn, "Rust", Some("development")).unwrap(), 2);
        assert_eq!(search_skill_catalog_count(&conn, "nonexistent", None).unwrap(), 0);
    }

    #[test]
    fn test_get_catalog_categories() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let entries = vec![
            make_catalog_entry("sk-1", "Skill A", "development"),
            make_catalog_entry("sk-2", "Skill B", "development"),
            make_catalog_entry("sk-3", "Skill C", "devops"),
            make_catalog_entry("sk-4", "Skill D", "security"),
        ];
        bulk_insert_catalog(&conn, &entries).unwrap();

        let categories = get_catalog_categories(&conn).unwrap();
        assert_eq!(categories.len(), 3);
        assert_eq!(categories[0].0, "development");
        assert_eq!(categories[0].1, 2);
        assert!(categories.iter().all(|(_, c)| *c >= 1));
    }

    #[test]
    fn test_search_skill_catalog_by_tags() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let mut entry = make_catalog_entry("sk-1", "Security Scanner", "security");
        entry.tags = Some("[\"vulnerability\",\"audit\",\"security\"]".to_string());
        bulk_insert_catalog(&conn, &[entry]).unwrap();

        let results = search_skill_catalog(&conn, "vulnerability", None, None, None).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Security Scanner");
    }

    #[test]
    fn test_search_skill_catalog_by_description() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let mut entry = make_catalog_entry("sk-1", "Generic Tool", "tools");
        entry.description = Some("Analyzes YAML configuration files".to_string());
        bulk_insert_catalog(&conn, &[entry]).unwrap();

        let results = search_skill_catalog(&conn, "YAML", None, None, None).unwrap();
        assert_eq!(results.len(), 1);
    }

    // ==================== Sprint S1-S2: Agent Skills Tests ====================

    #[test]
    fn test_install_agent_skill() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        ensure_agent(&conn, "agent-1");

        let skill = make_agent_skill("agent-1", "rust-analyzer", "Rust Analyzer");
        install_agent_skill(&conn, &skill).unwrap();

        let skills = get_agent_skills(&conn, "agent-1").unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].skill_key, "rust-analyzer");
        assert_eq!(skills[0].name, "Rust Analyzer");
        assert!(skills[0].installed);
        assert!(skills[0].enabled);
    }

    #[test]
    fn test_install_multiple_skills() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        ensure_agent(&conn, "agent-1");

        let skills = vec![
            make_agent_skill("agent-1", "rust-analyzer", "Rust Analyzer"),
            make_agent_skill("agent-1", "python-lint", "Python Linter"),
            make_agent_skill("agent-1", "docker-build", "Docker Build"),
        ];
        for s in &skills {
            install_agent_skill(&conn, s).unwrap();
        }

        let installed = get_agent_skills(&conn, "agent-1").unwrap();
        assert_eq!(installed.len(), 3);
    }

    #[test]
    fn test_agent_skills_isolation() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        ensure_agent(&conn, "agent-1");
        ensure_agent(&conn, "agent-2");

        install_agent_skill(&conn, &make_agent_skill("agent-1", "sk-a", "Skill A")).unwrap();
        install_agent_skill(&conn, &make_agent_skill("agent-2", "sk-b", "Skill B")).unwrap();

        let a1_skills = get_agent_skills(&conn, "agent-1").unwrap();
        assert_eq!(a1_skills.len(), 1);
        assert_eq!(a1_skills[0].skill_key, "sk-a");

        let a2_skills = get_agent_skills(&conn, "agent-2").unwrap();
        assert_eq!(a2_skills.len(), 1);
        assert_eq!(a2_skills[0].skill_key, "sk-b");
    }

    #[test]
    fn test_remove_agent_skill() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        ensure_agent(&conn, "agent-1");

        install_agent_skill(&conn, &make_agent_skill("agent-1", "sk-a", "Skill A")).unwrap();
        install_agent_skill(&conn, &make_agent_skill("agent-1", "sk-b", "Skill B")).unwrap();

        remove_agent_skill(&conn, "agent-1", "sk-a").unwrap();

        let skills = get_agent_skills(&conn, "agent-1").unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].skill_key, "sk-b");
    }

    #[test]
    fn test_remove_nonexistent_skill_is_safe() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        remove_agent_skill(&conn, "agent-1", "nonexistent").unwrap();
    }

    #[test]
    fn test_update_agent_skill_config() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        ensure_agent(&conn, "agent-1");

        install_agent_skill(&conn, &make_agent_skill("agent-1", "sk-a", "Skill A")).unwrap();

        update_agent_skill_config(&conn, "agent-1", "sk-a", Some("{\"debug\": true}"), None).unwrap();

        let skills = get_agent_skills(&conn, "agent-1").unwrap();
        assert_eq!(skills[0].config, Some("{\"debug\": true}".to_string()));
        assert!(skills[0].enabled);

        update_agent_skill_config(&conn, "agent-1", "sk-a", None, Some(false)).unwrap();

        let enabled: bool = conn
            .query_row(
                "SELECT enabled FROM agent_skills WHERE agent_id = ?1 AND skill_key = ?2",
                ["agent-1", "sk-a"],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!enabled);
    }

    #[test]
    fn test_update_agent_skill_config_and_enabled() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        ensure_agent(&conn, "agent-1");

        install_agent_skill(&conn, &make_agent_skill("agent-1", "sk-a", "Skill A")).unwrap();

        update_agent_skill_config(&conn, "agent-1", "sk-a", Some("{\"mode\": \"strict\"}"), Some(false)).unwrap();

        let row: (String, bool) = conn
            .query_row(
                "SELECT config, enabled FROM agent_skills WHERE agent_id = ?1 AND skill_key = ?2",
                ["agent-1", "sk-a"],
                |row| Ok((row.get::<_, String>(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(row.0, "{\"mode\": \"strict\"}");
        assert!(!row.1);
    }

    #[test]
    fn test_install_agent_skill_upsert() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        ensure_agent(&conn, "agent-1");

        let mut skill = make_agent_skill("agent-1", "sk-a", "Original");
        install_agent_skill(&conn, &skill).unwrap();

        skill.name = "Updated".to_string();
        install_agent_skill(&conn, &skill).unwrap();

        let skills = get_agent_skills(&conn, "agent-1").unwrap();
        assert_eq!(skills.len(), 1);
    }

    // ==================== Sprint S1-S2: Skill Bundles Tests ====================

    #[test]
    fn test_seed_skill_bundles() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let bundles = vec![
            DbSkillBundle {
                id: "bundle-security".to_string(),
                name: "Security Engineer".to_string(),
                description: Some("Security-focused skills".to_string()),
                icon: Some("🔒".to_string()),
                skill_keys: "[\"vuln-scan\",\"code-audit\"]".to_string(),
                is_builtin: true,
            },
            DbSkillBundle {
                id: "bundle-devops".to_string(),
                name: "DevOps & Cloud".to_string(),
                description: Some("Cloud infrastructure skills".to_string()),
                icon: Some("☁️".to_string()),
                skill_keys: "[\"docker\",\"k8s\",\"terraform\"]".to_string(),
                is_builtin: true,
            },
        ];

        seed_skill_bundles(&conn, &bundles).unwrap();

        let stored = get_skill_bundles(&conn).unwrap();
        assert_eq!(stored.len(), 2);
    }

    #[test]
    fn test_get_skill_bundles_ordered() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let bundles = vec![
            DbSkillBundle {
                id: "bundle-z".to_string(),
                name: "Zephyr".to_string(),
                description: None,
                icon: None,
                skill_keys: "[]".to_string(),
                is_builtin: true,
            },
            DbSkillBundle {
                id: "bundle-a".to_string(),
                name: "Alpha".to_string(),
                description: None,
                icon: None,
                skill_keys: "[]".to_string(),
                is_builtin: true,
            },
        ];

        seed_skill_bundles(&conn, &bundles).unwrap();

        let stored = get_skill_bundles(&conn).unwrap();
        assert_eq!(stored[0].name, "Alpha");
        assert_eq!(stored[1].name, "Zephyr");
    }

    #[test]
    fn test_skill_bundles_upsert() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let bundle = DbSkillBundle {
            id: "bundle-1".to_string(),
            name: "Original".to_string(),
            description: None,
            icon: None,
            skill_keys: "[\"a\"]".to_string(),
            is_builtin: true,
        };
        seed_skill_bundles(&conn, &[bundle]).unwrap();

        let updated = DbSkillBundle {
            id: "bundle-1".to_string(),
            name: "Updated".to_string(),
            description: Some("Now with description".to_string()),
            icon: Some("🔥".to_string()),
            skill_keys: "[\"a\",\"b\"]".to_string(),
            is_builtin: true,
        };
        seed_skill_bundles(&conn, &[updated]).unwrap();

        let stored = get_skill_bundles(&conn).unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].name, "Updated");
        assert_eq!(stored[0].description, Some("Now with description".to_string()));
        assert_eq!(stored[0].skill_keys, "[\"a\",\"b\"]");
    }

    #[test]
    fn test_skill_bundle_fields() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let bundle = DbSkillBundle {
            id: "bundle-full".to_string(),
            name: "Full Stack".to_string(),
            description: Some("Complete skill set".to_string()),
            icon: Some("🚀".to_string()),
            skill_keys: "[\"react\",\"node\",\"postgres\"]".to_string(),
            is_builtin: false,
        };
        seed_skill_bundles(&conn, &[bundle]).unwrap();

        let stored = get_skill_bundles(&conn).unwrap();
        assert_eq!(stored[0].id, "bundle-full");
        assert_eq!(stored[0].name, "Full Stack");
        assert_eq!(stored[0].description, Some("Complete skill set".to_string()));
        assert_eq!(stored[0].icon, Some("🚀".to_string()));
        assert!(!stored[0].is_builtin);

        let keys: Vec<String> = serde_json::from_str(&stored[0].skill_keys).unwrap();
        assert_eq!(keys.len(), 3);
        assert!(keys.contains(&"react".to_string()));
    }

    #[test]
    fn test_seed_catalog_if_empty() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let count = seed_catalog_if_empty(&conn).unwrap();
        assert!(count > 0, "Should seed at least 1 catalog entry from embedded JSON");

        let total = get_catalog_count(&conn).unwrap();
        assert_eq!(total as usize, count);

        let count2 = seed_catalog_if_empty(&conn).unwrap();
        assert_eq!(count2, 0, "Should skip re-seeding");
        assert_eq!(get_catalog_count(&conn).unwrap(), total);
    }

    #[test]
    fn test_empty_search_after_seed() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        seed_catalog_if_empty(&conn).unwrap();

        let results = search_skill_catalog(&conn, "", None, Some(10), Some(0)).unwrap();
        assert!(!results.is_empty());
        assert!(results.len() <= 10);
    }

    #[test]
    fn test_categories_after_seed() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        seed_catalog_if_empty(&conn).unwrap();

        let categories = get_catalog_categories(&conn).unwrap();
        assert!(!categories.is_empty(), "Seeded catalog should have categories");
    }

    // ==================== Sprint S1-S2: Edge Cases ====================

    #[test]
    fn test_down_migrate_v9_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        down_migrate_v9(&conn).unwrap();
        down_migrate_v9(&conn).unwrap();
    }

    #[test]
    fn test_search_catalog_special_characters() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let entries = vec![
            make_catalog_entry("sk-1", "C++ Compiler", "language"),
            make_catalog_entry("sk-2", "C# Debugger", "language"),
        ];
        bulk_insert_catalog(&conn, &entries).unwrap();

        let results = search_skill_catalog(&conn, "C++", None, None, None).unwrap();
        assert!(results.len() >= 1);
    }

    #[test]
    fn test_skill_config_null_handling() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        ensure_agent(&conn, "agent-1");

        let mut skill = make_agent_skill("agent-1", "sk-a", "Skill A");
        skill.config = None;
        install_agent_skill(&conn, &skill).unwrap();

        let skills = get_agent_skills(&conn, "agent-1").unwrap();
        assert!(skills[0].config.is_none());

        update_agent_skill_config(&conn, "agent-1", "sk-a", Some("{\"x\":1}"), None).unwrap();
        let skills = get_agent_skills(&conn, "agent-1").unwrap();
        assert_eq!(skills[0].config, Some("{\"x\":1}".to_string()));
    }

    #[test]
    fn test_empty_bundles() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let bundles = get_skill_bundles(&conn).unwrap();
        assert_eq!(bundles.len(), 0, "Should be empty before seeding");
    }

    #[test]
    fn test_search_catalog_count_matches_results() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let entries: Vec<_> = (0..15)
            .map(|i| {
                if i < 5 {
                    make_catalog_entry(&format!("sk-{}", i), &format!("Rust Tool {}", i), "dev")
                } else {
                    make_catalog_entry(&format!("sk-{}", i), &format!("Python Tool {}", i), "dev")
                }
            })
            .collect();
        bulk_insert_catalog(&conn, &entries).unwrap();

        let count = search_skill_catalog_count(&conn, "Rust", None).unwrap();
        let results = search_skill_catalog(&conn, "Rust", None, Some(100), Some(0)).unwrap();
        assert_eq!(count as usize, results.len());
        assert_eq!(count, 5);
    }

    // ─── v10 Integration Tests: Sprint S11-S20 DB Persistence ───────

    fn setup_v10() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_v10_migration_creates_all_tables() {
        let conn = setup_v10();
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        let expected = vec![
            "approval_requests", "audit_log_entries", "budget_configs",
            "cloud_deployment_config", "doc_coverage", "enterprise_config",
            "ga_release_metadata", "monitoring_config",
            "recommendations", "release_notes", "retention_policy",
            "runbook_entries", "score_weights", "security_audit_findings",
            "security_audit_reports", "skill_effectiveness", "skill_policies",
            "soc2_evidence", "sso_config", "team_templates", "tenant_config",
            "tracked_bugs", "usage_records", "voice_pipeline_config",
        ];
        for t in &expected {
            assert!(tables.contains(&t.to_string()), "Missing table: {}", t);
        }
    }

    // ── S11: Voice Pipeline Config ──

    #[test]
    fn test_voice_pipeline_config_seed() {
        let conn = setup_v10();
        let val = get_voice_pipeline_config_db(&conn).unwrap();
        assert_eq!(val["stt"]["provider"], "Deepgram");
        assert_eq!(val["stt"]["language"], "en-US");
        assert_eq!(val["vad"]["silence_threshold_ms"], 250);
        assert_eq!(val["push_to_talk"]["mode"], "PushToTalk");
    }

    // ── S12: Score Weights ──

    #[test]
    fn test_score_weights_default() {
        let conn = setup_v10();
        let (task, gate, cost, speed) = get_score_weights_db(&conn).unwrap();
        assert!((task - 0.35).abs() < 0.01);
        assert!((gate - 0.25).abs() < 0.01);
        assert!((cost - 0.20).abs() < 0.01);
        assert!((speed - 0.20).abs() < 0.01);
    }

    #[test]
    fn test_insert_and_read_agent_score() {
        let conn = setup_v10();
        insert_agent_score(&conn, "a1", "Agent A1", Some("p1"), Some("Project X"), 90.0, 85.0, 70.0, 80.0, 85.5, 5).unwrap();
        insert_agent_score(&conn, "a1", "Agent A1", Some("p2"), Some("Project Y"), 80.0, 70.0, 65.0, 75.0, 72.0, 4).unwrap();

        let history = get_agent_score_history(&conn, "a1").unwrap();
        assert_eq!(history.len(), 2);
        // Both inserted in same second so order may be by rowid
        let scores: Vec<f64> = history.iter().map(|h| h.2).collect();
        assert!(scores.contains(&85.5));
        assert!(scores.contains(&72.0));
        assert!(!history[0].4.is_empty()); // timestamp exists
    }

    // ── S12: Skill Effectiveness ──

    #[test]
    fn test_skill_effectiveness_seed() {
        let conn = setup_v10();
        let rows = get_skill_effectiveness_db(&conn).unwrap();
        // v10 doesn't seed skill_effectiveness, so should be empty
        assert!(rows.is_empty());
    }

    // ── S13: Team Templates ──

    #[test]
    fn test_team_template_crud() {
        let conn = setup_v10();
        // No templates initially
        assert!(get_first_team_template(&conn).is_err());

        // Insert one
        upsert_team_template(&conn, "tpl-001", "Backend Team", "3-agent backend team", 1,
            "[{\"role\":\"Architect\"},{\"role\":\"Dev\"},{\"role\":\"Reviewer\"}]",
            "{\"phases\":[\"design\",\"impl\",\"test\"]}", Some("proj-1")).unwrap();

        let (id, name, desc, ver, agents_json, _wf, cfp, _cat) = get_first_team_template(&conn).unwrap();
        assert_eq!(id, "tpl-001");
        assert_eq!(name, "Backend Team");
        assert!(desc.contains("3-agent"));
        assert_eq!(ver, 1);
        assert_eq!(cfp.unwrap(), "proj-1");
        let agents: Vec<serde_json::Value> = serde_json::from_str(&agents_json).unwrap();
        assert_eq!(agents.len(), 3);
    }

    #[test]
    fn test_upsert_team_template() {
        let conn = setup_v10();
        upsert_team_template(&conn, "tpl-new", "New Team", "Test desc", 1, "[]", "{}", Some("proj-1")).unwrap();
        let (id, name, _desc, _ver, _aj, _wj, cfp, _cat) = get_team_template_db(&conn, "tpl-new").unwrap();
        assert_eq!(id, "tpl-new");
        assert_eq!(name, "New Team");
        assert_eq!(cfp.unwrap(), "proj-1");

        // Upsert update
        upsert_team_template(&conn, "tpl-new", "Updated Team", "New desc", 2, "[{\"role\":\"Dev\"}]", "{}", None).unwrap();
        let (_, name2, _, ver2, aj2, _, cfp2, _) = get_team_template_db(&conn, "tpl-new").unwrap();
        assert_eq!(name2, "Updated Team");
        assert_eq!(ver2, 2);
        assert!(aj2.contains("Dev"));
        assert!(cfp2.is_none());
    }

    // ── S13: Recommendations ──

    #[test]
    fn test_recommendations_crud() {
        let conn = setup_v10();
        // Empty initially
        let recs = get_recommendations_db(&conn).unwrap();
        assert!(recs.is_empty());

        // Insert test data
        insert_recommendation_db(&conn, "rec-001", "Upgrade Model", "Use latest model", "ModelUpgrade", "High", None, None).unwrap();
        insert_recommendation_db(&conn, "rec-002", "Switch Linter", "Faster linting", "SkillSwap", "Medium", None, Some("sk-lint")).unwrap();
        insert_recommendation_db(&conn, "rec-003", "Parallel Tests", "Run concurrently", "WorkflowOptimization", "High", None, None).unwrap();

        let recs = get_recommendations_db(&conn).unwrap();
        assert_eq!(recs.len(), 3);
        assert!(recs.iter().any(|r| r.0 == "rec-001"));
        assert!(recs.iter().any(|r| r.3 == "ModelUpgrade"));
        assert!(recs.iter().all(|r| !r.7 && !r.8));
    }

    #[test]
    fn test_update_recommendation_status() {
        let conn = setup_v10();
        insert_recommendation_db(&conn, "rec-001", "Rec A", "Desc", "ModelUpgrade", "High", None, None).unwrap();
        insert_recommendation_db(&conn, "rec-002", "Rec B", "Desc", "SkillSwap", "Medium", None, None).unwrap();

        update_recommendation_status(&conn, "rec-001", true, false).unwrap();
        let recs = get_recommendations_db(&conn).unwrap();
        let r = recs.iter().find(|r| r.0 == "rec-001").unwrap();
        assert!(r.7); // dismissed
        assert!(!r.8); // not applied

        update_recommendation_status(&conn, "rec-002", false, true).unwrap();
        let recs2 = get_recommendations_db(&conn).unwrap();
        let r2 = recs2.iter().find(|r| r.0 == "rec-002").unwrap();
        assert!(!r2.7);
        assert!(r2.8); // applied
    }

    // ── S14: Skill Policies ──

    #[test]
    fn test_skill_policies_crud() {
        let conn = setup_v10();
        // Empty initially
        let policies = get_skill_policies_db(&conn).unwrap();
        assert!(policies.is_empty());

        // Insert test data
        insert_skill_policy_db(&conn, "sk-1", "CodeReview", "Approved", "low", Some("admin"), Some("2026-01-01")).unwrap();
        insert_skill_policy_db(&conn, "sk-2", "ShellExec", "Blocked", "high", Some("admin"), Some("2026-01-01")).unwrap();
        insert_skill_policy_db(&conn, "sk-3", "WebSearch", "PendingReview", "medium", None, None).unwrap();

        let policies = get_skill_policies_db(&conn).unwrap();
        assert_eq!(policies.len(), 3);
        assert!(policies.iter().any(|p| p.1 == "CodeReview" && p.2 == "Approved"));
        assert!(policies.iter().any(|p| p.1 == "ShellExec" && p.2 == "Blocked"));
        assert!(policies.iter().any(|p| p.1 == "WebSearch" && p.2 == "PendingReview"));
    }

    #[test]
    fn test_tenant_config_seed() {
        let conn = setup_v10();
        let (org_id, org_name, isolation, sync) = get_tenant_config_db(&conn).unwrap();
        assert_eq!(org_id, "org-001");
        assert_eq!(org_name, "Default Org");
        assert!(isolation);
        assert_eq!(sync, 300);
    }

    #[test]
    fn test_insert_approval_request() {
        let conn = setup_v10();
        let status = insert_approval_request(&conn, "sk-123", "user@test.com", "Need for project").unwrap();
        assert_eq!(status, "Pending");
        // Verify it's actually in the DB
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM approval_requests WHERE skill_id = 'sk-123'", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(count, 1);
    }

    // ── S15: Usage & Budget ──

    #[test]
    fn test_usage_summary_crud() {
        let conn = setup_v10();
        // Empty initially
        let (cost, tokens, calls, teams, models) = get_usage_summary_db(&conn, "2026-02").unwrap();
        assert!((cost - 0.0).abs() < 0.01);
        assert_eq!(tokens, 0);
        assert_eq!(calls, 0);
        assert!(teams.is_empty());
        assert!(models.is_empty());

        // Insert test data
        insert_usage_record_db(&conn, "2026-02", "team-a", "Alpha", "gpt-4o", 350.0, 2100000, 5200).unwrap();
        insert_usage_record_db(&conn, "2026-02", "team-a", "Alpha", "claude-3", 200.0, 1050000, 3100).unwrap();
        insert_usage_record_db(&conn, "2026-02", "team-b", "Beta", "gpt-4o", 180.0, 1200000, 4500).unwrap();

        let (total_cost, total_tokens, total_calls, teams, models) = get_usage_summary_db(&conn, "2026-02").unwrap();
        assert!(total_cost > 0.0);
        assert!(total_tokens > 0);
        assert!(total_calls > 0);
        assert_eq!(teams.len(), 2);
        assert_eq!(models.len(), 2);
    }

    #[test]
    fn test_budget_config_crud() {
        let conn = setup_v10();
        // No budget initially
        assert!(get_budget_config_db(&conn).is_err());

        insert_budget_config_db(&conn, "team-a", 5000.0, 80.0, 100.0).unwrap();
        let (tid, budget, soft, hard) = get_budget_config_db(&conn).unwrap();
        assert_eq!(tid, "team-a");
        assert!((budget - 5000.0).abs() < 0.01);
        assert!((soft - 80.0).abs() < 0.01);
        assert!((hard - 100.0).abs() < 0.01);
    }

    #[test]
    fn test_export_usage_csv() {
        let conn = setup_v10();
        insert_usage_record_db(&conn, "2026-02", "team-a", "Alpha", "gpt-4o", 350.0, 2100000, 5200).unwrap();
        insert_usage_record_db(&conn, "2026-02", "team-a", "Alpha", "claude-3", 200.0, 1050000, 3100).unwrap();

        let csv = export_usage_csv_db(&conn).unwrap();
        assert!(csv.starts_with("month,team_id,team_name,model_name,cost_usd,tokens,api_calls\n"));
        assert!(csv.contains("team-a"));
        assert!(csv.contains("gpt-4o"));
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines.len(), 3); // header + 2 data rows
    }

    // ── S16: Cloud Hosting ──

    #[test]
    fn test_cloud_config_defaults() {
        let conn = setup_v10();
        let (target, regions, min_p, max_p, auto_scale, cpu, mem) = get_cloud_config_db(&conn).unwrap();
        assert_eq!(target, "fly_io");
        assert!(regions.contains("US"));
        assert!(regions.contains("EU"));
        assert_eq!(min_p, 1);
        assert_eq!(max_p, 50);
        assert!(auto_scale);
        assert_eq!(cpu, 70);
        assert_eq!(mem, 80);
    }

    // ── S17: Compliance & Audit ──

    #[test]
    fn test_retention_policy_defaults() {
        let conn = setup_v10();
        let (days, archive, location) = get_retention_policy_db(&conn).unwrap();
        assert_eq!(days, 90);
        assert!(archive);
        assert_eq!(location, "s3://axtrizen-archive/audit-logs");
    }

    #[test]
    fn test_soc2_checklist_seed() {
        let conn = setup_v10();
        let items = get_soc2_checklist_db(&conn).unwrap();
        assert_eq!(items.len(), 4);
        assert!(items.iter().any(|i| i.1 == "CC6.1" && i.3));
        assert!(items.iter().any(|i| i.1 == "CC6.7" && !i.3)); // Encryption not collected
    }

    // ── S18: SSO & RBAC ──

    #[test]
    fn test_sso_config_defaults() {
        let conn = setup_v10();
        let (proto, provider, entity, url, jit, role) = get_sso_config_db(&conn).unwrap();
        assert_eq!(proto, "Saml2");
        assert_eq!(provider, "Okta");
        assert!(entity.contains("axtrizen"));
        assert!(url.contains("sso"));
        assert!(jit);
        assert_eq!(role, "Viewer");
    }

    // ── S19: Enterprise Config ──

    #[test]
    fn test_enterprise_config_load_test() {
        let conn = setup_v10();
        let val = get_enterprise_config_db(&conn).unwrap();
        let lt = &val["load_test"];
        assert_eq!(lt["concurrent_users"], 100);
        assert_eq!(lt["concurrent_projects"], 20);
    }

    #[test]
    fn test_enterprise_config_uptime() {
        let conn = setup_v10();
        let val = get_enterprise_config_db(&conn).unwrap();
        let uptime = &val["uptime"];
        assert!((uptime["target_uptime_pct"].as_f64().unwrap() - 99.9).abs() < 0.01);
        assert_eq!(uptime["health_check_interval_seconds"], 30);
    }

    #[test]
    fn test_enterprise_config_demo() {
        let conn = setup_v10();
        let val = get_enterprise_config_db(&conn).unwrap();
        let demo = &val["demo"];
        assert!(demo["url"].as_str().unwrap().contains("demo"));
        assert!(demo["pre_loaded_data"].as_bool().unwrap());
    }

    #[test]
    fn test_enterprise_config_docs() {
        let conn = setup_v10();
        let val = get_enterprise_config_db(&conn).unwrap();
        let docs = &val["docs"];
        assert!(docs["admin_guide"].as_bool().unwrap());
        assert!(docs["api_docs"].as_bool().unwrap());
        assert!(!docs["security_whitepaper"].as_bool().unwrap()); // default false
    }

    // ── S20: GA Release ──

    #[test]
    fn test_regression_result_crud() {
        let conn = setup_v10();
        // No regression result initially (schema defaults exist via ga_release_metadata but regression_results is separate)
        assert!(get_regression_result_db(&conn).is_err());

        insert_regression_result_db(&conn, 500, 498, 2, 0, 120).unwrap();
        let (total, passed, failed, skipped, dur) = get_regression_result_db(&conn).unwrap();
        assert_eq!(total, 500);
        assert_eq!(passed, 498);
        assert_eq!(failed, 2);
        assert_eq!(skipped, 0);
        assert_eq!(dur, 120);
    }

    #[test]
    fn test_security_audit_report_crud() {
        let conn = setup_v10();
        // No report initially
        assert!(get_security_audit_report_db(&conn).is_err());

        insert_security_audit_report_db(&conn, "sar-001", "AuditCorp", "2026-02-01", true).unwrap();
        insert_security_audit_finding_db(&conn, "saf-001", "sar-001", "High", "Finding A", "Desc A", true).unwrap();
        insert_security_audit_finding_db(&conn, "saf-002", "sar-001", "Low", "Finding B", "Desc B", false).unwrap();

        let (_id, firm, date, crit_resolved, findings) = get_security_audit_report_db(&conn).unwrap();
        assert_eq!(firm, "AuditCorp");
        assert!(date.contains("2026"));
        assert!(crit_resolved);
        assert_eq!(findings.len(), 2);
        assert!(findings.iter().any(|f| f.1 == "High" && f.4));
        assert!(findings.iter().any(|f| f.1 == "Low" && !f.4));
    }

    #[test]
    fn test_monitoring_config_defaults() {
        let conn = setup_v10();
        let (provider, health, metrics, channels, escalation) = get_monitoring_config_db(&conn).unwrap();
        assert_eq!(provider, "PagerDuty");
        assert_eq!(health, "/healthz");
        assert_eq!(metrics, "/metrics");
        assert!(channels.contains("ops-alerts"));
        assert_eq!(escalation, 15);
    }

    #[test]
    fn test_runbook_crud() {
        let conn = setup_v10();
        // Empty initially
        let entries = get_runbook_db(&conn).unwrap();
        assert!(entries.is_empty());

        insert_runbook_entry_db(&conn, "Gateway Failure", "[\"disconnects\"]", "[\"restart\"]", 15).unwrap();
        insert_runbook_entry_db(&conn, "DB Lock", "[\"slow queries\"]", "[\"checkpoint\"]", 30).unwrap();

        let entries = get_runbook_db(&conn).unwrap();
        assert_eq!(entries.len(), 2);
        assert!(entries.iter().any(|e| e.0.contains("Gateway")));
        for (_, symptoms_json, steps_json, mins) in &entries {
            let symptoms: Vec<String> = serde_json::from_str(symptoms_json).unwrap();
            let steps: Vec<String> = serde_json::from_str(steps_json).unwrap();
            assert!(!symptoms.is_empty());
            assert!(!steps.is_empty());
            assert!(*mins > 0);
        }
    }

    #[test]
    fn test_ga_release_metadata_defaults() {
        let conn = setup_v10();
        let (ver, _date, sprints, features, tests, issues_json, marketing) = get_ga_release_metadata_db(&conn).unwrap();
        assert_eq!(ver, "1.0.0");
        assert_eq!(sprints, 20);
        assert!(features > 0);
        assert_eq!(tests, 889);
        let issues: Vec<String> = serde_json::from_str(&issues_json).unwrap();
        assert!(issues.is_empty());
        assert!(!marketing);
    }

    // ── Cross-module Integration: Full CRUD Cycle ──

    #[test]
    fn test_full_score_lifecycle() {
        let conn = setup_v10();
        // Read default weights
        let (tw, gw, cw, sw) = get_score_weights_db(&conn).unwrap();
        assert!((tw + gw + cw + sw - 1.0).abs() < 0.01);

        // Insert scores
        insert_agent_score(&conn, "agent-x", "Agent X", Some("proj-a"), Some("Alpha"), 95.0, 90.0, 80.0, 85.0, 92.0, 5).unwrap();
        insert_agent_score(&conn, "agent-x", "Agent X", Some("proj-b"), Some("Beta"), 80.0, 75.0, 70.0, 72.0, 78.5, 4).unwrap();
        insert_agent_score(&conn, "agent-y", "Agent Y", Some("proj-a"), Some("Alpha"), 60.0, 70.0, 55.0, 65.0, 65.0, 3).unwrap();

        // Read agent-x history — should have 2
        let history_x = get_agent_score_history(&conn, "agent-x").unwrap();
        assert_eq!(history_x.len(), 2);

        // Read agent-y history — should have 1
        let history_y = get_agent_score_history(&conn, "agent-y").unwrap();
        assert_eq!(history_y.len(), 1);

        // Non-existent agent — empty
        let history_z = get_agent_score_history(&conn, "agent-z").unwrap();
        assert!(history_z.is_empty());
    }

    #[test]
    fn test_full_template_lifecycle() {
        let conn = setup_v10();
        // No templates initially
        assert!(get_first_team_template(&conn).is_err());

        // Create new
        upsert_team_template(&conn, "tpl-002", "ML Team", "Machine learning team", 1, "[{\"role\":\"MLEngineer\"}]", "{}", None).unwrap();

        // Read it back
        let (_, name, _, _, agents, _, _, _) = get_team_template_db(&conn, "tpl-002").unwrap();
        assert_eq!(name, "ML Team");
        assert!(agents.contains("MLEngineer"));

        // Update it
        upsert_team_template(&conn, "tpl-002", "ML Team v2", "Updated", 2, "[{\"role\":\"MLEngineer\"},{\"role\":\"DataSci\"}]", "{}", Some("ml-proj")).unwrap();
        let (_, name2, _, ver2, agents2, _, cfp2, _) = get_team_template_db(&conn, "tpl-002").unwrap();
        assert_eq!(name2, "ML Team v2");
        assert_eq!(ver2, 2);
        assert!(agents2.contains("DataSci"));
        assert_eq!(cfp2.unwrap(), "ml-proj");
    }

    #[test]
    fn test_full_recommendation_lifecycle() {
        let conn = setup_v10();
        // Insert test data
        insert_recommendation_db(&conn, "rec-001", "Rec A", "Desc", "ModelUpgrade", "High", None, None).unwrap();
        insert_recommendation_db(&conn, "rec-002", "Rec B", "Desc", "SkillSwap", "Medium", None, None).unwrap();
        insert_recommendation_db(&conn, "rec-003", "Rec C", "Desc", "WorkflowOptimization", "High", None, None).unwrap();

        let recs = get_recommendations_db(&conn).unwrap();
        assert_eq!(recs.len(), 3);

        // Dismiss one
        update_recommendation_status(&conn, "rec-001", true, false).unwrap();
        // Apply another
        update_recommendation_status(&conn, "rec-002", false, true).unwrap();

        let updated = get_recommendations_db(&conn).unwrap();
        let r1 = updated.iter().find(|r| r.0 == "rec-001").unwrap();
        let r2 = updated.iter().find(|r| r.0 == "rec-002").unwrap();
        let r3 = updated.iter().find(|r| r.0 == "rec-003").unwrap();
        assert!(r1.7 && !r1.8);  // dismissed, not applied
        assert!(!r2.7 && r2.8);  // not dismissed, applied
        assert!(!r3.7 && !r3.8); // untouched
    }

    #[test]
    fn test_approval_request_lifecycle() {
        let conn = setup_v10();
        // Insert two requests
        insert_approval_request(&conn, "sk-001", "alice", "Need for dev").unwrap();
        insert_approval_request(&conn, "sk-002", "bob", "Testing purpose").unwrap();

        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM approval_requests", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn test_usage_month_filter() {
        let conn = setup_v10();
        // Insert data for 2026-02
        insert_usage_record_db(&conn, "2026-02", "team-a", "Alpha", "gpt-4o", 350.0, 2100000, 5200).unwrap();

        let (cost_feb, _, _, _, _) = get_usage_summary_db(&conn, "2026-02").unwrap();
        assert!(cost_feb > 0.0);

        // No data for 2026-03
        let (cost_mar, _, _, teams_mar, models_mar) = get_usage_summary_db(&conn, "2026-03").unwrap();
        assert!((cost_mar - 0.0).abs() < 0.01);
        assert!(teams_mar.is_empty());
        assert!(models_mar.is_empty());
    }
}
