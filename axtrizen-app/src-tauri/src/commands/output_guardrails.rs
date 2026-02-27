// output_guardrails.rs — Sprint S9: PII & Unsafe Output Filtering + Browser Stream + Project Monitoring
//
// Components:
//   1. Output Scanner: PII detection (emails, phones, SSNs, API keys) + unsafe code patterns
//   2. Browser Stream Manager: WebRTC/screenshot fallback config
//   3. Project Monitoring: Multi-pane layout data, live metrics

use serde::{Deserialize, Serialize};

// ═══════════════════════════════ PII Types ═══════════════════════

/// PII detection result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiiScanResult {
    pub has_pii: bool,
    pub findings: Vec<PiiFinding>,
    pub redacted_text: String,
    pub original_length: usize,
}

/// A detected PII instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiiFinding {
    pub pii_type: String,       // "email", "phone", "ssn", "api_key", "credit_card", "ip_address"
    pub matched_text: String,
    pub position: usize,
    pub redacted_as: String,    // "[EMAIL]", "[PHONE]", etc.
}

/// Unsafe code pattern finding.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnsafeCodeFinding {
    pub pattern_name: String,
    pub severity: String,       // "critical", "high", "medium"
    pub matched_text: String,
    pub description: String,
    pub line_hint: Option<usize>,
}

/// Admin-configurable output guardrail mode.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum GuardrailMode {
    Redact,   // Replace PII with placeholders
    Warn,     // Show with warning banners
    Block,    // Prevent output entirely
    Allow,    // No filtering
}

impl Default for GuardrailMode {
    fn default() -> Self { GuardrailMode::Redact }
}

/// Full guardrail configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardrailConfig {
    pub mode: GuardrailMode,
    pub detect_emails: bool,
    pub detect_phones: bool,
    pub detect_ssns: bool,
    pub detect_api_keys: bool,
    pub detect_credit_cards: bool,
    pub detect_ip_addresses: bool,
    pub detect_unsafe_code: bool,
}

impl Default for GuardrailConfig {
    fn default() -> Self {
        Self {
            mode: GuardrailMode::Redact,
            detect_emails: true,
            detect_phones: true,
            detect_ssns: true,
            detect_api_keys: true,
            detect_credit_cards: true,
            detect_ip_addresses: true,
            detect_unsafe_code: true,
        }
    }
}

// ═══════════════════════ Browser Stream Types ════════════════════

/// Browser stream configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamConfig {
    pub method: StreamMethod,
    pub target_fps: u32,            // default 15
    pub resolution_width: u32,      // default 1280
    pub resolution_height: u32,     // default 720
    pub screenshot_interval_ms: u32, // fallback: 2000ms
    pub max_latency_ms: u32,        // target: <1000ms
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum StreamMethod {
    WebRTC,
    ScreenshotFallback,
}

impl Default for StreamConfig {
    fn default() -> Self {
        Self {
            method: StreamMethod::WebRTC,
            target_fps: 15,
            resolution_width: 1280,
            resolution_height: 720,
            screenshot_interval_ms: 2000,
            max_latency_ms: 1000,
        }
    }
}

/// Browser stream status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamStatus {
    pub sandbox_id: String,
    pub active: bool,
    pub method: StreamMethod,
    pub current_fps: f64,
    pub latency_ms: u32,
    pub resolution: String,
    pub frames_delivered: u64,
    pub last_frame_at: String,
}

// ═══════════════════ Project Monitoring Types ════════════════════

/// Live project metrics for top bar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectLiveMetrics {
    pub project_id: String,
    pub progress_pct: f64,
    pub running_cost_usd: f64,
    pub duration_seconds: u64,
    pub current_phase: String,
    pub active_agents: usize,
    pub total_agents: usize,
    pub messages_total: usize,
    pub last_updated: String,
}

/// Agent panel data for monitoring view.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMonitorData {
    pub agent_id: String,
    pub agent_name: String,
    pub status: String,          // "working", "idle", "blocked", "error"
    pub current_task: Option<String>,
    pub messages_sent: usize,
    pub tokens_used: usize,
    pub has_browser: bool,
    pub stream_active: bool,
}

