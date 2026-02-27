// Axtrizen AI - Tauri API Integration
// TypeScript types and functions for communicating with the Rust backend

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
      event?: {
        listen: <T>(
          event: string,
          handler: (event: { payload: T; id: number; event: string }) => void,
        ) => Promise<() => void>;
        emit: (event: string, payload?: unknown) => Promise<void>;
      };
      // Legacy path for older Tauri versions
      invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    };
  }
}

// ==================== Types ====================

export interface Agent {
  id: string;
  name: string;
  status: "active" | "idle" | "dormant" | "error";
  model?: string;
  workspace?: string;
  type?: string;
}

export interface AgentStatus {
  id: string;
  status: string;
  current_task?: string;
  memory_mb?: number;
}

export interface OpenClawConfig {
  gateway?: {
    auth?: {
      mode?: string;
      token?: string;
    };
    port?: number;
  };
}

// ==================== Helpers ====================

/**
 * Check if running inside Tauri (native app) or browser
 */
export function isTauri(): boolean {
  const hasTauri = typeof window !== "undefined" && window.__TAURI__ !== undefined;
  return hasTauri;
}

/**
 * Invoke a Tauri command (only works in native app)
 */
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    console.error("[Tauri API] Not running in Tauri environment");
    throw new Error("Not running in Tauri environment");
  }

  // Tauri 2.0 uses window.__TAURI__.core.invoke
  const tauriInvoke = window.__TAURI__?.core?.invoke ?? window.__TAURI__?.invoke;

  if (!tauriInvoke) {
    console.error("[Tauri API] invoke function not found on window.__TAURI__");
    throw new Error("Tauri invoke not available");
  }

  try {
    const result = await tauriInvoke<T>(cmd, args);
    return result;
  } catch (error) {
    console.error("[Tauri API] invoke error:", error);
    throw error;
  }
}

/**
 * Listen for Tauri events (only works in native app)
 */
async function listen<T>(
  event: string,
  handler: (event: { payload: T; id: number; event: string }) => void,
): Promise<(() => void) | undefined> {
  if (!isTauri()) {
    console.warn("[Tauri API] listen called outside Tauri — skipping");
    return undefined;
  }

  const tauriListen = window.__TAURI__?.event?.listen;
  if (!tauriListen) {
    console.warn("[Tauri API] listen function not found on window.__TAURI__.event");
    return undefined;
  }

  return tauriListen<T>(event, handler);
}

// ==================== Terminal Commands (Embedded) ====================

/**
 * Create a new PTY session for the given ID
 */
export async function createPty(id: string): Promise<void> {
  return invoke<void>("create_pty", { id });
}

/**
 * Write data to the PTY
 */
export async function writePty(id: string, data: string): Promise<void> {
  return invoke<void>("write_pty", { id, data });
}

/**
 * Resize the PTY
 */
export async function resizePty(id: string, rows: number, cols: number): Promise<void> {
  return invoke<void>("resize_pty", { id, rows, cols });
}

// ==================== Legacy Terminal Commands ====================

/**
 * Spawn a new agent by opening Terminal and running OpenClaw command
 * This triggers OpenClaw onboarding on first run, or adds a new agent subsequently
 */
export async function spawnAgent(agentName: string): Promise<string> {
  return invoke<string>("spawn_agent", { agentName });
}

/**
 * Open Terminal in the OpenClaw project directory
 */
export async function openTerminal(): Promise<string> {
  return invoke<string>("open_terminal");
}

// ==================== Agent Commands ====================

/**
 * Get list of all agents from OpenClaw Gateway
 */
export async function getAgents(): Promise<Agent[]> {
  return invoke<Agent[]>("get_agents");
}

/**
 * Get status of a specific agent
 */
/**
 * Get status of a specific agent
 */
export async function getAgentStatus(agentId: string): Promise<AgentStatus> {
  return invoke<AgentStatus>("get_agent_status", { agentId });
}

/**
 * Delete an agent
 */
export async function deleteAgent(agentId: string): Promise<void> {
  return invoke<void>("delete_agent", { agentId, deleteFiles: true });
}

/**
 * Create a new agent
 */
export async function createAgent(
  name: string,
  role: string,
  workingDir: string,
  agentType: "worker" | "manager",
): Promise<any> {
  return invoke<any>("create_agent", { name, role, workingDir, agentType });
}

/**
 * Stop an agent (kill its PTY session)
 */
export async function stopAgent(agentId: string): Promise<void> {
  return invoke<void>("kill_pty", { id: agentId });
}

// ==================== Config Commands ====================

/**
 * Check if OpenClaw has been configured (onboarded)
 */
export async function isOpenClawConfigured(): Promise<boolean> {
  return invoke<boolean>("is_openclaw_configured");
}

/**
 * Get the gateway authentication token
 */
export async function getGatewayToken(): Promise<string | null> {
  return invoke<string | null>("get_gateway_token");
}

/**
 * Get generic agent configuration from a specific path
 */
export async function getAgentConfig(path: string): Promise<any> {
  return invoke<any>("get_agent_config", { path });
}

/**
 * Save generic agent configuration to a specific path
 */
export async function saveAgentConfig(path: string, config: any): Promise<void> {
  return invoke<void>("save_agent_config", { path, config });
}

/**
 * Get full OpenClaw configuration
 */
export async function getOpenClawConfig(): Promise<OpenClawConfig | null> {
  return invoke<OpenClawConfig | null>("get_openclaw_config");
}

// ==================== Health Check ====================

/**
 * Simple ping to verify IPC is working
 */
export async function ping(): Promise<string> {
  return invoke<string>("ping");
}

// ==================== Gateway Connection ====================

/**
 * Connect to the OpenClaw Gateway
 */
export async function connectToGateway(url?: string, token?: string): Promise<boolean> {
  return invoke<boolean>("gateway_connect", { url, token });
}

/**
 * Disconnect from the OpenClaw Gateway
 */
export async function disconnectGateway(): Promise<void> {
  return invoke<void>("gateway_disconnect");
}

/**
 * Check if connected to the OpenClaw Gateway
 */
export async function isGatewayConnected(): Promise<boolean> {
  return invoke<boolean>("gateway_is_connected");
}

// ==================== Settings Commands ====================

export interface AppSettings {
  theme: string;
  gateway_url: string;
  openclaw_path: string;
  debug_mode: boolean;
  auto_reconnect: boolean;
  window_width?: number;
  window_height?: number;
}

/**
 * Get all application settings
 */
export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

/**
 * Update a single setting
 */
export async function setSetting(key: string, value: string): Promise<void> {
  return invoke<void>("set_setting", { key, value });
}

/**
 * Update multiple settings at once
 */
export async function updateSettings(settings: AppSettings): Promise<void> {
  return invoke<void>("update_settings", { settings });
}

/**
 * Toggle debug mode on/off
 */
export async function toggleDebugMode(): Promise<boolean> {
  return invoke<boolean>("toggle_debug_mode");
}

/**
 * Check if debug mode is enabled
 */
export async function isDebugMode(): Promise<boolean> {
  return invoke<boolean>("is_debug_mode");
}

// ==================== Project Commands ====================

export interface Project {
  id: string;
  name: string;
  description: string | null;
  team_id: string | null;
  status: string;
  phase: string;
  workspace_path: string | null;
  created_at: string;
}

export async function getProjects(): Promise<Project[]> {
  return invoke<Project[]>("get_projects");
}

export async function createProject(
  name: string,
  description: string | null,
  teamId: string | null = null,
): Promise<Project> {
  return invoke<Project>("create_project", { name, description, teamId });
}

export async function updateProject(
  id: string,
  name: string,
  description: string | null,
  teamId: string | null,
  status: string,
  phase: string,
  workspacePath?: string | null,
): Promise<Project> {
  return invoke<Project>("update_project", {
    id,
    name,
    description,
    teamId,
    status,
    phase,
    workspacePath: workspacePath ?? undefined,
  });
}

export async function deleteProject(id: string): Promise<void> {
  return invoke<void>("delete_project", { id });
}

// ── Planning / Board API ──────────────────────────────────────────────

export interface Epic {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Story {
  id: string;
  epic_id: string;
  project_id: string;
  title: string;
  description: string | null;
  acceptance_criteria: string | null;
  story_points: number;
  status: string;
  assigned_agent_id: string | null;
  sprint_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  story_id: string;
  epic_id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  assigned_agent_id: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  files_created: string | null;
  dependencies: string | null;
  sort_order: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Sprint {
  id: string;
  project_id: string;
  name: string;
  goal: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface ProjectBoard {
  epics: Epic[];
  stories: Story[];
  tasks: Task[];
  sprints: Sprint[];
}

export async function getProjectBoard(projectId: string): Promise<ProjectBoard> {
  return invoke<ProjectBoard>("get_project_board", { projectId });
}

export async function createEpic(
  projectId: string,
  title: string,
  description: string | null,
  priority: number,
  sortOrder: number,
): Promise<Epic> {
  return invoke<Epic>("create_epic", { projectId, title, description, priority, sortOrder });
}

export async function createStory(
  epicId: string,
  projectId: string,
  title: string,
  description: string | null,
  acceptanceCriteria: string | null,
  storyPoints: number,
  assignedAgentId: string | null,
  sprintId: string | null,
  sortOrder: number,
): Promise<Story> {
  return invoke<Story>("create_story", {
    epicId,
    projectId,
    title,
    description,
    acceptanceCriteria,
    storyPoints,
    assignedAgentId,
    sprintId,
    sortOrder,
  });
}

export async function createTask(
  storyId: string,
  epicId: string,
  projectId: string,
  title: string,
  description: string | null,
  assignedAgentId: string | null,
  estimatedMinutes: number | null,
  dependencies: string | null,
  sortOrder: number,
): Promise<Task> {
  return invoke<Task>("create_task", {
    storyId,
    epicId,
    projectId,
    title,
    description,
    assignedAgentId,
    estimatedMinutes,
    dependencies,
    sortOrder,
  });
}

export async function updateTaskStatus(
  taskId: string,
  status: string,
  filesCreated?: string | null,
): Promise<void> {
  return invoke<void>("update_task_status", { taskId, status, filesCreated });
}

export async function updateStoryStatus(storyId: string, status: string): Promise<void> {
  return invoke<void>("update_story_status", { storyId, status });
}

export async function updateEpicStatus(epicId: string, status: string): Promise<void> {
  return invoke<void>("update_epic_status", { epicId, status });
}

export async function createSprint(
  projectId: string,
  name: string,
  goal: string | null,
): Promise<Sprint> {
  return invoke<Sprint>("create_sprint", { projectId, name, goal });
}

/**
 * Open a native folder picker dialog and return the selected path.
 * Returns null if the user cancelled.
 */
export async function pickFolder(title?: string): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    title: title || "Select Workspace Folder",
  });
  // open() returns string | string[] | null for directory mode
  if (typeof selected === "string") {
    return selected;
  }
  if (
    selected &&
    typeof selected === "object" &&
    "length" in selected &&
    (selected as string[]).length > 0
  ) {
    return (selected as string[])[0];
  }
  return null;
}

