/**
 * Mock for tauri-api.ts — used in tests so components don't crash
 * when Tauri IPC is unavailable (jsdom environment).
 */
import { vi } from "vitest";

export const isTauri = vi.fn(() => false);

export const getSettings = vi.fn(async () => ({
  gateway_url: "ws://localhost:3000",
  openclaw_path: "/mock/openclaw",
  debug_mode: false,
}));

export const getAgentConfig = vi.fn(async (_path: string) => ({
  models: { primary: "claude-3-5-sonnet" },
  channels: {},
  browser: { enabled: false },
  tts: { enabled: false },
  sandbox: { mode: "auto" },
  tools: {},
  session: {},
}));

export const saveAgentConfig = vi.fn(async () => {});

export const getGatewayToken = vi.fn(async () => "mock-token");

export const spawnAgent = vi.fn(async () => ({
  pid: 12345,
  success: true,
}));

// Helper to reset all mocks between tests
export function resetAllMocks() {
  isTauri.mockClear();
  getSettings.mockClear();
  getAgentConfig.mockClear();
  saveAgentConfig.mockClear();
  getGatewayToken.mockClear();
  spawnAgent.mockClear();
}
