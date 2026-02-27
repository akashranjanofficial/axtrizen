// verification_engine.rs — Sprint S6: Quality Verification Engine
//
// Three-level verification system that checks agent deliverables:
//   Level 1 — Exists:      Are all expected output files present?
//   Level 2 — Substantive:  Do files contain real content (not stubs)?
//   Level 3 — Wired:        Do imports resolve, functions get called, tests target real code?

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// ═══════════════════════════════ Types ═══════════════════════════

/// Result of a single check.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CheckStatus {
    Pass,
    Fail,
    Warn,
}

/// Strictness level for how the gate treats failures.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum StrictnessLevel {
    /// Just show warnings, never block.
    WarnOnly,
    /// Block on critical (Level 1 & 2 fails), warn on Level 3.
    BlockCritical,
    /// Block on any failure across all levels.
    BlockAll,
}

impl Default for StrictnessLevel {
    fn default() -> Self {
        Self::WarnOnly
    }
}

/// A single verification finding.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationFinding {
    pub level: u8,           // 1, 2, or 3
    pub check_name: String,
    pub status: CheckStatus,
    pub file_path: String,
    pub line_number: Option<u32>,
    pub message: String,
    pub pattern_matched: Option<String>,
}

/// Aggregate result for one verification level.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LevelResult {
    pub level: u8,
    pub level_name: String,
    pub status: CheckStatus,
    pub findings: Vec<VerificationFinding>,
    pub pass_count: u32,
    pub fail_count: u32,
    pub warn_count: u32,
}

/// Full verification report for a phase.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationReport {
    pub project_id: String,
    pub phase_id: String,
    pub phase_name: String,
    pub overall_status: CheckStatus,
    pub gate_blocked: bool,
    pub strictness: StrictnessLevel,
    pub levels: Vec<LevelResult>,
    pub total_findings: u32,
    pub timestamp: String,
}

/// Override record for audit trail.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateOverride {
    pub project_id: String,
    pub phase_id: String,
    pub overridden_by: String,
    pub reason: String,
    pub timestamp: String,
    pub findings_at_override: u32,
}

/// Phase gate status for UI badges.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseGateStatus {
    pub phase_id: String,
    pub phase_name: String,
    pub badge: String,          // "pass", "fail", "warn", "pending", "overridden"
    pub badge_emoji: String,    // ✅, ❌, ⚠️, 🔄, ⏭️
    pub last_verified: Option<String>,
    pub can_advance: bool,
    pub override_record: Option<GateOverride>,
}

// ═══════════════════════════ Stub Patterns ═══════════════════════