// ==================== Team Commands ====================

export interface Team {
  id: string;
  name: string;
  description: string | null;
  manager_id: string | null;
  created_at: string;
}

export interface TeamMember {
  team_id: string;
  agent_id: string;
  manager_id: string | null;
  joined_at: string;
}

export async function getTeams(): Promise<Team[]> {
  return invoke<Team[]>("get_teams");
}

export async function createTeam(
  name: string,
  description: string | null,
  managerId: string | null,
): Promise<Team> {
  return invoke<Team>("create_team", { name, description, managerId });
}

export async function deleteTeam(id: string): Promise<void> {
  return invoke<void>("delete_team", { id });
}

export async function updateTeam(
  id: string,
  name: string,
  description: string | null,
  managerId: string | null,
): Promise<Team> {
  return invoke<Team>("update_team", { id, name, description, managerId });
}

export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  return invoke<TeamMember[]>("get_team_members", { teamId });
}

export async function addTeamMember(teamId: string, agentId: string): Promise<void> {
  return invoke<void>("add_team_member", { teamId, agentId });
}

export async function removeTeamMember(teamId: string, agentId: string): Promise<void> {
  return invoke<void>("remove_team_member", { teamId, agentId });
}

// ==================== Orchestrator Commands ====================

export interface ExecutionLogEntry {
  id: string;
  phase: string;
  agent_id: string | null;
  agent_name: string | null;
  event_type: string;
  content: string | null;
  created_at: string;
}

export interface ExecutionStatus {
  status: string;
  phase: string;
  logs: ExecutionLogEntry[];
}

export async function startProjectExecution(
  projectId: string,
): Promise<{ status: string; projectId: string }> {
  return invoke<{ status: string; projectId: string }>("start_project_execution", { projectId });
}

export async function stopProjectExecution(
  projectId: string,
): Promise<{ status: string; projectId: string }> {
  return invoke<{ status: string; projectId: string }>("stop_project_execution", { projectId });
}

export async function getExecutionStatus(projectId: string): Promise<ExecutionStatus> {
  return invoke<ExecutionStatus>("get_execution_status", { projectId });
}

export async function resumeProjectExecution(
  projectId: string,
  feedback: string,
): Promise<{ status: string; projectId: string }> {
  return invoke<{ status: string; projectId: string }>("resume_project_execution", {
    projectId,
    feedback,
  });
}

export async function restartWithFeedback(
  projectId: string,
  feedback: string,
  restartFromPhase?: string,
): Promise<{ status: string; projectId: string; feedback: string; restartFromPhase: string | null }> {
  return invoke<{ status: string; projectId: string; feedback: string; restartFromPhase: string | null }>(
    "restart_with_feedback",
    {
      projectId,
      feedback,
      restartFromPhase: restartFromPhase ?? null,
    },
  );
}

// ==================== Chat Persistence Commands ====================

export interface Conversation {
  id: string;
  session_key: string;
  title: string | null;
  conversation_type: "direct" | "group";
  agent_id: string | null;
  team_id: string | null;
  last_message_at: string | null;
  message_count: number;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sender_agent_id: string | null;
  sender_agent_name: string | null;
  label: string | null;
  metadata: string | null;
  created_at: string;
}

/**
 * Save a chat message to the local SQLite database
 */
export async function saveChatMessage(params: {
  sessionKey: string;
  role: string;
  content: string;
  senderAgentId?: string;
  senderAgentName?: string;
  label?: string;
  conversationType?: string;
  agentId?: string;
  teamId?: string;
  title?: string;
}): Promise<{ ok: boolean; messageId: string; conversationId: string }> {
  return invoke("save_chat_message", {
    sessionKey: params.sessionKey,
    role: params.role,
    content: params.content,
    senderAgentId: params.senderAgentId,
    senderAgentName: params.senderAgentName,
    label: params.label,
    conversationType: params.conversationType,
    agentId: params.agentId,
    teamId: params.teamId,
    title: params.title,
  });
}

/**
 * Get all conversations, sorted by most recent activity
 */
export async function getAllConversations(): Promise<{ conversations: Conversation[] }> {
  return invoke("get_all_conversations");
}

/**
 * Get chat messages for a conversation by session key
 */
export async function getConversationHistory(
  sessionKey: string,
  limit?: number,
): Promise<{ messages: ChatMessage[] }> {
  return invoke("get_conversation_history", { sessionKey, limit });
}

/**
 * Search chat messages across all conversations
 */
export async function searchChat(
  query: string,
  limit?: number,
): Promise<{ messages: ChatMessage[] }> {
  return invoke("search_chat", { query, limit });
}

/**
 * Delete a conversation and all its messages
 */
export async function deleteConversation(conversationId: string): Promise<{ ok: boolean }> {
  return invoke("delete_conversation", { conversationId });
}

// ==================== Agent Metrics Commands ====================

export interface AgentUsageData {
  tokens_in: number;
  tokens_out: number;
  total_tokens: number;
  cost_usd: number;
  model: string | null;
  last_updated: string | null;
}

export interface AgentSessionStats {
  message_count: number;
  context_pct: number;
  context_max_tokens: number;
}

export interface ActivityEntry {
  id: number;
  action_type: string;
  description: string | null;
  metadata: string | null;
  created_at: string;
}

export interface ToolCallEntry {
  id: number;
  tool_name: string;
  arguments: string | null;
  result_summary: string | null;
  duration_ms: number | null;
  status: string;
  created_at: string | null;
}

/**
 * Get agent usage metrics (tokens + cost). Uses SQLite cache with Gateway refresh.
 */
export async function getAgentUsage(agentId: string): Promise<AgentUsageData> {
  return invoke("get_agent_usage", { agentId });
}

/**
 * Get agent session stats (message count + context window usage)
 */
export async function getAgentSessionStats(agentId: string): Promise<AgentSessionStats> {
  return invoke("get_agent_session_stats", { agentId });
}

/**
 * Get recent agent activity entries
 */
export async function getAgentActivity(agentId: string, limit?: number): Promise<ActivityEntry[]> {
  return invoke("get_agent_activity", { agentId, limit });
}

/**
 * Get recent tool calls for an agent
 */
export async function getAgentToolCalls(agentId: string, limit?: number): Promise<ToolCallEntry[]> {
  return invoke("get_agent_tool_calls", { agentId, limit });
}

/**
 * Log an agent activity entry
 */
export async function logAgentActivity(
  agentId: string,
  actionType: string,
  description?: string,
  metadata?: string,
): Promise<void> {
  return invoke("log_agent_activity", { agentId, actionType, description, metadata });
}

/**
 * Log a tool call for an agent
 */
export async function logAgentToolCall(
  agentId: string,
  toolName: string,
  args?: string,
  resultSummary?: string,
  durationMs?: number,
  status?: string,
): Promise<void> {
  return invoke("log_agent_tool_call", {
    agentId,
    toolName,
    arguments: args,
    resultSummary,
    durationMs,
    status,
  });
}

// ==================== Maple P2P Bridge ====================

export interface MapleBrokerStatus {
  brokerActive: boolean;
  brokerType: string | null;
  connectedAgents: string[];
  agentCount: number;
}

export interface MapleEvent {
  agentId: string;
  type: string;
  message: Record<string, unknown>;
}

/** Start the Maple P2P broker sidecar */
export async function mapleBrokerStart(
  brokerType?: string,
  natsUrl?: string,
  requireLinks?: boolean,
): Promise<{ status: string }> {
  return invoke("maple_broker_start", { brokerType, natsUrl, requireLinks });
}

/** Stop the Maple broker and disconnect all agents */
export async function mapleBrokerStop(): Promise<{ status: string }> {
  return invoke("maple_broker_stop");
}

/** Get current Maple broker status */
export async function mapleBrokerStatus(): Promise<MapleBrokerStatus> {
  return invoke("maple_broker_status");
}

/** Connect an agent to the Maple broker for P2P comms */
export async function mapleAgentConnect(
  agentId: string,
  teamId: string,
  role?: string,
): Promise<{ status: string; agentId: string }> {
  return invoke("maple_agent_connect", { agentId, teamId, role });
}

/** Disconnect an agent from the Maple broker */
export async function mapleAgentDisconnect(
  agentId: string,
): Promise<{ status: string; agentId: string }> {
  return invoke("maple_agent_disconnect", { agentId });
}

