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
export async function getAgentStatus(agentId: string): Promise<AgentStatus> {
  return invoke<AgentStatus>("get_agent_status", { agentId });
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

// ==================== Settings Commands ====================

export interface AppSettings {
  theme: string;
  gateway_url: string;
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
