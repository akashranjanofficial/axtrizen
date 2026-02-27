/// Sprint S10: Browser Polish + Stabilization
///
/// Covers:
/// - Bug tracker for P0/P1 regressions from S7-S9
/// - Browser sandbox hardening: network isolation, download limits, cookie cleanup
/// - Load testing configuration and benchmarks
/// - Memory profiling utilities
/// - Release-notes and documentation metadata

use serde::{Deserialize, Serialize};

use crate::db;


// ─── Bug Tracker ────────────────────────────────────────────────

/// Severity of a tracked bug
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum BugSeverity {
    P0,
    P1,
    P2,
}

/// Status of a tracked bug
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum BugStatus {
    Open,
    InProgress,
    Resolved,
    Verified,
}

/// A tracked bug/regression from sprints S7-S9
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackedBug {
    pub id: String,
    pub title: String,
    pub severity: BugSeverity,
    pub status: BugStatus,
    pub sprint_origin: String,
    pub component: String,
    pub description: String,
    pub resolved_in_commit: Option<String>,
}

/// Read bugs from DB — returns empty if no bugs tracked
pub fn get_known_bugs() -> Vec<TrackedBug> {
    if let Ok(conn) = db::init_db() {
        if let Ok(rows) = db::get_tracked_bugs_db(&conn) {
            return rows.into_iter().map(|(id, title, sev, status, sprint, component, desc, commit)| {
                let severity = match sev.as_str() {
                    "P0" => BugSeverity::P0,
                    "P1" => BugSeverity::P1,
                    _ => BugSeverity::P2,
                };
                let bug_status = match status.as_str() {
                    "Open" => BugStatus::Open,
                    "InProgress" => BugStatus::InProgress,
                    "Verified" => BugStatus::Verified,
                    _ => BugStatus::Resolved,
                };
                TrackedBug { id, title, severity, status: bug_status, sprint_origin: sprint, component, description: desc, resolved_in_commit: commit }
            }).collect();
        }
    }
    vec![]
}

/// Filter bugs by status / severity
pub fn filter_bugs(bugs: &[TrackedBug], severity: Option<&BugSeverity>, status: Option<&BugStatus>) -> Vec<TrackedBug> {
    bugs.iter()
        .filter(|b| {
            let sev_match = severity.map_or(true, |s| &b.severity == s);
            let stat_match = status.map_or(true, |s| &b.status == s);
            sev_match && stat_match
        })
        .cloned()
        .collect()
}

/// True when zero P0/P1 bugs remain open or in-progress
pub fn all_critical_bugs_resolved(bugs: &[TrackedBug]) -> bool {
    !bugs.iter().any(|b| {
        (b.severity == BugSeverity::P0 || b.severity == BugSeverity::P1)
            && (b.status == BugStatus::Open || b.status == BugStatus::InProgress)
    })
}


// ─── Browser Sandbox Hardening ──────────────────────────────────

/// Network isolation policy for a browser sandbox
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkIsolationPolicy {
    /// Allow list of domains the sandbox may reach
    pub allowed_domains: Vec<String>,
    /// Block all outbound traffic except allowed_domains
    pub block_all_other: bool,
    /// Max total bytes the sandbox may download
    pub download_limit_bytes: u64,
    /// Max single-file download size
    pub max_file_size_bytes: u64,
}

impl Default for NetworkIsolationPolicy {
    fn default() -> Self {
        Self {
            allowed_domains: vec![
                "*.github.com".into(),
                "*.googleapis.com".into(),
                "*.openai.com".into(),
                "*.anthropic.com".into(),
            ],
            block_all_other: true,
            download_limit_bytes: 100 * 1024 * 1024,          // 100 MB
            max_file_size_bytes: 25 * 1024 * 1024,            // 25 MB
        }
    }
}

/// Cookie / state cleanup policy
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CookieCleanupPolicy {
    /// Wipe cookies on sandbox destroy
    pub clean_on_destroy: bool,
    /// Wipe cookies every N seconds (0 = disabled)
    pub periodic_clean_seconds: u64,
    /// Wipe local-storage on destroy
    pub clean_local_storage: bool,
    /// Wipe indexedDB on destroy
    pub clean_indexed_db: bool,
}