/** Publish a P2P message from an agent */
export async function mapleAgentPublish(
  agentId: string,
  msgType: string,
  payload: Record<string, unknown>,
  receiverId?: string,
  channel?: string,
): Promise<{ status: string; messageId: string }> {
  return invoke("maple_agent_publish", { agentId, msgType, payload, receiverId, channel });
}

/** Have a worker agent claim a task */
export async function mapleClaimTask(
  agentId: string,
  taskId: string,
  managerId: string,
): Promise<{ status: string; messageId: string }> {
  return invoke("maple_claim_task", { agentId, taskId, managerId });
}

/** Initiate a LIM link for secure code review */
export async function mapleLimInitiate(
  agentId: string,
  reviewerId: string,
): Promise<{ linkId: string }> {
  return invoke("maple_lim_initiate", { agentId, reviewerId });
}

/** Terminate a LIM link */
export async function mapleLimTerminate(
  agentId: string,
  linkId: string,
): Promise<{ status: string }> {
  return invoke("maple_lim_terminate", { agentId, linkId });
}

/** Listen for Maple P2P events */
export async function onMapleEvent(
  handler: (event: MapleEvent) => void,
): Promise<(() => void) | undefined> {
  return listen<MapleEvent>("maple-event", (evt) => handler(evt.payload));
}

// ==================== Agent Groups & Channels ====================

export interface AgentGroup {
  id: string;
  teamId: string;
  name: string;
  description?: string;
  mapleTopic: string;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  sender_type: "agent" | "human";
  content: string;
  message_type: string;
  created_at: string;
}

/** Create a new agent group (channel) within a team */
export async function createAgentGroup(
  teamId: string,
  name: string,
  description?: string,
): Promise<AgentGroup> {
  return invoke<AgentGroup>("create_agent_group", {
    teamId,
    name,
    description: description ?? null,
  });
}

/** Get all groups for a team */
export async function getAgentGroups(teamId: string): Promise<AgentGroup[]> {
  return invoke<AgentGroup[]>("get_agent_groups", { teamId });
}

/** Add an agent to a group */
export async function addAgentToGroup(groupId: string, agentId: string): Promise<void> {
  await invoke<string>("add_agent_to_group", { groupId, agentId });
}

/** Remove an agent from a group */
export async function removeAgentFromGroup(groupId: string, agentId: string): Promise<void> {
  await invoke<string>("remove_agent_from_group", { groupId, agentId });
}

/** Get member agent IDs of a group */
export async function getGroupMembers(groupId: string): Promise<string[]> {
  return invoke<string[]>("get_group_members", { groupId });
}

/** Send a message to a group channel */
export async function sendGroupMessage(
  groupId: string,
  senderId: string,
  senderType: "agent" | "human",
  content: string,
  messageType?: string,
): Promise<string> {
  return invoke<string>("send_group_message", {
    groupId,
    senderId,
    senderType,
    content,
    messageType: messageType ?? null,
  });
}

/** Get messages from a group channel */
export async function getGroupMessages(groupId: string, limit?: number): Promise<GroupMessage[]> {
  return invoke<GroupMessage[]>("get_group_messages", {
    groupId,
    limit: limit ?? null,
  });
}

/** Delete an agent group */
export async function deleteAgentGroup(groupId: string): Promise<void> {
  await invoke<string>("delete_agent_group", { groupId });
}

// ── Skills Management ───────────────────────────────────────────────

/** Get skill status for an agent (or all if no agentId) */
export async function skillsStatus(agentId?: string): Promise<Record<string, unknown>> {
  return invoke("skills_status", { agentId: agentId ?? null });
}

/** Install a skill by name */
export async function skillsInstall(name: string): Promise<Record<string, unknown>> {
  return invoke("skills_install", { name });
}

/** Update a skill – enable/disable or set API key */
export async function skillsUpdate(
  skillKey: string,
  enabled?: boolean,
  apiKey?: string,
): Promise<Record<string, unknown>> {
  return invoke("skills_update", { skillKey, enabled: enabled ?? null, apiKey: apiKey ?? null });
}

// ==================== Sprint 5: Git Integration Commands ====================

