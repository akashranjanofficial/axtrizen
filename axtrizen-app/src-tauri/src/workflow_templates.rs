// workflow_templates.rs — Domain-agnostic workflow template system
//
// Replaces hardcoded SDLC phases with configurable workflow templates.
// Each template defines phases, prompts, board labels, and output types
// for a specific domain (engineering, marketing, HR, legal, etc.).

use serde::{Deserialize, Serialize};

// ==================== Core Types ====================

/// A workflow template that defines the execution pipeline for a domain.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowTemplate {
    pub id: String,
    pub name: String,
    pub domain: String,
    pub description: String,
    pub icon: String,
    pub phases: Vec<WorkflowPhase>,
    pub board_labels: BoardLabels,
    pub output_types: Vec<String>,
    pub recommended_roles: Vec<String>,
    pub status_mapping: StatusMapping,
    pub report_sections: Vec<ReportSection>,
    pub final_report_prompt: String,
}

/// A single phase in a workflow pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowPhase {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub phase_type: PhaseType,
    /// Prompt template for worker agents. Supports {{variables}}.
    pub prompt_template: String,
    /// Optional separate prompt for the manager agent.
    pub manager_prompt: Option<String>,
    /// Whether this phase produces files saved to workspace.
    pub saves_files: bool,
}

/// Phase execution behavior pattern.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PhaseType {
    /// Manager breaks down work into board items (epics/stories/tasks).
    Planning,
    /// Agents discuss, propose, and cross-review approaches.
    Collaborative,
    /// Agents produce deliverables (code, documents, content, etc.).
    Execution,
    /// Agents review each other's output with structured feedback.
    Review,
    /// Final summary/handoff phase.
    Delivery,
}

/// Display labels for the 3-level board hierarchy + iteration concept.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardLabels {
    /// Top-level grouping: "Epics", "Campaigns", "Positions", "Matters"
    pub level1: String,
    /// Mid-level items: "Stories", "Initiatives", "Candidates", "Clauses"
    pub level2: String,
    /// Granular work items: "Tasks", "Action Items", "Steps", "Tasks"
    pub level3: String,
    /// Time-boxed iteration: "Sprints", "Waves", "Rounds", "Phases"
    pub iteration: String,
}

/// Maps phase IDs to board task statuses.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusMapping {
    /// Status to set when a phase starts.
    pub phase_start: std::collections::HashMap<String, String>,
    /// Status to set when a phase completes.
    pub phase_complete: std::collections::HashMap<String, String>,
}

/// A section in the final deliverables report.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportSection {
    pub id: String,
    pub title: String,
    pub emoji: String,
}

// ==================== Template Variable Expansion ====================

/// Fill {{variables}} in a prompt template with actual values.
pub fn expand_prompt(template: &str, vars: &std::collections::HashMap<String, String>) -> String {
    let mut result = template.to_string();
    for (key, value) in vars {
        result = result.replace(&format!("{{{{{}}}}}", key), value);
    }
    result
}

// ==================== Built-in Templates ====================

/// Get all built-in workflow templates.
pub fn get_builtin_templates() -> Vec<WorkflowTemplate> {
    vec![
        software_development_template(),
        marketing_campaign_template(),
        hr_recruitment_template(),
        legal_contract_template(),
        financial_analysis_template(),
        healthcare_operations_template(),
        education_training_template(),
        general_project_template(),
    ]
}

/// Get a built-in template by ID.
pub fn get_builtin_template(id: &str) -> Option<WorkflowTemplate> {
    get_builtin_templates().into_iter().find(|t| t.id == id)
}

/// The default template ID (used when no template is specified).
pub const DEFAULT_TEMPLATE_ID: &str = "builtin-software-development";

// ─── Software Development ────────────────────────────────────────────

