// context_summarizer.rs — Sprint S7: Context Auto-Summarization & Model Routing
//
// Manages context window optimization through:
//   1. Auto-summarization: Compresses older messages when context threshold reached
//   2. Model routing: Routes tasks to optimal model based on profile + task type

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ═══════════════════════════════ Types — Summarization ═══════════

/// Summarization trigger configuration per agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummarizationConfig {
    pub enabled: bool,
    pub threshold_pct: f64,     // Trigger at this % of context used (default 70%)
    pub preserve_recent: usize, // Keep N most recent messages unsummarized
    pub summary_max_tokens: usize,
}

impl Default for SummarizationConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            threshold_pct: 70.0,
            preserve_recent: 5,
            summary_max_tokens: 2000,
        }
    }
}

/// A message in the conversation history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub id: String,
    pub role: String,      // "user", "assistant", "system"
    pub content: String,
    pub token_count: usize,
    pub timestamp: String,
    pub is_summarized: bool,
}

/// Result of auto-summarization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummarizationResult {
    pub summary_text: String,
    pub messages_summarized: usize,
    pub tokens_before: usize,
    pub tokens_after: usize,
    pub tokens_saved: usize,
    pub savings_pct: f64,
    pub preserved_message_ids: Vec<String>,
}

/// Summarized conversation section (for UI expand/collapse).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSection {
    pub section_type: String,  // "summary" or "messages"
    pub summary_text: Option<String>,
    pub original_messages: Vec<ConversationMessage>,
    pub collapsed: bool,
    pub token_count: usize,
}

// ═══════════════════════════════ Types — Model Routing ═══════════

/// Model profile defining cost/quality trade-off.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ModelProfile {
    Speed,      // Cheapest, fastest
    Balanced,   // Good balance
    Quality,    // Best quality, most expensive
}

impl Default for ModelProfile {
    fn default() -> Self {
        Self::Balanced
    }
}

/// Task type classification for routing.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskType {
    Simple,     // Q&A, formatting, simple edits
    Standard,   // Code generation, analysis, writing
    Complex,    // Architecture, debugging, multi-file refactoring
}

/// Model routing configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelRoutingConfig {
    pub profile: ModelProfile,
    pub override_model: Option<String>, // Pin to specific model
}

impl Default for ModelRoutingConfig {
    fn default() -> Self {
        Self {
            profile: ModelProfile::Balanced,
            override_model: None,
        }
    }
}

/// Result of model routing decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingDecision {
    pub selected_model: String,
    pub profile: ModelProfile,
    pub task_type: TaskType,
    pub reason: String,
    pub is_override: bool,
    pub estimated_cost_per_1k_tokens: f64,
}

// ═══════════════════════════ Routing Matrix ══════════════════════

/// 3 profiles × 3 task types = 9 routing combinations.
pub fn get_routing_matrix() -> HashMap<(String, String), &'static str> {
    let mut matrix = HashMap::new();

    // Speed profile — always cheap
    matrix.insert(("Speed".to_string(),    "Simple".to_string()),   "gpt-4o-mini");
    matrix.insert(("Speed".to_string(),    "Standard".to_string()), "gpt-4o-mini");
    matrix.insert(("Speed".to_string(),    "Complex".to_string()),  "deepseek-v3");

    // Balanced profile — smart trade-offs
    matrix.insert(("Balanced".to_string(), "Simple".to_string()),   "gpt-4o-mini");
    matrix.insert(("Balanced".to_string(), "Standard".to_string()), "claude-sonnet-4-20250514");
    matrix.insert(("Balanced".to_string(), "Complex".to_string()),  "claude-sonnet-4-20250514");

    // Quality profile — best models
    matrix.insert(("Quality".to_string(),  "Simple".to_string()),   "claude-sonnet-4-20250514");
    matrix.insert(("Quality".to_string(),  "Standard".to_string()), "claude-sonnet-4-20250514");
    matrix.insert(("Quality".to_string(),  "Complex".to_string()),  "claude-opus-4-20250514");

    matrix
}

