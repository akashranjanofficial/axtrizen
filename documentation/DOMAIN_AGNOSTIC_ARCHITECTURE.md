# Domain-Agnostic Workflow Architecture

## Vision

Transform Axtrizen from a software-development-only tool into a **universal AI workforce platform** that works for any profession — HR, marketing, finance, legal, healthcare, operations, sales, education, and beyond. Scale to 1M+ enterprise users.

## Problem Statement

The current codebase has **85+ hardcoded SDLC assumptions** across 14 files:

| Category                                                        | Impact   | Locations                                           |
| --------------------------------------------------------------- | -------- | --------------------------------------------------- |
| Fixed 4-phase pipeline (planning→design→development→testing)    | Critical | orchestrator.rs, ProjectsView.tsx, db.rs            |
| Agile board entities (Epic/Story/Task/Sprint)                   | High     | 4 DB tables, Rust structs, TS interfaces, Kanban UI |
| Software-only agent prompts (coding, code review, architecture) | High     | 6 phase prompts in orchestrator.rs                  |
| Software-only role templates (12 engineering roles, 0 other)    | High     | role-templates.ts                                   |
| Software-biased keyword routing                                 | Medium   | discussion-engine.ts, orchestration-engine.ts       |
| Software-specific integrations (git, CI/CD)                     | Lower    | git-integration.ts, cicd-pipeline.ts                |

## Solution: Workflow Templates

### Core Concept

Replace all hardcoded SDLC logic with a **Workflow Template** system. A template defines:

```
WorkflowTemplate {
  id: string
  name: "Software Development" | "Marketing Campaign" | "HR Recruitment" | ...
  domain: "engineering" | "marketing" | "hr" | "legal" | "finance" | "healthcare" | "general"
  description: string

  // Ordered phases (replaces hardcoded vec)
  phases: [
    { id: "planning", name: "Planning", emoji: "📋", prompt_template: "..." },
    { id: "design", name: "Design", emoji: "🎨", prompt_template: "..." },
    ...
  ]

  // Board label aliases (frontend display)
  board_labels: {
    level1: "Epics"       // or "Campaigns", "Positions", "Matters"
    level2: "Stories"     // or "Initiatives", "Candidates", "Clauses"
    level3: "Tasks"       // or "Action Items", "Steps", "Tasks"
    iteration: "Sprints"  // or "Waves", "Rounds", "Phases"
  }

  // What phases produce
  output_types: ["code_files", "documents", "reports", "artifacts"]

  // Recommended role template IDs for this workflow
  recommended_roles: ["senior-architect", "fullstack-developer", ...]

  // Phase-to-board-status mapping
  status_mapping: {
    phase_start: { "planning": "todo", "design": "in_progress", ... },
    phase_complete: { "planning": "todo", "design": "in_progress", ... }
  }

  // Final report sections (what the manager summarizes at the end)
  report_sections: [
    { id: "deliverables", title: "What Was Delivered", emoji: "📦" },
    { id: "coverage", title: "Requirement Coverage", emoji: "📊" },
    ...
  ]
}
```

### Built-in Templates

#### 1. Software Development (current behavior, zero regression)

```
Phases: planning → design → development → testing → deployment
Board: Epics → Stories → Tasks → Sprints
Roles: Architect, Full-Stack Dev, Backend, Frontend, QA, DevOps, Security, Manager
Output: code files, architecture docs, test results
```

#### 2. Marketing Campaign

```
Phases: research → strategy → content_creation → review → launch
Board: Campaigns → Initiatives → Action Items → Waves
Roles: Market Researcher, Content Strategist, Copywriter, SEO Specialist, Analytics Expert, Campaign Manager
Output: documents, reports, content assets
```

#### 3. HR Recruitment & Onboarding

```
Phases: intake → sourcing → screening → evaluation → onboarding
Board: Positions → Candidates → Steps → Rounds
Roles: HR Manager, Recruiter, Interview Coordinator, Compensation Analyst, Onboarding Specialist
Output: documents, reports, process checklists
```

#### 4. Legal Contract Review

