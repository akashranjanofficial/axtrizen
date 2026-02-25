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
  console.log("[Tauri API] isTauri check:", hasTauri, "window.__TAURI__:", window.__TAURI__);
  return hasTauri;
}

/**
 * Invoke a Tauri command (only works in native app)
 */
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  console.log("[Tauri API] invoke called:", cmd, args);

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
    console.log("[Tauri API] invoke result:", result);
    return result;
  } catch (error) {
    console.error("[Tauri API] invoke error:", error);
    throw error;
  }
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
  console.log("[Tauri API] spawnAgent called with:", agentName);
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