/// Model cost table (cost per 1K tokens, blended input/output at 60/40).
fn model_blended_cost_per_1k(model_id: &str) -> f64 {
    match model_id {
        "gpt-4o-mini"                => 0.00033,   // $0.15/M in, $0.60/M out
        "deepseek-v3"                => 0.00084,   // $0.27/M in, $1.10/M out
        "claude-sonnet-4-20250514"   => 0.0078,    // $3/M in, $15/M out
        "claude-opus-4-20250514"     => 0.021,     // $15/M in, $75/M out (blended ≈ $21/M)
        "gpt-4o"                     => 0.006,     // $2.50/M in, $10/M out
        _                            => 0.01,      // default
    }
}

// ═══════════════════════════ Summarization Engine ════════════════

/// Estimate token count from text (rough: ~4 chars per token).
pub fn estimate_tokens(text: &str) -> usize {
    (text.len() + 3) / 4 // ceil division
}

/// Check if summarization should trigger.
pub fn should_summarize(
    messages: &[ConversationMessage],
    context_window: usize,
    config: &SummarizationConfig,
) -> bool {
    if !config.enabled { return false; }
    let used_tokens: usize = messages.iter().map(|m| m.token_count).sum();
    let usage_pct = (used_tokens as f64 / context_window as f64) * 100.0;
    usage_pct >= config.threshold_pct
}

/// Generate a summary of older messages (placeholder — real impl calls LLM).
pub fn summarize_messages(
    messages: &[ConversationMessage],
    config: &SummarizationConfig,
) -> SummarizationResult {
    let total_msgs = messages.len();
    let preserve_count = config.preserve_recent.min(total_msgs);
    let summarize_count = total_msgs.saturating_sub(preserve_count);

    if summarize_count == 0 {
        return SummarizationResult {
            summary_text: String::new(),
            messages_summarized: 0,
            tokens_before: messages.iter().map(|m| m.token_count).sum(),
            tokens_after: messages.iter().map(|m| m.token_count).sum(),
            tokens_saved: 0,
            savings_pct: 0.0,
            preserved_message_ids: messages.iter().map(|m| m.id.clone()).collect(),
        };
    }

    let to_summarize = &messages[..summarize_count];
    let preserved = &messages[summarize_count..];

    let tokens_before: usize = messages.iter().map(|m| m.token_count).sum();
    let summarized_tokens: usize = to_summarize.iter().map(|m| m.token_count).sum();

    // Build summary text: extract key points from each message
    let summary_parts: Vec<String> = to_summarize.iter()
        .filter(|m| m.role != "system") // skip system messages in summary
        .map(|m| {
            let preview = if m.content.len() > 100 {
                format!("{}...", &m.content[..100])
            } else {
                m.content.clone()
            };
            format!("[{}]: {}", m.role, preview)
        })
        .collect();

    let summary_text = format!(
        "[Context Summary: {} messages compressed]\n{}",
        summarize_count,
        summary_parts.join("\n")
    );

    let summary_tokens = estimate_tokens(&summary_text).min(config.summary_max_tokens);
    let preserved_tokens: usize = preserved.iter().map(|m| m.token_count).sum();
    let tokens_after = summary_tokens + preserved_tokens;
    let tokens_saved = tokens_before.saturating_sub(tokens_after);
    let savings_pct = if tokens_before > 0 {
        (tokens_saved as f64 / tokens_before as f64) * 100.0
    } else {
        0.0
    };

    SummarizationResult {
        summary_text,
        messages_summarized: summarize_count,
        tokens_before,
        tokens_after,
        tokens_saved,
        savings_pct,
        preserved_message_ids: preserved.iter().map(|m| m.id.clone()).collect(),
    }
}