/// 18 patterns that indicate stub/placeholder content.
pub const STUB_PATTERNS: &[(&str, &str)] = &[
    ("TODO",                  r"(?i)\bTODO\b"),
    ("FIXME",                 r"(?i)\bFIXME\b"),
    ("HACK",                  r"(?i)\bHACK\b"),
    ("XXX",                   r"(?i)\bXXX\b"),
    ("not implemented",       r"(?i)not\s+implemented"),
    ("unimplemented!()",      r"unimplemented!\(\)"),
    ("todo!()",               r"todo!\(\)"),
    ("pass (Python stub)",    r"^\s*pass\s*$"),
    ("empty function body",   r"(?i)(fn|function|def)\s+\w+\s*\([^)]*\)\s*\{?\s*\}?$"),
    ("lorem ipsum",           r"(?i)lorem\s+ipsum"),
    ("placeholder",           r"(?i)\bplaceholder\b"),
    ("sample data",           r"(?i)sample\s+data"),
    ("example.com",           r"example\.com"),
    ("foo/bar/baz",           r"\b(foo|bar|baz)\b"),
    ("throw not implemented", r#"throw\s+new\s+Error\(["']not implemented"#),
    ("return null stub",      r"return\s+null;\s*//\s*(stub|temp)"),
    ("print hello world",     r#"print(ln)?!?\s*\(\s*["']hello world"#),
    ("hardcoded 42",          r"=\s*42\s*;\s*//\s*(temp|stub|todo)"),
];

/// Common import resolution patterns by language.
fn get_import_patterns() -> Vec<(&'static str, &'static str)> {
    vec![
        ("ts_import",    r#"import\s+.*from\s+["']([^"']+)["']"#),
        ("ts_require",   r#"require\(["']([^"']+)["']\)"#),
        ("rust_use",     r"use\s+(\w+(::\w+)+)"),
        ("python_import", r"(?:from\s+(\S+)\s+import|import\s+(\S+))"),
        ("rs_mod",       r"mod\s+(\w+);"),
    ]
}

// ═══════════════════════════ Engine Core ═════════════════════════

/// Run Level 1: Exists check — verify expected files are present.
pub fn check_level1_exists(
    workspace: &str,
    expected_files: &[String],
) -> LevelResult {
    let mut findings = Vec::new();
    let ws = Path::new(workspace);

    for file in expected_files {
        let path = ws.join(file);
        let status = if path.exists() {
            CheckStatus::Pass
        } else {
            CheckStatus::Fail
        };
        let message = if status == CheckStatus::Pass {
            format!("File exists: {}", file)
        } else {
            format!("Missing expected file: {}", file)
        };
        findings.push(VerificationFinding {
            level: 1,
            check_name: "file_exists".to_string(),
            status,
            file_path: file.clone(),
            line_number: None,
            message,
            pattern_matched: None,
        });
    }

    aggregate_level(1, "Exists Check", findings)
}

/// Run Level 2: Substantive check — detect stub patterns in files.
pub fn check_level2_substantive(
    workspace: &str,
    files_to_check: &[String],
) -> LevelResult {
    let mut findings = Vec::new();
    let ws = Path::new(workspace);

    for file in files_to_check {
        let path = ws.join(file);
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => {
                findings.push(VerificationFinding {
                    level: 2,
                    check_name: "read_file".to_string(),
                    status: CheckStatus::Warn,
                    file_path: file.clone(),
                    line_number: None,
                    message: format!("Could not read file: {}", file),
                    pattern_matched: None,
                });
                continue;
            }
        };

        // Check for empty files
        let trimmed = content.trim();
        if trimmed.is_empty() {
            findings.push(VerificationFinding {
                level: 2,
                check_name: "empty_file".to_string(),
                status: CheckStatus::Fail,
                file_path: file.clone(),
                line_number: None,
                message: format!("File is empty: {}", file),
                pattern_matched: Some("empty_file".to_string()),
            });
            continue;
        }

        // Check each stub pattern
        for (name, pattern) in STUB_PATTERNS {
            if let Ok(re) = regex::Regex::new(pattern) {
                for (line_idx, line) in content.lines().enumerate() {
                    if re.is_match(line) {
                        findings.push(VerificationFinding {
                            level: 2,
                            check_name: "stub_pattern".to_string(),
                            status: CheckStatus::Warn,
                            file_path: file.clone(),
                            line_number: Some((line_idx + 1) as u32),
                            message: format!(
                                "Stub pattern '{}' found: {}",
                                name,
                                line.trim()
                            ),
                            pattern_matched: Some(name.to_string()),
                        });
                    }
                }
            }
        }
    }

    aggregate_level(2, "Substantive Check", findings)
}

/// Run Level 3: Wired check — validate imports resolve and functions are used.
pub fn check_level3_wired(
    workspace: &str,
    files_to_check: &[String],
) -> LevelResult {
    let mut findings = Vec::new();
    let ws = Path::new(workspace);
    let import_patterns = get_import_patterns();

    for file in files_to_check {
        let path = ws.join(file);
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Check for unresolved imports (TypeScript / JavaScript)
        if file.ends_with(".ts") || file.ends_with(".tsx") || file.ends_with(".js") {
            check_ts_imports(ws, file, &content, &mut findings);
        }

        // Check Rust mod declarations
        if file.ends_with(".rs") {
            check_rust_modules(ws, file, &content, &mut findings);
        }

        // Check for exported-but-unused functions (heuristic)
        check_exported_unused(file, &content, &mut findings);
    }

    aggregate_level(3, "Wired Check", findings)
}

/// Check TypeScript import paths resolve to actual files.
fn check_ts_imports(
    workspace: &Path,
    file: &str,
    content: &str,
    findings: &mut Vec<VerificationFinding>,
) {
    let re = regex::Regex::new(r#"import\s+.*from\s+["'](\./[^"']+|\.\.\/[^"']+)["']"#).unwrap();
    let file_dir = Path::new(file).parent().unwrap_or(Path::new(""));

    for cap in re.captures_iter(content) {
        let import_path = &cap[1];
        let resolved = workspace.join(file_dir).join(import_path);

        // Try common extensions
        let extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];
        let exists = extensions.iter().any(|ext| {
            let candidate = PathBuf::from(format!("{}{}", resolved.display(), ext));
            candidate.exists()
        });

        if !exists {
            // Find line number
            let line_num = content.lines().enumerate()
                .find(|(_, l)| l.contains(import_path))
                .map(|(i, _)| (i + 1) as u32);

            findings.push(VerificationFinding {
                level: 3,
                check_name: "import_resolve".to_string(),
                status: CheckStatus::Warn,
                file_path: file.to_string(),
                line_number: line_num,
                message: format!("Unresolved import: {}", import_path),
                pattern_matched: Some(import_path.to_string()),
            });
        }
    }
}

/// Check Rust `mod foo;` declarations have corresponding files.
fn check_rust_modules(
    workspace: &Path,
    file: &str,
    content: &str,
    findings: &mut Vec<VerificationFinding>,
) {
    let re = regex::Regex::new(r"mod\s+(\w+);").unwrap();
    let file_dir = Path::new(file).parent().unwrap_or(Path::new(""));

    for cap in re.captures_iter(content) {
        let mod_name = &cap[1];
        let mod_file = workspace.join(file_dir).join(format!("{}.rs", mod_name));
        let mod_dir = workspace.join(file_dir).join(mod_name).join("mod.rs");

        if !mod_file.exists() && !mod_dir.exists() {
            let line_num = content.lines().enumerate()
                .find(|(_, l)| l.contains(&format!("mod {};", mod_name)))
                .map(|(i, _)| (i + 1) as u32);

            findings.push(VerificationFinding {
                level: 3,
                check_name: "mod_resolve".to_string(),
                status: CheckStatus::Warn,
                file_path: file.to_string(),
                line_number: line_num,
                message: format!("Unresolved module: {}", mod_name),
                pattern_matched: Some(mod_name.to_string()),
            });
        }
    }
}

/// Heuristic: check if exported functions are likely called somewhere.
fn check_exported_unused(
    file: &str,
    content: &str,
    findings: &mut Vec<VerificationFinding>,
) {
    let re = regex::Regex::new(r"export\s+(?:async\s+)?function\s+(\w+)").unwrap();
    for cap in re.captures_iter(content) {
        let fn_name = &cap[1];
        // Count occurrences — if only 1 (the definition), it's unused within the file
        let count = content.matches(fn_name).count();
        if count <= 1 {
            let line_num = content.lines().enumerate()
                .find(|(_, l)| l.contains(&format!("function {}", fn_name)))
                .map(|(i, _)| (i + 1) as u32);

            findings.push(VerificationFinding {
                level: 3,
                check_name: "export_unused".to_string(),
                status: CheckStatus::Warn,
                file_path: file.to_string(),
                line_number: line_num,
                message: format!(
                    "Exported function '{}' not referenced elsewhere in file (may be used externally)",
                    fn_name
                ),
                pattern_matched: Some(fn_name.to_string()),
            });
        }
    }
}

/// Aggregate findings into a level result.
fn aggregate_level(level: u8, name: &str, findings: Vec<VerificationFinding>) -> LevelResult {
    let mut pass_count = 0u32;
    let mut fail_count = 0u32;
    let mut warn_count = 0u32;

    for f in &findings {
        match f.status {
            CheckStatus::Pass => pass_count += 1,
            CheckStatus::Fail => fail_count += 1,
            CheckStatus::Warn => warn_count += 1,
        }
    }

    let status = if fail_count > 0 {
        CheckStatus::Fail
    } else if warn_count > 0 {
        CheckStatus::Warn
    } else {
        CheckStatus::Pass
    };

    LevelResult {
        level,
        level_name: name.to_string(),
        status,
        findings,
        pass_count,
        fail_count,
        warn_count,
    }
}

/// Determine if the gate should block advancement.
fn should_block(report: &VerificationReport) -> bool {
    match report.strictness {
        StrictnessLevel::WarnOnly => false,
        StrictnessLevel::BlockCritical => {
            // Block if Level 1 or Level 2 has failures
            report.levels.iter().any(|l| l.level <= 2 && l.status == CheckStatus::Fail)
        }
        StrictnessLevel::BlockAll => {
            report.levels.iter().any(|l| l.status == CheckStatus::Fail)
        }
    }
}

/// Run full 3-level verification on a set of files for a project phase.
pub fn run_verification(
    project_id: &str,
    phase_id: &str,
    phase_name: &str,
    workspace: &str,
    expected_files: &[String],
    strictness: StrictnessLevel,
) -> VerificationReport {
    let level1 = check_level1_exists(workspace, expected_files);

    // For Level 2 & 3, only check files that actually exist
    let existing_files: Vec<String> = expected_files.iter()
        .filter(|f| Path::new(workspace).join(f).exists())
        .cloned()
        .collect();

    let level2 = check_level2_substantive(workspace, &existing_files);
    let level3 = check_level3_wired(workspace, &existing_files);

    let total_findings = level1.findings.len() + level2.findings.len() + level3.findings.len();

    let overall_status = if level1.status == CheckStatus::Fail || level2.status == CheckStatus::Fail {
        CheckStatus::Fail
    } else if level3.status == CheckStatus::Fail {
        CheckStatus::Fail
    } else if level1.status == CheckStatus::Warn || level2.status == CheckStatus::Warn || level3.status == CheckStatus::Warn {
        CheckStatus::Warn
    } else {
        CheckStatus::Pass
    };

    let mut report = VerificationReport {
        project_id: project_id.to_string(),
        phase_id: phase_id.to_string(),
        phase_name: phase_name.to_string(),
        overall_status,
        gate_blocked: false,
        strictness,
        levels: vec![level1, level2, level3],
        total_findings: total_findings as u32,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };

    report.gate_blocked = should_block(&report);
    report
}

/// Build phase gate statuses for all phases in a workflow.
pub fn build_phase_gate_statuses(
    phases: &[(String, String)], // (phase_id, phase_name)
    verified_phases: &HashMap<String, VerificationReport>,
    overrides: &HashMap<String, GateOverride>,
) -> Vec<PhaseGateStatus> {
    phases.iter().map(|(id, name)| {
        let report = verified_phases.get(id);
        let override_rec = overrides.get(id);

        let (badge, emoji, can_advance) = if let Some(ovr) = override_rec {
            ("overridden".to_string(), "⏭️".to_string(), true)
        } else if let Some(r) = report {
            match r.overall_status {
                CheckStatus::Pass => ("pass".to_string(), "✅".to_string(), true),
                CheckStatus::Fail => {
                    if r.gate_blocked {
                        ("fail".to_string(), "❌".to_string(), false)
                    } else {
                        ("warn".to_string(), "⚠️".to_string(), true)
                    }
                }
                CheckStatus::Warn => ("warn".to_string(), "⚠️".to_string(), true),
            }
        } else {
            ("pending".to_string(), "🔄".to_string(), false)
        };

        PhaseGateStatus {
            phase_id: id.clone(),
            phase_name: name.clone(),
            badge,
            badge_emoji: emoji,
            last_verified: report.map(|r| r.timestamp.clone()),
            can_advance,
            override_record: override_rec.cloned(),
        }
    }).collect()
}

// ═══════════════════════════ Tauri Commands ══════════════════════

/// Run full verification on a project phase.
#[tauri::command]
pub async fn verify_phase(
    project_id: String,
    phase_id: String,
    phase_name: String,
    workspace_path: String,
    expected_files: Vec<String>,
    strictness: String,
) -> Result<VerificationReport, String> {
    let strict = match strictness.as_str() {
        "block_critical" => StrictnessLevel::BlockCritical,
        "block_all" => StrictnessLevel::BlockAll,
        _ => StrictnessLevel::WarnOnly,
    };

    Ok(run_verification(
        &project_id,
        &phase_id,
        &phase_name,
        &workspace_path,
        &expected_files,
        strict,
    ))
}

/// Get the list of stub patterns used by the engine.
#[tauri::command]
pub async fn get_stub_patterns() -> Result<Vec<(String, String)>, String> {
    Ok(STUB_PATTERNS
        .iter()
        .map(|(name, pat)| (name.to_string(), pat.to_string()))
        .collect())
}

/// Override a failed gate (with audit trail).
#[tauri::command]
pub async fn override_gate(
    project_id: String,
    phase_id: String,
    overridden_by: String,
    reason: String,
) -> Result<GateOverride, String> {
    if reason.trim().is_empty() {
        return Err("Override reason is required".to_string());
    }
    Ok(GateOverride {
        project_id,
        phase_id,
        overridden_by,
        reason,
        timestamp: chrono::Utc::now().to_rfc3339(),
        findings_at_override: 0,
    })
}

/// Get phase gate statuses for all phases in a project workflow.
#[tauri::command]
pub async fn get_phase_gate_statuses(
    phases: Vec<(String, String)>,
) -> Result<Vec<PhaseGateStatus>, String> {
    // In real usage, verified_phases and overrides would come from DB
    let verified: HashMap<String, VerificationReport> = HashMap::new();
    let overrides: HashMap<String, GateOverride> = HashMap::new();
    Ok(build_phase_gate_statuses(&phases, &verified, &overrides))
}

/// Check a single file for stub patterns (utility command).
#[tauri::command]
pub async fn check_file_for_stubs(
    file_path: String,
) -> Result<Vec<VerificationFinding>, String> {
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Cannot read file: {}", e))?;

    let mut findings = Vec::new();
    for (name, pattern) in STUB_PATTERNS {
        if let Ok(re) = regex::Regex::new(pattern) {
            for (line_idx, line) in content.lines().enumerate() {
                if re.is_match(line) {
                    findings.push(VerificationFinding {
                        level: 2,
                        check_name: "stub_pattern".to_string(),
                        status: CheckStatus::Warn,
                        file_path: file_path.clone(),
                        line_number: Some((line_idx + 1) as u32),
                        message: format!("Stub pattern '{}': {}", name, line.trim()),
                        pattern_matched: Some(name.to_string()),
                    });
                }
            }
        }
    }

    Ok(findings)
}

// ═══════════════════════════ Tests ═══════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_workspace() -> tempfile::TempDir {
        tempfile::TempDir::new().unwrap()
    }

    // ── Level 1: Exists ───────────────────────────────

    #[test]
    fn test_level1_all_files_present() {
        let ws = temp_workspace();
        fs::write(ws.path().join("main.rs"), "fn main() {}").unwrap();
        fs::write(ws.path().join("lib.rs"), "pub fn greet() {}").unwrap();

        let result = check_level1_exists(
            ws.path().to_str().unwrap(),
            &["main.rs".to_string(), "lib.rs".to_string()],
        );

        assert_eq!(result.status, CheckStatus::Pass);
        assert_eq!(result.pass_count, 2);
        assert_eq!(result.fail_count, 0);
    }

    #[test]
    fn test_level1_missing_file() {
        let ws = temp_workspace();
        fs::write(ws.path().join("main.rs"), "fn main() {}").unwrap();

        let result = check_level1_exists(
            ws.path().to_str().unwrap(),
            &["main.rs".to_string(), "missing.rs".to_string()],
        );

        assert_eq!(result.status, CheckStatus::Fail);
        assert_eq!(result.pass_count, 1);
        assert_eq!(result.fail_count, 1);
    }

    #[test]
    fn test_level1_no_files_expected() {
        let ws = temp_workspace();
        let result = check_level1_exists(ws.path().to_str().unwrap(), &[]);
        assert_eq!(result.status, CheckStatus::Pass);
        assert_eq!(result.findings.len(), 0);
    }

    // ── Level 2: Substantive ──────────────────────────

    #[test]
    fn test_level2_clean_file() {
        let ws = temp_workspace();
        fs::write(ws.path().join("clean.rs"), r#"
pub fn calculate_total(items: &[f64]) -> f64 {
    items.iter().sum()
}
        "#).unwrap();

        let result = check_level2_substantive(
            ws.path().to_str().unwrap(),
            &["clean.rs".to_string()],
        );

        assert_eq!(result.fail_count, 0);
        assert_eq!(result.warn_count, 0);
    }

    #[test]
    fn test_level2_detects_todo() {
        let ws = temp_workspace();
        fs::write(ws.path().join("stub.rs"), "fn main() { // TODO: implement }").unwrap();

        let result = check_level2_substantive(
            ws.path().to_str().unwrap(),
            &["stub.rs".to_string()],
        );

        assert!(result.warn_count > 0);
        assert!(result.findings.iter().any(|f| f.pattern_matched.as_deref() == Some("TODO")));
    }

    #[test]
    fn test_level2_detects_fixme() {
        let ws = temp_workspace();
        fs::write(ws.path().join("fix.rs"), "// FIXME: broken logic\nfn run() {}").unwrap();

        let result = check_level2_substantive(
            ws.path().to_str().unwrap(),
            &["fix.rs".to_string()],
        );

        assert!(result.findings.iter().any(|f| f.pattern_matched.as_deref() == Some("FIXME")));
    }

    #[test]
    fn test_level2_detects_lorem_ipsum() {
        let ws = temp_workspace();
        fs::write(ws.path().join("placeholder.txt"), "Lorem ipsum dolor sit amet").unwrap();

        let result = check_level2_substantive(
            ws.path().to_str().unwrap(),
            &["placeholder.txt".to_string()],
        );

        assert!(result.findings.iter().any(|f| f.pattern_matched.as_deref() == Some("lorem ipsum")));
    }

    #[test]
    fn test_level2_detects_empty_file() {
        let ws = temp_workspace();
        fs::write(ws.path().join("empty.rs"), "   \n  ").unwrap();

        let result = check_level2_substantive(
            ws.path().to_str().unwrap(),
            &["empty.rs".to_string()],
        );

        assert_eq!(result.fail_count, 1);
        assert!(result.findings.iter().any(|f| f.check_name == "empty_file"));
    }

    #[test]
    fn test_level2_detects_unimplemented() {
        let ws = temp_workspace();
        fs::write(ws.path().join("stub.rs"), "fn handler() { unimplemented!() }").unwrap();

        let result = check_level2_substantive(
            ws.path().to_str().unwrap(),
            &["stub.rs".to_string()],
        );

        assert!(result.findings.iter().any(|f| f.pattern_matched.as_deref() == Some("unimplemented!()")));
    }

    #[test]
    fn test_level2_detects_python_pass() {
        let ws = temp_workspace();
        fs::write(ws.path().join("stub.py"), "def handler():\n    pass\n").unwrap();

        let result = check_level2_substantive(
            ws.path().to_str().unwrap(),
            &["stub.py".to_string()],
        );

        assert!(result.findings.iter().any(|f| f.pattern_matched.as_deref() == Some("pass (Python stub)")));
    }

    #[test]
    fn test_level2_detects_placeholder() {
        let ws = temp_workspace();
        fs::write(ws.path().join("ui.tsx"), r#"<div>placeholder text here</div>"#).unwrap();

        let result = check_level2_substantive(
            ws.path().to_str().unwrap(),
            &["ui.tsx".to_string()],
        );

        assert!(result.findings.iter().any(|f| f.pattern_matched.as_deref() == Some("placeholder")));
    }

    #[test]
    fn test_level2_detects_example_com() {
        let ws = temp_workspace();
        fs::write(ws.path().join("config.ts"), r#"const API = "https://example.com/api";"#).unwrap();

        let result = check_level2_substantive(
            ws.path().to_str().unwrap(),
            &["config.ts".to_string()],
        );

        assert!(result.findings.iter().any(|f| f.pattern_matched.as_deref() == Some("example.com")));
    }

    #[test]
    fn test_level2_detects_hello_world() {
        let ws = temp_workspace();
        fs::write(ws.path().join("main.rs"), r#"println!("hello world");"#).unwrap();

        let result = check_level2_substantive(
            ws.path().to_str().unwrap(),
            &["main.rs".to_string()],
        );

        assert!(result.findings.iter().any(|f| f.pattern_matched.as_deref() == Some("print hello world")));
    }

    #[test]
    fn test_level2_detects_todo_macro() {
        let ws = temp_workspace();
        fs::write(ws.path().join("stub.rs"), "fn process() { todo!() }").unwrap();

        let result = check_level2_substantive(
            ws.path().to_str().unwrap(),
            &["stub.rs".to_string()],
        );

        assert!(result.findings.iter().any(|f| f.pattern_matched.as_deref() == Some("todo!()")));
    }

    #[test]
    fn test_level2_detects_not_implemented() {
        let ws = temp_workspace();
        fs::write(ws.path().join("handler.ts"), "// This feature is not implemented yet\nfunction noop() {}").unwrap();

        let result = check_level2_substantive(
            ws.path().to_str().unwrap(),
            &["handler.ts".to_string()],
        );

        assert!(result.findings.iter().any(|f| f.pattern_matched.as_deref() == Some("not implemented")));
    }

    #[test]
    fn test_level2_unreadable_file_warns() {
        let ws = temp_workspace();
        // Don't create the file — it exists in expected list but not on disk
        let result = check_level2_substantive(
            ws.path().to_str().unwrap(),
            &["nonexistent.rs".to_string()],
        );

        assert!(result.warn_count > 0);
        assert!(result.findings.iter().any(|f| f.check_name == "read_file"));
    }

    // ── Level 3: Wired ────────────────────────────────

    #[test]
    fn test_level3_ts_import_resolves() {
        let ws = temp_workspace();
        fs::create_dir_all(ws.path().join("src")).unwrap();
        fs::write(ws.path().join("src/utils.ts"), "export function helper() {}").unwrap();
        fs::write(ws.path().join("src/main.ts"), r#"import { helper } from "./utils";"#).unwrap();

        let result = check_level3_wired(
            ws.path().to_str().unwrap(),
            &["src/main.ts".to_string()],
        );

        // Should pass — utils.ts exists
        let unresolved = result.findings.iter()
            .filter(|f| f.check_name == "import_resolve" && f.status != CheckStatus::Pass)
            .count();
        assert_eq!(unresolved, 0);
    }

    #[test]
    fn test_level3_ts_import_missing() {
        let ws = temp_workspace();
        fs::create_dir_all(ws.path().join("src")).unwrap();
        fs::write(ws.path().join("src/main.ts"), r#"import { foo } from "./missing_module";"#).unwrap();

        let result = check_level3_wired(
            ws.path().to_str().unwrap(),
            &["src/main.ts".to_string()],
        );

        assert!(result.findings.iter().any(|f| f.check_name == "import_resolve"));
    }

    #[test]
    fn test_level3_exported_unused_warns() {
        let ws = temp_workspace();
        fs::write(ws.path().join("utils.ts"), "export function uniqueHelper() { return 42; }").unwrap();

        let result = check_level3_wired(
            ws.path().to_str().unwrap(),
            &["utils.ts".to_string()],
        );

        assert!(result.findings.iter().any(|f| f.check_name == "export_unused"));
    }

    // ── Full Verification ─────────────────────────────

    #[test]
    fn test_full_verification_clean() {
        let ws = temp_workspace();
        fs::write(ws.path().join("app.ts"), r#"
export function start() {
    const server = createServer();
    server.listen(3000);
    return server;
}

function createServer() {
    return { listen: (port: number) => console.log(port) };
}
        "#).unwrap();

        let report = run_verification(
            "proj-1", "phase-1", "Development",
            ws.path().to_str().unwrap(),
            &["app.ts".to_string()],
            StrictnessLevel::WarnOnly,
        );

        assert_eq!(report.levels[0].status, CheckStatus::Pass); // Exists
        assert_eq!(report.levels[0].pass_count, 1);
    }

    #[test]
    fn test_full_verification_stubby_file() {
        let ws = temp_workspace();
        fs::write(ws.path().join("stub.rs"), "fn main() { // TODO: implement\nunimplemented!()\n}").unwrap();

        let report = run_verification(
            "proj-1", "phase-1", "Dev",
            ws.path().to_str().unwrap(),
            &["stub.rs".to_string()],
            StrictnessLevel::BlockCritical,
        );

        // Level 1 passes (file exists)
        assert_eq!(report.levels[0].status, CheckStatus::Pass);
        // Level 2 warns (stubs detected)
        assert!(report.levels[1].warn_count > 0);
    }

    #[test]
    fn test_full_verification_missing_file_blocks() {
        let ws = temp_workspace();

        let report = run_verification(
            "proj-1", "phase-1", "Dev",
            ws.path().to_str().unwrap(),
            &["missing.rs".to_string()],
            StrictnessLevel::BlockCritical,
        );

        assert_eq!(report.levels[0].status, CheckStatus::Fail);
        assert!(report.gate_blocked);
    }

    // ── Strictness ────────────────────────────────────

    #[test]
    fn test_warn_only_never_blocks() {
        let ws = temp_workspace();

        let report = run_verification(
            "proj-1", "phase-1", "Dev",
            ws.path().to_str().unwrap(),
            &["missing.rs".to_string()],
            StrictnessLevel::WarnOnly,
        );

        assert!(!report.gate_blocked);
    }

    #[test]
    fn test_block_all_blocks_on_any_fail() {
        let ws = temp_workspace();

        let report = run_verification(
            "proj-1", "phase-1", "Dev",
            ws.path().to_str().unwrap(),
            &["missing.rs".to_string()],
            StrictnessLevel::BlockAll,
        );

        assert!(report.gate_blocked);
    }

    // ── Phase Gate Statuses ───────────────────────────

    #[test]
    fn test_phase_gate_pending() {
        let phases = vec![
            ("p1".to_string(), "Planning".to_string()),
            ("p2".to_string(), "Dev".to_string()),
        ];
        let statuses = build_phase_gate_statuses(&phases, &HashMap::new(), &HashMap::new());

        assert_eq!(statuses.len(), 2);
        assert_eq!(statuses[0].badge, "pending");
        assert_eq!(statuses[0].badge_emoji, "🔄");
        assert!(!statuses[0].can_advance);
    }

    #[test]
    fn test_phase_gate_pass() {
        let ws = temp_workspace();
        fs::write(ws.path().join("main.rs"), "fn main() { run(); }\nfn run() {}").unwrap();

        let report = run_verification(
            "proj-1", "p1", "Planning",
            ws.path().to_str().unwrap(),
            &["main.rs".to_string()],
            StrictnessLevel::WarnOnly,
        );

        let mut verified = HashMap::new();
        verified.insert("p1".to_string(), report);

        let phases = vec![("p1".to_string(), "Planning".to_string())];
        let statuses = build_phase_gate_statuses(&phases, &verified, &HashMap::new());

        assert!(statuses[0].can_advance);
    }

    #[test]
    fn test_phase_gate_override() {
        let phases = vec![("p1".to_string(), "Dev".to_string())];
        let mut overrides = HashMap::new();
        overrides.insert("p1".to_string(), GateOverride {
            project_id: "proj-1".to_string(),
            phase_id: "p1".to_string(),
            overridden_by: "admin".to_string(),
            reason: "Reviewed manually".to_string(),
            timestamp: "2025-01-01T00:00:00Z".to_string(),
            findings_at_override: 3,
        });

        let statuses = build_phase_gate_statuses(&phases, &HashMap::new(), &overrides);
        assert_eq!(statuses[0].badge, "overridden");
        assert_eq!(statuses[0].badge_emoji, "⏭️");
        assert!(statuses[0].can_advance);
    }

    // ── Override Command ──────────────────────────────

    #[tokio::test]
    async fn test_override_gate_requires_reason() {
        let result = override_gate(
            "proj-1".to_string(),
            "p1".to_string(),
            "admin".to_string(),
            "".to_string(),
        ).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_override_gate_success() {
        let result = override_gate(
            "proj-1".to_string(),
            "p1".to_string(),
            "admin".to_string(),
            "Reviewed manually".to_string(),
        ).await;
        assert!(result.is_ok());
        let ovr = result.unwrap();
        assert_eq!(ovr.overridden_by, "admin");
    }

    // ── Stub Pattern Count ────────────────────────────

    #[test]
    fn test_stub_patterns_count() {
        assert!(STUB_PATTERNS.len() >= 15, "Must have 15+ stub patterns, got {}", STUB_PATTERNS.len());
    }

    #[tokio::test]
    async fn test_get_stub_patterns_command() {
        let patterns = get_stub_patterns().await.unwrap();
        assert!(patterns.len() >= 15);
        assert!(patterns.iter().any(|(name, _)| name == "TODO"));
    }
}
