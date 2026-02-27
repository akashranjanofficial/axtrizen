// CI/CD pipeline commands
//
// Sprint 6, Epic 8: Test running and deploy preview management.
// Uses tokio process for running test commands, tracks results in SQLite.

use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;
use tokio::process::Command;

// ── State ─────────────────────────────────────────────────────────────

pub struct CICDState {
    pub db: Mutex<Option<Connection>>,
    pub active_previews: Mutex<HashMap<String, PreviewInfo>>,
}

#[derive(Clone)]
pub struct PreviewInfo {
    pub id: String,
    pub pid: Option<u32>,
    pub url: String,
    pub provider: String,
}

impl Default for CICDState {
    fn default() -> Self {
        Self {
            db: Mutex::new(None),
            active_previews: Mutex::new(HashMap::new()),
        }
    }
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS test_runs (
            id TEXT PRIMARY KEY,
            project_path TEXT NOT NULL,
            command TEXT NOT NULL,
            framework TEXT,
            status TEXT NOT NULL DEFAULT 'running',
            total INTEGER DEFAULT 0,
            passed INTEGER DEFAULT 0,
            failed INTEGER DEFAULT 0,
            skipped INTEGER DEFAULT 0,
            duration INTEGER DEFAULT 0,
            output TEXT,
            failures TEXT,
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            finished_at TEXT
        );
        CREATE TABLE IF NOT EXISTS deploy_previews (
            id TEXT PRIMARY KEY,
            project_path TEXT NOT NULL,
            url TEXT,
            status TEXT NOT NULL DEFAULT 'deploying',
            provider TEXT NOT NULL DEFAULT 'local',
            branch TEXT,
            started_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )
    .map_err(|e| format!("CICD schema failed: {}", e))
}

fn get_or_init_db(state: &CICDState) -> Result<std::sync::MutexGuard<'_, Option<Connection>>, String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    if db.is_none() {
        let dir = dirs::data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("axtrizen");
        std::fs::create_dir_all(&dir).ok();
        let path = dir.join("cicd.db");
        let conn = Connection::open(&path)
            .map_err(|e| format!("Failed to open CICD DB: {}", e))?;
        ensure_schema(&conn)?;
        *db = Some(conn);
    }
    Ok(db)
}

// ── Tauri Commands ────────────────────────────────────────────────────

/// Run tests and return results
#[tauri::command]
pub async fn ci_run_tests(
    state: State<'_, CICDState>,
    project_path: String,
    command: String,
    framework: Option<String>,
) -> Result<Value, String> {
    let run_id = uuid::Uuid::new_v4().to_string();
    let fw = framework.unwrap_or_else(|| "auto".to_string());

    // Record the run
    {
        let db = get_or_init_db(&state)?;
        let conn = db.as_ref().ok_or("DB not initialized")?;
        conn.execute(
            "INSERT INTO test_runs (id, project_path, command, framework, status) VALUES (?1, ?2, ?3, ?4, 'running')",
            params![run_id, project_path, command, fw],
        )
        .map_err(|e| format!("Insert test run failed: {}", e))?;
    }

    // Execute the test command
    let start = std::time::Instant::now();

    // Split command into shell execution
    let output = Command::new("sh")
        .args(["-c", &command])
        .current_dir(&project_path)
        .output()
        .await
        .map_err(|e| format!("Failed to run tests: {}", e))?;

    let duration = start.elapsed().as_millis() as i64;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}\n{}", stdout, stderr);
    let success = output.status.success();

    // Parse test results from output
    let (total, passed, failed, skipped, failures) = parse_output(&combined, &fw);

    let status = if success && failed == 0 {
        "passed"
    } else {
        "failed"
    };

    // Update the run record
    {
        let db = get_or_init_db(&state)?;
        let conn = db.as_ref().ok_or("DB not initialized")?;
        conn.execute(
            "UPDATE test_runs SET status=?1, total=?2, passed=?3, failed=?4, skipped=?5, duration=?6, output=?7, failures=?8, finished_at=datetime('now') WHERE id=?9",
            params![status, total, passed, failed, skipped, duration, combined.chars().take(50000).collect::<String>(), serde_json::to_string(&failures).unwrap_or_default(), run_id],
        )
        .map_err(|e| format!("Update test run failed: {}", e))?;
    }

    Ok(json!({
        "id": run_id,
        "status": status,
        "total": total,
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "duration": duration,
        "failures": failures,
        "startedAt": chrono::Utc::now().to_rfc3339(),
        "finishedAt": chrono::Utc::now().to_rfc3339(),
    }))
}