/// Build conversation sections for UI rendering.
pub fn build_conversation_sections(
    messages: &[ConversationMessage],
    summary: Option<&SummarizationResult>,
) -> Vec<ConversationSection> {
    let mut sections = Vec::new();

    if let Some(sum) = summary {
        if sum.messages_summarized > 0 {
            let summarized = messages.iter()
                .take(sum.messages_summarized)
                .cloned()
                .collect::<Vec<_>>();
            let token_count: usize = summarized.iter().map(|m| m.token_count).sum();

            sections.push(ConversationSection {
                section_type: "summary".to_string(),
                summary_text: Some(sum.summary_text.clone()),
                original_messages: summarized,
                collapsed: true,
                token_count,
            });
        }

        // Preserved (recent) messages
        let preserved: Vec<ConversationMessage> = messages.iter()
            .skip(sum.messages_summarized)
            .cloned()
            .collect();
        let token_count: usize = preserved.iter().map(|m| m.token_count).sum();

        if !preserved.is_empty() {
            sections.push(ConversationSection {
                section_type: "messages".to_string(),
                summary_text: None,
                original_messages: preserved,
                collapsed: false,
                token_count,
            });
        }
    } else {
        let token_count: usize = messages.iter().map(|m| m.token_count).sum();
        sections.push(ConversationSection {
            section_type: "messages".to_string(),
            summary_text: None,
            original_messages: messages.to_vec(),
            collapsed: false,
            token_count,
        });
    }

    sections
}

// ═══════════════════════════ Model Router ════════════════════════

/// Classify task complexity from content.
pub fn classify_task(content: &str) -> TaskType {
    let lower = content.to_lowercase();
    let word_count = lower.split_whitespace().count();

    // Complex indicators
    let complex_keywords = [
        "refactor", "architecture", "debug", "optimize", "redesign",
        "multi-file", "migrate", "security audit", "performance",
    ];
    if complex_keywords.iter().any(|kw| lower.contains(kw)) || word_count > 200 {
        return TaskType::Complex;
    }

    // Simple indicators
    let simple_keywords = [
        "format", "rename", "typo", "fix spelling", "add comment",
        "what is", "explain", "summarize",
    ];
    if simple_keywords.iter().any(|kw| lower.contains(kw)) && word_count < 50 {
        return TaskType::Simple;
    }

    TaskType::Standard
}

/// Route to optimal model based on profile + task type.
pub fn route_model(
    config: &ModelRoutingConfig,
    task_type: &TaskType,
) -> RoutingDecision {
    // Check for override pin
    if let Some(ref pinned) = config.override_model {
        return RoutingDecision {
            selected_model: pinned.clone(),
            profile: config.profile.clone(),
            task_type: task_type.clone(),
            reason: format!("Pinned to {} via override", pinned),
            is_override: true,
            estimated_cost_per_1k_tokens: model_blended_cost_per_1k(pinned),
        };
    }

    let matrix = get_routing_matrix();
    let profile_str = format!("{:?}", config.profile);
    let task_str = format!("{:?}", task_type);

    let model_id = matrix
        .get(&(profile_str.clone(), task_str.clone()))
        .copied()
        .unwrap_or("claude-sonnet-4-20250514");

    RoutingDecision {
        selected_model: model_id.to_string(),
        profile: config.profile.clone(),
        task_type: task_type.clone(),
        reason: format!("{} profile + {} task → {}", profile_str, task_str, model_id),
        is_override: false,
        estimated_cost_per_1k_tokens: model_blended_cost_per_1k(model_id),
    }
}

/// Compare cost efficiency between profiles.
pub fn compare_profile_costs(
    task_type: &TaskType,
    token_count: usize,
) -> Vec<(String, String, f64)> {
    let profiles = [ModelProfile::Speed, ModelProfile::Balanced, ModelProfile::Quality];
    profiles.iter().map(|profile| {
        let config = ModelRoutingConfig {
            profile: profile.clone(),
            override_model: None,
        };
        let decision = route_model(&config, task_type);
        let cost = decision.estimated_cost_per_1k_tokens * (token_count as f64 / 1000.0);
        (format!("{:?}", profile), decision.selected_model, cost)
    }).collect()
}

// ═══════════════════════════ Tauri Commands ══════════════════════

/// Get default summarization config.
#[tauri::command]
pub async fn get_summarization_config() -> Result<SummarizationConfig, String> {
    Ok(SummarizationConfig::default())
}