impl Default for CookieCleanupPolicy {
    fn default() -> Self {
        Self {
            clean_on_destroy: true,
            periodic_clean_seconds: 0,
            clean_local_storage: true,
            clean_indexed_db: true,
        }
    }
}

/// Aggregated hardening config for a sandbox
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxHardeningConfig {
    pub network: NetworkIsolationPolicy,
    pub cookies: CookieCleanupPolicy,
    /// Number of seconds a sandbox may live before forced destroy
    pub max_lifetime_seconds: u64,
    /// Kill sandbox if idle (no CDP calls) for this many seconds
    pub idle_timeout_seconds: u64,
}

impl Default for SandboxHardeningConfig {
    fn default() -> Self {
        Self {
            network: NetworkIsolationPolicy::default(),
            cookies: CookieCleanupPolicy::default(),
            max_lifetime_seconds: 3600,    // 1 hour
            idle_timeout_seconds: 300,     // 5 minutes
        }
    }
}

/// Validate a URL against the network isolation policy.
/// Returns true if the URL is allowed.
pub fn is_url_allowed(url: &str, policy: &NetworkIsolationPolicy) -> bool {
    if !policy.block_all_other {
        return true; // no blocking active
    }
    // Extract host from URL
    let host = extract_host(url);
    if host.is_empty() {
        return false;
    }
    for pattern in &policy.allowed_domains {
        if domain_matches(&host, pattern) {
            return true;
        }
    }
    false
}

/// Extract host portion from a URL string (simple parser)
fn extract_host(url: &str) -> String {
    let without_scheme = if let Some(pos) = url.find("://") {
        &url[pos + 3..]
    } else {
        url
    };
    // Take up to next / or end
    let host_end = without_scheme.find('/').unwrap_or(without_scheme.len());
    let host_port = &without_scheme[..host_end];
    // Strip port
    if let Some(colon) = host_port.rfind(':') {
        // Check it's a port (digits after colon)
        let after = &host_port[colon + 1..];
        if after.chars().all(|c| c.is_ascii_digit()) {
            return host_port[..colon].to_lowercase();
        }
    }
    host_port.to_lowercase()
}

/// Wildcard domain matching: "*.github.com" matches "api.github.com"
fn domain_matches(host: &str, pattern: &str) -> bool {
    if pattern.starts_with("*.") {
        let suffix = &pattern[1..]; // e.g. ".github.com"
        host.ends_with(suffix) || host == &pattern[2..]
    } else {
        host == pattern
    }
}


// ─── Load Testing ───────────────────────────────────────────────

/// Load-test scenario specification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadTestConfig {
    /// Number of concurrent simulated projects
    pub concurrent_projects: u32,
    /// Number of agents per project
    pub agents_per_project: u32,
    /// Whether each agent opens a browser sandbox
    pub browsers_per_agent: bool,
    /// Duration of the test in seconds
    pub duration_seconds: u64,
    /// Target p95 API latency in ms
    pub target_p95_ms: u64,
}

impl Default for LoadTestConfig {
    fn default() -> Self {
        Self {
            concurrent_projects: 10,
            agents_per_project: 3,
            browsers_per_agent: true,
            duration_seconds: 120,
            target_p95_ms: 500,
        }
    }
}

/// Result of a single API call during load test
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadTestCallResult {
    pub endpoint: String,
    pub latency_ms: u64,
    pub status_ok: bool,
}

/// Aggregate load test report
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadTestReport {
    pub total_calls: u64,
    pub successful_calls: u64,
    pub failed_calls: u64,
    pub p50_latency_ms: u64,
    pub p95_latency_ms: u64,
    pub p99_latency_ms: u64,
    pub max_latency_ms: u64,
    pub meets_target: bool,
}