/// Get test run status
#[tauri::command]
pub async fn ci_test_status(
    state: State<'_, CICDState>,
    run_id: String,
) -> Result<Value, String> {
    let db = get_or_init_db(&state)?;
    let conn = db.as_ref().ok_or("DB not initialized")?;

    let result = conn
        .query_row(
            "SELECT id, status, total, passed, failed, skipped, duration, failures, started_at, finished_at FROM test_runs WHERE id = ?1",
            params![run_id],
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "status": row.get::<_, String>(1)?,
                    "total": row.get::<_, i64>(2)?,
                    "passed": row.get::<_, i64>(3)?,
                    "failed": row.get::<_, i64>(4)?,
                    "skipped": row.get::<_, i64>(5)?,
                    "duration": row.get::<_, i64>(6)?,
                    "failures": serde_json::from_str::<Value>(&row.get::<_, String>(7).unwrap_or_default()).unwrap_or(json!([])),
                    "startedAt": row.get::<_, String>(8)?,
                    "finishedAt": row.get::<_, Option<String>>(9)?,
                }))
            },
        )
        .map_err(|e| format!("Test run not found: {}", e))?;

    Ok(result)
}

/// Deploy a preview environment (local dev server)
#[tauri::command]
pub async fn ci_deploy_preview(
    state: State<'_, CICDState>,
    project_path: String,
    branch: Option<String>,
    provider: Option<String>,
    _env: Option<String>,
) -> Result<Value, String> {
    let preview_id = uuid::Uuid::new_v4().to_string();
    let prov = provider.unwrap_or_else(|| "local".to_string());

    // For local provider, start a dev server
    let (url, pid) = match prov.as_str() {
        "local" => {
            // Try to find an available port
            let port = 3000 + (rand_port() % 1000);
            let url = format!("http://localhost:{}", port);

            // Start dev server in background
            let child = Command::new("sh")
                .args(["-c", &format!("npx vite --port {} --host", port)])
                .current_dir(&project_path)
                .spawn()
                .map_err(|e| format!("Failed to start preview: {}", e))?;

            let pid = child.id();

            (url, pid)
        }
        _ => {
            // For cloud providers, would call their CLIs
            (String::from("https://preview-pending.example.com"), None)
        }
    };

    // Record in DB
    {
        let db = get_or_init_db(&state)?;
        let conn = db.as_ref().ok_or("DB not initialized")?;
        conn.execute(
            "INSERT INTO deploy_previews (id, project_path, url, status, provider, branch) VALUES (?1, ?2, ?3, 'ready', ?4, ?5)",
            params![preview_id, project_path, url, prov, branch.unwrap_or_default()],
        )
        .map_err(|e| format!("Insert preview failed: {}", e))?;
    }

    // Track active preview
    {
        let mut previews = state.active_previews.lock().map_err(|e| e.to_string())?;
        previews.insert(
            preview_id.clone(),
            PreviewInfo {
                id: preview_id.clone(),
                pid,
                url: url.clone(),
                provider: prov.clone(),
            },
        );
    }

    Ok(json!({
        "id": preview_id,
        "url": url,
        "status": "ready",
        "provider": prov,
        "startedAt": chrono::Utc::now().to_rfc3339(),
    }))
}