/// Update summarization config for an agent.
#[tauri::command]
pub async fn update_summarization_config(
    _agent_id: String,
    enabled: bool,
    threshold_pct: f64,
    preserve_recent: usize,
) -> Result<SummarizationConfig, String> {
    if threshold_pct < 10.0 || threshold_pct > 95.0 {
        return Err("Threshold must be between 10% and 95%".to_string());
    }
    Ok(SummarizationConfig {
        enabled,
        threshold_pct,
        preserve_recent,
        summary_max_tokens: 2000,
    })
}

/// Run context summarization on an agent's conversation.
#[tauri::command]
pub async fn run_summarization(
    messages: Vec<ConversationMessage>,
    context_window: usize,
    threshold_pct: f64,
    preserve_recent: usize,
) -> Result<SummarizationResult, String> {
    let config = SummarizationConfig {
        enabled: true,
        threshold_pct,
        preserve_recent,
        summary_max_tokens: 2000,
    };

    if !should_summarize(&messages, context_window, &config) {
        return Err("Context usage below threshold, no summarization needed".to_string());
    }

    Ok(summarize_messages(&messages, &config))
}

/// Route a task to the optimal model.
#[tauri::command]
pub async fn route_task_to_model(
    task_content: String,
    profile: String,
    override_model: Option<String>,
) -> Result<RoutingDecision, String> {
    let task_type = classify_task(&task_content);
    let model_profile = match profile.as_str() {
        "speed" | "Speed" => ModelProfile::Speed,
        "quality" | "Quality" => ModelProfile::Quality,
        _ => ModelProfile::Balanced,
    };

    let config = ModelRoutingConfig {
        profile: model_profile,
        override_model,
    };

    Ok(route_model(&config, &task_type))
}

/// Get the full routing matrix.
#[tauri::command]
pub async fn get_routing_matrix_cmd() -> Result<Vec<(String, String, String)>, String> {
    let matrix = get_routing_matrix();
    let mut result: Vec<(String, String, String)> = matrix
        .into_iter()
        .map(|((p, t), m)| (p, t, m.to_string()))
        .collect();
    result.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
    Ok(result)
}

/// Compare costs across profiles for a given task.
#[tauri::command]
pub async fn compare_costs(
    task_content: String,
    token_count: usize,
) -> Result<Vec<(String, String, f64)>, String> {
    let task_type = classify_task(&task_content);
    Ok(compare_profile_costs(&task_type, token_count))
}

