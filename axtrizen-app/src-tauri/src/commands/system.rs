// System commands - Health, heartbeat, presence

use serde_json::{json, Value};
use crate::gateway_client::GatewayClient;

/// Get gateway health (memory, CPU, version)
#[tauri::command]
pub async fn gateway_health(
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("health", json!({})).await
}

/// Get gateway status summary
#[tauri::command]
pub async fn gateway_status(
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("status", json!({})).await
}

/// Get last heartbeat timestamp
#[tauri::command]
pub async fn last_heartbeat(
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("last-heartbeat", json!({})).await
}

/// Get system presence (which nodes/devices are online)
#[tauri::command]
pub async fn system_presence(
    state: tauri::State<'_, GatewayClient>,
) -> Result<Value, String> {
    state.call("system-presence", json!({})).await
}

fn is_path_safe(requested_path: &str) -> Result<bool, String> {
    let path = std::path::Path::new(requested_path);
    let absolute_path = match std::fs::canonicalize(path) {
        Ok(p) => p,
        Err(_) => return Ok(false), // Path doesn't exist or can't be canonicalized
    };

    let abs_str = absolute_path.to_string_lossy().to_string();

    // 1. Always allow paths inside ~/.axtrizen/projects
    let axtrizen_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".axtrizen")
        .join("projects");
    let base_str = axtrizen_dir.to_string_lossy().to_string();
    if abs_str.starts_with(&base_str) || abs_str.contains(".axtrizen/projects") {
        return Ok(true);
    }

    // 2. Allow paths that are inside any known project workspace from the database.
    //    This enables workspace file browsing and final report reading for projects
    //    whose workspace_path is outside ~/.axtrizen/projects/.
    if let Ok(conn) = crate::db::init_db() {
        if let Ok(projects) = crate::db::get_all_projects(&conn) {
            for project in &projects {
                if let Some(ref wp) = project.workspace_path {
                    // Canonicalize the workspace path for reliable comparison
                    if let Ok(canonical_wp) = std::fs::canonicalize(wp) {
                        let wp_str = canonical_wp.to_string_lossy().to_string();
                        if abs_str.starts_with(&wp_str) {
                            return Ok(true);
                        }
                    }
                    // Also check without canonicalization in case the workspace
                    // path is a symlink or the directory was just created
                    if abs_str.starts_with(wp) {
                        return Ok(true);
                    }
                }
            }
        }
    }

    Ok(false)
}

/// Read a file's text content — used by frontend to load FINAL_REPORT.md etc.
#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    if !is_path_safe(&path).unwrap_or(false) {
        return Err("Security Error: Attempted to access file outside of Axtrizen workspace".to_string());
    }

    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read '{}': {}", path, e))
}

#[derive(serde::Serialize)]
pub struct FileEntry {
    name: String,
    path: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
    size: u64,
    children: Option<Vec<FileEntry>>,
}

/// List files and directories recursively for a given workspace path
#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    if !is_path_safe(&path).unwrap_or(false) {
        return Err("Security Error: Attempted to list directory outside of Axtrizen workspace".to_string());
    }

    fn walk_dir(dir_path: &std::path::Path) -> Result<Vec<FileEntry>, String> {
        let mut entries = Vec::new();
        let read_dir = std::fs::read_dir(dir_path).map_err(|e| e.to_string())?;

        for entry in read_dir.flatten() {
                let path_buf = entry.path();
                let file_name = entry.file_name().to_string_lossy().to_string();

                // Skip common ignored directories
                if file_name == "node_modules"
                    || file_name == ".git"
                    || file_name == "dist"
                    || file_name == "__pycache__"
                {
                    continue;
                }

                let metadata = entry.metadata().map_err(|e| e.to_string())?;
                let is_dir = metadata.is_dir();

                let mut file_entry = FileEntry {
                    name: file_name,
                    path: path_buf.to_string_lossy().to_string(),
                    is_dir,
                    size: metadata.len(),
                    children: None,
                };

                if is_dir {
                    // Recursively get children
                    if let Ok(children) = walk_dir(&path_buf) {
                        file_entry.children = Some(children);
                    }
                }

                entries.push(file_entry);
        }

        // Sort: directories first, then alphabetical
        entries.sort_by(|a, b| {
            if a.is_dir && !b.is_dir {
                std::cmp::Ordering::Less
            } else if !a.is_dir && b.is_dir {
                std::cmp::Ordering::Greater
            } else {
                a.name.cmp(&b.name)
            }
        });

        Ok(entries)
    }

    walk_dir(std::path::Path::new(&path))
}

/// Open a directory in the system file manager (Finder on macOS)
#[tauri::command]
pub async fn open_workspace(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open workspace: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open workspace: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open workspace: {}", e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_safety() {
        // Can't easily test real absolute canonicalization in unit tests across different CI machines
        // without setting up tmp dirs. So this is just a stub to ensure things compile.
        let invalid_path = "/etc/passwd";
        assert_eq!(is_path_safe(invalid_path).unwrap_or(false), false);

        let relative_traversal = "../../../etc/passwd";
        assert_eq!(is_path_safe(relative_traversal).unwrap_or(false), false);
    }
}