```
Phases: intake → analysis → drafting → review → finalization
Board: Matters → Clauses → Tasks → Milestones
Roles: Legal Analyst, Contract Drafter, Compliance Reviewer, Risk Assessor, Legal Manager
Output: documents, reports, contract drafts
```

#### 5. Financial Analysis

```
Phases: data_collection → analysis → modeling → reporting → presentation
Board: Reports → Sections → Items → Quarters
Roles: Financial Analyst, Data Specialist, Risk Modeler, Report Writer, Finance Manager
Output: documents, reports, spreadsheets, presentations
```

#### 6. Healthcare Operations

```
Phases: assessment → planning → implementation → monitoring → evaluation
Board: Programs → Protocols → Tasks → Cycles
Roles: Clinical Analyst, Protocol Designer, Implementation Lead, Quality Monitor, Operations Manager
Output: documents, protocols, compliance reports
```

#### 7. Education & Training

```
Phases: needs_analysis → curriculum_design → content_development → pilot → deployment
Board: Courses → Modules → Lessons → Terms
Roles: Instructional Designer, Content Developer, Assessment Specialist, Training Manager
Output: documents, course materials, assessments
```

#### 8. General / Custom

```
Phases: analyze → plan → execute → review → deliver (generic defaults)
Board: Categories → Items → Sub-Items → Iterations
Roles: Analyst, Planner, Executor, Reviewer, Project Manager
Output: documents, reports
```

---

## Implementation Plan

### Layer 1: Database Schema (Migration 7)

```sql
-- Workflow templates (JSON-based for maximum flexibility)
CREATE TABLE IF NOT EXISTS workflow_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT 'general',
    description TEXT,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    template_data TEXT NOT NULL,  -- JSON blob with phases, prompts, board_labels, etc.
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add workflow_template_id to projects
ALTER TABLE projects ADD COLUMN workflow_template_id TEXT
    REFERENCES workflow_templates(id) ON DELETE SET NULL;
```

**Why JSON blob instead of normalized tables?**

- Templates are read-heavy, write-rare (loaded once per execution)
- Schema flexibility — new domains can add custom fields without migrations
- Easier import/export — users can share templates as JSON files
- At 1M users, templates are still small (hundreds, not millions)

### Layer 2: Backend (Rust) — orchestrator.rs Refactor