// ═══════════════════════════ Tests ═══════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    fn make_msg(id: &str, role: &str, content: &str, tokens: usize) -> ConversationMessage {
        ConversationMessage {
            id: id.to_string(),
            role: role.to_string(),
            content: content.to_string(),
            token_count: tokens,
            timestamp: "2025-01-01T00:00:00Z".to_string(),
            is_summarized: false,
        }
    }

    // ── Summarization ─────────────────────────────────

    #[test]
    fn test_should_summarize_below_threshold() {
        let msgs = vec![make_msg("1", "user", "hello", 100)];
        let config = SummarizationConfig::default(); // 70%
        assert!(!should_summarize(&msgs, 10000, &config));
    }

    #[test]
    fn test_should_summarize_above_threshold() {
        let msgs = vec![make_msg("1", "user", "hello", 7500)];
        let config = SummarizationConfig::default(); // 70%
        assert!(should_summarize(&msgs, 10000, &config));
    }

    #[test]
    fn test_should_summarize_disabled() {
        let msgs = vec![make_msg("1", "user", "hello", 9000)];
        let config = SummarizationConfig { enabled: false, ..Default::default() };
        assert!(!should_summarize(&msgs, 10000, &config));
    }

    #[test]
    fn test_summarize_preserves_recent() {
        let msgs: Vec<ConversationMessage> = (0..10)
            .map(|i| make_msg(&format!("m{}", i), "user", &format!("msg {}", i), 100))
            .collect();
        let config = SummarizationConfig { preserve_recent: 3, ..Default::default() };
        let result = summarize_messages(&msgs, &config);

        assert_eq!(result.messages_summarized, 7);
        assert_eq!(result.preserved_message_ids.len(), 3);
        assert_eq!(result.preserved_message_ids[0], "m7");
    }

    #[test]
    fn test_summarize_saves_tokens() {
        let msgs: Vec<ConversationMessage> = (0..20)
            .map(|i| make_msg(&format!("m{}", i), "user", &format!("This is message number {}", i), 200))
            .collect();
        let config = SummarizationConfig { preserve_recent: 5, ..Default::default() };
        let result = summarize_messages(&msgs, &config);

        assert!(result.tokens_saved > 0);
        assert!(result.savings_pct > 0.0);
        assert!(result.tokens_after < result.tokens_before);
    }

    #[test]
    fn test_summarize_no_messages_to_compress() {
        let msgs = vec![make_msg("1", "user", "hi", 100)];
        let config = SummarizationConfig { preserve_recent: 5, ..Default::default() };
        let result = summarize_messages(&msgs, &config);

        assert_eq!(result.messages_summarized, 0);
        assert_eq!(result.tokens_saved, 0);
    }

    #[test]
    fn test_summarize_generates_summary_text() {
        let msgs = vec![
            make_msg("1", "user", "How do I implement a REST API?", 50),
            make_msg("2", "assistant", "You can use Express or FastAPI...", 200),
            make_msg("3", "user", "Show me the code", 20),
        ];
        let config = SummarizationConfig { preserve_recent: 1, ..Default::default() };
        let result = summarize_messages(&msgs, &config);

        assert!(result.summary_text.contains("Context Summary"));
        assert!(result.summary_text.contains("REST API"));
    }

    // ── Conversation Sections ─────────────────────────

    #[test]
    fn test_sections_without_summary() {
        let msgs = vec![make_msg("1", "user", "hi", 100)];
        let sections = build_conversation_sections(&msgs, None);

        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].section_type, "messages");
        assert!(!sections[0].collapsed);
    }

    #[test]
    fn test_sections_with_summary() {
        let msgs: Vec<ConversationMessage> = (0..5)
            .map(|i| make_msg(&format!("m{}", i), "user", &format!("msg {}", i), 100))
            .collect();
        let config = SummarizationConfig { preserve_recent: 2, ..Default::default() };
        let result = summarize_messages(&msgs, &config);
        let sections = build_conversation_sections(&msgs, Some(&result));

        assert_eq!(sections.len(), 2);
        assert_eq!(sections[0].section_type, "summary");
        assert!(sections[0].collapsed); // Summary section starts collapsed
        assert_eq!(sections[1].section_type, "messages");
        assert!(!sections[1].collapsed);
    }

    // ── Task Classification ───────────────────────────

    #[test]
    fn test_classify_simple_task() {
        assert_eq!(classify_task("fix typo in readme"), TaskType::Simple);
        assert_eq!(classify_task("what is a closure?"), TaskType::Simple);
    }

    #[test]
    fn test_classify_complex_task() {
        assert_eq!(classify_task("Refactor the entire auth module to use OAuth2"), TaskType::Complex);
        assert_eq!(classify_task("Need to debug a performance issue in the database layer"), TaskType::Complex);
    }

    #[test]
    fn test_classify_standard_task() {
        assert_eq!(classify_task("Write a function to parse CSV files"), TaskType::Standard);
    }

    // ── Model Routing ─────────────────────────────────

    #[test]
    fn test_routing_matrix_9_combinations() {
        let matrix = get_routing_matrix();
        assert_eq!(matrix.len(), 9, "3 profiles × 3 task types = 9 combos");
    }

    #[test]
    fn test_routing_speed_simple() {
        let config = ModelRoutingConfig { profile: ModelProfile::Speed, override_model: None };
        let decision = route_model(&config, &TaskType::Simple);
        assert_eq!(decision.selected_model, "gpt-4o-mini");
        assert!(!decision.is_override);
    }

    #[test]
    fn test_routing_quality_complex() {
        let config = ModelRoutingConfig { profile: ModelProfile::Quality, override_model: None };
        let decision = route_model(&config, &TaskType::Complex);
        assert_eq!(decision.selected_model, "claude-opus-4-20250514");
    }

    #[test]
    fn test_routing_balanced_standard() {
        let config = ModelRoutingConfig { profile: ModelProfile::Balanced, override_model: None };
        let decision = route_model(&config, &TaskType::Standard);
        assert_eq!(decision.selected_model, "claude-sonnet-4-20250514");
    }

    #[test]
    fn test_routing_override_pin() {
        let config = ModelRoutingConfig {
            profile: ModelProfile::Speed,
            override_model: Some("claude-opus-4-20250514".to_string()),
        };
        let decision = route_model(&config, &TaskType::Simple);
        assert_eq!(decision.selected_model, "claude-opus-4-20250514");
        assert!(decision.is_override);
    }

    // ── Cost Comparison ───────────────────────────────

    #[test]
    fn test_balanced_cheaper_than_quality_for_standard() {
        let comparisons = compare_profile_costs(&TaskType::Standard, 100_000);
        let balanced = comparisons.iter().find(|c| c.0 == "Balanced").unwrap();
        let quality = comparisons.iter().find(|c| c.0 == "Quality").unwrap();

        // Balanced uses same model for Standard as Quality (Sonnet), so cost should be equal
        // But for complex tasks, balanced should be cheaper
        let complex_comparisons = compare_profile_costs(&TaskType::Complex, 100_000);
        let balanced_complex = complex_comparisons.iter().find(|c| c.0 == "Balanced").unwrap();
        let quality_complex = complex_comparisons.iter().find(|c| c.0 == "Quality").unwrap();

        // Balanced uses Sonnet for Complex, Quality uses Opus — significant cost diff
        assert!(balanced_complex.2 < quality_complex.2,
            "Balanced ({:.4}) should be cheaper than Quality ({:.4}) for Complex tasks",
            balanced_complex.2, quality_complex.2);

        // Verify ≥30% savings
        let savings_pct = (1.0 - balanced_complex.2 / quality_complex.2) * 100.0;
        assert!(savings_pct >= 30.0,
            "Balanced should save ≥30% vs Quality, got {:.1}%", savings_pct);
    }

    #[test]
    fn test_speed_cheapest() {
        let comparisons = compare_profile_costs(&TaskType::Simple, 100_000);
        let speed = comparisons.iter().find(|c| c.0 == "Speed").unwrap();
        let balanced = comparisons.iter().find(|c| c.0 == "Balanced").unwrap();

        assert!(speed.2 <= balanced.2);
    }

    // ── Commands ──────────────────────────────────────

    #[tokio::test]
    async fn test_update_config_valid() {
        let result = update_summarization_config(
            "agent-1".to_string(), true, 70.0, 5
        ).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().threshold_pct, 70.0);
    }

    #[tokio::test]
    async fn test_update_config_invalid_threshold() {
        let result = update_summarization_config(
            "agent-1".to_string(), true, 99.0, 5
        ).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_route_task_speed() {
        let result = route_task_to_model(
            "fix typo".to_string(), "speed".to_string(), None,
        ).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().selected_model, "gpt-4o-mini");
    }

    #[tokio::test]
    async fn test_route_task_with_override() {
        let result = route_task_to_model(
            "fix typo".to_string(), "speed".to_string(),
            Some("claude-opus-4-20250514".to_string()),
        ).await;
        assert!(result.is_ok());
        let decision = result.unwrap();
        assert!(decision.is_override);
        assert_eq!(decision.selected_model, "claude-opus-4-20250514");
    }

    #[tokio::test]
    async fn test_get_routing_matrix_cmd() {
        let result = get_routing_matrix_cmd().await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 9);
    }

    #[test]
    fn test_estimate_tokens() {
        assert_eq!(estimate_tokens("hello"), 2); // 5 chars → (5+3)/4 = 2
        assert_eq!(estimate_tokens(""), 0);      // (0+3)/4 = 0 (integer div)
        assert!(estimate_tokens("This is a longer piece of text for testing") > 5);
    }
}