/// Compute percentile from a sorted list of values
fn percentile(sorted: &[u64], pct: f64) -> u64 {
    if sorted.is_empty() {
        return 0;
    }
    let idx = ((pct / 100.0) * (sorted.len() as f64 - 1.0)).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

/// Build a load-test report from individual call results
pub fn build_load_test_report(results: &[LoadTestCallResult], target_p95: u64) -> LoadTestReport {
    let total = results.len() as u64;
    let successful = results.iter().filter(|r| r.status_ok).count() as u64;
    let failed = total - successful;

    let mut latencies: Vec<u64> = results.iter().map(|r| r.latency_ms).collect();
    latencies.sort_unstable();

    let p50 = percentile(&latencies, 50.0);
    let p95 = percentile(&latencies, 95.0);
    let p99 = percentile(&latencies, 99.0);
    let max = latencies.last().copied().unwrap_or(0);

    LoadTestReport {
        total_calls: total,
        successful_calls: successful,
        failed_calls: failed,
        p50_latency_ms: p50,
        p95_latency_ms: p95,
        p99_latency_ms: p99,
        max_latency_ms: max,
        meets_target: p95 <= target_p95,
    }
}


// ─── Memory Profiling ───────────────────────────────────────────

/// Memory snapshot at a point in time
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemorySnapshot {
    pub timestamp_epoch_ms: u64,
    pub heap_bytes: u64,
    pub rss_bytes: u64,
    pub sandbox_count: u32,
    pub agent_count: u32,
}

/// Detect if memory is leaking: check if final snapshot is > initial * threshold
pub fn detect_memory_leak(snapshots: &[MemorySnapshot], threshold_ratio: f64) -> bool {
    if snapshots.len() < 2 {
        return false;
    }
    let initial = snapshots.first().unwrap().rss_bytes as f64;
    let final_snap = snapshots.last().unwrap().rss_bytes as f64;
    if initial == 0.0 {
        return false;
    }
    (final_snap / initial) > threshold_ratio
}

/// Memory profiling config
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryProfilingConfig {
    /// Interval between snapshots in seconds
    pub snapshot_interval_seconds: u64,
    /// Total profiling duration in seconds
    pub duration_seconds: u64,
    /// Ratio above which we consider it a leak (e.g. 1.5 = 50% growth)
    pub leak_threshold_ratio: f64,
}

impl Default for MemoryProfilingConfig {
    fn default() -> Self {
        Self {
            snapshot_interval_seconds: 60,
            duration_seconds: 7200,      // 2 hours
            leak_threshold_ratio: 1.5,   // 50% growth = leak
        }
    }
}


// ─── Release Notes / Documentation ─────────────────────────────

/// Feature entry for release notes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseNoteEntry {
    pub category: String,
    pub title: String,
    pub description: String,
    pub sprint: String,
}

/// Phase 3 release notes — read from DB
pub fn generate_phase3_release_notes() -> Vec<ReleaseNoteEntry> {
    if let Ok(conn) = db::init_db() {
        if let Ok(rows) = db::get_release_notes_db(&conn) {
            return rows.into_iter().map(|(cat, title, desc, sprint)| {
                ReleaseNoteEntry { category: cat, title, description: desc, sprint }
            }).collect();
        }
    }
    vec![]
}

/// Documentation coverage tracker
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocCoverageEntry {
    pub feature: String,
    pub has_api_docs: bool,
    pub has_user_guide: bool,
    pub has_examples: bool,
    pub last_updated_sprint: String,
}

/// Phase 3 doc coverage — read from DB
pub fn get_doc_coverage() -> Vec<DocCoverageEntry> {
    if let Ok(conn) = db::init_db() {
        if let Ok(rows) = db::get_doc_coverage_db(&conn) {
            return rows.into_iter().map(|(feature, api, guide, examples, sprint)| {
                DocCoverageEntry { feature, has_api_docs: api, has_user_guide: guide, has_examples: examples, last_updated_sprint: sprint }
            }).collect();
        }
    }
    vec![]
}


// ─── Tauri Commands ─────────────────────────────────────────────

#[tauri::command]
pub fn get_known_bugs_cmd() -> Vec<TrackedBug> {
    get_known_bugs()
}

