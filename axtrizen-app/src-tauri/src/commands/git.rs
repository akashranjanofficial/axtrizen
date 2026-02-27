// Git integration commands — autonomous version control for agents
//
// Sprint 5, Epic 5: Auto-commit, branch management, and PR creation.
// All git operations shell out to `git` CLI via tokio::process.

use serde_json::{json, Value};
use std::path::Path;
use tokio::process::Command;

// ── Helpers ───────────────────────────────────────────────────────────

async fn git_cmd(workspace: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(workspace)
        .output()
        .await
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!("git {} failed: {}", args.join(" "), stderr))
    }
}

// ── Tauri Commands ────────────────────────────────────────────────────

/// Check if a directory is a git repository
#[tauri::command]
pub async fn git_is_repo(workspace_path: String) -> Result<bool, String> {
    let path = Path::new(&workspace_path).join(".git");
    Ok(path.exists())
}

/// Get the current branch name
#[tauri::command]
pub async fn git_current_branch(workspace_path: String) -> Result<String, String> {
    git_cmd(&workspace_path, &["rev-parse", "--abbrev-ref", "HEAD"]).await
}

/// Get git status: staged, unstaged, untracked files
#[tauri::command]
pub async fn git_status(workspace_path: String) -> Result<Value, String> {
    let output = git_cmd(&workspace_path, &["status", "--porcelain=v1"]).await?;

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    for line in output.lines() {
        if line.len() < 3 {
            continue;
        }
        let x = line.chars().next().unwrap_or(' ');
        let y = line.chars().nth(1).unwrap_or(' ');
        let file = line[3..].to_string();

        if x == '?' && y == '?' {
            untracked.push(file);
        } else {
            if x != ' ' && x != '?' {
                staged.push(file.clone());
            }
            if y != ' ' && y != '?' {
                unstaged.push(file);
            }
        }
    }

    Ok(json!({
        "staged": staged,
        "unstaged": unstaged,
        "untracked": untracked,
    }))
}

/// Commit changes with an optional addAll flag
#[tauri::command]
pub async fn git_commit(
    workspace_path: String,
    message: String,
    add_all: bool,
) -> Result<Value, String> {
    if add_all {
        git_cmd(&workspace_path, &["add", "-A"]).await?;
    }

    git_cmd(&workspace_path, &["commit", "-m", &message]).await?;

    // Get the commit hash
    let hash = git_cmd(&workspace_path, &["rev-parse", "--short", "HEAD"]).await?;

    Ok(json!({ "hash": hash }))
}

/// Create a new branch
#[tauri::command]
pub async fn git_create_branch(
    workspace_path: String,
    branch_name: String,
) -> Result<Value, String> {
    git_cmd(&workspace_path, &["branch", &branch_name]).await?;
    Ok(json!({ "status": "ok", "branch": branch_name }))
}

/// Checkout a branch
#[tauri::command]
pub async fn git_checkout(
    workspace_path: String,
    branch_name: String,
) -> Result<Value, String> {
    git_cmd(&workspace_path, &["checkout", &branch_name]).await?;
    Ok(json!({ "status": "ok", "branch": branch_name }))
}

/// Push a branch to origin
#[tauri::command]
pub async fn git_push(
    workspace_path: String,
    branch_name: String,
) -> Result<Value, String> {
    git_cmd(
        &workspace_path,
        &["push", "-u", "origin", &branch_name],
    )
    .await?;
    Ok(json!({ "status": "ok" }))
}

/// Get diff stats between two branches
#[tauri::command]
pub async fn git_diff(
    workspace_path: String,
    base_branch: String,
    head_branch: String,
) -> Result<Value, String> {
    let range = format!("{}...{}", base_branch, head_branch);

    // Get numstat for per-file info
    let numstat = git_cmd(
        &workspace_path,
        &["diff", "--numstat", &range],
    )
    .await
    .unwrap_or_default();

    let mut files = Vec::new();
    let mut total_ins: u64 = 0;
    let mut total_del: u64 = 0;

    for line in numstat.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            let ins: u64 = parts[0].parse().unwrap_or(0);
            let del: u64 = parts[1].parse().unwrap_or(0);
            let path = parts[2].to_string();
            total_ins += ins;
            total_del += del;
            files.push(json!({
                "path": path,
                "insertions": ins,
                "deletions": del,
            }));
        }
    }

    Ok(json!({
        "filesChanged": files.len(),
        "insertions": total_ins,
        "deletions": total_del,
        "files": files,
    }))
}

