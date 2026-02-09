use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{Arc, Mutex},
    thread,
};
use tauri::{AppHandle, Emitter, Manager, Window};

// State to manage multiple PTY sessions (one per agent or tab)
// We wrap the writer in Arc<Mutex> to share it between threads/commands
pub struct PtyState {
    // Map of id -> PTY writer
    ptys: Arc<Mutex<HashMap<String, Box<dyn Write + Send>>>>,
}

impl Default for PtyState {
    fn default() -> Self {
        Self {
            ptys: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Clone, serde::Serialize)]
struct PtyOutput {
    id: String,
    data: String,
}

/// Spawns a new PTY session for the given ID (e.g., agent ID)
#[tauri::command]
pub async fn create_pty(
    id: String,
    window: Window,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    // 1. Setup PTY system
    let pty_system = NativePtySystem::default();
    let size = PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    };
    
    // 2. Open PTY pair
    let pair = pty_system
        .openpty(size)
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    // 3. Configure command (Default shell or specific command)
    // For now, we spawn a shell. The frontend can send the "node openclaw.mjs onboard" command immediately after.
    // Or we can spawn the command directly.
    // Let's spawn shell to allow interaction.
    #[cfg(target_os = "windows")]
    let cmd = CommandBuilder::new("powershell.exe");
    #[cfg(not(target_os = "windows"))]
    let cmd = CommandBuilder::new("bash"); // Mac/Linux

    // 4. Spawn process
    let _child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn command: {}", e))?;
        
    // 5. Store writer
    let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    
    // 6. Spawn reader thread
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let id_clone = id.clone();
    
    thread::spawn(move || {
        let mut buffer = [0u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(n) if n > 0 => {
                    let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                    let _ = window.emit("pty-output", PtyOutput {
                        id: id_clone.clone(),
                        data,
                    });
                }
                Ok(_) => break, // EOF
                Err(_) => break, // Error
            }
        }
    });

    // Store the writer in state
    state.ptys.lock().unwrap().insert(id, writer);

    Ok(())
}

/// Write data (input) to the PTY
#[tauri::command]
pub async fn write_pty(
    id: String,
    data: String,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    let mut ptys = state.ptys.lock().unwrap();
    if let Some(writer) = ptys.get_mut(&id) {
        write!(writer, "{}", data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Resize the PTY
#[tauri::command]
pub async fn resize_pty(
    id: String,
    rows: u16,
    cols: u16,
    // state: tauri::State<'_, PtyState>, // Note: resizing usually requires original pair or master, currently portable-pty resizing is on master.
    // Simplifying: portable-pty 0.8+ allows resizing on MasterPty. 
    // But we only stored writer. We need to store MasterPty to resize.
) -> Result<(), String> {
    // For now, resizing is omitted to keep state simple (Box<dyn Write> vs Box<dyn MasterPty>)
    // To support resize, we'd need to store the MasterPty trait object which is more complex to wrap.
    // We'll skip resize for MVP or use fixed size.
    Ok(())
}

// Keep old commands for backward compatibility or direct spawning if needed
#[tauri::command]
pub async fn spawn_agent(agent_name: String) -> Result<String, String> {
    // ... logic to call create_pty internally? 
    // Actually, handling this via frontend calling create_pty is better.
    // We'll keep this as a stub or legacy.
    Ok(format!("Use create_pty for embedded terminal"))
}

#[tauri::command]
pub async fn open_terminal() -> Result<String, String> {
    Ok("Use create_pty for embedded terminal".to_string())
}
