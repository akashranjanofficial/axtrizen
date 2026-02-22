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
  team_id: string | null = null,
): Promise<Project> {
  return invoke<Project>("create_project", { name, description, team_id });
}

export async function deleteProject(id: string): Promise<void> {
  return invoke<void>("delete_project", { id });
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