/// Create a pull request via GitHub REST API
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn git_create_pr(
    workspace_path: String,
    title: String,
    body: String,
    head: String,
    base: String,
    provider: Option<String>,
    owner: Option<String>,
    repo: Option<String>,
    token: Option<String>,
) -> Result<Value, String> {
    let provider = provider.unwrap_or_else(|| "github".to_string());

    // Try to detect owner/repo from remote URL if not provided
    let (final_owner, final_repo) = match (owner, repo) {
        (Some(o), Some(r)) => (o, r),
        _ => detect_remote_info(&workspace_path).await?,
    };

    let api_token = token.unwrap_or_default();
    if api_token.is_empty() {
        return Err("No API token provided for PR creation".to_string());
    }

    match provider.as_str() {
        "github" => {
            let url = format!(
                "https://api.github.com/repos/{}/{}/pulls",
                final_owner, final_repo
            );

            let client = reqwest::Client::new();
            let resp = client
                .post(&url)
                .header("Authorization", format!("Bearer {}", api_token))
                .header("Accept", "application/vnd.github+json")
                .header("User-Agent", "Axtrizen-AI")
                .json(&json!({
                    "title": title,
                    "body": body,
                    "head": head,
                    "base": base,
                }))
                .send()
                .await
                .map_err(|e| format!("HTTP request failed: {}", e))?;

            let status = resp.status();
            let body_text: Value = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse response: {}", e))?;

            if status.is_success() {
                Ok(json!({
                    "url": body_text["html_url"],
                    "number": body_text["number"],
                }))
            } else {
                Err(format!(
                    "GitHub API error ({}): {}",
                    status,
                    body_text.get("message").unwrap_or(&Value::Null)
                ))
            }
        }
        "gitlab" => {
            let url = format!(
                "https://gitlab.com/api/v4/projects/{}%2F{}/merge_requests",
                final_owner, final_repo
            );

            let client = reqwest::Client::new();
            let resp = client
                .post(&url)
                .header("PRIVATE-TOKEN", &api_token)
                .json(&json!({
                    "title": title,
                    "description": body,
                    "source_branch": head,
                    "target_branch": base,
                }))
                .send()
                .await
                .map_err(|e| format!("HTTP request failed: {}", e))?;

            let status = resp.status();
            let body_text: Value = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse response: {}", e))?;

            if status.is_success() {
                Ok(json!({
                    "url": body_text["web_url"],
                    "number": body_text["iid"],
                }))
            } else {
                Err(format!("GitLab API error ({}): {:?}", status, body_text))
            }
        }
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

/// Detect owner/repo from the git remote URL
async fn detect_remote_info(workspace: &str) -> Result<(String, String), String> {
    let remote = git_cmd(workspace, &["remote", "get-url", "origin"]).await?;
    parse_remote_url(&remote)
}

/// Parse a git remote URL into (owner, repo)
fn parse_remote_url(url: &str) -> Result<(String, String), String> {
    // SSH: git@github.com:owner/repo.git
    if let Some(rest) = url.strip_prefix("git@") {
        let parts: Vec<&str> = rest.splitn(2, ':').collect();
        if parts.len() == 2 {
            let path = parts[1].trim_end_matches(".git");
            let segments: Vec<&str> = path.splitn(2, '/').collect();
            if segments.len() == 2 {
                return Ok((segments[0].to_string(), segments[1].to_string()));
            }
        }
    }

    // HTTPS: https://github.com/owner/repo.git
    if url.starts_with("https://") || url.starts_with("http://") {
        let path = url
            .trim_start_matches("https://")
            .trim_start_matches("http://");
        // Remove host
        let parts: Vec<&str> = path.splitn(2, '/').collect();
        if parts.len() == 2 {
            let rest = parts[1].trim_end_matches(".git");
            let segments: Vec<&str> = rest.splitn(2, '/').collect();
            if segments.len() == 2 {
                return Ok((segments[0].to_string(), segments[1].to_string()));
            }
        }
    }

    Err(format!("Could not parse remote URL: {}", url))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ssh_remote() {
        let (owner, repo) = parse_remote_url("git@github.com:acme/widgets.git").unwrap();
        assert_eq!(owner, "acme");
        assert_eq!(repo, "widgets");
    }

    #[test]
    fn test_parse_https_remote() {
        let (owner, repo) =
            parse_remote_url("https://github.com/acme/widgets.git").unwrap();
        assert_eq!(owner, "acme");
        assert_eq!(repo, "widgets");
    }

    #[test]
    fn test_parse_https_no_git_suffix() {
        let (owner, repo) =
            parse_remote_url("https://github.com/acme/widgets").unwrap();
        assert_eq!(owner, "acme");
        assert_eq!(repo, "widgets");
    }
}