export interface GitStatusResult {
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface GitDiffFile {
  path: string;
  insertions: number;
  deletions: number;
}

export interface GitDiffResult {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: GitDiffFile[];
}

export interface GitPRResult {
  url: string;
  number: number;
}

export interface GitPRParams {
  title: string;
  body: string;
  head: string;
  base: string;
  provider?: "github" | "gitlab";
  owner?: string;
  repo?: string;
  token?: string;
}

/** Check if a directory is a git repository */
export async function gitIsRepo(workspacePath: string): Promise<boolean> {
  return invoke<boolean>("git_is_repo", { workspacePath });
}

/** Get current branch name */
export async function gitGetCurrentBranch(workspacePath: string): Promise<string> {
  return invoke<string>("git_current_branch", { workspacePath });
}

/** Get git status (staged, unstaged, untracked files) */
export async function gitStatus(workspacePath: string): Promise<GitStatusResult> {
  return invoke<GitStatusResult>("git_status", { workspacePath });
}

/** Commit changes (optionally add all first) */
export async function gitCommit(
  workspacePath: string,
  message: string,
  addAll?: boolean,
): Promise<{ hash: string }> {
  return invoke("git_commit", { workspacePath, message, addAll: addAll ?? false });
}

/** Create a new branch */
export async function gitCreateBranch(workspacePath: string, branchName: string): Promise<void> {
  return invoke("git_create_branch", { workspacePath, branchName });
}

/** Checkout a branch */
export async function gitCheckout(workspacePath: string, branchName: string): Promise<void> {
  return invoke("git_checkout", { workspacePath, branchName });
}

/** Push a branch to remote */
export async function gitPush(workspacePath: string, branchName: string): Promise<void> {
  return invoke("git_push", { workspacePath, branchName });
}

/** Get diff between two branches */
export async function gitDiff(
  workspacePath: string,
  baseBranch: string,
  headBranch: string,
): Promise<GitDiffResult> {
  return invoke("git_diff", { workspacePath, baseBranch, headBranch });
}

/** Create a pull request via GitHub/GitLab API */
export async function gitCreatePR(
  workspacePath: string,
  params: GitPRParams,
): Promise<GitPRResult> {
  return invoke("git_create_pr", { workspacePath, ...params });
}

// ==================== Sprint 5: Vector Memory (RAG) Commands ====================

export interface VectorDocument {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
}

export interface VectorSearchResult {
  document: VectorDocument;
  score: number;
}

export interface VectorCollectionStats {
  name: string;
  documentCount: number;
  dimensionality: number;
}

/** Initialize the vector store (creates collections if needed) */
export async function vectorStoreInit(): Promise<{ status: string }> {
  return invoke("vector_store_init");
}

/** Add documents to the vector store */
export async function vectorStoreAdd(
  collection: string,
  documents: Array<{ content: string; metadata?: Record<string, unknown> }>,
): Promise<{ added: number }> {
  return invoke("vector_store_add", { collection, documents });
}

/** Search the vector store */
export async function vectorStoreSearch(
  collection: string,
  query: string,
  topK?: number,
): Promise<{ results: VectorSearchResult[] }> {
  return invoke("vector_store_search", { collection, query, topK: topK ?? 5 });
}

/** Delete documents by IDs */
export async function vectorStoreDelete(
  collection: string,
  documentIds: string[],
): Promise<{ deleted: number }> {
  return invoke("vector_store_delete", { collection, documentIds });
}

/** Get collection stats */
export async function vectorStoreStats(
  collection?: string,
): Promise<{ collections: VectorCollectionStats[] }> {
  return invoke("vector_store_stats", { collection: collection ?? null });
}

// ==================== Sprint 6: Slack/Discord Integration Commands ====================

export interface SlackConfig {
  botToken: string;
  appToken?: string;
  defaultChannel?: string;
  webhookUrl?: string;
}

export interface DiscordConfig {
  botToken: string;
  guildId?: string;
  defaultChannel?: string;
  webhookUrl?: string;
}

export interface IntegrationMessage {
  channel?: string;
  text: string;
  blocks?: Record<string, unknown>[];
  threadTs?: string;
}

/** Configure Slack integration */
export async function slackConfigure(config: SlackConfig): Promise<{ status: string }> {
  return invoke("slack_configure", { config });
}

/** Send a message to Slack */
export async function slackSend(message: IntegrationMessage): Promise<{ ts: string }> {
  return invoke("slack_send", { message });
}

/** Get Slack connection status */
export async function slackStatus(): Promise<{ connected: boolean; workspace?: string }> {
  return invoke("slack_status");
}

/** Configure Discord integration */
export async function discordConfigure(config: DiscordConfig): Promise<{ status: string }> {
  return invoke("discord_configure", { config });
}

/** Send a message to Discord */
export async function discordSend(message: IntegrationMessage): Promise<{ messageId: string }> {
  return invoke("discord_send", { message });
}

/** Get Discord connection status */
export async function discordStatus(): Promise<{ connected: boolean; guild?: string }> {
  return invoke("discord_status");
}

/** Handle incoming bot mention (routes to Human Feedback gate) */
export async function integrationHandleMention(
  platform: "slack" | "discord",
  userId: string,
  messageText: string,
  threadId?: string,
): Promise<{ routed: boolean }> {
  return invoke("integration_handle_mention", { platform, userId, messageText, threadId });
}

// ==================== Sprint 6: CI/CD Pipeline Commands ====================

export interface TestRunResult {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration_ms: number;
  output: string;
  failedTests: Array<{
    name: string;
    error: string;
    stackTrace?: string;
  }>;
}

export interface DeployPreviewResult {
  url: string;
  tunnelType: string;
  pid: number;
}

/** Run tests in a workspace */
export async function ciRunTests(workspacePath: string, command?: string): Promise<TestRunResult> {
  return invoke("ci_run_tests", { workspacePath, command: command ?? null });
}

/** Get test status for a workspace */
export async function ciTestStatus(
  workspacePath: string,
): Promise<{ lastRun?: TestRunResult; running: boolean }> {
  return invoke("ci_test_status", { workspacePath });
}

/** Start a deploy preview tunnel */
export async function ciDeployPreview(
  workspacePath: string,
  port: number,
  tunnelType?: string,
): Promise<DeployPreviewResult> {
  return invoke("ci_deploy_preview", {
    workspacePath,
    port,
    tunnelType: tunnelType ?? "cloudflare",
  });
}

/** Stop a deploy preview tunnel */
export async function ciStopPreview(workspacePath: string): Promise<{ status: string }> {
  return invoke("ci_stop_preview", { workspacePath });
}

// ==================== memU Proactive Memory Commands ====================

export interface MemUMemorizeResult {
  resource?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
  categories?: Array<Record<string, unknown>>;
}

export interface MemURetrieveResult {
  categories?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
  resources?: Array<Record<string, unknown>>;
  next_step_query?: string;
}

export interface MemUListResult {
  items?: Array<Record<string, unknown>>;
  categories?: Array<Record<string, unknown>>;
}

export interface MemUStatsResult {
  initialized: boolean;
  item_count?: number;
  category_count?: number;
  provider?: Record<string, unknown> | string;
}

/** Initialize memU memory service (reads config from ~/.openclaw/openclaw.json) */
export async function memuInit(
  apiKey?: string,
  embedModel?: string,
  dbProvider?: string,
): Promise<{ status: string; db_provider?: string; data_dir?: string }> {
  return invoke("memu_init", {
    apiKey: apiKey ?? null,
    embedModel: embedModel ?? null,
    dbProvider: dbProvider ?? null,
  });
}

/** Memorize content (conversation, document, code) into memU */
export async function memuMemorize(params: {
  content?: string;
  resourceUrl?: string;
  modality?: "conversation" | "document" | "code" | "image";
  userId?: string;
  agentId?: string;
}): Promise<MemUMemorizeResult> {
  return invoke("memu_memorize", {
    content: params.content ?? null,
    resourceUrl: params.resourceUrl ?? null,
    modality: params.modality ?? "conversation",
    userId: params.userId ?? null,
    agentId: params.agentId ?? null,
  });
}

/** Search memU memory using RAG or LLM retrieval */
export async function memuRetrieve(params: {
  query?: string;
  queries?: Array<{ role: string; content: { text: string } }>;
  method?: "rag" | "llm";
  userId?: string;
  topK?: number;
}): Promise<MemURetrieveResult> {
  return invoke("memu_retrieve", {
    query: params.query ?? null,
    queries: params.queries ?? null,
    method: params.method ?? "rag",
    userId: params.userId ?? null,
    topK: params.topK ?? null,
  });
}

/** List stored memories and categories */
export async function memuList(userId?: string, category?: string): Promise<MemUListResult> {
  return invoke("memu_list", {
    userId: userId ?? null,
    category: category ?? null,
  });
}

/** Clear all memU memories (optionally scoped to a user/agent) */
export async function memuClear(userId?: string): Promise<{ status: string }> {
  return invoke("memu_clear", { userId: userId ?? null });
}

/** Get memU memory statistics */
export async function memuStats(): Promise<MemUStatsResult> {
  return invoke("memu_stats");
}

// ==================== Workflow Template Types ====================

export type PhaseType = "Planning" | "Collaborative" | "Execution" | "Review" | "Delivery";

export interface WorkflowPhase {
  id: string;
  name: string;
  emoji: string;
  phase_type: PhaseType;
  prompt_template: string;
  manager_prompt?: string;
  saves_files: boolean;
}

export interface BoardLabels {
  level1: string; // "Epics", "Campaigns", "Positions", etc.
  level2: string; // "Stories", "Initiatives", "Candidates", etc.
  level3: string; // "Tasks", "Action Items", "Steps", etc.
  iteration: string; // "Sprints", "Waves", "Rounds", etc.
}

export interface StatusMapping {
  phase_start: Record<string, string>;
  phase_complete: Record<string, string>;
}

export interface ReportSection {
  id: string;
  title: string;
  emoji: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  domain: string;
  description: string;
  icon: string;
  phases: WorkflowPhase[];
  board_labels: BoardLabels;
  output_types: string[];
  recommended_roles: string[];
  status_mapping: StatusMapping;
  report_sections: ReportSection[];
  final_report_prompt: string;
}

export interface WorkflowTemplateSummary {
  id: string;
  name: string;
  domain: string;
  description: string;
  icon: string;
  phase_count: number;
}

// ==================== Workflow Template Commands ====================

/** Get all available workflow templates */
export async function getWorkflowTemplates(): Promise<WorkflowTemplateSummary[]> {
  return invoke<WorkflowTemplateSummary[]>("get_workflow_templates");
}

/** Get a full workflow template by ID */
export async function getWorkflowTemplate(templateId: string): Promise<WorkflowTemplate> {
  return invoke<WorkflowTemplate>("get_workflow_template", { templateId });
}

/** Get the workflow template for a project (with fallback to default) */
export async function getProjectWorkflowTemplate(projectId: string): Promise<WorkflowTemplate> {
  return invoke<WorkflowTemplate>("get_project_workflow_template", { projectId });
}

/** Set the workflow template for a project */
export async function setProjectWorkflowTemplate(
  projectId: string,
  templateId: string,
): Promise<void> {
  return invoke<void>("set_project_workflow_template", { projectId, templateId });
}

// ==================== Sprint S1: Unified Skill System ====================

// ── Types ──────────────────────────────────────────────────────────

export interface SkillCatalogEntry {
  id: string;
  name: string;
  description: string | null;
  category: string;
  tags: string | null;
  risk_level: string;
  source: string | null;
  source_path: string | null;
  date_added: string | null;
}

export interface AgentSkill {
  id: string;
  agent_id: string;
  skill_key: string;
  name: string;
  description: string | null;
  category: string;
  tags: string | null;
  risk_level: string;
  source: string;
  version: string | null;
  installed: boolean;
  enabled: boolean;
  config: string | null;
  installed_at: string | null;
  updated_at: string | null;
}

export interface SkillBundle {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  skill_keys: string;
  is_builtin: boolean;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface CatalogSearchResult {
  skills: SkillCatalogEntry[];
  total: number;
  categories: CategoryCount[];
}

export interface InstallSkillRequest {
  skill_key: string;
  name: string;
  description?: string | null;
  category: string;
  tags?: string | null;
  risk_level: string;
  source: string;
  version?: string | null;
  config?: string | null;
}

// ── Catalog Commands ───────────────────────────────────────────────

/** Seed the skill catalog from a JSON string (antigravity skills_index.json) */
export async function catalogSeed(entriesJson: string): Promise<{ indexed: number; skipped: number }> {
  return invoke<{ indexed: number; skipped: number }>("catalog_seed", { entriesJson });
}

/** Get catalog count to check if indexing has been done */
export async function catalogCount(): Promise<{ count: number }> {
  return invoke<{ count: number }>("catalog_count");
}

/** Search the skill catalog */
export async function catalogSearch(
  query: string,
  category?: string | null,
  limit?: number | null,
  offset?: number | null,
): Promise<CatalogSearchResult> {
  return invoke<CatalogSearchResult>("catalog_search", {
    query,
    category: category ?? null,
    limit: limit ?? null,
    offset: offset ?? null,
  });
}

/** Get all categories with counts */
export async function catalogCategories(): Promise<CategoryCount[]> {
  return invoke<CategoryCount[]>("catalog_categories");
}

/** Get a single catalog entry by ID */
export async function catalogGetEntry(skillId: string): Promise<SkillCatalogEntry | null> {
  return invoke<SkillCatalogEntry | null>("catalog_get_entry", { skillId });
}

// ── Agent Skill Commands ───────────────────────────────────────────

/** Install a skill for an agent */
export async function agentSkillInstall(
  agentId: string,
  req: InstallSkillRequest,
): Promise<{ success: boolean; skill_id: string; skill_key: string; agent_id: string }> {
  return invoke("agent_skill_install", { agentId, req });
}

/** Get all installed skills for an agent */
export async function agentSkillsList(agentId: string): Promise<AgentSkill[]> {
  return invoke<AgentSkill[]>("agent_skills_list", { agentId });
}

/** Remove a skill from an agent */
export async function agentSkillRemove(
  agentId: string,
  skillKey: string,
): Promise<{ success: boolean; removed: string }> {
  return invoke("agent_skill_remove", { agentId, skillKey });
}

/** Update skill config or enabled state */
export async function agentSkillUpdateConfig(
  agentId: string,
  skillKey: string,
  config?: string | null,
  enabled?: boolean | null,
): Promise<{ success: boolean }> {
  return invoke("agent_skill_update_config", {
    agentId,
    skillKey,
    config: config ?? null,
    enabled: enabled ?? null,
  });
}

/** Batch install multiple skills for an agent (useful for bundles) */
export async function agentSkillsBatchInstall(
  agentId: string,
  skills: InstallSkillRequest[],
): Promise<{ installed: number; failed: number; failed_details: string[]; total: number }> {
  return invoke("agent_skills_batch_install", { agentId, skills });
}

// ── Bundle Commands ────────────────────────────────────────────────

/** Get all skill bundles */
export async function getSkillBundles(): Promise<SkillBundle[]> {
  return invoke<SkillBundle[]>("get_skill_bundles");
}

/** Seed default skill bundles (called on startup, safe to re-call) */
export async function seedDefaultBundles(): Promise<{ seeded: number }> {
  return invoke<{ seeded: number }>("seed_default_bundles");
}

// ── Skill Source Commands (Sprint S1 — US-1.1.3) ──────────────────

export interface ResolvedSkill {
  skill_key: string;
  name: string;
  description: string | null;
  category: string;
  tags: string | null;
  risk_level: string;
  source: string;
  source_type: "Catalog" | "GitHub" | "Url" | "LocalPath";
  version: string | null;
  source_path: string | null;
}

/** Resolve a skill source (catalog ID, GitHub shorthand, URL, or local path) */
export async function skillsResolveSource(source: string): Promise<ResolvedSkill> {
  return invoke<ResolvedSkill>("skills_resolve_source", { source });
}

/** Install a skill from any source and attach it to an agent */
export async function skillsInstallFromSource(
  agentId: string,
  source: string,
): Promise<{ success: boolean; skill_key: string; name: string; source_type: string; agent_id: string }> {
  return invoke("skills_install_from_source", { agentId, source });
}

/** Search remote skills.sh API (stub — uses local catalog for now) */
export async function skillsSearchRemote(
  query: string,
): Promise<{ source: string; results: SkillCatalogEntry[]; note: string }> {
  return invoke("skills_search_remote", { query });
}

// ── Agent Wizard Commands (Sprint S3) ─────────────────────────────

export interface SkillRecommendation {
  skill_id: string;
  skill_name: string;
  category: string;
  relevance_score: number; // 0.0–1.0
  reason: string;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string | null;
  agent_type: string;
  role: string;
  model_profile: string;
  soul_md: string;
  identity_md: string;
  skill_ids: string[];
  bundle_ids: string[];
  tool_permissions: string | null; // JSON
  security_level: string;
  context_budget: number | null;
  created_at: string | null;
}

export interface CreateAgentWithConfigRequest {
  name: string;
  role: string;
  agent_type: string;
  folder_path: string;
  model_profile: string;
  soul_md: string;
  identity_md: string;
  skill_ids: string[];
  bundle_ids: string[];
  tool_permissions: string | null;
  security_level: string;
  context_budget: number | null;
}

export interface CreateAgentResult {
  agent_id: string;
  skills_installed: number;
  skills_failed: string[];
  success: boolean;
}

/** Get skill recommendations based on agent role and name */
export async function skillRecommendations(
  role: string,
  name: string,
  limit?: number,
): Promise<SkillRecommendation[]> {
  return invoke<SkillRecommendation[]>("skill_recommendations", { role, name, limit: limit ?? 8 });
}

/** Create agent with full configuration (skills + config + permissions) */
export async function createAgentWithConfig(
  config: CreateAgentWithConfigRequest,
): Promise<CreateAgentResult> {
  return invoke<CreateAgentResult>("create_agent_with_config", { config });
}

/** Save an agent template for reuse */
export async function saveAgentTemplate(template: AgentTemplate): Promise<string> {
  return invoke<string>("save_agent_template", { template });
}

/** List all saved agent templates */
export async function listAgentTemplates(): Promise<AgentTemplate[]> {
  return invoke<AgentTemplate[]>("list_agent_templates", {});
}

/** Delete an agent template */
export async function deleteAgentTemplate(templateId: string): Promise<void> {
  return invoke<void>("delete_agent_template", { templateId });
}

// ── Context Tracker Commands (Sprint S4) ──────────────────────────

export type ContextHealthLevel = "Healthy" | "Warning" | "Critical" | "Exhausted";

export interface ContextHealthReport {
  agent_id: string;
  usage_pct: number;
  remaining_pct: number;
  tokens_used: number;
  tokens_max: number;
  health_level: ContextHealthLevel;
  color: string;
  label: string;
  should_warn: boolean;
  should_block: boolean;
}

export interface ContextBudgetConfig {
  agent_id: string;
  max_tokens: number;
  warn_threshold_pct: number;
  critical_threshold_pct: number;
  auto_summarize: boolean;
  summarize_at_pct: number;
}

/** Get context health report for an agent */
export async function getContextHealth(agentId: string): Promise<ContextHealthReport> {
  return invoke<ContextHealthReport>("get_context_health", { agentId });
}

/** Update context usage for an agent (called after each message) */
export async function updateContextUsage(agentId: string, tokensUsed: number): Promise<ContextHealthReport> {
  return invoke<ContextHealthReport>("update_context_usage", { agentId, tokensUsed });
}

/** Get context budget configuration for an agent */
export async function getContextBudgetConfig(agentId: string): Promise<ContextBudgetConfig> {
  return invoke<ContextBudgetConfig>("get_context_budget_config", { agentId });
}

/** Save context budget configuration for an agent */
export async function saveContextBudgetConfig(config: ContextBudgetConfig): Promise<void> {
  return invoke<void>("save_context_budget_config", { config });
}

// ── Project Wizard Commands (Sprint S5) ──────────────────────────

export interface ModelPricing {
  model_id: string;
  display_name: string;
  provider: string;
  input_cost_per_m: number;
  output_cost_per_m: number;
  context_window: number;
}

export interface SuggestedAgent {
  role: string;
  suggested_model: string;
  agent_type: string;
  skill_categories: string[];
  recommended_skills: string[];
  confidence: number;
  estimated_tokens: number;
}

export interface CostEstimate {
  agent_role: string;
  model_id: string;
  model_name: string;
  estimated_tokens: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
}

export interface TeamSuggestion {
  project_description: string;
  suggested_agents: SuggestedAgent[];
  cost_estimates: CostEstimate[];
  total_cost_low: number;
  total_cost_mid: number;
  total_cost_high: number;
  total_estimated_tokens: number;
}

/** Analyze project description and suggest team composition + cost */
export async function suggestTeamForProject(description: string): Promise<TeamSuggestion> {
  return invoke<TeamSuggestion>("suggest_team_for_project", { description });
}

/** Get the model pricing table */
export async function getModelPricing(): Promise<ModelPricing[]> {
  return invoke<ModelPricing[]>("get_model_pricing");
}

/** Compute cost estimate for a specific model + token amount */
export async function estimateCost(
  modelId: string,
  role: string,
  estimatedTokens: number,
): Promise<CostEstimate> {
  return invoke<CostEstimate>("estimate_cost", { modelId, role, estimatedTokens });
}

/** Recalculate team cost after model changes */
export async function recalculateTeamCost(
  agents: SuggestedAgent[],
): Promise<[CostEstimate[], number, number, number]> {
  return invoke<[CostEstimate[], number, number, number]>("recalculate_team_cost", { agents });
}

// ═══════════════════════════ Sprint S6: Quality Verification ═══════════════

export type CheckStatus = "Pass" | "Fail" | "Warn";
export type StrictnessLevel = "WarnOnly" | "BlockCritical" | "BlockAll";

export interface VerificationFinding {
  level: number;
  check_name: string;
  status: CheckStatus;
  file_path: string;
  line_number: number | null;
  message: string;
  pattern_matched: string | null;
}

export interface LevelResult {
  level: number;
  level_name: string;
  status: CheckStatus;
  findings: VerificationFinding[];
  pass_count: number;
  fail_count: number;
  warn_count: number;
}

export interface VerificationReport {
  project_id: string;
  phase_id: string;
  phase_name: string;
  overall_status: CheckStatus;
  gate_blocked: boolean;
  strictness: StrictnessLevel;
  levels: LevelResult[];
  total_findings: number;
  timestamp: string;
}

export interface GateOverride {
  project_id: string;
  phase_id: string;
  overridden_by: string;
  reason: string;
  timestamp: string;
  findings_at_override: number;
}

export interface PhaseGateStatus {
  phase_id: string;
  phase_name: string;
  badge: string;
  badge_emoji: string;
  last_verified: string | null;
  can_advance: boolean;
  override_record: GateOverride | null;
}

/** Run full 3-level verification on a project phase */
export async function verifyPhase(
  projectId: string,
  phaseId: string,
  phaseName: string,
  workspacePath: string,
  expectedFiles: string[],
  strictness: string = "warn_only",
): Promise<VerificationReport> {
  return invoke<VerificationReport>("verify_phase", {
    projectId, phaseId, phaseName, workspacePath, expectedFiles, strictness,
  });
}

/** Get the list of stub patterns used by the engine */
export async function getStubPatterns(): Promise<[string, string][]> {
  return invoke<[string, string][]>("get_stub_patterns");
}

/** Override a failed gate with audit trail */
export async function overrideGate(
  projectId: string,
  phaseId: string,
  overriddenBy: string,
  reason: string,
): Promise<GateOverride> {
  return invoke<GateOverride>("override_gate", { projectId, phaseId, overriddenBy, reason });
}

/** Get phase gate statuses for all phases */
export async function getPhaseGateStatuses(
  phases: [string, string][],
): Promise<PhaseGateStatus[]> {
  return invoke<PhaseGateStatus[]>("get_phase_gate_statuses", { phases });
}

/** Check a single file for stub patterns */
export async function checkFileForStubs(
  filePath: string,
): Promise<VerificationFinding[]> {
  return invoke<VerificationFinding[]>("check_file_for_stubs", { filePath });
}

// ═══════════════════════════ Sprint S7: Context Summarization & Model Routing ═══

export interface SummarizationConfig {
  enabled: boolean;
  threshold_pct: number;
  preserve_recent: number;
  summary_max_tokens: number;
}

export interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  token_count: number;
  timestamp: string;
  is_summarized: boolean;
}

export interface SummarizationResult {
  summary_text: string;
  messages_summarized: number;
  tokens_before: number;
  tokens_after: number;
  tokens_saved: number;
  savings_pct: number;
  preserved_message_ids: string[];
}

export type ModelProfile = "Speed" | "Balanced" | "Quality";
export type TaskType = "Simple" | "Standard" | "Complex";

export interface RoutingDecision {
  selected_model: string;
  profile: ModelProfile;
  task_type: TaskType;
  reason: string;
  is_override: boolean;
  estimated_cost_per_1k_tokens: number;
}

/** Get default summarization config */
export async function getSummarizationConfig(): Promise<SummarizationConfig> {
  return invoke<SummarizationConfig>("get_summarization_config");
}

/** Update summarization config for an agent */
export async function updateSummarizationConfig(
  agentId: string, enabled: boolean, thresholdPct: number, preserveRecent: number,
): Promise<SummarizationConfig> {
  return invoke<SummarizationConfig>("update_summarization_config", {
    agentId, enabled, thresholdPct, preserveRecent,
  });
}

/** Run context summarization */
export async function runSummarization(
  messages: ConversationMessage[], contextWindow: number,
  thresholdPct: number, preserveRecent: number,
): Promise<SummarizationResult> {
  return invoke<SummarizationResult>("run_summarization", {
    messages, contextWindow, thresholdPct, preserveRecent,
  });
}

/** Route a task to the optimal model */
export async function routeTaskToModel(
  taskContent: string, profile: string, overrideModel?: string,
): Promise<RoutingDecision> {
  return invoke<RoutingDecision>("route_task_to_model", {
    taskContent, profile, overrideModel: overrideModel ?? null,
  });
}

/** Get the full routing matrix */
export async function getRoutingMatrix(): Promise<[string, string, string][]> {
  return invoke<[string, string, string][]>("get_routing_matrix_cmd");
}

/** Compare costs across profiles */
export async function compareCosts(
  taskContent: string, tokenCount: number,
): Promise<[string, string, number][]> {
  return invoke<[string, string, number][]>("compare_costs", { taskContent, tokenCount });
}

// ═══════════════════════════════════════════════════════════════════
// Sprint S8 — Security Guardrails & Browser Sandbox
// ═══════════════════════════════════════════════════════════════════

/** A matched injection pattern */
export interface PatternMatch {
  pattern_id: string;
  category: string;
  severity: string;
  matched_text: string;
  position: number;
}

/** Result of scanning a message */
export interface ScanResult {
  is_safe: boolean;
  risk_score: number;
  matched_patterns: PatternMatch[];
  scan_time_ms: number;
  message_length: number;
}

/** Security audit log entry */
export interface SecurityAuditEntry {
  id: string;
  timestamp: string;
  agent_id: string;
  message_preview: string;
  risk_score: number;
  patterns_matched: string[];
  action_taken: string;
  full_message: string;
}

/** Browser sandbox configuration */
export interface SandboxConfig {
  max_concurrent: number;
  cpu_limit: number;
  memory_limit_mb: number;
  idle_timeout_min: number;
  image: string;
}

/** Browser sandbox instance */
export interface SandboxInstance {
  id: string;
  container_id: string;
  status: string;
  cdp_url: string;
  health_ok: boolean;
  created_at: string;
  last_active: string;
  cpu_usage: number;
  memory_usage_mb: number;
}

/** CDP action result */
export interface CdpActionResult {
  action: string;
  success: boolean;
  result: string | null;
  error: string | null;
  duration_ms: number;
}

/** Scan a message for prompt injection */
export async function scanForInjection(message: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_for_injection", { message });
}

/** Get all injection pattern definitions */
export async function getInjectionPatterns(): Promise<[string, string, string, string][]> {
  return invoke<[string, string, string, string][]>("get_injection_patterns_cmd");
}

/** Spawn a browser sandbox */
export async function spawnBrowserSandbox(sandboxId: string): Promise<SandboxInstance> {
  return invoke<SandboxInstance>("spawn_browser_sandbox", { sandboxId });
}

/** Get sandbox configuration */
export async function getSandboxConfig(): Promise<SandboxConfig> {
  return invoke<SandboxConfig>("get_sandbox_config");
}

/** Execute a CDP action on a sandbox */
export async function executeCdp(action: string, target?: string): Promise<CdpActionResult> {
  return invoke<CdpActionResult>("execute_cdp", { action, target });
}

// ═══════════════════════════════════════════════════════════════════
// Sprint S9 — Output Guardrails, Browser Stream, Project Monitoring
// ═══════════════════════════════════════════════════════════════════

/** PII finding */
export interface PiiFinding {
  pii_type: string;
  matched_text: string;
  position: number;
  redacted_as: string;
}

/** PII scan result */
export interface PiiScanResult {
  has_pii: boolean;
  findings: PiiFinding[];
  redacted_text: string;
  original_length: number;
}

/** Unsafe code finding */
export interface UnsafeCodeFinding {
  pattern_name: string;
  severity: string;
  matched_text: string;
  description: string;
  line_hint: number | null;
}

/** Guardrail mode */
export type GuardrailMode = "Redact" | "Warn" | "Block" | "Allow";

/** Guardrail configuration */
export interface GuardrailConfig {
  mode: GuardrailMode;
  detect_emails: boolean;
  detect_phones: boolean;
  detect_ssns: boolean;
  detect_api_keys: boolean;
  detect_credit_cards: boolean;
  detect_ip_addresses: boolean;
  detect_unsafe_code: boolean;
}

/** Stream method */
export type StreamMethod = "WebRTC" | "ScreenshotFallback";

/** Stream configuration */
export interface StreamConfig {
  method: StreamMethod;
  target_fps: number;
  resolution_width: number;
  resolution_height: number;
  screenshot_interval_ms: number;
  max_latency_ms: number;
}

/** Stream status */
export interface StreamStatus {
  sandbox_id: string;
  active: boolean;
  method: StreamMethod;
  current_fps: number;
  latency_ms: number;
  resolution: string;
  frames_delivered: number;
  last_frame_at: string;
}

/** Project live metrics */
export interface ProjectLiveMetrics {
  project_id: string;
  progress_pct: number;
  running_cost_usd: number;
  duration_seconds: number;
  current_phase: string;
  active_agents: number;
  total_agents: number;
  messages_total: number;
  last_updated: string;
}

/** Agent monitor data */
export interface AgentMonitorData {
  agent_id: string;
  agent_name: string;
  status: string;
  current_task: string | null;
  messages_sent: number;
  tokens_used: number;
  has_browser: boolean;
  stream_active: boolean;
}

/** Monitoring layout */
export interface MonitoringLayout {
  agent_list_width_pct: number;
  main_view_width_pct: number;
  sidebar_width_pct: number;
  selected_agent_id: string | null;
}

/** Scan output for PII */
export async function scanOutputPii(text: string): Promise<PiiScanResult> {
  return invoke<PiiScanResult>("scan_output_pii", { text });
}

/** Scan output for unsafe code */
export async function scanOutputUnsafe(text: string): Promise<UnsafeCodeFinding[]> {
  return invoke<UnsafeCodeFinding[]>("scan_output_unsafe", { text });
}

/** Get guardrail configuration */
export async function getGuardrailConfig(): Promise<GuardrailConfig> {
  return invoke<GuardrailConfig>("get_guardrail_config");
}

/** Apply guardrails to output */
export async function applyOutputGuardrail(text: string, mode: string): Promise<[string, PiiFinding[], UnsafeCodeFinding[]]> {
  return invoke<[string, PiiFinding[], UnsafeCodeFinding[]]>("apply_output_guardrail", { text, mode });
}

/** Get stream config */
export async function getStreamConfig(): Promise<StreamConfig> {
  return invoke<StreamConfig>("get_stream_config");
}

/** Get project live metrics */
export async function getProjectLiveMetrics(projectId: string): Promise<ProjectLiveMetrics> {
  return invoke<ProjectLiveMetrics>("get_project_live_metrics", { projectId });
}

/** Get monitoring layout */
export async function getMonitoringLayout(): Promise<MonitoringLayout> {
  return invoke<MonitoringLayout>("get_monitoring_layout");
}

// ─── Sprint S10: Browser Polish + Stabilization ──────────────────

/** Bug severity levels */
export type BugSeverity = "P0" | "P1" | "P2";

/** Bug status */
export type BugStatus = "Open" | "InProgress" | "Resolved" | "Verified";

/** A tracked bug from sprints S7-S9 */
export interface TrackedBug {
  id: string;
  title: string;
  severity: BugSeverity;
  status: BugStatus;
  sprint_origin: string;
  component: string;
  description: string;
  resolved_in_commit: string | null;
}

/** Network isolation policy for browser sandbox */
export interface NetworkIsolationPolicy {
  allowed_domains: string[];
  block_all_other: boolean;
  download_limit_bytes: number;
  max_file_size_bytes: number;
}

/** Cookie / state cleanup policy */
export interface CookieCleanupPolicy {
  clean_on_destroy: boolean;
  periodic_clean_seconds: number;
  clean_local_storage: boolean;
  clean_indexed_db: boolean;
}

/** Aggregated sandbox hardening config */
export interface SandboxHardeningConfig {
  network: NetworkIsolationPolicy;
  cookies: CookieCleanupPolicy;
  max_lifetime_seconds: number;
  idle_timeout_seconds: number;
}

/** Load test configuration */
export interface LoadTestConfig {
  concurrent_projects: number;
  agents_per_project: number;
  browsers_per_agent: boolean;
  duration_seconds: number;
  target_p95_ms: number;
}

/** Aggregate load test report */
export interface LoadTestReport {
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  max_latency_ms: number;
  meets_target: boolean;
}

/** Memory snapshot at a point in time */
export interface MemorySnapshot {
  timestamp_epoch_ms: number;
  heap_bytes: number;
  rss_bytes: number;
  sandbox_count: number;
  agent_count: number;
}

/** Memory profiling config */
export interface MemoryProfilingConfig {
  snapshot_interval_seconds: number;
  duration_seconds: number;
  leak_threshold_ratio: number;
}

/** Release note entry */
export interface ReleaseNoteEntry {
  category: string;
  title: string;
  description: string;
  sprint: string;
}

/** Documentation coverage entry */
export interface DocCoverageEntry {
  feature: string;
  has_api_docs: boolean;
  has_user_guide: boolean;
  has_examples: boolean;
  last_updated_sprint: string;
}

/** Get all known bugs from S7-S9 */
export async function getKnownBugs(): Promise<TrackedBug[]> {
  return invoke<TrackedBug[]>("get_known_bugs_cmd");
}

/** Get open P0/P1 bugs */
export async function getOpenP0P1Bugs(): Promise<TrackedBug[]> {
  return invoke<TrackedBug[]>("get_open_p0_p1_bugs");
}

/** Check if all critical bugs are resolved */
export async function allBugsResolved(): Promise<boolean> {
  return invoke<boolean>("all_bugs_resolved_cmd");
}

/** Get sandbox hardening config */
export async function getSandboxHardeningConfig(): Promise<SandboxHardeningConfig> {
  return invoke<SandboxHardeningConfig>("get_sandbox_hardening_config");
}

/** Check if a URL is allowed by sandbox network policy */
export async function checkUrlAllowed(url: string): Promise<boolean> {
  return invoke<boolean>("check_url_allowed", { url });
}

/** Get load test config */
export async function getLoadTestConfig(): Promise<LoadTestConfig> {
  return invoke<LoadTestConfig>("get_load_test_config");
}

/** Run simulated load test */
export async function runSimulatedLoadTest(): Promise<LoadTestReport> {
  return invoke<LoadTestReport>("run_simulated_load_test");
}

/** Get memory profiling config */
export async function getMemoryProfilingConfig(): Promise<MemoryProfilingConfig> {
  return invoke<MemoryProfilingConfig>("get_memory_profiling_config");
}

/** Check for memory leaks from snapshots */
export async function checkMemoryLeak(snapshots: MemorySnapshot[]): Promise<boolean> {
  return invoke<boolean>("check_memory_leak", { snapshots });
}

/** Get Phase 3 release notes */
export async function getPhase3ReleaseNotes(): Promise<ReleaseNoteEntry[]> {
  return invoke<ReleaseNoteEntry[]>("get_phase3_release_notes");
}

/** Get documentation coverage */
export async function getDocCoverage(): Promise<DocCoverageEntry[]> {
  return invoke<DocCoverageEntry[]>("get_doc_coverage_cmd");
}

// ─── Sprint S11: Voice Pipeline ─────────────────────────────────

export type SttProvider = "Deepgram" | "Whisper" | "WhisperLocal";
export type TtsProvider = "ElevenLabs" | "Kokoro" | "SystemDefault";
export type VoiceInputMode = "PushToTalk" | "HandsFree";
export type PipelineStage = "Idle" | "Recording" | "Transcribing" | "Processing" | "Synthesizing" | "Playing" | "Error";
export type VadState = "Idle" | "Listening" | "SpeechDetected" | "SilenceDetected" | "EndOfSpeech";

export interface SttConfig { provider: SttProvider; language: string; model: string; sample_rate_hz: number; channels: number; interim_results: boolean; }
export interface TtsConfig { provider: TtsProvider; voice_id: string; speed: number; stability: number; similarity_boost: number; output_format: string; }
export interface VadConfig { silence_threshold_ms: number; min_volume: number; pre_speech_buffer_ms: number; }
export interface PushToTalkConfig { mode: VoiceInputMode; keyboard_shortcut: string; show_waveform: boolean; show_pulsing_indicator: boolean; max_recording_seconds: number; }
export interface VoicePipelineConfig { stt: SttConfig; tts: TtsConfig; vad: VadConfig; push_to_talk: PushToTalkConfig; target_latency_ms: number; show_transcription_in_chat: boolean; show_audio_playback_button: boolean; }
export interface VoicePipelineStatus { stage: PipelineStage; is_recording: boolean; last_transcription: string | null; last_latency_ms: number | null; microphone_permitted: boolean; }
export interface MicPermissionResult { granted: boolean; prompt_shown: boolean; error: string | null; }

export async function getVoicePipelineConfig(): Promise<VoicePipelineConfig> { return invoke<VoicePipelineConfig>("get_voice_pipeline_config"); }
export async function getVoicePipelineStatus(): Promise<VoicePipelineStatus> { return invoke<VoicePipelineStatus>("get_voice_pipeline_status"); }
export async function getSttConfig(): Promise<SttConfig> { return invoke<SttConfig>("get_stt_config"); }
export async function getTtsConfig(): Promise<TtsConfig> { return invoke<TtsConfig>("get_tts_config"); }
export async function getVadConfig(): Promise<VadConfig> { return invoke<VadConfig>("get_vad_config"); }
export async function getPushToTalkConfig(): Promise<PushToTalkConfig> { return invoke<PushToTalkConfig>("get_push_to_talk_config"); }
export async function requestMicPermission(firstUse: boolean): Promise<MicPermissionResult> { return invoke<MicPermissionResult>("request_mic_permission", { firstUse }); }
export async function processVadSample(volume: number, currentState: VadState, silenceMs: number): Promise<[VadState, boolean]> { return invoke<[VadState, boolean]>("process_vad_sample_cmd", { volume, currentState, silenceMs }); }

// ─── Sprint S12: Performance Scoring ────────────────────────────

export interface ScoreWeights { completion: number; gate_pass: number; cost_efficiency: number; latency: number; }
export interface AgentRawMetrics { agent_id: string; agent_name: string; tasks_assigned: number; tasks_completed: number; tasks_failed: number; gate_checks_passed: number; gate_checks_total: number; tokens_used: number; cost_usd: number; avg_response_time_ms: number; max_response_time_ms: number; }
export interface AgentScore { agent_id: string; agent_name: string; completion_score: number; gate_pass_score: number; cost_efficiency_score: number; latency_score: number; composite_score: number; star_rating: number; }
export type ScoreTrend = "Improving" | "Stable" | "Declining";
export interface HistoricalScore { project_id: string; project_name: string; composite_score: number; star_rating: number; timestamp: string; }
export interface AgentScorecard { current: AgentScore; history: HistoricalScore[]; trend: ScoreTrend; }
export interface SkillEffectiveness { skill_id: string; skill_name: string; invocation_count: number; positive_outcomes: number; effectiveness_pct: number; is_underperforming: boolean; alternatives: string[]; }

export async function getScoreWeights(): Promise<ScoreWeights> { return invoke<ScoreWeights>("get_score_weights"); }
export async function computeAgentScore(metrics: AgentRawMetrics): Promise<AgentScore> { return invoke<AgentScore>("compute_agent_score_cmd", { metrics }); }
export async function getSampleScorecard(): Promise<AgentScorecard> { return invoke<AgentScorecard>("get_sample_scorecard"); }
export async function getSkillEffectivenessReport(): Promise<SkillEffectiveness[]> { return invoke<SkillEffectiveness[]>("get_skill_effectiveness_report"); }
export async function scoreToStars(score: number): Promise<number> { return invoke<number>("score_to_stars_cmd", { score }); }

// ─── Sprint S13: Config Reuse + Recommendations ─────────────────

export interface TemplateAgent { role: string; skills: string[]; model_profile: string; permissions: string[]; }
export interface TemplateWorkflow { phases: string[]; orchestration_mode: string; max_concurrent_agents: number; }
export interface TeamTemplate { id: string; name: string; description: string; version: number; agents: TemplateAgent[]; workflow: TemplateWorkflow; created_from_project: string | null; created_at: string; }
export type RecommendationCategory = "SkillSwap" | "ModelUpgrade" | "WorkflowOptimization" | "CostReduction" | "PerformanceBoost";
export type RecommendationImpact = "High" | "Medium" | "Low";
export interface Recommendation { id: string; title: string; description: string; category: RecommendationCategory; impact: RecommendationImpact; agent_id: string | null; skill_id: string | null; dismissed: boolean; applied: boolean; }

export async function getSampleTemplate(): Promise<TeamTemplate> { return invoke<TeamTemplate>("get_sample_template"); }
export async function applyTemplate(template: TeamTemplate): Promise<string[]> { return invoke<string[]>("apply_template_cmd", { template }); }
export async function createTemplateVersion(template: TeamTemplate): Promise<TeamTemplate> { return invoke<TeamTemplate>("create_template_version_cmd", { template }); }
export async function getSampleRecommendations(): Promise<Recommendation[]> { return invoke<Recommendation[]>("get_sample_recommendations"); }
export async function dismissRecommendation(rec: Recommendation): Promise<Recommendation> { return invoke<Recommendation>("dismiss_recommendation_cmd", { rec }); }
export async function applyRecommendation(rec: Recommendation): Promise<Recommendation> { return invoke<Recommendation>("apply_recommendation_cmd", { rec }); }

// ─── Sprint S14: Org Skill Policies ─────────────────────────────

export type SkillApprovalStatus = "Approved" | "Blocked" | "PendingReview";
export interface SkillPolicy { skill_id: string; skill_name: string; status: SkillApprovalStatus; risk_level: string; reviewed_by: string | null; reviewed_at: string | null; }
export interface ApprovalRequest { skill_id: string; requested_by: string; reason: string; status: string; }
export interface TenantConfig { org_id: string; org_name: string; row_level_isolation: boolean; sync_interval_seconds: number; }

export async function getSkillPolicies(): Promise<SkillPolicy[]> { return invoke<SkillPolicy[]>("get_skill_policies"); }
export async function getTenantConfig(): Promise<TenantConfig> { return invoke<TenantConfig>("get_tenant_config"); }
export async function requestSkillApproval(skillId: string, user: string, reason: string): Promise<ApprovalRequest> { return invoke<ApprovalRequest>("request_skill_approval", { skillId, user, reason }); }

// ─── Sprint S15: Usage & Budget Dashboard ───────────────────────

export interface TeamUsage { team_id: string; team_name: string; cost_usd: number; tokens: number; }
export interface ModelUsage { model_name: string; cost_usd: number; tokens: number; call_count: number; }
export interface UsageSummary { month: string; total_cost_usd: number; total_tokens: number; total_api_calls: number; breakdown_by_team: TeamUsage[]; breakdown_by_model: ModelUsage[]; }
export type BudgetStatus = "Normal" | "Warning" | "Blocked";
export interface BudgetConfig { team_id: string; monthly_budget_usd: number; soft_limit_pct: number; hard_limit_pct: number; }

export async function getUsageSummary(): Promise<UsageSummary> { return invoke<UsageSummary>("get_usage_summary"); }
export async function getBudgetConfig(): Promise<BudgetConfig> { return invoke<BudgetConfig>("get_budget_config"); }
export async function checkBudgetStatus(spent: number): Promise<BudgetStatus> { return invoke<BudgetStatus>("check_budget_status_cmd", { spent }); }
export async function exportUsageCsv(): Promise<string> { return invoke<string>("export_usage_csv_cmd"); }

// ─── Sprint S16: Cloud Hosting ──────────────────────────────────

export type DeploymentTarget = "FlyIo" | "Render" | "Custom";
export type DataRegion = "US" | "EU" | "APAC";
export interface CloudDeploymentConfig { target: DeploymentTarget; regions: DataRegion[]; min_pods: number; max_pods: number; auto_scale_enabled: boolean; cpu_threshold_pct: number; memory_threshold_pct: number; }
export interface TenantIsolationResult { org_id: string; data_isolated: boolean; network_isolated: boolean; storage_isolated: boolean; all_passed: boolean; }

export async function getCloudConfig(): Promise<CloudDeploymentConfig> { return invoke<CloudDeploymentConfig>("get_cloud_config"); }
export async function verifyTenantIsolation(orgId: string): Promise<TenantIsolationResult> { return invoke<TenantIsolationResult>("verify_tenant_isolation_cmd", { orgId }); }

// ─── Sprint S17: Compliance & Audit ─────────────────────────────

export interface AuditLogEntry { id: string; timestamp: string; actor: string; action: string; target: string; result: string; hash: string; prev_hash: string; }
export interface RetentionPolicy { retention_days: number; archive_enabled: boolean; archive_location: string; }
export interface Soc2Evidence { category: string; control: string; evidence_type: string; collected: boolean; }

export async function getRetentionPolicy(): Promise<RetentionPolicy> { return invoke<RetentionPolicy>("get_retention_policy"); }
export async function getSoc2Checklist(): Promise<Soc2Evidence[]> { return invoke<Soc2Evidence[]>("get_soc2_checklist"); }
export async function verifyAuditChain(entries: AuditLogEntry[]): Promise<boolean> { return invoke<boolean>("verify_audit_chain", { entries }); }
export async function getAuditLogEntries(): Promise<AuditLogEntry[]> { return invoke<AuditLogEntry[]>("get_audit_log_entries_cmd"); }

// ─── Sprint S18: SSO & RBAC ────────────────────────────────────

export type SsoProtocol = "Saml2" | "Oidc";
export type SsoProvider = "Okta" | "AzureAd" | "Custom";
export type Role = "Admin" | "Manager" | "Operator" | "Viewer";
export type RbacAction = "CreateProject" | "DeleteProject" | "ManageAgents" | "ViewDashboard" | "ManageTeam" | "ManageBudget" | "ManageSkillPolicies" | "ViewAuditLogs" | "ManageSso" | "ExportData";
export interface SsoConfig { protocol: SsoProtocol; provider: SsoProvider; entity_id: string; sso_url: string; jit_provisioning: boolean; default_role: Role; }

export async function getSsoConfig(): Promise<SsoConfig> { return invoke<SsoConfig>("get_sso_config"); }
export async function checkPermission(role: Role, action: RbacAction): Promise<boolean> { return invoke<boolean>("check_permission", { role, action }); }
export async function canAssignRole(assigner: Role, target: Role): Promise<boolean> { return invoke<boolean>("can_assign_role_cmd", { assigner, target }); }

// ─── Sprint S19: Enterprise Polish ──────────────────────────────

export interface EnterpriseLoadTestConfig { concurrent_users: number; concurrent_projects: number; target_p95_ms: number; duration_seconds: number; }
export interface UptimeSlaConfig { target_uptime_pct: number; max_downtime_minutes_per_month: number; health_check_interval_seconds: number; }
export interface DemoEnvironmentConfig { url: string; sample_projects: number; sample_agents: number; pre_loaded_data: boolean; }
export interface DocumentationStatusInfo { admin_guide: boolean; api_docs: boolean; security_whitepaper: boolean; user_guide: boolean; migration_guide: boolean; }

export async function getEnterpriseLoadTestConfig(): Promise<EnterpriseLoadTestConfig> { return invoke<EnterpriseLoadTestConfig>("get_enterprise_load_test_config"); }
export async function getUptimeSlaConfig(): Promise<UptimeSlaConfig> { return invoke<UptimeSlaConfig>("get_uptime_sla_config"); }
export async function getDemoEnvironment(): Promise<DemoEnvironmentConfig> { return invoke<DemoEnvironmentConfig>("get_demo_environment"); }
export async function getDocumentationStatus(): Promise<DocumentationStatusInfo> { return invoke<DocumentationStatusInfo>("get_documentation_status"); }

// ─── Sprint S20: GA Release ─────────────────────────────────────

export interface RegressionSuiteResult { total_tests: number; passed: number; failed: number; skipped: number; duration_seconds: number; all_passing: boolean; }
export type AuditFindingSeverity = "Critical" | "High" | "Medium" | "Low" | "Informational";
export interface SecurityAuditFinding { id: string; severity: AuditFindingSeverity; title: string; description: string; resolved: boolean; }
export interface SecurityAuditReport { audit_firm: string; audit_date: string; findings: SecurityAuditFinding[]; critical_resolved: boolean; }
export type AlertingProvider = "PagerDuty" | "OpsGenie" | "Slack";
export interface MonitoringAlertConfig { alerting_provider: AlertingProvider; health_check_endpoint: string; metrics_endpoint: string; alert_channels: string[]; escalation_timeout_minutes: number; }
export interface RunbookEntry { scenario: string; symptoms: string[]; resolution_steps: string[]; estimated_resolution_minutes: number; }
export interface GaReleaseMetadata { version: string; release_date: string; total_sprints: number; total_features: number; total_tests: number; known_issues: string[]; marketing_ready: boolean; }

export async function getRegressionSuiteResult(): Promise<RegressionSuiteResult> { return invoke<RegressionSuiteResult>("get_regression_suite_result"); }
export async function getSecurityAuditReport(): Promise<SecurityAuditReport> { return invoke<SecurityAuditReport>("get_security_audit_report"); }
export async function getMonitoringAlertConfig(): Promise<MonitoringAlertConfig> { return invoke<MonitoringAlertConfig>("get_monitoring_config_cmd"); }
export async function getRunbook(): Promise<RunbookEntry[]> { return invoke<RunbookEntry[]>("get_runbook"); }
export async function getGaReleaseMetadata(): Promise<GaReleaseMetadata> { return invoke<GaReleaseMetadata>("get_ga_release_metadata_cmd"); }

// ─── Gateway Bridge: Live Data Enrichment ───────────────────────

export type UsageDataSource = "Gateway" | "LocalDb" | "Fallback";

export interface GatewayHealthReport {
  connected: boolean;
  gateway_version: string | null;
  uptime_seconds: number | null;
  memory_mb: number | null;
  cpu_pct: number | null;
  active_agents: number | null;
  active_sessions: number | null;
  last_error: string | null;
}

export interface GatewayModelUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  request_count: number;
}

