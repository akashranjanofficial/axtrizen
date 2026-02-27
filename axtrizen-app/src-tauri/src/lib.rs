// Axtrizen AI - Tauri Library
// Main application entry point and IPC registration

pub mod commands;
pub mod db;
pub mod gateway_client;
pub mod maple_bridge;
pub mod orchestrator;
pub mod workflow_templates;

use std::sync::Arc;
use commands::{agents, terminal, config, settings, chat, sessions, usage, system, skills, cron, devices, logs, agent_metrics, maple, git, vector_store, integrations, cicd, memu, agent_groups, unified_skills};
use commands::skill_sources;
use commands::agent_wizard;
use commands::context_tracker;
use commands::project_wizard;
use commands::verification_engine;
use commands::context_summarizer;
use commands::security_guardrails;
use commands::output_guardrails;
    use commands::stabilization;
    use commands::voice_pipeline;
    use commands::scoring_engine;
    use commands::config_reuse;
    use commands::org_policies;
    use commands::usage_dashboard;
    use commands::cloud_hosting;
    use commands::compliance_audit;
    use commands::sso_rbac;
    use commands::enterprise_polish;
    use commands::ga_release;
    use commands::gateway_bridge;
use gateway_client::GatewayClient;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize database on startup
    if let Err(e) = db::init_db() {
        eprintln!("Failed to initialize database: {}", e);
    }

    // Seed built-in workflow templates (idempotent)
    if let Ok(conn) = db::init_db() {
        if let Err(e) = db::seed_builtin_templates(&conn) {
            eprintln!("Failed to seed workflow templates: {}", e);
        }
    }

    // Seed skill catalog from embedded JSON (idempotent — only on first launch)
    if let Ok(conn) = db::init_db() {
        match db::seed_catalog_if_empty(&conn) {
            Ok(0) => {} // already seeded, skip
            Ok(n) => eprintln!("Seeded {} skills into catalog", n),
            Err(e) => eprintln!("Failed to seed skill catalog: {}", e),
        }
    }

    // Seed default skill bundles — all 7 built-in bundles (idempotent)
    if let Ok(conn) = db::init_db() {
        let bundles = vec![
            db::DbSkillBundle {
                id: "bundle-security-engineer".to_string(),
                name: "Security Engineer".to_string(),
                description: Some("Security auditing and compliance".to_string()),
                icon: Some("🛡️".to_string()),
                skill_keys: serde_json::to_string(&vec![
                    "owasp-top-10", "secure-code-review", "security-headers",
                    "cve-analysis", "penetration-testing-methodology",
                    "security-compliance-soc2-audit", "api-security-testing",
                    "dependency-vulnerability-scan", "network-security-audit",
                ]).unwrap_or_default(),
                is_builtin: true,
            },
            db::DbSkillBundle {
                id: "bundle-fullstack-dev".to_string(),
                name: "Full-Stack Developer".to_string(),
                description: Some("Complete web development stack".to_string()),
                icon: Some("🚀".to_string()),
                skill_keys: serde_json::to_string(&vec![
                    "react-nextjs", "nodejs-backend", "typescript-strict",
                    "database-design", "rest-api-design", "docker-compose",
                    "tailwind-css", "testing-strategy", "git-workflow",
                ]).unwrap_or_default(),
                is_builtin: true,
            },
            db::DbSkillBundle {
                id: "bundle-devops-cloud".to_string(),
                name: "DevOps & Cloud".to_string(),
                description: Some("Infrastructure and CI/CD".to_string()),
                icon: Some("☁️".to_string()),
                skill_keys: serde_json::to_string(&vec![
                    "docker-compose", "kubernetes-deployment", "terraform-iac",
                    "github-actions-ci", "aws-cloud-architecture",
                    "monitoring-observability", "nginx-configuration",
                ]).unwrap_or_default(),
                is_builtin: true,
            },
            db::DbSkillBundle {
                id: "bundle-data-engineer".to_string(),
                name: "Data Engineer".to_string(),
                description: Some("Data pipelines, analytics, and ML deployment".to_string()),
                icon: Some("📊".to_string()),
                skill_keys: serde_json::to_string(&vec![
                    "python-data-science", "sql-optimization", "etl-pipeline",
                    "data-visualization", "machine-learning-deployment",
                    "spark-processing", "data-quality-testing",
                ]).unwrap_or_default(),
                is_builtin: true,
            },
            db::DbSkillBundle {
                id: "bundle-agent-architect".to_string(),
                name: "Agent Architect".to_string(),
                description: Some("Design and build AI agent systems".to_string()),
                icon: Some("🤖".to_string()),
                skill_keys: serde_json::to_string(&vec![
                    "prompt-engineering", "agent-orchestration", "tool-use-design",
                    "memory-management", "context-engineering",
                    "eval-and-testing", "multi-agent-patterns",
                ]).unwrap_or_default(),
                is_builtin: true,
            },
            db::DbSkillBundle {
                id: "bundle-web-designer".to_string(),
                name: "Web Designer".to_string(),
                description: Some("UI/UX design, responsive layouts, and design systems".to_string()),
                icon: Some("🎨".to_string()),
                skill_keys: serde_json::to_string(&vec![
                    "tailwind-css", "responsive-design", "accessibility-audit",
                    "design-system", "svg-animation", "color-theory",
                    "typography-web", "figma-to-code",
                ]).unwrap_or_default(),
                is_builtin: true,
            },
            db::DbSkillBundle {
                id: "bundle-oss-maintainer".to_string(),
                name: "OSS Maintainer".to_string(),
                description: Some("Open source project management and releases".to_string()),
                icon: Some("🌐".to_string()),
                skill_keys: serde_json::to_string(&vec![
                    "code-review-best-practices", "semantic-versioning",
                    "changelog-generation", "license-compliance",
                    "contributing-guide", "issue-triage", "release-automation",
                ]).unwrap_or_default(),
                is_builtin: true,
            },
        ];
        if let Err(e) = db::seed_skill_bundles(&conn, &bundles) {
            eprintln!("Failed to seed skill bundles: {}", e);
        }
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

            // Planning / Board commands
            commands::planning::get_project_board,
            commands::planning::create_epic,
            commands::planning::create_story,
            commands::planning::create_task,
            commands::planning::update_task_status,
            commands::planning::update_story_status,
            commands::planning::update_epic_status,
            commands::planning::create_sprint,

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
            commands::orchestrator::restart_with_feedback,
            
            // Usage commands
            usage::usage_cost,
            usage::usage_status,
            
            // System commands
            system::gateway_health,
            system::gateway_status,
            system::last_heartbeat,
            system::system_presence,
            system::read_file_content,
            system::list_directory,
            system::open_workspace,
            
            // Skills commands (legacy gateway proxy)
            skills::skills_status,
            skills::skills_update,
            skills::skills_install,

            // Unified Skills commands (Sprint S1)
            unified_skills::catalog_seed,
            unified_skills::catalog_count,
            unified_skills::catalog_search,
            unified_skills::catalog_categories,
            unified_skills::catalog_get_entry,
            unified_skills::agent_skill_install,
            unified_skills::agent_skills_list,
            unified_skills::agent_skill_remove,
            unified_skills::agent_skill_update_config,
            unified_skills::agent_skills_batch_install,
            unified_skills::get_skill_bundles,
            unified_skills::seed_default_bundles,
            
            // Skill source resolver (GitHub, URL, local path)
            skill_sources::skills_resolve_source,
            skill_sources::skills_install_from_source,
            skill_sources::skills_search_remote,
            
            // Agent wizard — creation with config, recommendations, templates
            agent_wizard::skill_recommendations,
            agent_wizard::create_agent_with_config,
            agent_wizard::save_agent_template,
            agent_wizard::list_agent_templates,
            agent_wizard::delete_agent_template,
            // Context tracker commands (Sprint S4)
            context_tracker::get_context_health,
            context_tracker::update_context_usage,
            context_tracker::get_context_budget_config,
            context_tracker::save_context_budget_config,
            // Project wizard commands (Sprint S5)
            project_wizard::suggest_team_for_project,
            project_wizard::get_model_pricing,
            project_wizard::estimate_cost,
            project_wizard::recalculate_team_cost,
            // Quality verification engine (Sprint S6)
            verification_engine::verify_phase,
            verification_engine::get_stub_patterns,
            verification_engine::override_gate,
            verification_engine::get_phase_gate_statuses,
            verification_engine::check_file_for_stubs,
            // Context summarizer & model routing (Sprint S7)
            context_summarizer::get_summarization_config,
            context_summarizer::update_summarization_config,
            context_summarizer::run_summarization,
            context_summarizer::route_task_to_model,
            context_summarizer::get_routing_matrix_cmd,
            context_summarizer::compare_costs,
            // Security guardrails & browser sandbox (Sprint S8)
            security_guardrails::scan_for_injection,
            security_guardrails::get_injection_patterns_cmd,
            security_guardrails::spawn_browser_sandbox,
            security_guardrails::get_sandbox_config,
            security_guardrails::execute_cdp,
            // Output guardrails, browser stream, monitoring (Sprint S9)
            output_guardrails::scan_output_pii,
            output_guardrails::scan_output_unsafe,
            output_guardrails::get_guardrail_config,
            output_guardrails::apply_output_guardrail,
            output_guardrails::get_stream_config,
            output_guardrails::get_project_live_metrics,
            output_guardrails::get_monitoring_layout,
            // Browser polish + stabilization (Sprint S10)
            stabilization::get_known_bugs_cmd,
            stabilization::get_open_p0_p1_bugs,
            stabilization::all_bugs_resolved_cmd,
            stabilization::get_sandbox_hardening_config,
            stabilization::check_url_allowed,
            stabilization::get_load_test_config,
            stabilization::run_simulated_load_test,
            stabilization::get_memory_profiling_config,
            stabilization::check_memory_leak,
            stabilization::get_phase3_release_notes,
            stabilization::get_doc_coverage_cmd,
            // Voice pipeline (Sprint S11)
            voice_pipeline::get_voice_pipeline_config,
            voice_pipeline::get_voice_pipeline_status,
            voice_pipeline::get_stt_config,
            voice_pipeline::get_tts_config,
            voice_pipeline::get_vad_config,
            voice_pipeline::get_push_to_talk_config,
            voice_pipeline::request_mic_permission,
            voice_pipeline::process_vad_sample_cmd,
            // Performance scoring (Sprint S12)
            scoring_engine::get_score_weights,
            scoring_engine::compute_agent_score_cmd,
            scoring_engine::get_sample_scorecard,
            scoring_engine::get_skill_effectiveness_report,
            scoring_engine::score_to_stars_cmd,
            // Config reuse + recommendations (Sprint S13)
            config_reuse::get_sample_template,
            config_reuse::apply_template_cmd,
            config_reuse::create_template_version_cmd,
            config_reuse::get_sample_recommendations,
            config_reuse::dismiss_recommendation_cmd,
            config_reuse::apply_recommendation_cmd,
            // Org skill policies (Sprint S14)
            org_policies::get_skill_policies,
            org_policies::get_tenant_config,
            org_policies::request_skill_approval,
            // Usage & budget dashboard (Sprint S15)
            usage_dashboard::get_usage_summary,
            usage_dashboard::get_budget_config,
            usage_dashboard::check_budget_status_cmd,
            usage_dashboard::export_usage_csv_cmd,
            // Cloud hosting (Sprint S16)
            cloud_hosting::get_cloud_config,
            cloud_hosting::verify_tenant_isolation_cmd,
            // Compliance & audit (Sprint S17)
            compliance_audit::get_retention_policy,
            compliance_audit::get_soc2_checklist,
            compliance_audit::verify_audit_chain,
            compliance_audit::get_audit_log_entries_cmd,
            // SSO & RBAC (Sprint S18)
            sso_rbac::get_sso_config,
            sso_rbac::check_permission,
            sso_rbac::can_assign_role_cmd,
            // Enterprise polish (Sprint S19)
            enterprise_polish::get_enterprise_load_test_config,
            enterprise_polish::get_uptime_sla_config,
            enterprise_polish::get_demo_environment,
            enterprise_polish::get_documentation_status,
            // GA release (Sprint S20)
            ga_release::get_regression_suite_result,
            ga_release::get_security_audit_report,
            ga_release::get_monitoring_config_cmd,
            ga_release::get_runbook,
            ga_release::get_ga_release_metadata_cmd,
            // Gateway bridge (live data enrichment)
            gateway_bridge::get_gateway_health_report,
            gateway_bridge::get_live_usage,
            gateway_bridge::get_enriched_agent_metrics,
            gateway_bridge::get_system_overview,
            gateway_bridge::sync_skill_policies_to_gateway,
            
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
            
            // Maple P2P bridge commands
            maple::maple_broker_start,
            maple::maple_broker_stop,
            maple::maple_broker_status,
            maple::maple_agent_connect,
            maple::maple_agent_disconnect,
            maple::maple_agent_publish,
            maple::maple_claim_task,
            maple::maple_lim_initiate,
            maple::maple_lim_terminate,
            
            // Git integration commands
            git::git_is_repo,
            git::git_current_branch,
            git::git_status,
            git::git_commit,
            git::git_create_branch,
            git::git_checkout,
            git::git_push,
            git::git_diff,
            git::git_create_pr,

            // Vector store commands
            vector_store::vector_store_init,
            vector_store::vector_store_add,
            vector_store::vector_store_search,
            vector_store::vector_store_delete,
            vector_store::vector_store_stats,

            // Slack/Discord integration commands
            integrations::slack_configure,
            integrations::slack_send,
            integrations::slack_status,
            integrations::discord_configure,
            integrations::discord_send,
            integrations::discord_status,
            integrations::integration_handle_mention,

            // CI/CD pipeline commands
            cicd::ci_run_tests,
            cicd::ci_test_status,
            cicd::ci_deploy_preview,
            cicd::ci_stop_preview,

            // Workflow template commands
            commands::workflow::get_workflow_templates,
            commands::workflow::get_workflow_template,
            commands::workflow::get_project_workflow_template,
            commands::workflow::set_project_workflow_template,

            // memU memory commands
            memu::memu_init,
            memu::memu_memorize,
            memu::memu_retrieve,
            memu::memu_list,
            memu::memu_clear,
            memu::memu_stats,

            // Agent Groups (Phase 3: Smart Group Communication)
            agent_groups::create_agent_group,
            agent_groups::get_agent_groups,
            agent_groups::add_agent_to_group,
            agent_groups::remove_agent_from_group,
            agent_groups::get_group_members,
            agent_groups::send_group_message,
            agent_groups::get_group_messages,
            agent_groups::delete_agent_group,

            // Health check
            ping
        ])
        .manage(terminal::PtyState::default())
        .manage(GatewayClient::default())
        .manage(Arc::new(orchestrator::OrchestratorState::default()))
        .manage(maple::MapleBridgeState::default())
        .manage(vector_store::VectorStoreState::default())
        .manage(integrations::IntegrationState::default())
        .manage(cicd::CICDState::default())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Simple ping command for testing IPC
#[tauri::command]
fn ping() -> String {
    "pong".to_string()
}
