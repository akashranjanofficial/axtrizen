# TeamForge AI - Feature Grooming & User Stories

> **SDLC Phase 1 Deliverable** | Version 0.2 (Draft) | 2026-02-06

---

## Table of Contents

1. [Epics Overview](#epics-overview)
2. [Epic 1: Agent Management](#epic-1-agent-management)
3. [Epic 2: Team Management](#epic-2-team-management)
4. [Epic 3: Project Execution](#epic-3-project-execution)
5. [Epic 4: Agent Communication](#epic-4-agent-communication)
6. [Epic 5: Memory System](#epic-5-memory-system)
7. [Epic 6: Platform & Settings](#epic-6-platform--settings)
8. [**Epic 7: AI Manager (Mandatory Orchestrator)**](#epic-7-ai-manager)
9. [**Epic 8: External Channels (Slack/Discord)**](#epic-8-external-channels)
10. [Sprint Mapping](#sprint-mapping)
11. [Dependency Graph](#dependency-graph)
12. [Design System](#design-system)

---

## Epics Overview

| Epic   | Name                          | Priority   | Stories | Total Points |
| ------ | ----------------------------- | ---------- | ------- | ------------ |
| E1     | Agent Management              | **MUST**   | 12      | 42           |
| E2     | Team Management               | **MUST**   | 8       | 31           |
| E3     | Project Execution             | **MUST**   | 10      | 48           |
| E4     | Agent Communication           | **MUST**   | 9       | 38           |
| E5     | Memory System                 | **SHOULD** | 7       | 29           |
| E6     | Platform & Settings           | **MUST**   | 8       | 26           |
| **E7** | **AI Manager (Orchestrator)** | **MUST**   | 8       | 34           |
| **E8** | **External Channels**         | **MUST**   | 5       | 21           |

**Total**: 67 User Stories | 269 Story Points

> ⚠️ **CRITICAL**: AI Manager (E7) is MANDATORY for all teams. External Channels (E8) enables Slack/Discord integration.

---

## Epic 1: Agent Management

> Create, configure, and manage AI agents with role-based templates

### User Stories

#### US-101: Create New Agent

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 3     |

**As a** user  
**I want to** create a new AI agent with a name and role  
**So that** I can add specialized team members to my project

**Acceptance Criteria:**

- [ ] User can enter agent name (2-50 chars, alphanumeric + spaces)
- [ ] User can select a role from dropdown (PM, Architect, Developer, QA, DevOps)
- [ ] Agent is persisted to SQLite database
- [ ] Agent appears in agent list immediately
- [ ] Agent is assigned a unique ID (UUID)
- [ ] Default system prompt is loaded based on role

---

#### US-102: Select Role Template

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 3     |
| **Sprint**   | 3     |

**As a** user  
**I want to** select from predefined role templates  
**So that** I can quickly set up agents with appropriate prompts

**Acceptance Criteria:**

- [ ] Minimum 10 role templates available:
  - Product Manager, Tech Lead, Architect
  - Senior Developer, Junior Developer, Code Reviewer
  - QA Engineer, Security Engineer, DevOps Engineer
  - Business Analyst
- [ ] Each template includes: name, description, system prompt, suggested model
- [ ] Templates loaded from JSON files in `~/.teamforge/templates/roles/`
- [ ] User can preview template before applying

---

#### US-103: Customize Agent Personality

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 5      |
| **Sprint**   | 3      |

**As a** user  
**I want to** customize an agent's personality and behavior  
**So that** it aligns with my team's working style

**Acceptance Criteria:**

- [ ] User can edit AGENTS.md (role instructions)
- [ ] User can edit SOUL.md (personality traits)
- [ ] Changes persist across sessions
- [ ] Syntax highlighting for markdown editing
- [ ] Preview rendered markdown before saving
- [ ] Reset to template defaults option

---

#### US-104: Select AI Model

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 3      |
| **Sprint**   | 3      |

**As a** user  
**I want to** select which AI model each agent uses  
**So that** I can balance cost vs capability per agent

**Acceptance Criteria:**

- [ ] Models available: Claude 3.5 Sonnet, Claude 3 Opus, GPT-4o, GPT-4-turbo
- [ ] Model selection persists per agent
- [ ] Model info shown: name, cost estimate, context window
- [ ] Warning if selected model not configured in settings

---

#### US-105: Delete Agent

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 2     |
| **Sprint**   | 3     |

**As a** user  
**I want to** delete an agent  
**So that** I can remove agents I no longer need

**Acceptance Criteria:**

- [ ] Confirmation dialog before deletion
- [ ] Agent removed from all teams
- [ ] Option to archive (soft delete) vs permanent delete
- [ ] Archived agents can be restored
- [ ] Associated OpenClaw session terminated

---

#### US-106: Duplicate Agent

| Field        | Value |
| ------------ | ----- |
| **Priority** | COULD |
| **Points**   | 2     |
| **Sprint**   | 4     |

**As a** user  
**I want to** duplicate an existing agent configuration  
**So that** I can quickly create similar agents

**Acceptance Criteria:**

- [ ] Creates new agent with "[Original Name] (Copy)" naming
- [ ] All settings copied except name
- [ ] New unique ID assigned
- [ ] Duplicate not added to any team by default

---

#### US-107: View Agent Status

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 3     |
| **Sprint**   | 3     |

**As a** user  
**I want to** see the current status of each agent  
**So that** I know which agents are active/idle/errored

**Acceptance Criteria:**

- [ ] Status indicators: 🟢 Active, 🟡 Idle, 🔴 Error, ⚪ Dormant
- [ ] Last activity timestamp shown
- [ ] Current task (if any) shown
- [ ] Memory usage per agent displayed
- [ ] Click to expand detailed status

---

#### US-108: Agent Activity Log

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 5      |
| **Sprint**   | 6      |

**As a** user  
**I want to** view an agent's activity history  
**So that** I can audit what the agent has done

**Acceptance Criteria:**

- [ ] Chronological list of agent actions
- [ ] Filter by action type (message, task, tool use)
- [ ] Filter by date range
- [ ] Export to JSON/CSV
- [ ] Paginated (50 items per page)

---

#### US-109: Agent Quick Actions

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 3      |
| **Sprint**   | 4      |

**As a** user  
**I want to** perform quick actions on agents  
**So that** I can efficiently manage active agents

**Acceptance Criteria:**

- [ ] Start/Stop agent session
- [ ] Wake dormant agent
- [ ] Clear agent's working memory
- [ ] Reset agent to default state
- [ ] Actions available via right-click menu

---

#### US-110: Import Agent Configuration

| Field        | Value |
| ------------ | ----- |
| **Priority** | COULD |
| **Points**   | 3     |
| **Sprint**   | 5     |

**As a** user  
**I want to** import an agent configuration from file  
**So that** I can share agent setups across installations

**Acceptance Criteria:**

- [ ] Import from JSON file
- [ ] Validate configuration schema
- [ ] Handle conflicts (duplicate names)
- [ ] Preview before import

---

#### US-111: Export Agent Configuration

| Field        | Value |
| ------------ | ----- |
| **Priority** | COULD |
| **Points**   | 2     |
| **Sprint**   | 5     |

**As a** user  
**I want to** export an agent configuration to file  
**So that** I can backup or share my agent setups

**Acceptance Criteria:**

- [ ] Export as JSON
- [ ] Include: name, role, prompts, model, settings
- [ ] Exclude: conversation history, sensitive data

---

#### US-112: Agent Token Usage Tracking

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 3      |
| **Sprint**   | 6      |

**As a** user  
**I want to** track token usage per agent  
**So that** I can monitor AI costs

**Acceptance Criteria:**

- [ ] Track input tokens, output tokens per request
- [ ] Daily/weekly/monthly aggregation
- [ ] Cost estimation based on model pricing
- [ ] Visual chart of usage over time

---

## Epic 2: Team Management

> Create teams, manage hierarchy, and use team templates

### User Stories

#### US-201: Create Team

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 3     |
| **Sprint**   | 4     |

**As a** user  
**I want to** create a team with name and description  
**So that** I can organize agents into logical groups

**Acceptance Criteria:**

- [ ] Team name required (2-50 chars)
- [ ] Description optional (max 500 chars)
- [ ] Team created with unique ID
- [ ] Team appears in team list
- [ ] Empty team allowed (add agents later)

---

#### US-202: Add Agents to Team

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 3     |
| **Sprint**   | 4     |

**As a** user  
**I want to** add agents to a team  
**So that** they can collaborate on projects

**Acceptance Criteria:**

- [ ] Select agents from available agent pool
- [ ] Agent can belong to multiple teams
- [ ] Drag-and-drop agent into team
- [ ] Bulk add multiple agents
- [ ] Validation: warn if agent already in team

---

#### US-203: Remove Agent from Team

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 2     |
| **Sprint**   | 4     |

**As a** user  
**I want to** remove an agent from a team  
**So that** I can adjust team composition

**Acceptance Criteria:**

- [ ] Remove via right-click or button
- [ ] Confirmation if agent has active tasks
- [ ] Agent remains in system (just removed from team)
- [ ] Update team hierarchy if manager removed

---

#### US-204: Define Reporting Hierarchy

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 5      |
| **Sprint**   | 4      |

**As a** user  
**I want to** define who reports to whom in a team  
**So that** agents can escalate and delegate appropriately

**Acceptance Criteria:**

- [ ] Visual hierarchy editor (org chart style)
- [ ] Drag agent under another to set manager
- [ ] One agent can have one manager max
- [ ] One agent can have multiple direct reports
- [ ] Hierarchy stored in DB (manager_id foreign key)

---

#### US-205: Team Templates

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 5      |
| **Sprint**   | 4      |

**As a** user  
**I want to** create a team from a template  
**So that** I can quickly set up common team structures

**Acceptance Criteria:**

- [ ] Minimum 3 built-in templates:
  - **Startup Team**: PM, Full-stack Dev, QA
  - **Enterprise Team**: PM, Architect, 2x Dev, QA, DevOps
  - **Research Team**: Lead Researcher, 2x Analyst
- [ ] Templates define: agents, hierarchy, default prompts
- [ ] Custom templates can be created
- [ ] Templates stored in `~/.teamforge/templates/teams/`

---

#### US-206: Save Team as Template

| Field        | Value |
| ------------ | ----- |
| **Priority** | COULD |
| **Points**   | 3     |
| **Sprint**   | 5     |

**As a** user  
**I want to** save my current team as a reusable template  
**So that** I can recreate similar teams

**Acceptance Criteria:**

- [ ] Save button in team config
- [ ] Enter template name and description
- [ ] Saves agents, hierarchy, prompts
- [ ] Template appears in template list

---

#### US-207: View Team Dashboard

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 5      |
| **Sprint**   | 5      |

**As a** user  
**I want to** see a dashboard for my team  
**So that** I can monitor overall team activity

**Acceptance Criteria:**

- [ ] Shows all team members with status
- [ ] Active tasks per agent
- [ ] Recent messages (last 10)
- [ ] Team hierarchy visualization
- [ ] Quick stats: messages today, tasks completed

---

#### US-208: Delete Team

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 2     |
| **Sprint**   | 4     |

**As a** user  
**I want to** delete a team  
**So that** I can clean up unused teams

**Acceptance Criteria:**

- [ ] Confirmation dialog
- [ ] Agents are NOT deleted (just unassigned)
- [ ] Associated projects warned
- [ ] Soft delete with restore option

---

## Epic 3: Project Execution

> Create projects, assign teams, and execute SDLC workflows

### User Stories

#### US-301: Create Project

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 5     |

**As a** user  
**I want to** create a new project with requirements  
**So that** the AI team can work on it

**Acceptance Criteria:**

- [ ] Project name required
- [ ] Requirements document (rich text editor)
- [ ] Optional: link to external docs
- [ ] Workspace folder created: `~/.teamforge/projects/{id}/`
- [ ] Project state: DRAFT

---

#### US-302: Assign Team to Project

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 3     |
| **Sprint**   | 5     |

**As a** user  
**I want to** assign a team to a project  
**So that** the team can start working

**Acceptance Criteria:**

- [ ] Select team from dropdown
- [ ] One team per project at a time
- [ ] Can change team (with confirmation)
- [ ] Team agents notified of assignment

---

#### US-303: Start Project Execution

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 5     |

**As a** user  
**I want to** start project execution  
**So that** agents begin the SDLC workflow

**Acceptance Criteria:**

- [ ] Start button enabled when team assigned
- [ ] Project moves to REQUIREMENTS phase
- [ ] PM agent receives requirements document
- [ ] PM agent begins user story creation
- [ ] UI shows phase progress indicator

---

#### US-304: View SDLC Phase Progress

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 6     |

**As a** user  
**I want to** see current SDLC phase progress  
**So that** I know where the project stands

**Acceptance Criteria:**

- [ ] Phase indicator: Requirements → Design → Dev → Test → Deploy
- [ ] Current phase highlighted
- [ ] Completed phases marked with ✓
- [ ] Sub-phase progress shown (e.g., Sprint 2/5)
- [ ] Estimated completion date

---

#### US-305: Pause/Resume Project

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 5      |
| **Sprint**   | 6      |

**As a** user  
**I want to** pause and resume project execution  
**So that** I can control when agents are active

**Acceptance Criteria:**

- [ ] Pause button stops all agent activity
- [ ] Agent states preserved
- [ ] Resume continues from exact point
- [ ] UI indicates paused state clearly

---

#### US-306: View Agent Communications

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 8     |
| **Sprint**   | 6     |

**As a** user  
**I want to** view all agent communications in a project  
**So that** I can follow the team's progress

**Acceptance Criteria:**

- [ ] Threaded message view (like Slack)
- [ ] Filter by agent, message type, date
- [ ] Search messages
- [ ] Real-time updates (WebSocket)
- [ ] Message types: Task, Question, Review, Bug, Info
- [ ] @mentions highlighted

---

#### US-307: Inject Human Feedback

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 5      |
| **Sprint**   | 7      |

**As a** user  
**I want to** send messages to agents during execution  
**So that** I can provide guidance or corrections

**Acceptance Criteria:**

- [ ] Message input field in project view
- [ ] Select target agent(s) or broadcast to all
- [ ] Message appears in agent's context
- [ ] Agent acknowledges receipt
- [ ] Priority flag option

---

#### US-308: Approve Phase Deliverables

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 5      |
| **Sprint**   | 7      |

**As a** user  
**I want to** approve or reject phase deliverables  
**So that** I maintain quality control

**Acceptance Criteria:**

- [ ] Notification when phase completes
- [ ] Review deliverables in UI
- [ ] Approve → proceed to next phase
- [ ] Reject → return with feedback
- [ ] Comments/notes on approval

---

#### US-309: View Project Artifacts

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 7     |

**As a** user  
**I want to** view artifacts generated by agents  
**So that** I can see the actual output

**Acceptance Criteria:**

- [ ] File browser for project workspace
- [ ] Preview: markdown, code, images
- [ ] Download artifacts
- [ ] Version history (if available)
- [ ] Link artifacts to creating agent

---

#### US-310: Delete Project

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 2     |
| **Sprint**   | 5     |

**As a** user  
**I want to** delete a project  
**So that** I can clean up completed/abandoned projects

**Acceptance Criteria:**

- [ ] Confirmation dialog with warning
- [ ] Option to archive vs delete
- [ ] Delete removes workspace folder
- [ ] Associated data cleaned up

---

## Epic 4: Agent Communication

> Inter-agent messaging, collaboration, and notifications

### User Stories

#### US-401: Agent-to-Agent Messaging

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 6     |

**As an** agent  
**I want to** send messages to other agents  
**So that** I can collaborate on tasks

**Acceptance Criteria:**

- [ ] Uses OpenClaw `sessions_send` API
- [ ] Message includes: from, to, content, type, timestamp
- [ ] Message stored in local DB for UI
- [ ] Real-time delivery via WebSocket

---

#### US-402: Task Assignment

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 7     |

**As a** manager agent (PM/Tech Lead)  
**I want to** assign tasks to developer agents  
**So that** work gets distributed

**Acceptance Criteria:**

- [ ] Create task with: title, description, priority, assignee
- [ ] Task appears in assignee's queue
- [ ] Status tracking: assigned, in-progress, review, done
- [ ] Due date optional
- [ ] Task linked to project phase

---

#### US-403: Request Code Review

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 3     |
| **Sprint**   | 9     |

**As a** developer agent  
**I want to** request code review from senior developer  
**So that** code quality is maintained

**Acceptance Criteria:**

- [ ] Link to code artifact
- [ ] Reviewer receives notification
- [ ] Review comments supported
- [ ] Approve/Request Changes outcome
- [ ] Review history preserved

---

#### US-404: Escalate Blocker

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 3      |
| **Sprint**   | 7      |

**As an** agent  
**I want to** escalate blockers to my manager  
**So that** issues get resolved

**Acceptance Criteria:**

- [ ] Escalation includes context and proposed solutions
- [ ] Manager notified immediately
- [ ] Human user also notified for critical blockers
- [ ] Escalation tracked in project timeline

---

#### US-405: Request Human Clarification

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 7     |

**As a** PM agent  
**I want to** ask the human user for clarification  
**So that** I can resolve ambiguous requirements

**Acceptance Criteria:**

- [ ] Desktop notification to user
- [ ] Question appears in project message feed
- [ ] User can respond via UI
- [ ] Response delivered to PM agent
- [ ] Timeout handling (remind after X hours)

---

#### US-406: Team Design Discussion

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 5      |
| **Sprint**   | 8      |

**As** agents  
**I want to** participate in multi-agent design discussions  
**So that** we can collaboratively solve problems

**Acceptance Criteria:**

- [ ] Discussion thread with multiple participants
- [ ] @mention specific agents
- [ ] Conclusion/decision recorded
- [ ] Discussion linked to design document
- [ ] Human can observe and intervene

---

#### US-407: Agent Notification System

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 3      |
| **Sprint**   | 6      |

**As an** agent  
**I want to** receive notifications of relevant events  
**So that** I stay informed

**Acceptance Criteria:**

- [ ] Notification types: task assigned, mentioned, review requested
- [ ] Notifications queued for dormant agents
- [ ] Delivered when agent wakes
- [ ] Notification read/unread tracking

---

#### US-408: Message Threading

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 5      |
| **Sprint**   | 6      |

**As a** user  
**I want to** see messages in threaded conversations  
**So that** I can follow related discussions

**Acceptance Criteria:**

- [ ] Reply creates thread under parent
- [ ] Thread collapse/expand
- [ ] Thread summary (N replies)
- [ ] Navigate to original message

---

#### US-409: Message Search

| Field        | Value |
| ------------ | ----- |
| **Priority** | COULD |
| **Points**   | 3     |
| **Sprint**   | 8     |

**As a** user  
**I want to** search through agent messages  
**So that** I can find specific discussions

**Acceptance Criteria:**

- [ ] Full-text search
- [ ] Filter by agent, project, date
- [ ] Results show context snippet
- [ ] Click to navigate to message

---

## Epic 5: Memory System

> Multi-tier memory for agent context and history

### User Stories

#### US-501: Working Memory

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 9     |

**As an** agent  
**I want to** have working memory for current task  
**So that** I maintain context during a conversation

**Acceptance Criteria:**

- [ ] ~200 tokens of immediate context
- [ ] Stored in RAM only
- [ ] Cleared on task completion
- [ ] Managed by agent daemon

---

#### US-502: Short-Term Memory

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 9     |

**As an** agent  
**I want to** retain recent conversation history  
**So that** I remember what happened today/this week

**Acceptance Criteria:**

- [ ] Up to 10,000 messages per agent
- [ ] Stored in SQLite (agents/{id}/history.db)
- [ ] Oldest messages pruned on limit
- [ ] Queryable by date, type, content

---

#### US-503: Long-Term Memory (Vector)

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 8      |
| **Sprint**   | 9      |

**As an** agent  
**I want to** semantically search past interactions  
**So that** I can recall relevant information

**Acceptance Criteria:**

- [ ] Messages embedded as vectors
- [ ] Stored in LanceDB (agents/{id}/vectors/)
- [ ] Semantic search via cosine similarity
- [ ] Top-K retrieval for context injection
- [ ] Background embedding process

---

#### US-504: Episodic Memory

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 5      |
| **Sprint**   | 10     |

**As an** agent  
**I want to** have compressed summaries of past projects  
**So that** I can recall "What did we do 3 months ago?"

**Acceptance Criteria:**

- [ ] Project completion triggers summarization
- [ ] Summary stored in SQLite
- [ ] Includes: key decisions, blockers, outcomes
- [ ] Searchable by project name, date

---

#### US-505: Memory Retrieval for Context

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 10    |

**As an** agent  
**I want to** automatically retrieve relevant memories  
**So that** my responses are contextually aware

**Acceptance Criteria:**

- [ ] Before each LLM call, retrieve relevant memories
- [ ] Combine: working + short-term + vector search
- [ ] Respect token limits
- [ ] Memory source tagged in context

---

#### US-506: Agent Dormancy

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 9     |

**As the** system  
**I want to** put idle agents into dormant mode  
**So that** memory usage stays low

**Acceptance Criteria:**

- [ ] Agent dormant after 5 min inactivity
- [ ] Working memory serialized to disk
- [ ] Memory footprint reduced to ~0.5MB
- [ ] Wake on message/task assignment
- [ ] Wake time < 500ms

---

#### US-507: Memory Dashboard

| Field        | Value |
| ------------ | ----- |
| **Priority** | COULD |
| **Points**   | 3     |
| **Sprint**   | 10    |

**As a** user  
**I want to** see memory usage across agents  
**So that** I can monitor system resources

**Acceptance Criteria:**

- [ ] Per-agent memory breakdown
- [ ] Working/Short-term/Long-term sizes
- [ ] Clear memory option per tier
- [ ] Export memory data

---

## Epic 6: Platform & Settings

> Cross-platform support, settings, and integrations

### User Stories

#### US-601: Cross-Platform Support

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 1-2   |

**As a** user  
**I want to** run the app on Windows, Mac, and Linux  
**So that** I can use my preferred OS

**Acceptance Criteria:**

- [ ] Windows 10+ (64-bit) installer
- [ ] macOS 12+ (Universal binary)
- [ ] Linux (AppImage + .deb)
- [ ] Consistent behavior across platforms
- [ ] Native look and feel

---

#### US-602: Configure API Keys

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 3     |
| **Sprint**   | 2     |

**As a** user  
**I want to** configure my AI provider API keys  
**So that** agents can use AI models

**Acceptance Criteria:**

- [ ] Settings page for API keys
- [ ] Support: Anthropic, OpenAI, OpenRouter
- [ ] Keys stored securely (encrypted)
- [ ] Validate key on save
- [ ] Show which models available per provider

---

#### US-603: Startup Performance

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 3     |
| **Sprint**   | 1     |

**As a** user  
**I want the** app to start in under 100ms  
**So that** I don't wait around

**Acceptance Criteria:**

- [ ] Cold start < 100ms to first paint
- [ ] Lazy load heavy components
- [ ] Splash screen if initialization > 200ms
- [ ] Benchmark in CI

---

#### US-604: Desktop Notifications

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 3      |
| **Sprint**   | 6      |

**As a** user  
**I want to** receive desktop notifications  
**So that** I know when human input is needed

**Acceptance Criteria:**

- [ ] Native OS notifications
- [ ] Notification types: phase complete, question pending, error
- [ ] Click notification → open app
- [ ] Notification settings (enable/disable per type)

---

#### US-605: Cost Tracking Dashboard

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 5      |
| **Sprint**   | 10     |

**As a** user  
**I want to** track AI usage costs  
**So that** I can manage my spending

**Acceptance Criteria:**

- [ ] Track tokens per request
- [ ] Calculate cost based on model pricing
- [ ] Daily/weekly/monthly breakdown
- [ ] Per-agent and per-project costs
- [ ] Export cost report

---

#### US-606: Dark Mode

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 2      |
| **Sprint**   | 5      |

**As a** user  
**I want to** use dark mode  
**So that** I can reduce eye strain

**Acceptance Criteria:**

- [ ] Dark and light theme options
- [ ] System preference auto-detect
- [ ] Persisted preference
- [ ] All UI components themed

---

#### US-607: Preferences Persistence

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 2     |
| **Sprint**   | 2     |

**As a** user  
**I want my** preferences to persist  
**So that** I don't reconfigure on every launch

**Acceptance Criteria:**

- [ ] Settings stored in SQLite
- [ ] Window size/position remembered
- [ ] Last active project remembered
- [ ] Preference migration on upgrade

---

#### US-608: Auto-Update

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 3      |
| **Sprint**   | 11     |

**As a** user  
**I want the** app to auto-update  
**So that** I always have the latest version

**Acceptance Criteria:**

- [ ] Check for updates on startup
- [ ] Prompt to download new version
- [ ] In-place update (Windows/Mac)
- [ ] Release notes shown before update
- [ ] Manual check button in settings

---

## Epic 7: AI Manager (Mandatory Orchestrator)

> **CRITICAL**: Every team MUST have an AI Manager. It is auto-created when a team is formed.

### User Stories

#### US-701: AI Manager Auto-Creation

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 4     |

**As a** user  
**I want** an AI Manager to be automatically created when I create a team  
**So that** there is always a central orchestrator for task management

**Acceptance Criteria:**

- [ ] AI Manager agent created automatically with every new team
- [ ] Cannot be removed from team (protected role)
- [ ] Default prompt loaded from "AI Manager" template
- [ ] Positioned at top of hierarchy by default
- [ ] Visible badge: "🎯 AI Manager" in UI

---

#### US-702: Task Distribution by AI Manager

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 7     |

**As an** AI Manager  
**I want to** receive tasks from human and distribute to appropriate agents  
**So that** work is efficiently delegated

**Acceptance Criteria:**

- [ ] Parse human request for task breakdown
- [ ] Identify required skills/roles
- [ ] Assign subtasks to matching agents
- [ ] Track assignment status
- [ ] Retry assignment if agent unavailable

---

#### US-703: Progress Tracking

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 7     |

**As an** AI Manager  
**I want to** track progress of all assigned tasks  
**So that** I can report status to human

**Acceptance Criteria:**

- [ ] Task board showing: Pending, In Progress, Review, Done
- [ ] Real-time updates from agent messages
- [ ] Auto-detect "done" signals from agents
- [ ] Aggregate progress percentage
- [ ] Alert on stalled tasks (no activity > 30 min)

---

#### US-704: Completion Notification

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 3     |
| **Sprint**   | 7     |

**As an** AI Manager  
**I want to** notify human when tasks complete  
**So that** human stays informed without constant monitoring

**Acceptance Criteria:**

- [ ] Notification on individual task completion
- [ ] Summary notification on all-tasks-complete
- [ ] Notification via: Desktop, Slack, Discord (based on config)
- [ ] Include: task name, time taken, agent who completed

---

#### US-705: Human Override Handling

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 3      |
| **Sprint**   | 8      |

**As an** AI Manager  
**I want to** detect and handle human direct messages to other agents  
**So that** I maintain awareness of all team activity

**Acceptance Criteria:**

- [ ] Observe all messages in team (read-only by default)
- [ ] Log human interventions
- [ ] Update task status if human assigns directly
- [ ] Do not interfere with direct human→agent communication

---

#### US-706: Blocker Escalation

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 3      |
| **Sprint**   | 8      |

**As an** AI Manager  
**I want to** receive blocker escalations from agents  
**So that** I can resolve or escalate to human

**Acceptance Criteria:**

- [ ] Agents escalate via `[BLOCKER]` message type
- [ ] AI Manager attempts resolution first
- [ ] Escalate to human if unresolved after 2 attempts
- [ ] Track blocker resolution time

---

#### US-707: Daily Summary Report

| Field        | Value |
| ------------ | ----- |
| **Priority** | COULD |
| **Points**   | 5     |
| **Sprint**   | 10    |

**As an** AI Manager  
**I want to** generate daily summary reports  
**So that** human has visibility into team productivity

**Acceptance Criteria:**

- [ ] Configurable schedule (daily, weekly)
- [ ] Report includes: tasks completed, in progress, blockers
- [ ] Agent performance metrics
- [ ] Delivered via configured channel
- [ ] Exportable as markdown/PDF

---

#### US-708: AI Manager Configuration

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 5      |
| **Sprint**   | 5      |

**As a** user  
**I want to** configure AI Manager behavior  
**So that** it matches my management style

**Acceptance Criteria:**

- [ ] Notification frequency (immediate, batched, summary)
- [ ] Auto-task-assignment on/off
- [ ] Escalation timeout threshold
- [ ] Personality/communication style

---

## Epic 8: External Channels (Slack/Discord)

> Human can send tasks via Slack/Discord. AI Manager responds in same channel.

### User Stories

#### US-801: Slack Integration

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 8     |
| **Sprint**   | 3     |

**As a** user  
**I want to** connect TeamForge to my Slack workspace  
**So that** I can assign tasks and receive updates via Slack

**Acceptance Criteria:**

- [ ] OAuth 2.0 Slack app installation flow
- [ ] Channel selection for TeamForge messages
- [ ] Slash command: `/teamforge [task]`
- [ ] Messages from TeamForge appear as bot
- [ ] @mention agents in Slack: `@ai-manager build login page`
- [ ] Secure token storage (encrypted)

---

#### US-802: Discord Integration

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 5     |
| **Sprint**   | 3     |

**As a** user  
**I want to** connect TeamForge to my Discord server  
**So that** I can interact with agents via Discord

**Acceptance Criteria:**

- [ ] Discord bot OAuth flow
- [ ] Channel binding (one channel per project)
- [ ] Command prefixes: `!tf` or `@TeamForge`
- [ ] Embed formatting for responses
- [ ] Role-based access control

---

#### US-803: Channel Message Routing

| Field        | Value |
| ------------ | ----- |
| **Priority** | MUST  |
| **Points**   | 3     |
| **Sprint**   | 4     |

**As the** system  
**I want to** route incoming channel messages to AI Manager  
**So that** tasks are processed from any channel

**Acceptance Criteria:**

- [ ] Parse incoming messages for intent
- [ ] Route to AI Manager by default
- [ ] Support `@agent-name` for direct routing
- [ ] Deduplicate cross-channel messages
- [ ] Rate limiting (prevent spam)

---

#### US-804: Response Formatting

| Field        | Value  |
| ------------ | ------ |
| **Priority** | SHOULD |
| **Points**   | 2      |
| **Sprint**   | 4      |

**As an** agent  
**I want to** format responses appropriately for each channel  
**So that** messages look native to Slack/Discord

**Acceptance Criteria:**

- [ ] Slack: Use blocks and attachments
- [ ] Discord: Use embeds
- [ ] Code blocks formatted correctly
- [ ] Long messages split appropriately
- [ ] Files/artifacts shared as attachments

---

#### US-805: Channel Preferences

| Field        | Value |
| ------------ | ----- |
| **Priority** | COULD |
| **Points**   | 3     |
| **Sprint**   | 6     |

**As a** user  
**I want to** configure per-channel preferences  
**So that** I control how TeamForge behaves in different channels

**Acceptance Criteria:**

- [ ] Mute notifications per channel
- [ ] Channel-specific agent routing rules
- [ ] Enable/disable specific features per channel
- [ ] Default reply behavior (thread vs channel)

---

## Sprint Mapping

| Sprint | Weeks | Epics Covered      | Stories                                                | Points |
| ------ | ----- | ------------------ | ------------------------------------------------------ | ------ |
| 1      | 5-6   | E6                 | US-601, US-603, US-607                                 | 10     |
| 2      | 7-8   | E6                 | US-602, OpenClaw Integration                           | 15     |
| 3      | 9-10  | E1, **E8**         | US-101-105, **US-801, US-802**                         | 37     |
| 4      | 11-12 | E1, E2, **E7, E8** | US-106, US-109, US-201-208, **US-701, US-803, US-804** | 40     |
| 5      | 13-14 | E2, E3, E6, **E7** | US-206, US-207, US-301-303, US-310, US-606, **US-708** | 33     |
| 6      | 15-16 | E3, E4, **E8**     | US-304-306, US-401, US-407, US-408, US-604, **US-805** | 42     |
| 7      | 17-18 | E3, E4, **E7**     | US-307-309, US-402, US-404, US-405, **US-702-704**     | 41     |
| 8      | 19-20 | E4, **E7**         | US-403, US-406, US-409, **US-705, US-706**             | 17     |
| 9      | 21-22 | E1, E5             | US-108, US-501-503, US-506                             | 28     |
| 10     | 23-24 | E5, E6, **E7**     | US-504, US-505, US-507, US-605, **US-707**             | 23     |
| 11     | 25-26 | E1, E6             | US-110, US-111, US-112, US-608                         | 11     |

> **Updated Total**: 67 User Stories | 297 Story Points

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Feature Dependency Graph                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                       ┌──────────────────┐                                   │
│                       │ US-601: Platform │                                   │
│                       │    US-603: Perf  │                                   │
│                       └────────┬─────────┘                                   │
│                                │                                             │
│              ┌─────────────────┼─────────────────┐                          │
│              ▼                 ▼                 ▼                          │
│     ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                     │
│     │ US-602: API │   │ US-607:     │   │ OpenClaw    │                     │
│     │    Keys     │   │ Preferences │   │ Integration │                     │
│     └──────┬──────┘   └─────────────┘   └──────┬──────┘                     │
│            │                                    │                            │
│            └───────────────┬───────────────────┘                            │
│                            ▼                                                 │
│                   ┌─────────────────┐                                        │
│                   │ US-101 to US-107│                                        │
│                   │ Agent Management│                                        │
│                   └────────┬────────┘                                        │
│                            │                                                 │
│              ┌─────────────┼─────────────┐                                  │
│              ▼             ▼             ▼                                  │
│     ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                         │
│     │ US-201-208  │ │ US-401:     │ │ US-501-506  │                         │
│     │ Team Mgmt   │ │ Messaging   │ │ Memory Sys  │                         │
│     └──────┬──────┘ └──────┬──────┘ └──────┬──────┘                         │
│            │               │               │                                 │
│            └───────────────┼───────────────┘                                │
│                            ▼                                                 │
│                   ┌─────────────────┐                                        │
│                   │ US-301-310      │                                        │
│                   │ Project Exec    │                                        │
│                   └────────┬────────┘                                        │
│                            │                                                 │
│                   ┌────────┴────────┐                                        │
│                   ▼                 ▼                                        │
│          ┌─────────────┐   ┌─────────────┐                                   │
│          │ US-402-409  │   │ US-605:     │                                   │
│          │ Collab Flow │   │ Cost Track  │                                   │
│          └─────────────┘   └─────────────┘                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Glossary

| Term                  | Definition                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| **Agent**             | An AI-powered entity with a specific role (PM, Dev, QA, etc.)                                  |
| **AI Manager**        | **Mandatory** orchestrator agent that distributes tasks, tracks progress, and reports to human |
| **Team**              | A group of agents organized for a project                                                      |
| **Hierarchy**         | Manager→report relationships within a team                                                     |
| **Session**           | An OpenClaw session representing an active agent instance                                      |
| **Dormant**           | Agent state with minimal memory footprint                                                      |
| **Working Memory**    | Short-lived context for current conversation (~200 tokens)                                     |
| **Short-Term Memory** | Recent conversation history (SQLite, 10k messages)                                             |
| **Long-Term Memory**  | Semantic vector embeddings for retrieval (LanceDB)                                             |
| **Episodic Memory**   | Compressed summaries of past projects                                                          |
| **External Channel**  | Slack, Discord, Telegram integration for human-agent communication                             |
| **SDLC**              | Software Development Lifecycle                                                                 |
| **MoSCoW**            | Must/Should/Could/Won't prioritization method                                                  |
| **Material Design 3** | Google's latest design system, used for UI                                                     |

---

## Related Documents

| Document                               | Description                           |
| -------------------------------------- | ------------------------------------- |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Material Design 3 implementation spec |
| [UI_COMPONENTS.md](./UI_COMPONENTS.md) | Component library specification       |
| [FINAL_PLAN.md](./FINAL_PLAN.md)       | Architecture and technical overview   |

---

> **Document Status**: v0.2 Draft - Ready for Review  
> **Total**: 67 User Stories | 297 Story Points | 11 Sprints  
> **Next Step**: Stakeholder approval → Phase 2 (System Design)