export interface LiveUsageData {
  source: UsageDataSource;
  total_cost_usd: number;
  total_tokens: number;
  total_api_calls: number;
  models: GatewayModelUsage[];
  budget_status: string;
}

export interface EnrichedAgentMetrics {
  agent_id: string;
  agent_name: string;
  tokens_in: number;
  tokens_out: number;
  total_tokens: number;
  cost_usd: number;
  message_count: number;
  context_pct: number;
  composite_score: number | null;
  star_rating: number | null;
  gateway_connected: boolean;
}

export interface DbStatus {
  accessible: boolean;
  path: string;
  tables_count: number;
}

export interface SystemOverview {
  gateway: GatewayHealthReport;
  db_status: DbStatus;
  total_projects: number;
  total_agents: number;
  orchestrator_running: boolean;
}

export async function getGatewayHealthReport(): Promise<GatewayHealthReport> {
  return invoke<GatewayHealthReport>("get_gateway_health_report");
}

export async function getLiveUsage(): Promise<LiveUsageData> {
  return invoke<LiveUsageData>("get_live_usage");
}

export async function getEnrichedAgentMetrics(agentId: string): Promise<EnrichedAgentMetrics> {
  return invoke<EnrichedAgentMetrics>("get_enriched_agent_metrics", { agentId });
}

export async function getSystemOverview(): Promise<SystemOverview> {
  return invoke<SystemOverview>("get_system_overview");
}

export async function syncSkillPoliciesToGateway(): Promise<number> {
  return invoke<number>("sync_skill_policies_to_gateway");
}