#### New Types

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowTemplate {
    pub id: String,
    pub name: String,
    pub domain: String,
    pub description: String,
    pub phases: Vec<WorkflowPhase>,
    pub board_labels: BoardLabels,
    pub output_types: Vec<String>,
    pub recommended_roles: Vec<String>,
    pub status_mapping: StatusMapping,
    pub report_sections: Vec<ReportSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowPhase {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub phase_type: PhaseType,        // planning | collaborative | execution | review | delivery
    pub prompt_template: String,       // The LLM prompt with {{variables}}
    pub manager_prompt: Option<String>, // Optional separate manager prompt
    pub saves_files: bool,             // Whether this phase produces files
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PhaseType {
    Planning,      // Manager breaks down work into board items
    Collaborative, // Agents discuss and cross-review (like current design)
    Execution,     // Agents produce deliverables (code, documents, etc.)
    Review,        // Agents review each other's output
    Delivery,      // Final summary / handoff
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardLabels {
    pub level1: String, // "Epics" or "Campaigns" etc.
    pub level2: String, // "Stories" or "Initiatives" etc.
    pub level3: String, // "Tasks" or "Action Items" etc.
    pub iteration: String, // "Sprints" or "Waves" etc.
}
```

#### Generic Phase Runner

Instead of 4 hardcoded functions (`run_planning_phase`, `run_design_phase`, etc.), we have:

```rust
async fn run_phase(
    app: &AppHandle,
    gateway: &GatewayClient,
    state: &Mutex<ExecutionState>,
    cancel: &AtomicBool,
    phase: &WorkflowPhase,
    template: &WorkflowTemplate,
) -> Result<String, String> {
    match phase.phase_type {
        PhaseType::Planning => run_planning_generic(app, gateway, state, cancel, phase, template).await,
        PhaseType::Collaborative => run_collaborative_generic(app, gateway, state, cancel, phase, template).await,
        PhaseType::Execution => run_execution_generic(app, gateway, state, cancel, phase, template).await,
        PhaseType::Review => run_review_generic(app, gateway, state, cancel, phase, template).await,
        PhaseType::Delivery => run_delivery_generic(app, gateway, state, cancel, phase, template).await,
    }
}
```

Each generic runner reads its prompt from `phase.prompt_template` and fills in `{{project_name}}`, `{{requirements}}`, `{{agent_names}}`, `{{workspace_path}}` etc. via simple string replacement.

#### Template Variable System

Prompts in templates use `{{variable}}` placeholders:

```
"You are managing '{{project_name}}'. Requirements:\n{{requirements}}\n\nTeam: {{agent_names}}\n\n{{phase_instructions}}"
```

The orchestrator fills these at runtime. This way, prompt content is stored in the template (editable), not compiled into Rust.

### Layer 3: Frontend Changes

#### Dynamic Phase Bar

```tsx
// Before (hardcoded):
const phaseOrder = [
  "draft",
  "planning",
  "design",
  "development",
  "testing",
  "deployment",
];

// After (from template):
const phaseOrder = useMemo(() => {
  if (!selectedProject?.workflow_template)
    return ["draft", "analyze", "plan", "execute", "review", "deliver"];
  return [
    "draft",
    ...selectedProject.workflow_template.phases.map((p) => p.id),
    "completed",
  ];
}, [selectedProject]);
```

#### Dynamic Board Labels

```tsx
// Before:
<h3>Epics</h3> / <h3>Stories</h3> / <h3>Tasks</h3>

// After (from template):
<h3>{template.board_labels.level1}</h3>
<h3>{template.board_labels.level2}</h3>
<h3>{template.board_labels.level3}</h3>
```

#### Template Picker on Project Creation

New UI component that lets users pick a workflow template (with preview cards showing phases, recommended roles, and domain description).

#### Domain Role Templates

Expand `role-templates.ts` from 12 engineering-only roles to ~40+ roles across all domains.

### Layer 4: Scale Considerations (1M users)

| Concern                      | Solution                                                         |
| ---------------------------- | ---------------------------------------------------------------- |
| Template storage             | JSON in SQLite is fast for reads; templates are tiny (~5KB each) |
| Custom templates per org     | `is_builtin` flag + user/org ownership columns                   |
| Template marketplace         | Future: share/import templates as JSON files                     |
| Phase prompt optimization    | Templates cached in memory once loaded per execution             |
| Multi-domain keyword routing | Load keywords from template, not hardcoded                       |
| Internationalization         | Template `name`/`description` support i18n keys                  |

---

## Migration Strategy (Zero Regression)

1. **Phase A — Add template infrastructure** (no behavior change)
   - Add DB tables + migration
   - Add Rust types
   - Seed built-in "Software Development" template matching current behavior
   - Add `workflow_template_id` to projects (nullable, defaults to software-dev)

2. **Phase B — Refactor orchestrator to be template-driven** (same behavior, new code path)
   - Replace hardcoded `phases` vec with `template.phases`
   - Replace phase match dispatch with `run_phase()` router
   - Move hardcoded prompts into the software-dev template
   - Move `update_board_tasks_for_phase*` to use template status mapping
   - **Test**: Run software-dev project, verify identical behavior

3. **Phase C — Add new domain templates** (new capabilities)
   - Add Marketing, HR, Legal, Finance, Healthcare, Education, General templates
   - Add ~30 new role templates across domains
   - Add template picker UI to project creation

4. **Phase D — Frontend dynamism** (UI flex)
   - Dynamic phase bar from template
   - Dynamic board labels
   - Dynamic keyword routing
   - Domain-aware final report sections

---

## File Change Map

| File                      | Change Type                                               | Effort |
| ------------------------- | --------------------------------------------------------- | ------ |
| `db.rs`                   | Add migration 7 + template CRUD functions                 | Medium |
| `orchestrator.rs`         | Major refactor — generic phase runner + template loading  | High   |
| `commands/planning.rs`    | No schema change — board labels are frontend-only aliases | Low    |
| `commands/projects.rs`    | Add `workflow_template_id` to create/update               | Low    |
| `lib.rs`                  | Register new template commands                            | Low    |
| `ProjectsView.tsx`        | Dynamic phaseOrder + labels                               | Medium |
| `ProjectBoard.tsx`        | Dynamic board labels from template                        | Low    |
| `role-templates.ts`       | Add ~30 new domain roles                                  | Medium |
| `tauri-api.ts`            | Add WorkflowTemplate types                                | Low    |
| `planning-engine.ts`      | Template-aware planning prompts                           | Low    |
| `discussion-engine.ts`    | Template-aware keyword routing                            | Medium |
| `orchestration-engine.ts` | Template-aware intent detection                           | Medium |

**Total**: ~14 files, ~2500 lines of changes

---

## Built-in Template: Software Development (preserves current behavior)

```json
{
  "id": "builtin-software-development",
  "name": "Software Development",
  "domain": "engineering",
  "description": "Full SDLC workflow: planning, architecture design, implementation, code review, and deployment.",
  "phases": [
    {
      "id": "planning",
      "name": "Planning",
      "emoji": "📋",
      "phase_type": "Planning",
      "prompt_template": "...(current planning prompt)...",
      "saves_files": false
    },
    {
      "id": "design",
      "name": "Design",
      "emoji": "🎨",
      "phase_type": "Collaborative",
      "prompt_template": "...(current design prompt)...",
      "saves_files": false
    },
    {
      "id": "development",
      "name": "Development",
      "emoji": "⚡",
      "phase_type": "Execution",
      "prompt_template": "...(current dev prompt)...",
      "saves_files": true
    },
    {
      "id": "testing",
      "name": "Testing",
      "emoji": "🔍",
      "phase_type": "Review",
      "prompt_template": "...(current review prompt)...",
      "saves_files": false
    }
  ],
  "board_labels": {
    "level1": "Epics",
    "level2": "Stories",
    "level3": "Tasks",
    "iteration": "Sprints"
  },
  "output_types": ["code_files", "documents"],
  "status_mapping": {
    "phase_start": {
      "planning": "todo",
      "design": "in_progress",
      "development": "in_progress",
      "testing": "review"
    },
    "phase_complete": {
      "planning": "todo",
      "design": "in_progress",
      "development": "review",
      "testing": "done"
    }
  },
  "report_sections": [
    { "id": "built", "title": "What Was Built", "emoji": "📦" },
    { "id": "coverage", "title": "Requirement Coverage", "emoji": "📊" },
    { "id": "files", "title": "Files Created", "emoji": "📂" },
    { "id": "architecture", "title": "Architecture", "emoji": "🏗️" },
    { "id": "tech_stack", "title": "Tech Stack & Dependencies", "emoji": "🛠️" },
    { "id": "how_to_run", "title": "How to Run", "emoji": "🚀" },
    { "id": "verification", "title": "Verification Summary", "emoji": "✅" },
    { "id": "next_steps", "title": "Next Steps", "emoji": "📋" }
  ]
}
```

## Built-in Template: Marketing Campaign

````json
{
  "id": "builtin-marketing-campaign",
  "name": "Marketing Campaign",
  "domain": "marketing",
  "description": "End-to-end marketing campaign workflow: market research, strategy, content creation, review, and launch planning.",
  "phases": [
    {
      "id": "research",
      "name": "Research",
      "emoji": "🔬",
      "phase_type": "Planning",
      "prompt_template": "You are the campaign manager. Analyze the following campaign brief:\n\n{{requirements}}\n\nTeam: {{agent_names}}\n\nSTEP 1 — THINK:\n- Who is the target audience? (demographics, psychographics, behaviors)\n- What channels will reach them? (social, email, paid, PR, events)\n- What are competitors doing? What gaps exist?\n- What is the budget and timeline?\n\nSTEP 2 — MARKET INSIGHTS:\nSummarize 3-5 key insights about the target market.\n\nSTEP 3 — CAMPAIGN PLAN:\nRespond with a JSON plan:\n```json\n{\"project_type\": \"campaign\", \"epics\": [{\"title\": \"Campaign Area\", \"description\": \"...\", \"priority\": 2, \"stories\": [{\"title\": \"Initiative\", \"description\": \"...\", \"story_points\": 3, \"tasks\": [{\"title\": \"Action item\", \"description\": \"Specific deliverable...\", \"estimated_minutes\": 30}]}]}]}\n```",
      "saves_files": false
    },
    {
      "id": "strategy",
      "name": "Strategy",
      "emoji": "🎯",
      "phase_type": "Collaborative",
      "prompt_template": "The campaign brief is:\n{{requirements}}\n\nPropose your strategy using this structure:\n\n## Target Audience\nDefine segments with personas.\n\n## Channel Strategy\nWhich channels, why, and expected ROI.\n\n## Messaging Framework\nKey messages, tone of voice, unique value propositions.\n\n## Content Plan\nTypes of content needed per channel.\n\n## Timeline\nPhased rollout plan.\n\n## Success Metrics\nKPIs and measurement approach.",
      "saves_files": false
    },
    {
      "id": "content_creation",
      "name": "Content Creation",
      "emoji": "✍️",
      "phase_type": "Execution",
      "prompt_template": "Create campaign content for '{{project_name}}'. Workspace: {{workspace_path}}\n\nRequirements:\n{{requirements}}\n\nRULES:\n- Follow the approved strategy from the previous phase\n- Each content piece must have a clear call-to-action\n- Maintain consistent brand voice across all pieces\n- Include all metadata (target audience, channel, publish date)\n\nOUTPUT FORMAT — each deliverable with a FILE: marker:\n\n**File: `content/filename.md`**\n```markdown\n// FILE: content/filename.md\n<content here>\n```\n\nCreate ALL campaign deliverables.",
      "saves_files": true
    },
    {
      "id": "review",
      "name": "Review",
      "emoji": "🔍",
      "phase_type": "Review",
      "prompt_template": "Review the campaign materials created by @{{reviewee_name}}.\n\n**Review Protocol:**\n1. Brand consistency — Does it match the brand voice and guidelines?\n2. Target audience fit — Will this resonate with the defined personas?\n3. Channel optimization — Is the content format right for the channel?\n4. Call-to-action — Is it clear and compelling?\n5. Legal/compliance — Any claims that need sourcing? Disclaimers needed?\n6. Quality — Grammar, formatting, visual flow\n\n## Verdict: APPROVED / CHANGES REQUESTED\n\n### Critical Issues\n### Major Issues\n### Minor Issues\n### What Went Well",
      "saves_files": false
    },
    {
      "id": "launch",
      "name": "Launch",
      "emoji": "🚀",
      "phase_type": "Delivery",
      "prompt_template": "...",
      "saves_files": false
    }
  ],
  "board_labels": {
    "level1": "Campaigns",
    "level2": "Initiatives",
    "level3": "Action Items",
    "iteration": "Waves"
  },
  "output_types": ["documents", "content_assets", "reports"],
  "recommended_roles": [
    "market-researcher",
    "content-strategist",
    "copywriter",
    "seo-specialist",
    "campaign-manager"
  ],
  "status_mapping": {
    "phase_start": {
      "research": "todo",
      "strategy": "in_progress",
      "content_creation": "in_progress",
      "review": "review"
    },
    "phase_complete": {
      "research": "todo",
      "strategy": "in_progress",
      "content_creation": "review",
      "review": "done"
    }
  },
  "report_sections": [
    { "id": "deliverables", "title": "Campaign Deliverables", "emoji": "📦" },
    { "id": "channels", "title": "Channel Strategy Summary", "emoji": "📡" },
    { "id": "content", "title": "Content Inventory", "emoji": "📂" },
    { "id": "timeline", "title": "Launch Timeline", "emoji": "📅" },
    { "id": "metrics", "title": "Success Metrics & KPIs", "emoji": "📊" },
    { "id": "next_steps", "title": "Post-Launch Plan", "emoji": "📋" }
  ]
}
````

---

## Sequence of Implementation

### Step 1: Add Rust types + DB migration (foundation)

### Step 2: Seed built-in templates

### Step 3: Refactor orchestrator to load and use template

### Step 4: Add template commands to Tauri

### Step 5: Frontend: add template types + picker

### Step 6: Frontend: dynamic phases + board labels

### Step 7: Add domain-specific role templates

### Step 8: Template-aware keyword routing
