// Axtrizen AI - Tauri Backend
// Main entry point and IPC command registration

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;

use commands::{agents, terminal, config, settings};

fn main() {
    // Initialize database on startup
    if let Err(e) = db::init_db() {
        eprintln!("Failed to initialize database: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // Terminal commands (PTY)
            terminal::create_pty,
            terminal::write_pty,
            terminal::resize_pty,
            terminal::spawn_agent, // Kept for legacy compatibility
            terminal::open_terminal, // Kept for legacy compatibility
            
            // Agent commands
            agents::get_agents,
            agents::get_agent_status,
            
            // Config commands
            config::get_gateway_token,
            config::get_openclaw_config,
            config::is_openclaw_configured,
            
            // Settings commands
            settings::get_settings,
            settings::set_setting,
            settings::update_settings,
            settings::toggle_debug_mode,
            settings::is_debug_mode,
            
            // Health check
            ping
        ])
        .manage(terminal::PtyState::default())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Simple ping command for testing IPC
#[tauri::command]
fn ping() -> String {
    "pong".to_string()
}