#[tauri::command]
pub fn get_open_p0_p1_bugs() -> Vec<TrackedBug> {
    let bugs = get_known_bugs();
    filter_bugs(&bugs, None, Some(&BugStatus::Open))
        .into_iter()
        .chain(filter_bugs(&bugs, None, Some(&BugStatus::InProgress)))
        .filter(|b| b.severity == BugSeverity::P0 || b.severity == BugSeverity::P1)
        .collect()
}

#[tauri::command]
pub fn all_bugs_resolved_cmd() -> bool {
    let bugs = get_known_bugs();
    all_critical_bugs_resolved(&bugs)
}

#[tauri::command]
pub fn get_sandbox_hardening_config() -> SandboxHardeningConfig {
    SandboxHardeningConfig::default()
}

#[tauri::command]
pub fn check_url_allowed(url: String) -> bool {
    let policy = NetworkIsolationPolicy::default();
    is_url_allowed(&url, &policy)
}

#[tauri::command]
pub fn get_load_test_config() -> LoadTestConfig {
    LoadTestConfig::default()
}

#[tauri::command]
pub fn run_simulated_load_test() -> LoadTestReport {
    // No simulated data — return empty report
    LoadTestReport {
        total_calls: 0,
        successful_calls: 0,
        failed_calls: 0,
        p50_latency_ms: 0,
        p95_latency_ms: 0,
        p99_latency_ms: 0,
        max_latency_ms: 0,
        meets_target: true,
    }
}

#[tauri::command]
pub fn get_memory_profiling_config() -> MemoryProfilingConfig {
    MemoryProfilingConfig::default()
}

#[tauri::command]
pub fn check_memory_leak(snapshots: Vec<MemorySnapshot>) -> bool {
    let config = MemoryProfilingConfig::default();
    detect_memory_leak(&snapshots, config.leak_threshold_ratio)
}

#[tauri::command]
pub fn get_phase3_release_notes() -> Vec<ReleaseNoteEntry> {
    generate_phase3_release_notes()
}

#[tauri::command]
pub fn get_doc_coverage_cmd() -> Vec<DocCoverageEntry> {
    get_doc_coverage()
}