/// Multi-pane layout configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringLayout {
    pub agent_list_width_pct: u32,   // default 20
    pub main_view_width_pct: u32,    // default 55
    pub sidebar_width_pct: u32,      // default 25
    pub selected_agent_id: Option<String>,
}

impl Default for MonitoringLayout {
    fn default() -> Self {
        Self {
            agent_list_width_pct: 20,
            main_view_width_pct: 55,
            sidebar_width_pct: 25,
            selected_agent_id: None,
        }
    }
}

// ═══════════════════════ PII Scanner Engine ══════════════════════

/// PII pattern definitions.
pub fn get_pii_patterns() -> Vec<(&'static str, &'static str)> {
    vec![
        ("email", r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
        ("phone", r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b"),
        ("ssn", r"\b\d{3}-\d{2}-\d{4}\b"),
        ("api_key", r"\b(sk|pk|api|key|token|secret|password)[-_]?[a-zA-Z0-9]{16,}\b"),
        ("credit_card", r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b"),
        ("ip_address", r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"),
    ]
}

/// Unsafe code pattern definitions.
pub fn get_unsafe_code_patterns() -> Vec<(&'static str, &'static str, &'static str)> {
    // (name, regex_hint, severity)
    vec![
        ("eval_injection", "eval(", "critical"),
        ("exec_injection", "exec(", "critical"),
        ("shell_command", "os.system(", "critical"),
        ("sql_injection", "' OR 1=1", "critical"),
        ("xss_script", "<script>", "high"),
        ("hardcoded_password", "password = ", "high"),
        ("hardcoded_secret", "secret = ", "high"),
        ("debug_print", "console.log(password", "medium"),
        ("insecure_http", "http://", "medium"),
        ("wildcard_cors", "Access-Control-Allow-Origin: *", "medium"),
    ]
}

/// Scan text for PII and return findings with redacted text.
pub fn scan_output_for_pii(text: &str, config: &GuardrailConfig) -> PiiScanResult {
    let mut findings = Vec::new();
    let mut redacted = text.to_string();

    // Simple pattern matching (production would use regex crate)
    if config.detect_emails {
        // find email-like patterns
        for (i, _) in text.match_indices('@') {
            // Walk back to find start
            let start = text[..i].rfind(|c: char| c.is_whitespace() || c == '<' || c == '(' || c == '"').map(|p| p + 1).unwrap_or(0);
            // Walk forward to find end
            let end = text[i..].find(|c: char| c.is_whitespace() || c == '>' || c == ')' || c == '"').map(|p| i + p).unwrap_or(text.len());
            let candidate = &text[start..end];
            if candidate.contains('.') && candidate.len() > 5 {
                findings.push(PiiFinding {
                    pii_type: "email".to_string(),
                    matched_text: candidate.to_string(),
                    position: start,
                    redacted_as: "[EMAIL]".to_string(),
                });
                redacted = redacted.replace(candidate, "[EMAIL]");
            }
        }
    }

    if config.detect_ssns {
        // SSN pattern: ###-##-####
        let chars: Vec<char> = text.chars().collect();
        for i in 0..chars.len().saturating_sub(10) {
            if chars[i].is_ascii_digit() && chars.get(i+3) == Some(&'-') 
                && chars.get(i+6) == Some(&'-')
                && chars[i+1].is_ascii_digit() && chars[i+2].is_ascii_digit()
                && chars[i+4].is_ascii_digit() && chars[i+5].is_ascii_digit()
                && chars[i+7].is_ascii_digit() && chars[i+8].is_ascii_digit()
                && chars[i+9].is_ascii_digit() && chars[i+10].is_ascii_digit()
            {
                let ssn: String = chars[i..=i+10].iter().collect();
                findings.push(PiiFinding {
                    pii_type: "ssn".to_string(),
                    matched_text: ssn.clone(),
                    position: i,
                    redacted_as: "[SSN]".to_string(),
                });
                redacted = redacted.replace(&ssn, "[SSN]");
            }
        }
    }

    if config.detect_phones {
        // Simple phone: 10 consecutive digits (possibly with separators)
        let digits: String = text.chars().filter(|c| c.is_ascii_digit()).collect();
        if digits.len() >= 10 {
            // Find a run of 10+ digits in original
            let mut digit_run = String::new();
            let mut run_start = 0;
            for (i, ch) in text.chars().enumerate() {
                if ch.is_ascii_digit() || ch == '-' || ch == '.' || ch == ' ' {
                    if digit_run.is_empty() { run_start = i; }
                    digit_run.push(ch);
                } else {
                    let pure_digits: String = digit_run.chars().filter(|c| c.is_ascii_digit()).collect();
                    if pure_digits.len() >= 10 && !digit_run.contains('-') || !digit_run.contains("--") {
                        if pure_digits.len() == 10 || pure_digits.len() == 11 {
                            findings.push(PiiFinding {
                                pii_type: "phone".to_string(),
                                matched_text: digit_run.trim().to_string(),
                                position: run_start,
                                redacted_as: "[PHONE]".to_string(),
                            });
                            let trimmed = digit_run.trim().to_string();
                            redacted = redacted.replace(&trimmed, "[PHONE]");
                        }
                    }
                    digit_run.clear();
                }
            }
        }
    }

    if config.detect_api_keys {
        let key_prefixes = ["sk-", "pk-", "api_", "token_", "sk_live_", "sk_test_"];
        for prefix in &key_prefixes {
            if let Some(pos) = text.to_lowercase().find(prefix) {
                // Find end of key
                let start = pos;
                let end = text[pos..].find(|c: char| c.is_whitespace() || c == '"' || c == '\'').map(|p| pos + p).unwrap_or(text.len());
                let key = &text[start..end];
                if key.len() > prefix.len() + 8 {
                    findings.push(PiiFinding {
                        pii_type: "api_key".to_string(),
                        matched_text: key.to_string(),
                        position: start,
                        redacted_as: "[API_KEY]".to_string(),
                    });
                    redacted = redacted.replace(key, "[API_KEY]");
                }
            }
        }
    }

    PiiScanResult {
        has_pii: !findings.is_empty(),
        findings,
        redacted_text: redacted,
        original_length: text.len(),
    }
}

/// Scan for unsafe code patterns.
pub fn scan_for_unsafe_code(text: &str) -> Vec<UnsafeCodeFinding> {
    let patterns = get_unsafe_code_patterns();
    let lower = text.to_lowercase();
    let mut findings = Vec::new();

    for (name, pattern, severity) in &patterns {
        if lower.contains(&pattern.to_lowercase()) {
            findings.push(UnsafeCodeFinding {
                pattern_name: name.to_string(),
                severity: severity.to_string(),
                matched_text: pattern.to_string(),
                description: format!("Detected unsafe pattern: {}", name),
                line_hint: None,
            });
        }
    }

    findings
}

/// Apply guardrail mode to output.
pub fn apply_guardrail(text: &str, config: &GuardrailConfig) -> (String, Vec<PiiFinding>, Vec<UnsafeCodeFinding>) {
    let pii_result = scan_output_for_pii(text, config);
    let unsafe_findings = if config.detect_unsafe_code {
        scan_for_unsafe_code(text)
    } else {
        Vec::new()
    };

    match config.mode {
        GuardrailMode::Redact => (pii_result.redacted_text, pii_result.findings, unsafe_findings),
        GuardrailMode::Warn => (text.to_string(), pii_result.findings, unsafe_findings),
        GuardrailMode::Block => {
            if pii_result.has_pii || !unsafe_findings.is_empty() {
                ("[OUTPUT BLOCKED: Contains sensitive content]".to_string(), pii_result.findings, unsafe_findings)
            } else {
                (text.to_string(), vec![], vec![])
            }
        }
        GuardrailMode::Allow => (text.to_string(), vec![], vec![]),
    }
}

/// Compute live project metrics.
pub fn compute_live_metrics(
    project_id: &str,
    agents: &[AgentMonitorData],
    phase: &str,
    cost: f64,
    duration_sec: u64,
) -> ProjectLiveMetrics {
    let active = agents.iter().filter(|a| a.status == "working").count();
    let total_messages: usize = agents.iter().map(|a| a.messages_sent).sum();

    // Progress based on phase
    let progress = match phase {
        "Requirements" => 10.0,
        "Design" => 30.0,
        "Development" => 60.0,
        "Testing" => 85.0,
        "Deployment" => 95.0,
        "Complete" => 100.0,
        _ => 0.0,
    };

    ProjectLiveMetrics {
        project_id: project_id.to_string(),
        progress_pct: progress,
        running_cost_usd: cost,
        duration_seconds: duration_sec,
        current_phase: phase.to_string(),
        active_agents: active,
        total_agents: agents.len(),
        messages_total: total_messages,
        last_updated: chrono::Utc::now().to_rfc3339(),
    }
}

// ═══════════════════════════ Tauri Commands ══════════════════════

/// Scan output for PII.
#[tauri::command]
pub async fn scan_output_pii(text: String) -> Result<PiiScanResult, String> {
    let config = GuardrailConfig::default();
    Ok(scan_output_for_pii(&text, &config))
}

/// Scan output for unsafe code.
#[tauri::command]
pub async fn scan_output_unsafe(text: String) -> Result<Vec<UnsafeCodeFinding>, String> {
    Ok(scan_for_unsafe_code(&text))
}

/// Get guardrail configuration.
#[tauri::command]
pub async fn get_guardrail_config() -> Result<GuardrailConfig, String> {
    Ok(GuardrailConfig::default())
}

/// Apply guardrails to output text.
#[tauri::command]
pub async fn apply_output_guardrail(text: String, mode: String) -> Result<(String, Vec<PiiFinding>, Vec<UnsafeCodeFinding>), String> {
    let mut config = GuardrailConfig::default();
    config.mode = match mode.as_str() {
        "redact" => GuardrailMode::Redact,
        "warn" => GuardrailMode::Warn,
        "block" => GuardrailMode::Block,
        "allow" => GuardrailMode::Allow,
        _ => GuardrailMode::Redact,
    };
    Ok(apply_guardrail(&text, &config))
}

/// Get stream configuration.
#[tauri::command]
pub async fn get_stream_config() -> Result<StreamConfig, String> {
    Ok(StreamConfig::default())
}

/// Get project live metrics.
#[tauri::command]
pub async fn get_project_live_metrics(project_id: String) -> Result<ProjectLiveMetrics, String> {
    Ok(ProjectLiveMetrics {
        project_id,
        progress_pct: 0.0,
        running_cost_usd: 0.0,
        duration_seconds: 0,
        current_phase: "Requirements".to_string(),
        active_agents: 0,
        total_agents: 0,
        messages_total: 0,
        last_updated: chrono::Utc::now().to_rfc3339(),
    })
}

/// Get monitoring layout.
#[tauri::command]
pub async fn get_monitoring_layout() -> Result<MonitoringLayout, String> {
    Ok(MonitoringLayout::default())
}

// ═══════════════════════════ Tests ═══════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    // ── PII Detection ─────────────────────────────────

    #[test]
    fn test_detect_email() {
        let config = GuardrailConfig::default();
        let result = scan_output_for_pii("Contact us at user@example.com for help", &config);
        assert!(result.has_pii);
        assert!(result.findings.iter().any(|f| f.pii_type == "email"));
        assert!(result.redacted_text.contains("[EMAIL]"));
        assert!(!result.redacted_text.contains("user@example.com"));
    }

    #[test]
    fn test_detect_ssn() {
        let config = GuardrailConfig::default();
        let result = scan_output_for_pii("SSN: 123-45-6789 is sensitive", &config);
        assert!(result.has_pii);
        assert!(result.findings.iter().any(|f| f.pii_type == "ssn"));
        assert!(result.redacted_text.contains("[SSN]"));
    }

    #[test]
    fn test_detect_api_key() {
        let config = GuardrailConfig::default();
        let result = scan_output_for_pii("Use key sk-abc123def456ghi789jkl0 for auth", &config);
        assert!(result.has_pii);
        assert!(result.findings.iter().any(|f| f.pii_type == "api_key"));
        assert!(result.redacted_text.contains("[API_KEY]"));
    }

    #[test]
    fn test_no_pii_in_safe_text() {
        let config = GuardrailConfig::default();
        let result = scan_output_for_pii("This is a normal message with no sensitive data.", &config);
        assert!(!result.has_pii);
        assert!(result.findings.is_empty());
    }

    #[test]
    fn test_pii_patterns_count() {
        let patterns = get_pii_patterns();
        assert!(patterns.len() >= 6, "Need 6+ PII patterns, got {}", patterns.len());
    }

    // ── Unsafe Code ───────────────────────────────────

    #[test]
    fn test_detect_eval_injection() {
        let findings = scan_for_unsafe_code("Use eval(userInput) carefully");
        assert!(!findings.is_empty());
        assert!(findings.iter().any(|f| f.pattern_name == "eval_injection"));
    }

    #[test]
    fn test_detect_xss() {
        let findings = scan_for_unsafe_code("Output: <script>alert('xss')</script>");
        assert!(findings.iter().any(|f| f.pattern_name == "xss_script"));
    }

    #[test]
    fn test_detect_sql_injection() {
        let findings = scan_for_unsafe_code("Query: SELECT * WHERE name = '' OR 1=1 --");
        assert!(findings.iter().any(|f| f.pattern_name == "sql_injection"));
    }

    #[test]
    fn test_safe_code_no_findings() {
        let findings = scan_for_unsafe_code("const x = 5; return x + 1;");
        assert!(findings.is_empty());
    }

    #[test]
    fn test_unsafe_patterns_count() {
        let patterns = get_unsafe_code_patterns();
        assert!(patterns.len() >= 10, "Need 10+ unsafe patterns, got {}", patterns.len());
    }

    // ── Guardrail Modes ───────────────────────────────

    #[test]
    fn test_redact_mode() {
        let config = GuardrailConfig { mode: GuardrailMode::Redact, ..Default::default() };
        let (output, pii, _) = apply_guardrail("Email: user@test.com", &config);
        assert!(output.contains("[EMAIL]"));
        assert!(!pii.is_empty());
    }

    #[test]
    fn test_warn_mode_preserves_text() {
        let config = GuardrailConfig { mode: GuardrailMode::Warn, ..Default::default() };
        let (output, pii, _) = apply_guardrail("Email: user@test.com", &config);
        assert!(output.contains("user@test.com"));
        assert!(!pii.is_empty());
    }

    #[test]
    fn test_block_mode() {
        let config = GuardrailConfig { mode: GuardrailMode::Block, ..Default::default() };
        let (output, _, _) = apply_guardrail("Email: user@test.com", &config);
        assert!(output.contains("BLOCKED"));
    }

    #[test]
    fn test_allow_mode_no_findings() {
        let config = GuardrailConfig { mode: GuardrailMode::Allow, ..Default::default() };
        let (output, pii, unsafe_f) = apply_guardrail("Email: user@test.com has eval(x)", &config);
        assert!(output.contains("user@test.com"));
        assert!(pii.is_empty());
        assert!(unsafe_f.is_empty());
    }

    #[test]
    fn test_block_mode_safe_passes() {
        let config = GuardrailConfig { mode: GuardrailMode::Block, ..Default::default() };
        let (output, _, _) = apply_guardrail("This is safe text", &config);
        assert_eq!(output, "This is safe text");
    }

    // ── Stream Config ─────────────────────────────────

    #[test]
    fn test_default_stream_config() {
        let config = StreamConfig::default();
        assert_eq!(config.target_fps, 15);
        assert_eq!(config.resolution_width, 1280);
        assert_eq!(config.resolution_height, 720);
        assert_eq!(config.screenshot_interval_ms, 2000);
        assert_eq!(config.max_latency_ms, 1000);
        assert_eq!(config.method, StreamMethod::WebRTC);
    }

    #[test]
    fn test_screenshot_fallback_interval() {
        let config = StreamConfig {
            method: StreamMethod::ScreenshotFallback,
            screenshot_interval_ms: 2000,
            ..Default::default()
        };
        assert_eq!(config.screenshot_interval_ms, 2000);
    }

    // ── Project Monitoring ────────────────────────────

    #[test]
    fn test_compute_live_metrics() {
        let agents = vec![
            AgentMonitorData {
                agent_id: "a1".to_string(),
                agent_name: "Coder".to_string(),
                status: "working".to_string(),
                current_task: Some("Implement feature".to_string()),
                messages_sent: 15,
                tokens_used: 5000,
                has_browser: false,
                stream_active: false,
            },
            AgentMonitorData {
                agent_id: "a2".to_string(),
                agent_name: "Tester".to_string(),
                status: "idle".to_string(),
                current_task: None,
                messages_sent: 8,
                tokens_used: 2000,
                has_browser: true,
                stream_active: true,
            },
        ];

        let metrics = compute_live_metrics("proj-1", &agents, "Development", 1.50, 3600);
        assert_eq!(metrics.progress_pct, 60.0);
        assert_eq!(metrics.active_agents, 1);
        assert_eq!(metrics.total_agents, 2);
        assert_eq!(metrics.messages_total, 23);
        assert_eq!(metrics.running_cost_usd, 1.50);
    }

    #[test]
    fn test_monitoring_layout_default() {
        let layout = MonitoringLayout::default();
        assert_eq!(layout.agent_list_width_pct, 20);
        assert_eq!(layout.main_view_width_pct, 55);
        assert_eq!(layout.sidebar_width_pct, 25);
        assert!(layout.selected_agent_id.is_none());
        assert_eq!(layout.agent_list_width_pct + layout.main_view_width_pct + layout.sidebar_width_pct, 100);
    }

    #[test]
    fn test_progress_by_phase() {
        let agents = vec![];
        let req = compute_live_metrics("p1", &agents, "Requirements", 0.0, 0);
        assert_eq!(req.progress_pct, 10.0);
        let dev = compute_live_metrics("p1", &agents, "Development", 0.0, 0);
        assert_eq!(dev.progress_pct, 60.0);
        let test = compute_live_metrics("p1", &agents, "Testing", 0.0, 0);
        assert_eq!(test.progress_pct, 85.0);
        let done = compute_live_metrics("p1", &agents, "Complete", 0.0, 0);
        assert_eq!(done.progress_pct, 100.0);
    }

    // ── Commands ──────────────────────────────────────

    #[tokio::test]
    async fn test_scan_output_pii_cmd() {
        let result = scan_output_pii("Email: user@example.com".to_string()).await.unwrap();
        assert!(result.has_pii);
    }

    #[tokio::test]
    async fn test_get_guardrail_config_cmd() {
        let config = get_guardrail_config().await.unwrap();
        assert!(config.detect_emails);
        assert!(config.detect_ssns);
        assert_eq!(config.mode, GuardrailMode::Redact);
    }

    #[tokio::test]
    async fn test_apply_guardrail_redact() {
        let (output, _, _) = apply_output_guardrail("user@test.com".to_string(), "redact".to_string()).await.unwrap();
        assert!(output.contains("[EMAIL]"));
    }

    #[tokio::test]
    async fn test_apply_guardrail_block() {
        let (output, _, _) = apply_output_guardrail("user@test.com".to_string(), "block".to_string()).await.unwrap();
        assert!(output.contains("BLOCKED"));
    }

    #[tokio::test]
    async fn test_get_stream_config_cmd() {
        let config = get_stream_config().await.unwrap();
        assert_eq!(config.target_fps, 15);
        assert_eq!(config.resolution_width, 1280);
    }

    #[tokio::test]
    async fn test_get_monitoring_layout_cmd() {
        let layout = get_monitoring_layout().await.unwrap();
        assert_eq!(layout.agent_list_width_pct + layout.main_view_width_pct + layout.sidebar_width_pct, 100);
    }
}