/// Stop a running preview
#[tauri::command]
pub async fn ci_stop_preview(
    state: State<'_, CICDState>,
    preview_id: String,
) -> Result<Value, String> {
    // Kill the process if tracked
    {
        let mut previews = state.active_previews.lock().map_err(|e| e.to_string())?;
        if let Some(info) = previews.remove(&preview_id) {
            if let Some(pid) = info.pid {
                // Kill the process group
                #[cfg(unix)]
                {
                    unsafe {
                        libc::kill(pid as i32, libc::SIGTERM);
                    }
                }
            }
        }
    }

    // Update DB
    {
        let db = get_or_init_db(&state)?;
        let conn = db.as_ref().ok_or("DB not initialized")?;
        conn.execute(
            "UPDATE deploy_previews SET status = 'stopped' WHERE id = ?1",
            params![preview_id],
        )
        .map_err(|e| format!("Update preview failed: {}", e))?;
    }

    Ok(json!({ "status": "stopped", "id": preview_id }))
}

// ── Helpers ───────────────────────────────────────────────────────────

fn rand_port() -> u16 {
    use std::time::SystemTime;
    let t = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    (t % 1000) as u16
}

fn parse_output(
    output: &str,
    framework: &str,
) -> (i64, i64, i64, i64, Vec<Value>) {
    let mut total: i64 = 0;
    let mut passed: i64 = 0;
    let mut failed: i64 = 0;
    let mut skipped: i64 = 0;
    let mut failures = Vec::new();

    match framework {
        "vitest" | "jest" => {
            // Look for "Tests:  X passed, Y failed, Z total"
            for line in output.lines() {
                let trimmed = line.trim();
                if trimmed.contains("passed") && (trimmed.contains("failed") || trimmed.contains("total")) {
                    // Parse numbers
                    for part in trimmed.split(',') {
                        let part = part.trim();
                        if part.contains("passed") {
                            passed = extract_number(part);
                        } else if part.contains("failed") {
                            failed = extract_number(part);
                        } else if part.contains("skipped") {
                            skipped = extract_number(part);
                        } else if part.contains("total") {
                            total = extract_number(part);
                        }
                    }
                }

                // Capture FAIL lines
                if trimmed.starts_with("FAIL") || trimmed.starts_with("✗") || trimmed.starts_with("×") {
                    failures.push(json!({
                        "name": trimmed,
                        "file": "",
                        "message": trimmed,
                    }));
                }
            }
            if total == 0 {
                total = passed + failed + skipped;
            }
        }
        "pytest" => {
            for line in output.lines() {
                if line.contains("passed") || line.contains("failed") {
                    for part in line.split(',') {
                        let part = part.trim();
                        if part.contains("passed") {
                            passed = extract_number(part);
                        } else if part.contains("failed") {
                            failed = extract_number(part);
                        } else if part.contains("skipped") {
                            skipped = extract_number(part);
                        }
                    }
                }
            }
            total = passed + failed + skipped;
        }
        "cargo" => {
            for line in output.lines() {
                if line.contains("test result:") {
                    for part in line.split(';') {
                        let part = part.trim();
                        if part.contains("passed") {
                            passed = extract_number(part);
                        } else if part.contains("failed") {
                            failed = extract_number(part);
                        } else if part.contains("ignored") {
                            skipped = extract_number(part);
                        }
                    }
                    total = passed + failed + skipped;
                }
            }
        }
        _ => {
            // Best-effort generic parsing
            total = if output.contains("PASS") || output.contains("pass") {
                1
            } else {
                0
            };
        }
    }

    (total, passed, failed, skipped, failures)
}

fn extract_number(s: &str) -> i64 {
    s.chars()
        .filter(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse()
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_vitest_output() {
        let output = "Tests:  5 passed, 2 failed, 7 total\nTime: 1.2s";
        let (total, passed, failed, skipped, _) = parse_output(output, "vitest");
        assert_eq!(total, 7);
        assert_eq!(passed, 5);
        assert_eq!(failed, 2);
        assert_eq!(skipped, 0);
    }

    #[test]
    fn test_parse_cargo_output() {
        let output = "test result: ok. 10 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out";
        let (total, passed, failed, skipped, _) = parse_output(output, "cargo");
        assert_eq!(total, 12);
        assert_eq!(passed, 10);
        assert_eq!(failed, 0);
        assert_eq!(skipped, 2);
    }

    #[test]
    fn test_extract_number() {
        assert_eq!(extract_number("5 passed"), 5);
        assert_eq!(extract_number("12 failed"), 12);
        assert_eq!(extract_number("no number here"), 0);
    }
}