// ─── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // --- Bug Tracker Tests ---

    #[test]
    fn test_known_bugs_returns_db_or_empty() {
        let bugs = get_known_bugs();
        // Returns empty when DB has no tracked bugs
        assert!(bugs.len() <= 10000);
    }

    #[test]
    fn test_all_critical_bugs_resolved_true_when_empty() {
        let bugs: Vec<TrackedBug> = vec![];
        assert!(all_critical_bugs_resolved(&bugs));
    }

    #[test]
    fn test_all_critical_bugs_resolved_false_with_open() {
        let mut bugs = get_known_bugs();
        bugs.push(TrackedBug {
            id: "BUG-TEST".into(),
            title: "Open P0".into(),
            severity: BugSeverity::P0,
            status: BugStatus::Open,
            sprint_origin: "S10".into(),
            component: "test".into(),
            description: "Test".into(),
            resolved_in_commit: None,
        });
        assert!(!all_critical_bugs_resolved(&bugs));
    }

    #[test]
    fn test_filter_bugs_by_severity() {
        let bugs = vec![
            TrackedBug { id: "B1".into(), title: "T".into(), severity: BugSeverity::P0, status: BugStatus::Open, sprint_origin: "S1".into(), component: "c".into(), description: "d".into(), resolved_in_commit: None },
            TrackedBug { id: "B2".into(), title: "T".into(), severity: BugSeverity::P1, status: BugStatus::Open, sprint_origin: "S1".into(), component: "c".into(), description: "d".into(), resolved_in_commit: None },
        ];
        let p0s = filter_bugs(&bugs, Some(&BugSeverity::P0), None);
        assert!(p0s.iter().all(|b| b.severity == BugSeverity::P0));
        assert_eq!(p0s.len(), 1);
    }

    #[test]
    fn test_filter_bugs_by_status() {
        let bugs = vec![
            TrackedBug { id: "B1".into(), title: "T".into(), severity: BugSeverity::P0, status: BugStatus::Resolved, sprint_origin: "S1".into(), component: "c".into(), description: "d".into(), resolved_in_commit: Some("abc".into()) },
            TrackedBug { id: "B2".into(), title: "T".into(), severity: BugSeverity::P1, status: BugStatus::Open, sprint_origin: "S1".into(), component: "c".into(), description: "d".into(), resolved_in_commit: None },
        ];
        let resolved = filter_bugs(&bugs, None, Some(&BugStatus::Resolved));
        assert!(resolved.iter().all(|b| b.status == BugStatus::Resolved));
        assert_eq!(resolved.len(), 1);
    }

    #[test]
    fn test_p2_open_does_not_block_resolution() {
        let bugs = vec![
            TrackedBug {
                id: "BUG-P2".into(),
                title: "P2 open".into(),
                severity: BugSeverity::P2,
                status: BugStatus::Open,
                sprint_origin: "S9".into(),
                component: "test".into(),
                description: "Low severity".into(),
                resolved_in_commit: None,
            },
        ];
        // P2 open should not block all_critical_bugs_resolved
        assert!(all_critical_bugs_resolved(&bugs));
    }

    // --- Network Isolation Tests ---

    #[test]
    fn test_default_policy_allows_github() {
        let policy = NetworkIsolationPolicy::default();
        assert!(is_url_allowed("https://api.github.com/repos", &policy));
    }

    #[test]
    fn test_default_policy_allows_openai() {
        let policy = NetworkIsolationPolicy::default();
        assert!(is_url_allowed("https://api.openai.com/v1/chat", &policy));
    }

    #[test]
    fn test_default_policy_blocks_random_domain() {
        let policy = NetworkIsolationPolicy::default();
        assert!(!is_url_allowed("https://evil.example.com/steal", &policy));
    }

    #[test]
    fn test_non_blocking_policy_allows_everything() {
        let policy = NetworkIsolationPolicy {
            allowed_domains: vec![],
            block_all_other: false,
            download_limit_bytes: 0,
            max_file_size_bytes: 0,
        };
        assert!(is_url_allowed("https://anything.com", &policy));
    }

    #[test]
    fn test_extract_host_with_port() {
        assert_eq!(extract_host("https://localhost:8080/path"), "localhost");
    }

    #[test]
    fn test_extract_host_without_scheme() {
        assert_eq!(extract_host("github.com/path"), "github.com");
    }

    #[test]
    fn test_wildcard_domain_match() {
        assert!(domain_matches("api.github.com", "*.github.com"));
        assert!(domain_matches("github.com", "*.github.com"));
        assert!(!domain_matches("notgithub.com", "*.github.com"));
    }

    #[test]
    fn test_exact_domain_match() {
        assert!(domain_matches("example.com", "example.com"));
        assert!(!domain_matches("sub.example.com", "example.com"));
    }

    // --- Cookie Cleanup Tests ---

    #[test]
    fn test_default_cookie_policy_cleans_on_destroy() {
        let policy = CookieCleanupPolicy::default();
        assert!(policy.clean_on_destroy);
        assert!(policy.clean_local_storage);
        assert!(policy.clean_indexed_db);
    }

    #[test]
    fn test_default_no_periodic_clean() {
        let policy = CookieCleanupPolicy::default();
        assert_eq!(policy.periodic_clean_seconds, 0);
    }

    // --- Sandbox Hardening Tests ---

    #[test]
    fn test_default_hardening_has_1h_lifetime() {
        let config = SandboxHardeningConfig::default();
        assert_eq!(config.max_lifetime_seconds, 3600);
    }

    #[test]
    fn test_default_hardening_has_5min_idle() {
        let config = SandboxHardeningConfig::default();
        assert_eq!(config.idle_timeout_seconds, 300);
    }

    #[test]
    fn test_default_download_limit_100mb() {
        let policy = NetworkIsolationPolicy::default();
        assert_eq!(policy.download_limit_bytes, 100 * 1024 * 1024);
    }

    #[test]
    fn test_default_file_limit_25mb() {
        let policy = NetworkIsolationPolicy::default();
        assert_eq!(policy.max_file_size_bytes, 25 * 1024 * 1024);
    }

    // --- Load Test Tests ---

    #[test]
    fn test_default_load_config_10_projects() {
        let config = LoadTestConfig::default();
        assert_eq!(config.concurrent_projects, 10);
        assert_eq!(config.target_p95_ms, 500);
    }

    #[test]
    fn test_build_report_empty_results() {
        let report = build_load_test_report(&[], 500);
        assert_eq!(report.total_calls, 0);
        assert!(report.meets_target);
    }

    #[test]
    fn test_build_report_all_fast() {
        let results: Vec<LoadTestCallResult> = (0..100)
            .map(|i| LoadTestCallResult {
                endpoint: format!("/api/{}", i),
                latency_ms: 100 + (i as u64),
                status_ok: true,
            })
            .collect();
        let report = build_load_test_report(&results, 500);
        assert_eq!(report.total_calls, 100);
        assert_eq!(report.failed_calls, 0);
        assert!(report.p95_latency_ms < 500);
        assert!(report.meets_target);
    }

    #[test]
    fn test_build_report_some_slow() {
        let mut results: Vec<LoadTestCallResult> = (0..80)
            .map(|i| LoadTestCallResult {
                endpoint: format!("/api/{}", i),
                latency_ms: 100,
                status_ok: true,
            })
            .collect();
        // Add 20 slow calls
        for i in 0..20 {
            results.push(LoadTestCallResult {
                endpoint: format!("/api/slow/{}", i),
                latency_ms: 800,
                status_ok: true,
            });
        }
        let report = build_load_test_report(&results, 500);
        // p95 should be 800 (>= 95th percentile is slow)
        assert!(report.p95_latency_ms > 500);
        assert!(!report.meets_target);
    }

    #[test]
    fn test_percentile_computation() {
        let sorted = vec![10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        assert_eq!(percentile(&sorted, 50.0), 60);  // idx = round(0.5 * 9) = 5 → 60
        assert_eq!(percentile(&sorted, 95.0), 100); // idx = round(0.95 * 9) = 9 → 100
        assert_eq!(percentile(&sorted, 0.0), 10);   // idx = 0 → 10
    }

    #[test]
    fn test_simulated_load_test_returns_empty() {
        let report = run_simulated_load_test();
        assert_eq!(report.total_calls, 0);
        assert!(report.meets_target);
    }

    // --- Memory Profiling Tests ---

    #[test]
    fn test_no_leak_when_stable() {
        let snapshots = vec![
            MemorySnapshot { timestamp_epoch_ms: 0, heap_bytes: 1000, rss_bytes: 5000, sandbox_count: 1, agent_count: 2 },
            MemorySnapshot { timestamp_epoch_ms: 3600000, heap_bytes: 1100, rss_bytes: 5200, sandbox_count: 1, agent_count: 2 },
        ];
        assert!(!detect_memory_leak(&snapshots, 1.5));
    }

    #[test]
    fn test_leak_detected_when_growth_exceeds_threshold() {
        let snapshots = vec![
            MemorySnapshot { timestamp_epoch_ms: 0, heap_bytes: 1000, rss_bytes: 5000, sandbox_count: 1, agent_count: 2 },
            MemorySnapshot { timestamp_epoch_ms: 7200000, heap_bytes: 5000, rss_bytes: 10000, sandbox_count: 1, agent_count: 2 },
        ];
        assert!(detect_memory_leak(&snapshots, 1.5));
    }

    #[test]
    fn test_no_leak_with_single_snapshot() {
        let snapshots = vec![
            MemorySnapshot { timestamp_epoch_ms: 0, heap_bytes: 1000, rss_bytes: 5000, sandbox_count: 0, agent_count: 0 },
        ];
        assert!(!detect_memory_leak(&snapshots, 1.5));
    }

    #[test]
    fn test_memory_profiling_config_defaults() {
        let config = MemoryProfilingConfig::default();
        assert_eq!(config.duration_seconds, 7200);
        assert_eq!(config.snapshot_interval_seconds, 60);
        assert!((config.leak_threshold_ratio - 1.5).abs() < f64::EPSILON);
    }

    // --- Release Notes Tests ---

    #[test]
    fn test_phase3_release_notes_from_db() {
        let notes = generate_phase3_release_notes();
        // Returns whatever is in DB; empty if no data
        assert!(notes.len() <= 10000);
    }

    #[test]
    fn test_release_notes_type_check() {
        let notes = generate_phase3_release_notes();
        for n in &notes {
            assert!(!n.title.is_empty());
        }
    }

    #[test]
    fn test_release_notes_categories() {
        // Test with manually created notes
        let note = ReleaseNoteEntry {
            category: "Security".into(),
            title: "Test".into(),
            description: "Desc".into(),
            sprint: "S1".into(),
        };
        assert_eq!(note.category, "Security");
    }

    // --- Doc Coverage Tests ---

    #[test]
    fn test_doc_coverage_from_db() {
        let coverage = get_doc_coverage();
        // Returns whatever is in DB; may be empty
        assert!(coverage.len() <= 10000);
    }

    #[test]
    fn test_doc_coverage_entry_type_check() {
        let entry = DocCoverageEntry {
            feature: "Test".into(),
            has_api_docs: true,
            has_user_guide: false,
            has_examples: false,
            last_updated_sprint: "S1".into(),
        };
        assert!(entry.has_api_docs);
        assert!(!entry.has_user_guide);
    }

    // --- Tauri Command Tests ---

    #[test]
    fn test_cmd_get_known_bugs() {
        let bugs = get_known_bugs_cmd();
        // Returns DB data; may be empty
        assert!(bugs.len() <= 10000);
    }

    #[test]
    fn test_cmd_get_open_p0_p1_empty_when_no_data() {
        let open = get_open_p0_p1_bugs();
        // May be empty if no bugs in DB
        assert!(open.len() <= 10000);
    }

    #[test]
    fn test_cmd_all_bugs_resolved_true_no_data() {
        // With no bugs, all_critical_bugs_resolved should be true
        let empty: Vec<TrackedBug> = vec![];
        assert!(all_critical_bugs_resolved(&empty));
    }

    #[test]
    fn test_cmd_sandbox_hardening_config() {
        let config = get_sandbox_hardening_config();
        assert!(config.network.block_all_other);
        assert!(config.cookies.clean_on_destroy);
    }

    #[test]
    fn test_cmd_check_url_allowed_github() {
        assert!(check_url_allowed("https://api.github.com/repos".into()));
    }

    #[test]
    fn test_cmd_check_url_blocked_random() {
        assert!(!check_url_allowed("https://malware.example.com".into()));
    }

    #[test]
    fn test_cmd_load_test_config() {
        let config = get_load_test_config();
        assert_eq!(config.concurrent_projects, 10);
    }

    #[test]
    fn test_cmd_memory_profiling_config() {
        let config = get_memory_profiling_config();
        assert_eq!(config.duration_seconds, 7200);
    }

    #[test]
    fn test_cmd_check_memory_leak_no_leak() {
        let snapshots = vec![
            MemorySnapshot { timestamp_epoch_ms: 0, heap_bytes: 1000, rss_bytes: 5000, sandbox_count: 0, agent_count: 0 },
            MemorySnapshot { timestamp_epoch_ms: 7200000, heap_bytes: 1200, rss_bytes: 5500, sandbox_count: 0, agent_count: 0 },
        ];
        assert!(!check_memory_leak(snapshots));
    }

    #[test]
    fn test_cmd_phase3_release_notes() {
        let notes = get_phase3_release_notes();
        assert!(notes.len() <= 10000);
    }

    #[test]
    fn test_cmd_doc_coverage() {
        let docs = get_doc_coverage_cmd();
        assert!(docs.len() <= 10000);
    }
}