fn software_development_template() -> WorkflowTemplate {
    WorkflowTemplate {
        id: "builtin-software-development".to_string(),
        name: "Software Development".to_string(),
        domain: "engineering".to_string(),
        description: "Full SDLC workflow: planning, architecture design, code implementation, code review, and deployment.".to_string(),
        icon: "💻".to_string(),
        phases: vec![
            WorkflowPhase {
                id: "planning".to_string(),
                name: "Planning".to_string(),
                emoji: "📋".to_string(),
                phase_type: PhaseType::Planning,
                prompt_template: "You are the project manager. A new project has been created with the following requirements:\n\n\
                    ---\n{{requirements}}\n---\n\n\
                    Your team members are: {{agent_names}}\n\n\
                    **STEP 1 -- THINK**: Before creating the plan, think step-by-step:\n\
                    - What is the project TYPE? (web app / API / CLI / mobile / library / other)\n\
                    - What are the core features vs nice-to-haves?\n\
                    - What are the technical risks or unknowns?\n\
                    - What is the right build order (dependencies first)?\n\n\
                    **STEP 2 -- FORMAL REQUIREMENTS**: Write 3-8 formal requirements using EARS syntax:\n\
                    - `WHEN [trigger] THEN the system SHALL [behavior]`\n\
                    - `IF [condition] THEN the system SHALL [behavior]`\n\
                    - `The system SHALL [behavior]` (for unconditional requirements)\n\n\
                    **STEP 3 -- IMPLEMENTATION PLAN**: Create a structured JSON plan.\n\
                    You MUST respond with a JSON code block:\n\n\
                    ```json\n\
                    {{\n\
                      \"project_type\": \"web_app\",\n\
                      \"epics\": [\n\
                        {{\n\
                          \"title\": \"Epic Name\",\n\
                          \"description\": \"What this epic covers\",\n\
                          \"priority\": 2,\n\
                          \"stories\": [\n\
                            {{\n\
                              \"title\": \"User Story Title\",\n\
                              \"description\": \"As a user, I want to...\",\n\
                              \"story_points\": 3,\n\
                              \"tasks\": [\n\
                                {{\n\
                                  \"title\": \"Task name\",\n\
                                  \"description\": \"Actionable prompt: Create/modify [file] to implement [feature] by...\",\n\
                                  \"estimated_minutes\": 15\n\
                                }}\n\
                              ]\n\
                            }}\n\
                          ]\n\
                        }}\n\
                      ]\n\
                    }}\n\
                    ```\n\n\
                    Rules:\n\
                    - Break into 2-5 epics\n\
                    - Each epic has 2-5 stories\n\
                    - Each story has 1-5 tasks with actionable titles\n\
                    - Priority: 0=low, 1=medium, 2=high, 3=critical\n\
                    - Include testing tasks\n\
                    - Task descriptions MUST be written as actionable prompts (a coding AI should be able to execute each task directly)\n\
                    - Include ONLY what the requirements ask for -- do NOT add unrequested features\n\
                    - You MUST include the JSON block in your response\n\
                    - You may also include explanatory text and the EARS requirements around it".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "design".to_string(),
                name: "Design".to_string(),
                emoji: "🎨".to_string(),
                phase_type: PhaseType::Collaborative,
                prompt_template: "The project requirements are:\n{{requirements}}\n\n\
                    **THINK** step-by-step before proposing:\n\
                    - What components/modules are needed?\n\
                    - What are the data flows between them?\n\
                    - What could go wrong? What error cases exist?\n\n\
                    Then propose your design using this structure:\n\n\
                    ## Architecture Overview\n\
                    Describe the overall architecture (include a Mermaid diagram if helpful).\n\n\
                    ## Components & Interfaces\n\
                    List each component/module, its responsibility, and its interfaces.\n\n\
                    ## Data Models\n\
                    Define key data structures, schemas, or types.\n\n\
                    ## API Contracts\n\
                    If applicable, define endpoints: method, path, request/response shape.\n\n\
                    ## File Plan\n\
                    List ALL files you plan to create or modify:\n\
                    - [NEW] `path/to/file.ext` -- description\n\
                    - [MODIFY] `path/to/existing.ext` -- what changes\n\n\
                    ## Error Handling Strategy\n\
                    How will errors be handled and reported?\n\n\
                    Do NOT include actual code -- only architecture, models, and interfaces.".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "development".to_string(),
                name: "Development".to_string(),
                emoji: "⚡".to_string(),
                phase_type: PhaseType::Execution,
                prompt_template: "You are working on the project '{{project_name}}'. The workspace directory is:\n\
                    {{workspace_path}}\n\n\
                    **BEFORE writing code, THINK:**\n\
                    - What files already exist in the workspace? (respect existing structure)\n\
                    - What dependencies/imports will you need? (only use packages from the project dependency file)\n\
                    - Follow the design plan and API contracts from the previous phase exactly\n\n\
                    **RULES:**\n\
                    - Build ONLY what is in the requirements -- do NOT add unrequested features, fallbacks, or edge cases\n\
                    - Each file MUST be <=400 lines. Break larger features into multiple files\n\
                    - All imports must reference real, available packages\n\
                    - Include proper error handling for all failure paths\n\
                    - Annotate key changes with `// <CHANGE> description` comments\n\n\
                    **OUTPUT FORMAT -- each file with a FILE: marker:**\n\n\
                    **File: `path/to/filename.ext`**\n\
                    ```language\n\
                    // FILE: path/to/filename.ext\n\
                    <your complete code here>\n\
                    ```\n\n\
                    Requirements:\n{{requirements}}\n\n\
                    Create ALL necessary files. Every file must have the FILE: marker. \
                    Write REAL, COMPLETE, PRODUCTION-READY code.".to_string(),
                manager_prompt: None,
                saves_files: true,
            },
            WorkflowPhase {
                id: "testing".to_string(),
                name: "Testing".to_string(),
                emoji: "🔍".to_string(),
                phase_type: PhaseType::Review,
                prompt_template: "Please review @{{reviewee_name}}'s implementation for the project.\n\n\
                    **Follow this review protocol:**\n\
                    1. **Root cause analysis** - Look for the actual source of issues, not just symptoms\n\
                    2. **Check imports & dependencies** - Are all imports valid? Are packages actually available?\n\
                    3. **Verify API contracts** - Do endpoints, request/response shapes match the design?\n\
                    4. **Check error handling** - Is every failure path handled? Are errors informative?\n\
                    5. **Security check** - Any injection risks, exposed secrets, missing auth?\n\
                    6. **Code quality** - Naming, structure, readability, DRY principle\n\n\
                    **Output your review in this format:**\n\n\
                    ## Verdict: APPROVED / CHANGES REQUESTED\n\n\
                    ### Critical Issues (blocks deployment)\n\
                    - (list or None)\n\n\
                    ### Major Issues (bugs/missing features)\n\
                    - (list or None)\n\n\
                    ### Minor Issues (style/naming/suggestions)\n\
                    - (list or None)\n\n\
                    ### What Went Well\n\
                    - (positive feedback)\n\n\
                    Be thorough but constructive.".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
        ],
        board_labels: BoardLabels {
            level1: "Epics".to_string(),
            level2: "Stories".to_string(),
            level3: "Tasks".to_string(),
            iteration: "Sprints".to_string(),
        },
        output_types: vec!["code_files".to_string(), "documents".to_string()],
        recommended_roles: vec![
            "senior-architect".to_string(),
            "fullstack-developer".to_string(),
            "backend-engineer".to_string(),
            "frontend-engineer".to_string(),
            "qa-engineer".to_string(),
            "devops-engineer".to_string(),
            "engineering-manager".to_string(),
        ],
        status_mapping: StatusMapping {
            phase_start: [
                ("planning".to_string(), "todo".to_string()),
                ("design".to_string(), "in_progress".to_string()),
                ("development".to_string(), "in_progress".to_string()),
                ("testing".to_string(), "review".to_string()),
            ].into_iter().collect(),
            phase_complete: [
                ("planning".to_string(), "todo".to_string()),
                ("design".to_string(), "in_progress".to_string()),
                ("development".to_string(), "review".to_string()),
                ("testing".to_string(), "done".to_string()),
            ].into_iter().collect(),
        },
        report_sections: vec![
            ReportSection { id: "built".to_string(), title: "What Was Built".to_string(), emoji: "📦".to_string() },
            ReportSection { id: "coverage".to_string(), title: "Requirement Coverage".to_string(), emoji: "📊".to_string() },
            ReportSection { id: "files".to_string(), title: "Files Created".to_string(), emoji: "📂".to_string() },
            ReportSection { id: "architecture".to_string(), title: "Architecture".to_string(), emoji: "🏗️".to_string() },
            ReportSection { id: "tech_stack".to_string(), title: "Tech Stack & Dependencies".to_string(), emoji: "🛠️".to_string() },
            ReportSection { id: "how_to_run".to_string(), title: "How to Run".to_string(), emoji: "🚀".to_string() },
            ReportSection { id: "verification".to_string(), title: "Verification Summary".to_string(), emoji: "✅".to_string() },
            ReportSection { id: "next_steps".to_string(), title: "Next Steps".to_string(), emoji: "📋".to_string() },
        ],
        final_report_prompt: "The project '{{project_name}}' is now COMPLETE. All phases are done.\n\n\
            You are presenting this to the HUMAN PROJECT OWNER. Generate a clear **Final Deliverables Report**.\n\n\
            Your report MUST include these sections:\n\n\
            ## 📦 What Was Built\nList every feature and component that was implemented. Map each back to the original requirements.\n\n\
            ## 📊 Requirement Coverage\nFor each original requirement, state: ✅ Implemented / ⚠️ Partial / ❌ Not Implemented.\nWhat percentage of requirements are fully covered?\n\n\
            ## 📂 Files Created\nList ALL files created or modified with line counts and brief descriptions.\nUse this format: `path/to/file.ext` (X lines) -- description\n\n\
            ## 🏗️ Architecture\nInclude a Mermaid diagram showing the system architecture and component relationships.\n\n\
            ## 🛠️ Tech Stack & Dependencies\nAll technologies, frameworks, libraries, and their versions.\n\n\
            ## 🚀 How to Run\n**Copy-pasteable** step-by-step instructions:\n1. Install dependencies: (exact commands)\n2. Configure environment: (any env vars needed)\n3. Start the application: (exact commands)\n4. Access at: (URLs/ports)\n\n\
            ## ✅ Verification Summary\nWhat was tested, how it was tested, and the results. Include any code reviews performed.\n\n\
            ## 📋 Next Steps\nPrioritized recommendations for future improvements (P0 = critical, P1 = important, P2 = nice to have).\n\n\
            Be specific and actionable. This is the human's primary way to understand what was delivered.".to_string(),
    }
}

// ─── Marketing Campaign ─────────────────────────────────────────────

fn marketing_campaign_template() -> WorkflowTemplate {
    WorkflowTemplate {
        id: "builtin-marketing-campaign".to_string(),
        name: "Marketing Campaign".to_string(),
        domain: "marketing".to_string(),
        description: "End-to-end marketing campaign: market research, strategy development, content creation, review, and launch planning.".to_string(),
        icon: "📢".to_string(),
        phases: vec![
            WorkflowPhase {
                id: "research".to_string(),
                name: "Research".to_string(),
                emoji: "🔬".to_string(),
                phase_type: PhaseType::Planning,
                prompt_template: "You are the campaign manager. A new marketing campaign has been briefed:\n\n\
                    ---\n{{requirements}}\n---\n\n\
                    Your team members are: {{agent_names}}\n\n\
                    **STEP 1 -- THINK**: Before creating the plan, analyze:\n\
                    - Who is the target audience? (demographics, psychographics, behaviors)\n\
                    - What channels will reach them? (social, email, paid, PR, events, content marketing)\n\
                    - What are competitors doing? What gaps exist?\n\
                    - What is the budget and timeline?\n\
                    - What are the key performance indicators (KPIs)?\n\n\
                    **STEP 2 -- MARKET INSIGHTS**: Write 3-5 formal market insights:\n\
                    - `INSIGHT: [observation] -- IMPLICATION: [what it means for our campaign]`\n\n\
                    **STEP 3 -- CAMPAIGN PLAN**: Create a structured JSON plan.\n\
                    You MUST respond with a JSON code block:\n\n\
                    ```json\n\
                    {{\n\
                      \"project_type\": \"campaign\",\n\
                      \"epics\": [\n\
                        {{\n\
                          \"title\": \"Campaign Stream Name\",\n\
                          \"description\": \"What this campaign stream covers\",\n\
                          \"priority\": 2,\n\
                          \"stories\": [\n\
                            {{\n\
                              \"title\": \"Initiative Title\",\n\
                              \"description\": \"Specific deliverable or milestone\",\n\
                              \"story_points\": 3,\n\
                              \"tasks\": [\n\
                                {{\n\
                                  \"title\": \"Action item\",\n\
                                  \"description\": \"Create [deliverable] for [channel] targeting [audience] with [key message]\",\n\
                                  \"estimated_minutes\": 30\n\
                                }}\n\
                              ]\n\
                            }}\n\
                          ]\n\
                        }}\n\
                      ]\n\
                    }}\n\
                    ```\n\n\
                    Rules:\n\
                    - Break into 2-5 campaign streams\n\
                    - Each stream has 2-5 initiatives\n\
                    - Each initiative has 1-5 action items\n\
                    - Priority: 0=low, 1=medium, 2=high, 3=critical\n\
                    - Include measurement/analytics tasks\n\
                    - Action item descriptions MUST be specific and actionable\n\
                    - Include ONLY what the brief asks for".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "strategy".to_string(),
                name: "Strategy".to_string(),
                emoji: "🎯".to_string(),
                phase_type: PhaseType::Collaborative,
                prompt_template: "The campaign brief is:\n{{requirements}}\n\n\
                    Propose your strategy using this structure:\n\n\
                    ## Target Audience\nDefine segments with personas (demographics, behaviors, pain points).\n\n\
                    ## Channel Strategy\nWhich channels, why, and expected ROI per channel.\n\n\
                    ## Messaging Framework\nKey messages, tone of voice, unique value propositions per audience segment.\n\n\
                    ## Content Plan\nTypes of content needed per channel (blog posts, social media, email sequences, landing pages, etc.).\n\n\
                    ## Timeline\nPhased rollout plan with milestones.\n\n\
                    ## Budget Allocation\nHow to distribute budget across channels and phases.\n\n\
                    ## Success Metrics\nKPIs and measurement approach for each channel.".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "content_creation".to_string(),
                name: "Content Creation".to_string(),
                emoji: "✍️".to_string(),
                phase_type: PhaseType::Execution,
                prompt_template: "Create campaign content for '{{project_name}}'. Workspace: {{workspace_path}}\n\n\
                    Requirements:\n{{requirements}}\n\n\
                    **RULES:**\n\
                    - Follow the approved strategy from the previous phase\n\
                    - Each content piece must have a clear call-to-action\n\
                    - Maintain consistent brand voice across all pieces\n\
                    - Include all metadata (target audience, channel, publish date, KPIs)\n\
                    - Optimize for the target channel (character limits, format, hashtags, etc.)\n\n\
                    **OUTPUT FORMAT -- each deliverable with a FILE: marker:**\n\n\
                    **File: `content/filename.md`**\n\
                    ```markdown\n\
                    // FILE: content/filename.md\n\
                    <content here>\n\
                    ```\n\n\
                    Create ALL campaign deliverables. Every asset must have the FILE: marker.".to_string(),
                manager_prompt: None,
                saves_files: true,
            },
            WorkflowPhase {
                id: "review".to_string(),
                name: "Review".to_string(),
                emoji: "🔍".to_string(),
                phase_type: PhaseType::Review,
                prompt_template: "Review the campaign materials created by @{{reviewee_name}}.\n\n\
                    **Review Protocol:**\n\
                    1. **Brand consistency** - Does it match the brand voice and guidelines?\n\
                    2. **Target audience fit** - Will this resonate with the defined personas?\n\
                    3. **Channel optimization** - Is the content format right for the channel?\n\
                    4. **Call-to-action** - Is it clear and compelling?\n\
                    5. **Legal/compliance** - Any claims that need sourcing? Disclaimers needed?\n\
                    6. **Quality** - Grammar, formatting, visual flow, messaging clarity\n\n\
                    **Output your review in this format:**\n\n\
                    ## Verdict: APPROVED / CHANGES REQUESTED\n\n\
                    ### Critical Issues (blocks launch)\n- (list or None)\n\n\
                    ### Major Issues (weakens campaign effectiveness)\n- (list or None)\n\n\
                    ### Minor Issues (polish/suggestions)\n- (list or None)\n\n\
                    ### What Went Well\n- (positive feedback)".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
        ],
        board_labels: BoardLabels {
            level1: "Campaigns".to_string(),
            level2: "Initiatives".to_string(),
            level3: "Action Items".to_string(),
            iteration: "Waves".to_string(),
        },
        output_types: vec!["documents".to_string(), "content_assets".to_string(), "reports".to_string()],
        recommended_roles: vec![
            "market-researcher".to_string(),
            "content-strategist".to_string(),
            "copywriter".to_string(),
            "seo-specialist".to_string(),
            "campaign-manager".to_string(),
        ],
        status_mapping: StatusMapping {
            phase_start: [
                ("research".to_string(), "todo".to_string()),
                ("strategy".to_string(), "in_progress".to_string()),
                ("content_creation".to_string(), "in_progress".to_string()),
                ("review".to_string(), "review".to_string()),
            ].into_iter().collect(),
            phase_complete: [
                ("research".to_string(), "todo".to_string()),
                ("strategy".to_string(), "in_progress".to_string()),
                ("content_creation".to_string(), "review".to_string()),
                ("review".to_string(), "done".to_string()),
            ].into_iter().collect(),
        },
        report_sections: vec![
            ReportSection { id: "deliverables".to_string(), title: "Campaign Deliverables".to_string(), emoji: "📦".to_string() },
            ReportSection { id: "channels".to_string(), title: "Channel Strategy Summary".to_string(), emoji: "📡".to_string() },
            ReportSection { id: "content".to_string(), title: "Content Inventory".to_string(), emoji: "📂".to_string() },
            ReportSection { id: "timeline".to_string(), title: "Launch Timeline".to_string(), emoji: "📅".to_string() },
            ReportSection { id: "metrics".to_string(), title: "Success Metrics & KPIs".to_string(), emoji: "📊".to_string() },
            ReportSection { id: "next_steps".to_string(), title: "Post-Launch Plan".to_string(), emoji: "📋".to_string() },
        ],
        final_report_prompt: "The marketing campaign '{{project_name}}' is now COMPLETE. All phases are done.\n\n\
            You are presenting this to the HUMAN PROJECT OWNER. Generate a clear **Campaign Deliverables Report**.\n\n\
            Your report MUST include these sections:\n\n\
            ## 📦 Campaign Deliverables\nList every content piece and asset created. Map each back to the original campaign brief.\n\n\
            ## 📊 Strategy Summary\nTarget audience, channels selected, and key messaging framework.\n\n\
            ## 📂 Content Inventory\nList ALL content pieces created with format and target channel.\n\n\
            ## 📅 Launch Timeline\nPhased rollout plan with dates and milestones.\n\n\
            ## 📈 Success Metrics\nKPIs defined, baseline measurements, and tracking approach.\n\n\
            ## 📋 Next Steps\nPost-launch monitoring plan and optimization recommendations.\n\n\
            Be specific and actionable. This is the human's guide to launching and measuring the campaign.".to_string(),
    }
}

// ─── HR Recruitment ──────────────────────────────────────────────────

fn hr_recruitment_template() -> WorkflowTemplate {
    WorkflowTemplate {
        id: "builtin-hr-recruitment".to_string(),
        name: "HR Recruitment & Onboarding".to_string(),
        domain: "hr".to_string(),
        description: "Recruitment workflow: job analysis, sourcing strategy, candidate screening, evaluation, and onboarding planning.".to_string(),
        icon: "👥".to_string(),
        phases: vec![
            WorkflowPhase {
                id: "intake".to_string(),
                name: "Intake".to_string(),
                emoji: "📋".to_string(),
                phase_type: PhaseType::Planning,
                prompt_template: "You are the HR manager. A new recruitment request has been submitted:\n\n\
                    ---\n{{requirements}}\n---\n\n\
                    Your team members are: {{agent_names}}\n\n\
                    **STEP 1 -- ANALYZE**:\n\
                    - What is the role and level (junior/mid/senior/leadership)?\n\
                    - What are the must-have vs nice-to-have qualifications?\n\
                    - What is the expected salary range and budget?\n\
                    - What is the hiring timeline and urgency?\n\
                    - What are the cultural fit requirements?\n\n\
                    **STEP 2 -- JOB REQUIREMENTS**: Write formal requirements:\n\
                    - `MUST HAVE: [qualification/experience]`\n\
                    - `PREFERRED: [qualification/experience]`\n\
                    - `CULTURE FIT: [behavioral indicator]`\n\n\
                    **STEP 3 -- RECRUITMENT PLAN**: Create a structured JSON plan.\n\
                    ```json\n\
                    {{\n\
                      \"project_type\": \"recruitment\",\n\
                      \"epics\": [\n\
                        {{\n\
                          \"title\": \"Recruitment Phase\",\n\
                          \"description\": \"...\",\n\
                          \"priority\": 2,\n\
                          \"stories\": [\n\
                            {{\n\
                              \"title\": \"Milestone\",\n\
                              \"description\": \"...\",\n\
                              \"story_points\": 3,\n\
                              \"tasks\": [\n\
                                {{\n\
                                  \"title\": \"Action step\",\n\
                                  \"description\": \"Specific HR action...\",\n\
                                  \"estimated_minutes\": 30\n\
                                }}\n\
                              ]\n\
                            }}\n\
                          ]\n\
                        }}\n\
                      ]\n\
                    }}\n\
                    ```".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "sourcing".to_string(),
                name: "Sourcing".to_string(),
                emoji: "🔎".to_string(),
                phase_type: PhaseType::Collaborative,
                prompt_template: "The recruitment requirements are:\n{{requirements}}\n\n\
                    Propose your sourcing strategy:\n\n\
                    ## Job Description\nDraft a compelling job description that attracts the right candidates.\n\n\
                    ## Sourcing Channels\nWhich platforms and methods to use (LinkedIn, job boards, referrals, agencies, etc.).\n\n\
                    ## Screening Criteria\nDefine the initial screening rubric (resume keywords, experience thresholds, etc.).\n\n\
                    ## Interview Framework\nStructured interview questions aligned to requirements. Include behavioral and technical questions.\n\n\
                    ## Evaluation Rubric\nScoring framework for comparing candidates objectively.\n\n\
                    ## Diversity & Inclusion\nHow to ensure an inclusive hiring process.".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "screening".to_string(),
                name: "Screening".to_string(),
                emoji: "📝".to_string(),
                phase_type: PhaseType::Execution,
                prompt_template: "Create recruitment materials for '{{project_name}}'. Workspace: {{workspace_path}}\n\n\
                    Requirements:\n{{requirements}}\n\n\
                    **DELIVERABLES:**\n\
                    - Job description document\n\
                    - Screening rubric/scorecard\n\
                    - Interview question bank (behavioral + technical)\n\
                    - Candidate evaluation template\n\
                    - Offer letter template\n\
                    - Onboarding checklist\n\n\
                    **OUTPUT FORMAT:**\n\n\
                    **File: `hr/filename.md`**\n\
                    ```markdown\n\
                    // FILE: hr/filename.md\n\
                    <content here>\n\
                    ```\n\n\
                    Create ALL recruitment documents.".to_string(),
                manager_prompt: None,
                saves_files: true,
            },
            WorkflowPhase {
                id: "evaluation".to_string(),
                name: "Evaluation".to_string(),
                emoji: "⚖️".to_string(),
                phase_type: PhaseType::Review,
                prompt_template: "Review the recruitment materials created by @{{reviewee_name}}.\n\n\
                    **Review Protocol:**\n\
                    1. **Legal compliance** - Are all materials compliant with employment law?\n\
                    2. **Bias check** - Any language that could be exclusionary or biased?\n\
                    3. **Completeness** - Are all required documents present and thorough?\n\
                    4. **Clarity** - Are criteria and rubrics clear and actionable?\n\
                    5. **Alignment** - Do materials match the role requirements?\n\
                    6. **Competitiveness** - Will the job description attract top talent?\n\n\
                    ## Verdict: APPROVED / CHANGES REQUESTED\n\n\
                    ### Critical Issues\n### Major Issues\n### Minor Issues\n### What Went Well".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
        ],
        board_labels: BoardLabels {
            level1: "Positions".to_string(),
            level2: "Candidates".to_string(),
            level3: "Steps".to_string(),
            iteration: "Rounds".to_string(),
        },
        output_types: vec!["documents".to_string(), "reports".to_string()],
        recommended_roles: vec![
            "hr-manager".to_string(),
            "recruiter".to_string(),
            "interview-coordinator".to_string(),
            "compensation-analyst".to_string(),
        ],
        status_mapping: StatusMapping {
            phase_start: [
                ("intake".to_string(), "todo".to_string()),
                ("sourcing".to_string(), "in_progress".to_string()),
                ("screening".to_string(), "in_progress".to_string()),
                ("evaluation".to_string(), "review".to_string()),
            ].into_iter().collect(),
            phase_complete: [
                ("intake".to_string(), "todo".to_string()),
                ("sourcing".to_string(), "in_progress".to_string()),
                ("screening".to_string(), "review".to_string()),
                ("evaluation".to_string(), "done".to_string()),
            ].into_iter().collect(),
        },
        report_sections: vec![
            ReportSection { id: "deliverables".to_string(), title: "Recruitment Deliverables".to_string(), emoji: "📦".to_string() },
            ReportSection { id: "requirements".to_string(), title: "Role Requirements Summary".to_string(), emoji: "📋".to_string() },
            ReportSection { id: "documents".to_string(), title: "Documents Created".to_string(), emoji: "📂".to_string() },
            ReportSection { id: "process".to_string(), title: "Hiring Process Framework".to_string(), emoji: "🔄".to_string() },
            ReportSection { id: "next_steps".to_string(), title: "Next Steps".to_string(), emoji: "📋".to_string() },
        ],
        final_report_prompt: "The recruitment project '{{project_name}}' is now COMPLETE.\n\n\
            Generate a clear **Recruitment Deliverables Report** for the hiring manager.\n\n\
            ## 📦 Deliverables\nList all recruitment materials created.\n\n\
            ## 📋 Role Requirements Summary\nFinal must-have and preferred qualifications.\n\n\
            ## 📂 Documents Created\nList all documents with descriptions.\n\n\
            ## 🔄 Hiring Process\nStep-by-step hiring process from sourcing to offer.\n\n\
            ## 📋 Next Steps\nImmediate actions to begin the recruitment.".to_string(),
    }
}

// ─── Legal Contract Review ───────────────────────────────────────────

fn legal_contract_template() -> WorkflowTemplate {
    WorkflowTemplate {
        id: "builtin-legal-contract".to_string(),
        name: "Legal Contract Review".to_string(),
        domain: "legal".to_string(),
        description: "Contract lifecycle: intake and analysis, clause drafting, compliance review, and finalization.".to_string(),
        icon: "⚖️".to_string(),
        phases: vec![
            WorkflowPhase {
                id: "intake".to_string(),
                name: "Intake".to_string(),
                emoji: "📋".to_string(),
                phase_type: PhaseType::Planning,
                prompt_template: "You are the legal project manager. A new contract matter has been submitted:\n\n\
                    ---\n{{requirements}}\n---\n\n\
                    Your team members are: {{agent_names}}\n\n\
                    **ANALYZE:**\n\
                    - What type of contract is this? (NDA, SaaS, employment, vendor, partnership, etc.)\n\
                    - Who are the parties involved?\n\
                    - What are the key terms to negotiate?\n\
                    - What are the risk areas?\n\
                    - What jurisdictions apply?\n\n\
                    Create a structured JSON plan:\n\
                    ```json\n\
                    {{\n\
                      \"project_type\": \"contract\",\n\
                      \"epics\": [{{ \"title\": \"Contract Section\", \"description\": \"...\", \"priority\": 2, \"stories\": [{{ \"title\": \"Clause\", \"description\": \"...\", \"story_points\": 3, \"tasks\": [{{ \"title\": \"Task\", \"description\": \"...\", \"estimated_minutes\": 15 }}] }}] }}]\n\
                    }}\n\
                    ```".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "analysis".to_string(),
                name: "Analysis".to_string(),
                emoji: "🔍".to_string(),
                phase_type: PhaseType::Collaborative,
                prompt_template: "The contract requirements are:\n{{requirements}}\n\n\
                    Analyze and propose:\n\n\
                    ## Contract Structure\nOutline the sections and clause organization.\n\n\
                    ## Key Terms\nIdentify critical terms, conditions, and negotiation points.\n\n\
                    ## Risk Assessment\nIdentify legal risks, liabilities, and mitigation strategies.\n\n\
                    ## Compliance Requirements\nApplicable laws, regulations, and industry standards.\n\n\
                    ## Precedent Review\nRelevant case law or standard market terms.".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "drafting".to_string(),
                name: "Drafting".to_string(),
                emoji: "📝".to_string(),
                phase_type: PhaseType::Execution,
                prompt_template: "Draft the contract for '{{project_name}}'. Workspace: {{workspace_path}}\n\n\
                    Requirements:\n{{requirements}}\n\n\
                    **RULES:**\n\
                    - Use precise legal language\n\
                    - Include all standard clauses (definitions, term, termination, etc.)\n\
                    - Mark negotiable terms with [NEGOTIABLE]\n\
                    - Include comments explaining each clause purpose\n\n\
                    **OUTPUT FORMAT:**\n\
                    **File: `legal/contract-name.md`**\n\
                    ```markdown\n\
                    // FILE: legal/contract-name.md\n\
                    <contract content>\n\
                    ```".to_string(),
                manager_prompt: None,
                saves_files: true,
            },
            WorkflowPhase {
                id: "review".to_string(),
                name: "Review".to_string(),
                emoji: "⚖️".to_string(),
                phase_type: PhaseType::Review,
                prompt_template: "Review the contract drafted by @{{reviewee_name}}.\n\n\
                    **Review Protocol:**\n\
                    1. **Legal accuracy** - Are all clauses legally sound?\n\
                    2. **Completeness** - Are standard clauses present?\n\
                    3. **Risk exposure** - Any clauses that create undue liability?\n\
                    4. **Compliance** - Does it meet regulatory requirements?\n\
                    5. **Clarity** - Is the language clear and unambiguous?\n\
                    6. **Balance** - Are terms fair to all parties?\n\n\
                    ## Verdict: APPROVED / CHANGES REQUESTED\n\n\
                    ### Critical Issues\n### Major Issues\n### Minor Issues\n### What Went Well".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
        ],
        board_labels: BoardLabels {
            level1: "Matters".to_string(),
            level2: "Clauses".to_string(),
            level3: "Tasks".to_string(),
            iteration: "Milestones".to_string(),
        },
        output_types: vec!["documents".to_string(), "contracts".to_string()],
        recommended_roles: vec![
            "legal-analyst".to_string(),
            "contract-drafter".to_string(),
            "compliance-reviewer".to_string(),
            "legal-manager".to_string(),
        ],
        status_mapping: StatusMapping {
            phase_start: [
                ("intake".to_string(), "todo".to_string()),
                ("analysis".to_string(), "in_progress".to_string()),
                ("drafting".to_string(), "in_progress".to_string()),
                ("review".to_string(), "review".to_string()),
            ].into_iter().collect(),
            phase_complete: [
                ("intake".to_string(), "todo".to_string()),
                ("analysis".to_string(), "in_progress".to_string()),
                ("drafting".to_string(), "review".to_string()),
                ("review".to_string(), "done".to_string()),
            ].into_iter().collect(),
        },
        report_sections: vec![
            ReportSection { id: "deliverables".to_string(), title: "Contract Deliverables".to_string(), emoji: "📦".to_string() },
            ReportSection { id: "terms".to_string(), title: "Key Terms Summary".to_string(), emoji: "📋".to_string() },
            ReportSection { id: "risks".to_string(), title: "Risk Assessment".to_string(), emoji: "⚠️".to_string() },
            ReportSection { id: "compliance".to_string(), title: "Compliance Status".to_string(), emoji: "✅".to_string() },
            ReportSection { id: "next_steps".to_string(), title: "Next Steps".to_string(), emoji: "📋".to_string() },
        ],
        final_report_prompt: "The contract review '{{project_name}}' is now COMPLETE.\n\n\
            Generate a **Contract Deliverables Report**.\n\n\
            ## 📦 Deliverables\nAll contract documents drafted.\n\n\
            ## 📋 Key Terms Summary\nCritical terms, conditions, and negotiation points.\n\n\
            ## ⚠️ Risk Assessment\nIdentified risks and mitigations.\n\n\
            ## ✅ Compliance\nRegulatory compliance status.\n\n\
            ## 📋 Next Steps\nReview cycle, signing process, and execution plan.".to_string(),
    }
}

// ─── Financial Analysis ──────────────────────────────────────────────

fn financial_analysis_template() -> WorkflowTemplate {
    WorkflowTemplate {
        id: "builtin-financial-analysis".to_string(),
        name: "Financial Analysis".to_string(),
        domain: "finance".to_string(),
        description: "Financial workflow: data collection, analysis, modeling, reporting, and presentation.".to_string(),
        icon: "💰".to_string(),
        phases: vec![
            WorkflowPhase {
                id: "data_collection".to_string(),
                name: "Data Collection".to_string(),
                emoji: "📊".to_string(),
                phase_type: PhaseType::Planning,
                prompt_template: "You are the finance manager. A new financial analysis project:\n\n\
                    ---\n{{requirements}}\n---\n\n\
                    Team: {{agent_names}}\n\n\
                    **ANALYZE:**\n\
                    - What type of analysis? (budget review, investment analysis, cost optimization, forecasting, etc.)\n\
                    - What data sources are needed?\n\
                    - What is the time period?\n\
                    - Who are the stakeholders and what decisions will this inform?\n\n\
                    Create a structured JSON plan with work items.".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "analysis".to_string(),
                name: "Analysis".to_string(),
                emoji: "📈".to_string(),
                phase_type: PhaseType::Collaborative,
                prompt_template: "The financial analysis requirements are:\n{{requirements}}\n\n\
                    Propose your analysis approach:\n\n\
                    ## Data Sources & Assumptions\n## Methodology\n## Key Metrics\n## Risk Factors\n## Sensitivity Analysis Plan".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "modeling".to_string(),
                name: "Modeling".to_string(),
                emoji: "🔢".to_string(),
                phase_type: PhaseType::Execution,
                prompt_template: "Create financial analysis documents for '{{project_name}}'. Workspace: {{workspace_path}}\n\n\
                    Requirements:\n{{requirements}}\n\n\
                    Create all financial models, projections, and analysis documents.\n\n\
                    **OUTPUT FORMAT:**\n\
                    **File: `finance/filename.md`**\n\
                    ```markdown\n\
                    // FILE: finance/filename.md\n\
                    <content>\n\
                    ```".to_string(),
                manager_prompt: None,
                saves_files: true,
            },
            WorkflowPhase {
                id: "reporting".to_string(),
                name: "Reporting".to_string(),
                emoji: "📑".to_string(),
                phase_type: PhaseType::Review,
                prompt_template: "Review the financial analysis by @{{reviewee_name}}.\n\n\
                    **Review Protocol:**\n\
                    1. **Accuracy** - Are calculations correct?\n\
                    2. **Assumptions** - Are assumptions reasonable and documented?\n\
                    3. **Completeness** - Are all required analyses included?\n\
                    4. **Methodology** - Is the approach sound?\n\
                    5. **Presentation** - Is it clear for stakeholders?\n\
                    6. **Risk coverage** - Are risks properly quantified?\n\n\
                    ## Verdict: APPROVED / CHANGES REQUESTED".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
        ],
        board_labels: BoardLabels {
            level1: "Reports".to_string(),
            level2: "Sections".to_string(),
            level3: "Items".to_string(),
            iteration: "Quarters".to_string(),
        },
        output_types: vec!["documents".to_string(), "reports".to_string(), "spreadsheets".to_string()],
        recommended_roles: vec![
            "financial-analyst".to_string(),
            "data-specialist".to_string(),
            "risk-modeler".to_string(),
            "finance-manager".to_string(),
        ],
        status_mapping: StatusMapping {
            phase_start: [
                ("data_collection".to_string(), "todo".to_string()),
                ("analysis".to_string(), "in_progress".to_string()),
                ("modeling".to_string(), "in_progress".to_string()),
                ("reporting".to_string(), "review".to_string()),
            ].into_iter().collect(),
            phase_complete: [
                ("data_collection".to_string(), "todo".to_string()),
                ("analysis".to_string(), "in_progress".to_string()),
                ("modeling".to_string(), "review".to_string()),
                ("reporting".to_string(), "done".to_string()),
            ].into_iter().collect(),
        },
        report_sections: vec![
            ReportSection { id: "deliverables".to_string(), title: "Analysis Deliverables".to_string(), emoji: "📦".to_string() },
            ReportSection { id: "findings".to_string(), title: "Key Findings".to_string(), emoji: "📊".to_string() },
            ReportSection { id: "recommendations".to_string(), title: "Recommendations".to_string(), emoji: "💡".to_string() },
            ReportSection { id: "next_steps".to_string(), title: "Next Steps".to_string(), emoji: "📋".to_string() },
        ],
        final_report_prompt: "The financial analysis '{{project_name}}' is COMPLETE.\n\n\
            Generate a **Financial Analysis Report**.\n\n\
            ## 📦 Deliverables\n## 📊 Key Findings\n## 💡 Recommendations\n## 📋 Next Steps".to_string(),
    }
}

// ─── Healthcare Operations ───────────────────────────────────────────

fn healthcare_operations_template() -> WorkflowTemplate {
    WorkflowTemplate {
        id: "builtin-healthcare-ops".to_string(),
        name: "Healthcare Operations".to_string(),
        domain: "healthcare".to_string(),
        description: "Healthcare workflow: assessment, protocol planning, implementation, monitoring, and quality evaluation.".to_string(),
        icon: "🏥".to_string(),
        phases: vec![
            WorkflowPhase {
                id: "assessment".to_string(),
                name: "Assessment".to_string(),
                emoji: "🔬".to_string(),
                phase_type: PhaseType::Planning,
                prompt_template: "You are the operations manager. A new healthcare operations project:\n\n\
                    ---\n{{requirements}}\n---\n\n\
                    Team: {{agent_names}}\n\n\
                    **ANALYZE:**\n\
                    - What is the scope? (clinical protocol, operational improvement, compliance, quality initiative)\n\
                    - What are the regulatory requirements?\n\
                    - Who are the stakeholders (clinical staff, patients, administrators)?\n\
                    - What are the quality metrics and targets?\n\
                    - What are the patient safety considerations?\n\n\
                    Create a structured JSON plan.".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "planning".to_string(),
                name: "Planning".to_string(),
                emoji: "📋".to_string(),
                phase_type: PhaseType::Collaborative,
                prompt_template: "The healthcare operations requirements are:\n{{requirements}}\n\n\
                    Propose your approach:\n\n\
                    ## Clinical/Operational Framework\n## Compliance & Regulatory Alignment\n## Stakeholder Impact Analysis\n## Implementation Timeline\n## Quality Metrics & Monitoring Plan\n## Risk Mitigation".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "implementation".to_string(),
                name: "Implementation".to_string(),
                emoji: "⚡".to_string(),
                phase_type: PhaseType::Execution,
                prompt_template: "Create healthcare operations documents for '{{project_name}}'. Workspace: {{workspace_path}}\n\n\
                    Requirements:\n{{requirements}}\n\n\
                    Create all protocols, procedures, checklists, and training materials.\n\n\
                    **OUTPUT FORMAT:**\n\
                    **File: `healthcare/filename.md`**\n\
                    ```markdown\n\
                    // FILE: healthcare/filename.md\n\
                    <content>\n\
                    ```".to_string(),
                manager_prompt: None,
                saves_files: true,
            },
            WorkflowPhase {
                id: "monitoring".to_string(),
                name: "Quality Review".to_string(),
                emoji: "📊".to_string(),
                phase_type: PhaseType::Review,
                prompt_template: "Review the healthcare materials by @{{reviewee_name}}.\n\n\
                    **Review Protocol:**\n\
                    1. **Patient safety** - Are all safety protocols adequate?\n\
                    2. **Regulatory compliance** - Meets all applicable regulations?\n\
                    3. **Clinical accuracy** - Is medical/clinical information correct?\n\
                    4. **Completeness** - All required protocols and procedures present?\n\
                    5. **Feasibility** - Can staff realistically follow these procedures?\n\
                    6. **Quality metrics** - Are measurement criteria clear and actionable?\n\n\
                    ## Verdict: APPROVED / CHANGES REQUESTED".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
        ],
        board_labels: BoardLabels {
            level1: "Programs".to_string(),
            level2: "Protocols".to_string(),
            level3: "Tasks".to_string(),
            iteration: "Cycles".to_string(),
        },
        output_types: vec!["documents".to_string(), "protocols".to_string(), "reports".to_string()],
        recommended_roles: vec![
            "clinical-analyst".to_string(),
            "protocol-designer".to_string(),
            "quality-monitor".to_string(),
            "operations-manager".to_string(),
        ],
        status_mapping: StatusMapping {
            phase_start: [
                ("assessment".to_string(), "todo".to_string()),
                ("planning".to_string(), "in_progress".to_string()),
                ("implementation".to_string(), "in_progress".to_string()),
                ("monitoring".to_string(), "review".to_string()),
            ].into_iter().collect(),
            phase_complete: [
                ("assessment".to_string(), "todo".to_string()),
                ("planning".to_string(), "in_progress".to_string()),
                ("implementation".to_string(), "review".to_string()),
                ("monitoring".to_string(), "done".to_string()),
            ].into_iter().collect(),
        },
        report_sections: vec![
            ReportSection { id: "deliverables".to_string(), title: "Deliverables".to_string(), emoji: "📦".to_string() },
            ReportSection { id: "protocols".to_string(), title: "Protocols & Procedures".to_string(), emoji: "📋".to_string() },
            ReportSection { id: "compliance".to_string(), title: "Compliance Status".to_string(), emoji: "✅".to_string() },
            ReportSection { id: "next_steps".to_string(), title: "Next Steps".to_string(), emoji: "📋".to_string() },
        ],
        final_report_prompt: "The healthcare project '{{project_name}}' is COMPLETE.\n\n\
            Generate a **Healthcare Operations Report**.\n\n\
            ## 📦 Deliverables\n## 📋 Protocols & Procedures\n## ✅ Compliance Status\n## 📋 Next Steps".to_string(),
    }
}

// ─── Education & Training ────────────────────────────────────────────

fn education_training_template() -> WorkflowTemplate {
    WorkflowTemplate {
        id: "builtin-education-training".to_string(),
        name: "Education & Training".to_string(),
        domain: "education".to_string(),
        description: "Training workflow: needs analysis, curriculum design, content development, review, and deployment.".to_string(),
        icon: "📚".to_string(),
        phases: vec![
            WorkflowPhase {
                id: "needs_analysis".to_string(),
                name: "Needs Analysis".to_string(),
                emoji: "🔬".to_string(),
                phase_type: PhaseType::Planning,
                prompt_template: "You are the training manager. New training program request:\n\n\
                    ---\n{{requirements}}\n---\n\n\
                    Team: {{agent_names}}\n\n\
                    **ANALYZE:**\n\
                    - Who is the target audience and what are their skill levels?\n\
                    - What are the learning objectives?\n\
                    - What is the preferred delivery format (self-paced, instructor-led, blended)?\n\
                    - What are the success metrics?\n\
                    - What is the timeline and budget?\n\n\
                    Create a structured JSON plan.".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "curriculum_design".to_string(),
                name: "Curriculum Design".to_string(),
                emoji: "📐".to_string(),
                phase_type: PhaseType::Collaborative,
                prompt_template: "The training requirements are:\n{{requirements}}\n\n\
                    Propose your curriculum:\n\n\
                    ## Learning Objectives\n## Module Structure\n## Assessment Strategy\n## Delivery Methods\n## Materials Needed\n## Timeline".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "content_development".to_string(),
                name: "Content Development".to_string(),
                emoji: "✍️".to_string(),
                phase_type: PhaseType::Execution,
                prompt_template: "Create training materials for '{{project_name}}'. Workspace: {{workspace_path}}\n\n\
                    Requirements:\n{{requirements}}\n\n\
                    Create all course materials, assessments, and facilitator guides.\n\n\
                    **OUTPUT FORMAT:**\n\
                    **File: `training/filename.md`**\n\
                    ```markdown\n\
                    // FILE: training/filename.md\n\
                    <content>\n\
                    ```".to_string(),
                manager_prompt: None,
                saves_files: true,
            },
            WorkflowPhase {
                id: "pilot".to_string(),
                name: "Review".to_string(),
                emoji: "🔍".to_string(),
                phase_type: PhaseType::Review,
                prompt_template: "Review the training materials by @{{reviewee_name}}.\n\n\
                    **Review Protocol:**\n\
                    1. **Learning alignment** - Do materials achieve stated learning objectives?\n\
                    2. **Engagement** - Will learners find the content engaging and relevant?\n\
                    3. **Accuracy** - Is all content accurate and up-to-date?\n\
                    4. **Accessibility** - Are materials accessible to all target learners?\n\
                    5. **Assessment validity** - Do assessments actually measure learning objectives?\n\
                    6. **Practical applicability** - Can learners apply this in real situations?\n\n\
                    ## Verdict: APPROVED / CHANGES REQUESTED".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
        ],
        board_labels: BoardLabels {
            level1: "Courses".to_string(),
            level2: "Modules".to_string(),
            level3: "Lessons".to_string(),
            iteration: "Terms".to_string(),
        },
        output_types: vec!["documents".to_string(), "course_materials".to_string(), "assessments".to_string()],
        recommended_roles: vec![
            "instructional-designer".to_string(),
            "content-developer".to_string(),
            "assessment-specialist".to_string(),
            "training-manager".to_string(),
        ],
        status_mapping: StatusMapping {
            phase_start: [
                ("needs_analysis".to_string(), "todo".to_string()),
                ("curriculum_design".to_string(), "in_progress".to_string()),
                ("content_development".to_string(), "in_progress".to_string()),
                ("pilot".to_string(), "review".to_string()),
            ].into_iter().collect(),
            phase_complete: [
                ("needs_analysis".to_string(), "todo".to_string()),
                ("curriculum_design".to_string(), "in_progress".to_string()),
                ("content_development".to_string(), "review".to_string()),
                ("pilot".to_string(), "done".to_string()),
            ].into_iter().collect(),
        },
        report_sections: vec![
            ReportSection { id: "deliverables".to_string(), title: "Training Deliverables".to_string(), emoji: "📦".to_string() },
            ReportSection { id: "curriculum".to_string(), title: "Curriculum Summary".to_string(), emoji: "📋".to_string() },
            ReportSection { id: "materials".to_string(), title: "Materials Inventory".to_string(), emoji: "📂".to_string() },
            ReportSection { id: "next_steps".to_string(), title: "Next Steps".to_string(), emoji: "📋".to_string() },
        ],
        final_report_prompt: "The training program '{{project_name}}' is COMPLETE.\n\n\
            Generate a **Training Program Report**.\n\n\
            ## 📦 Deliverables\n## 📋 Curriculum Summary\n## 📂 Materials Inventory\n## 📋 Next Steps".to_string(),
    }
}

// ─── General / Custom ────────────────────────────────────────────────

fn general_project_template() -> WorkflowTemplate {
    WorkflowTemplate {
        id: "builtin-general".to_string(),
        name: "General Project".to_string(),
        domain: "general".to_string(),
        description: "Universal workflow for any project type: analyze, plan, execute, review, and deliver.".to_string(),
        icon: "📁".to_string(),
        phases: vec![
            WorkflowPhase {
                id: "analyze".to_string(),
                name: "Analyze".to_string(),
                emoji: "🔬".to_string(),
                phase_type: PhaseType::Planning,
                prompt_template: "You are the project manager. A new project has been submitted:\n\n\
                    ---\n{{requirements}}\n---\n\n\
                    Your team members are: {{agent_names}}\n\n\
                    **STEP 1 -- UNDERSTAND**: Analyze the project requirements:\n\
                    - What is the project type and domain?\n\
                    - What are the key objectives and success criteria?\n\
                    - What are the deliverables?\n\
                    - What are the risks and constraints?\n\
                    - What is the priority order?\n\n\
                    **STEP 2 -- REQUIREMENTS**: Write 3-8 formal requirements:\n\
                    - `MUST: [requirement]`\n\
                    - `SHOULD: [requirement]`\n\
                    - `COULD: [requirement]`\n\n\
                    **STEP 3 -- WORK PLAN**: Create a structured JSON plan:\n\
                    ```json\n\
                    {{\n\
                      \"project_type\": \"general\",\n\
                      \"epics\": [\n\
                        {{\n\
                          \"title\": \"Work Area\",\n\
                          \"description\": \"What this covers\",\n\
                          \"priority\": 2,\n\
                          \"stories\": [\n\
                            {{\n\
                              \"title\": \"Objective\",\n\
                              \"description\": \"Specific goal\",\n\
                              \"story_points\": 3,\n\
                              \"tasks\": [\n\
                                {{\n\
                                  \"title\": \"Action item\",\n\
                                  \"description\": \"Specific, actionable task\",\n\
                                  \"estimated_minutes\": 15\n\
                                }}\n\
                              ]\n\
                            }}\n\
                          ]\n\
                        }}\n\
                      ]\n\
                    }}\n\
                    ```".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "plan".to_string(),
                name: "Plan".to_string(),
                emoji: "📐".to_string(),
                phase_type: PhaseType::Collaborative,
                prompt_template: "The project requirements are:\n{{requirements}}\n\n\
                    Propose your approach:\n\n\
                    ## Approach Overview\nDescribe your strategy and methodology.\n\n\
                    ## Key Components\nList the major components of your deliverable.\n\n\
                    ## Dependencies & Risks\nWhat could go wrong and how to mitigate.\n\n\
                    ## Quality Criteria\nHow to measure success.\n\n\
                    ## Timeline Estimate\nPhased approach with milestones.".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
            WorkflowPhase {
                id: "execute".to_string(),
                name: "Execute".to_string(),
                emoji: "⚡".to_string(),
                phase_type: PhaseType::Execution,
                prompt_template: "Create deliverables for '{{project_name}}'. Workspace: {{workspace_path}}\n\n\
                    Requirements:\n{{requirements}}\n\n\
                    **RULES:**\n\
                    - Follow the approved plan from the previous phase\n\
                    - Be thorough and complete\n\
                    - Include all necessary detail\n\n\
                    **OUTPUT FORMAT -- each deliverable with a FILE: marker:**\n\n\
                    **File: `output/filename.md`**\n\
                    ```markdown\n\
                    // FILE: output/filename.md\n\
                    <content>\n\
                    ```\n\n\
                    Create ALL required deliverables.".to_string(),
                manager_prompt: None,
                saves_files: true,
            },
            WorkflowPhase {
                id: "review".to_string(),
                name: "Review".to_string(),
                emoji: "🔍".to_string(),
                phase_type: PhaseType::Review,
                prompt_template: "Review the deliverables by @{{reviewee_name}}.\n\n\
                    **Review Protocol:**\n\
                    1. **Completeness** - Does it address all requirements?\n\
                    2. **Quality** - Is the work thorough and well-structured?\n\
                    3. **Accuracy** - Is all information correct?\n\
                    4. **Clarity** - Is it understandable by the target audience?\n\
                    5. **Actionability** - Can the recipient act on this?\n\
                    6. **Consistency** - Is it internally consistent?\n\n\
                    ## Verdict: APPROVED / CHANGES REQUESTED\n\n\
                    ### Critical Issues\n### Major Issues\n### Minor Issues\n### What Went Well".to_string(),
                manager_prompt: None,
                saves_files: false,
            },
        ],
        board_labels: BoardLabels {
            level1: "Categories".to_string(),
            level2: "Items".to_string(),
            level3: "Sub-Items".to_string(),
            iteration: "Iterations".to_string(),
        },
        output_types: vec!["documents".to_string(), "reports".to_string()],
        recommended_roles: vec![
            "analyst".to_string(),
            "specialist".to_string(),
            "reviewer".to_string(),
            "project-manager".to_string(),
        ],
        status_mapping: StatusMapping {
            phase_start: [
                ("analyze".to_string(), "todo".to_string()),
                ("plan".to_string(), "in_progress".to_string()),
                ("execute".to_string(), "in_progress".to_string()),
                ("review".to_string(), "review".to_string()),
            ].into_iter().collect(),
            phase_complete: [
                ("analyze".to_string(), "todo".to_string()),
                ("plan".to_string(), "in_progress".to_string()),
                ("execute".to_string(), "review".to_string()),
                ("review".to_string(), "done".to_string()),
            ].into_iter().collect(),
        },
        report_sections: vec![
            ReportSection { id: "deliverables".to_string(), title: "What Was Delivered".to_string(), emoji: "📦".to_string() },
            ReportSection { id: "coverage".to_string(), title: "Requirement Coverage".to_string(), emoji: "📊".to_string() },
            ReportSection { id: "files".to_string(), title: "Files Created".to_string(), emoji: "📂".to_string() },
            ReportSection { id: "quality".to_string(), title: "Quality Assessment".to_string(), emoji: "✅".to_string() },
            ReportSection { id: "next_steps".to_string(), title: "Next Steps".to_string(), emoji: "📋".to_string() },
        ],
        final_report_prompt: "The project '{{project_name}}' is now COMPLETE. All phases are done.\n\n\
            Generate a clear **Final Deliverables Report**.\n\n\
            ## 📦 What Was Delivered\nList every deliverable created. Map each back to the original requirements.\n\n\
            ## 📊 Requirement Coverage\nFor each requirement: ✅ Complete / ⚠️ Partial / ❌ Not Done.\n\n\
            ## 📂 Files Created\nList ALL files created with descriptions.\n\n\
            ## ✅ Quality Assessment\nOverall quality, review feedback, and verification results.\n\n\
            ## 📋 Next Steps\nPrioritized recommendations for future work.".to_string(),
    }
}

// ==================== Tests ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builtin_templates_count() {
        let templates = get_builtin_templates();
        assert_eq!(templates.len(), 8);
    }

    #[test]
    fn test_each_template_has_phases() {
        for template in get_builtin_templates() {
            assert!(!template.phases.is_empty(), "Template {} has no phases", template.name);
            assert!(template.phases.len() >= 3, "Template {} has < 3 phases", template.name);
        }
    }

    #[test]
    fn test_software_dev_template_backward_compat() {
        let t = get_builtin_template("builtin-software-development").unwrap();
        assert_eq!(t.phases.len(), 4);
        assert_eq!(t.phases[0].id, "planning");
        assert_eq!(t.phases[1].id, "design");
        assert_eq!(t.phases[2].id, "development");
        assert_eq!(t.phases[3].id, "testing");
        assert_eq!(t.board_labels.level1, "Epics");
        assert_eq!(t.board_labels.level2, "Stories");
        assert_eq!(t.board_labels.level3, "Tasks");
    }

    #[test]
    fn test_expand_prompt() {
        let template = "Hello {{name}}, your project is {{project_name}}.";
        let mut vars = std::collections::HashMap::new();
        vars.insert("name".to_string(), "Alice".to_string());
        vars.insert("project_name".to_string(), "Widget".to_string());
        let result = expand_prompt(template, &vars);
        assert_eq!(result, "Hello Alice, your project is Widget.");
    }

    #[test]
    fn test_default_template_exists() {
        assert!(get_builtin_template(DEFAULT_TEMPLATE_ID).is_some());
    }

    #[test]
    fn test_unique_template_ids() {
        let templates = get_builtin_templates();
        let mut ids: Vec<&str> = templates.iter().map(|t| t.id.as_str()).collect();
        let original_len = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), original_len, "Duplicate template IDs found");
    }

    #[test]
    fn test_status_mapping_covers_all_phases() {
        for template in get_builtin_templates() {
            for phase in &template.phases {
                assert!(
                    template.status_mapping.phase_start.contains_key(&phase.id),
                    "Template {} missing phase_start mapping for phase {}",
                    template.name, phase.id
                );
                assert!(
                    template.status_mapping.phase_complete.contains_key(&phase.id),
                    "Template {} missing phase_complete mapping for phase {}",
                    template.name, phase.id
                );
            }
        }
    }
}
