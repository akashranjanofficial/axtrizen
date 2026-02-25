// Axtrizen AI - Tauri Library
// Main application entry point and IPC registration

pub mod commands;
pub mod db;
pub mod gateway_client;
pub mod orchestrator;

use std::sync::Arc;
use commands::{agents, terminal, config, settings, chat, sessions, usage, system, skills, cron, devices, logs, agent_metrics};
use gateway_client::GatewayClient;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize database on startup
    if let Err(e) = db::init_db() {
        eprintln!("Failed to initialize database: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_webdriver::init())
        .invoke_handler(tauri::generate_handler![
            // Terminal commands (PTY)
            terminal::create_pty,
            terminal::write_pty,
            terminal::resize_pty,
            terminal::kill_pty,
            terminal::spawn_agent,
            terminal::open_terminal,
            
            // Gateway connection
            gateway_client::gateway_connect,
            gateway_client::gateway_disconnect,
            gateway_client::gateway_is_connected,
            
            // Agent commands (CRUD + files)
            agents::get_agents,
            agents::get_agent_status,
            agents::create_agent,
            agents::update_agent,
            agents::delete_agent,
            agents::get_agent_files,
            agents::get_agent_file,
            agents::set_agent_file,
            
            // Chat commands
            chat::chat_send,
            chat::chat_history,
            chat::chat_abort,
            chat::chat_inject,
            
            // Chat persistence (local SQLite)
            chat::save_chat_message,
            chat::get_all_conversations,
            chat::get_conversation_history,
            chat::search_chat,
            chat::delete_conversation,
            
            // Session commands
            sessions::sessions_list,
            sessions::sessions_preview,
            sessions::sessions_patch,
            sessions::sessions_reset,
            sessions::sessions_delete,

            // Project commands
            commands::projects::get_projects,
            commands::projects::create_project,
            commands::projects::update_project,
            commands::projects::delete_project,

            // Team commands
            commands::teams::get_teams,
            commands::teams::create_team,
            commands::teams::update_team,
            commands::teams::delete_team,
            commands::teams::get_team_members,
            commands::teams::add_team_member,
            commands::teams::remove_team_member,

            // Orchestrator commands
            commands::orchestrator::start_project_execution,
            commands::orchestrator::stop_project_execution,
            commands::orchestrator::get_execution_status,
            commands::orchestrator::resume_project_execution,
            
            // Usage commands
            usage::usage_cost,
            usage::usage_status,
            
            // System commands
            system::gateway_health,
            system::gateway_status,
            system::last_heartbeat,
            system::system_presence,
            
            // Skills commands
            skills::skills_status,
            skills::skills_update,
            skills::skills_install,
            
            // Cron commands
            cron::cron_list,
            cron::cron_add,
            cron::cron_update,
            cron::cron_remove,
            cron::cron_run,
            cron::cron_runs,
            
            // Device commands
            devices::device_list,
            devices::device_approve,
            devices::device_reject,
            devices::device_revoke,
            
            // Log commands
            logs::logs_tail,
            
            // Config commands
            config::get_gateway_token,
            config::get_openclaw_config,
            config::is_openclaw_configured,
            config::get_agent_config,
            config::save_agent_config,
            
            // Settings commands
            settings::get_settings,
            settings::set_setting,
            settings::update_settings,
            settings::toggle_debug_mode,
            settings::is_debug_mode,
            
            // Agent metrics commands
            agent_metrics::get_agent_usage,
            agent_metrics::get_agent_session_stats,
            agent_metrics::get_agent_activity,
            agent_metrics::get_agent_tool_calls,
            agent_metrics::log_agent_activity,
            agent_metrics::log_agent_tool_call,
            
            // Health check
            ping
        ])
        .manage(terminal::PtyState::default())
        .manage(GatewayClient::default())
        .manage(Arc::new(orchestrator::OrchestratorState::default()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Simple ping command for testing IPC
#[tauri::command]
fn ping() -> String {
    "pong".to_string()
}
