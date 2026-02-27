/**
 * Gateway Adapter — Abstraction layer between Axtrizen and OpenClaw
 *
 * This is the SINGLE FILE that speaks the raw OpenClaw protocol.
 * If OpenClaw changes their API, only this file needs to update.
 *
 * Usage:
 *   import { getAdapter } from "../services/gateway-adapter";
 *   const gw = getAdapter();
 *   await gw.connect();
 *   const agents = await gw.listAgents();
 *   const response = await gw.sendMessage("agent-id", "hello", "session-key");
 */

import {
  getGatewayClient,
  type ChatMessage,
  type AgentInfo,
  type SessionInfo,
  type ConnectionStatus,
  type GatewayEvent,
  type StreamDelta,
} from "../gateway-client";

// ── Adapter Types ──────────────────────────────────────────────────────
// These are Axtrizen's own types, decoupled from OpenClaw's internal types.
// If OpenClaw renames fields, we map them here.

export type { ChatMessage, AgentInfo, SessionInfo, ConnectionStatus, GatewayEvent, StreamDelta };

/** Structured agent response from a message send */
export type AgentResponse = {
  runId?: string;
  status?: string;
  summary?: string;
  payloads: Array<{ text?: string; mediaUrl?: string | null; mediaUrls?: string[] }>;
  meta?: unknown;
};

/** Chat history result */
export type ChatHistory = {
  sessionKey: string;
  sessionId?: string;
  messages: Array<{
    role: string;
    content: Array<{ type: string; text?: string }> | string;
    timestamp?: number;
  }>;
};

/** Session list result */
export type SessionList = {
  sessions: SessionInfo[];
  count: number;
};

/** Agent list result */
export type AgentList = {
  defaultId: string;
  mainKey: string;
  agents: AgentInfo[];
};

// ── Gateway Adapter Interface ──────────────────────────────────────────
// This is the contract. Any gateway backend must implement this.

export interface GatewayAdapter {
  /** Current connection status */
  readonly status: ConnectionStatus;

  // ── Lifecycle ──
  connect(): Promise<void>;
  disconnect(): void;

  // ── Event Handlers ──
  onStatusChange: ((status: ConnectionStatus) => void) | null;
  onEvent: ((event: GatewayEvent) => void) | null;

  // ── Agent Operations ──
  /** Send a message to an agent and wait for the full reply */
  sendMessage(message: string, agentId: string, sessionKey: string): Promise<AgentResponse>;

  /** Send a message with streaming — fires onDelta for text chunks and tool events */
  sendMessageStreaming(
    message: string,
    agentId: string,
    sessionKey: string,
    onDelta: (delta: StreamDelta) => void,
  ): Promise<AgentResponse>;

  /** List all configured agents */
  listAgents(): Promise<AgentList>;

  // ── Chat Operations ──
  /** Load chat history for a session */
  getChatHistory(sessionKey: string, limit?: number): Promise<ChatHistory>;

  /** Inject a message into session transcript (without triggering agent run) */
  injectMessage(sessionKey: string, content: string, role?: string): Promise<void>;

  /** Reset/clear a session's chat history */
  resetSession(sessionKey: string): Promise<void>;

  // ── Session Operations ──
  /** List sessions with optional filters */
  listSessions(opts?: {
    limit?: number;
    includeDerivedTitles?: boolean;
    includeLastMessage?: boolean;
  }): Promise<SessionList>;

  // ── System Operations ──
  /** Get gateway status */
  getStatus(): Promise<Record<string, unknown>>;

  /** Get gateway health (memory, uptime, version) */
  getHealth(): Promise<Record<string, unknown>>;

  /** Get usage cost summary */
  getUsageCost(days?: number): Promise<Record<string, unknown>>;
}

// ── OpenClaw Implementation ────────────────────────────────────────────
// Wraps the raw OpenClawGatewayClient behind the adapter interface.

export class OpenClawAdapter implements GatewayAdapter {
  private client = getGatewayClient();

  get status(): ConnectionStatus {
    return this.client.status;
  }

  get onStatusChange(): ((status: ConnectionStatus) => void) | null {
    return this.client.onStatusChange;
  }
  set onStatusChange(handler: ((status: ConnectionStatus) => void) | null) {
    this.client.onStatusChange = handler;
  }

  get onEvent(): ((event: GatewayEvent) => void) | null {
    return this.client.onEvent;
  }
  set onEvent(handler: ((event: GatewayEvent) => void) | null) {
    this.client.onEvent = handler;
  }

  // ── Lifecycle ──

  async connect(): Promise<void> {
    return this.client.connect();
  }

  disconnect(): void {
    this.client.disconnect();
  }

  // ── Agent Operations ──

  async sendMessage(message: string, agentId: string, sessionKey: string): Promise<AgentResponse> {
    const raw = await this.client.sendAgentMessage(message, agentId, sessionKey);
    // Normalize the response into our clean type
    return {
      runId: raw.runId,
      status: raw.status,
      summary: raw.summary,
      payloads: raw.result?.payloads ?? [],
      meta: raw.result?.meta,
    };
  }

  async sendMessageStreaming(
    message: string,
    agentId: string,
    sessionKey: string,
    onDelta: (delta: StreamDelta) => void,
  ): Promise<AgentResponse> {
    const raw = await this.client.sendAgentMessageStreaming(message, agentId, sessionKey, onDelta);
    return {
      runId: raw.runId,
      status: raw.status,
      summary: raw.summary,
      payloads: raw.result?.payloads ?? [],
      meta: raw.result?.meta,
    };
  }

  async listAgents(): Promise<AgentList> {
    return this.client.listAgents();
  }

  // ── Chat Operations ──

  async getChatHistory(sessionKey: string, limit?: number): Promise<ChatHistory> {
    return this.client.getChatHistory(sessionKey, limit);
  }

  async injectMessage(sessionKey: string, content: string, role?: string): Promise<void> {
    return this.client.chatInject(sessionKey, content, role);
  }

  async resetSession(sessionKey: string): Promise<void> {
    return this.client.resetSession(sessionKey);
  }

  // ── Session Operations ──

  async listSessions(opts?: {
    limit?: number;
    includeDerivedTitles?: boolean;
    includeLastMessage?: boolean;
  }): Promise<SessionList> {
    return this.client.listSessions(opts);
  }

  // ── System Operations ──

  async getStatus(): Promise<Record<string, unknown>> {
    return this.client.getStatus();
  }

  async getHealth(): Promise<Record<string, unknown>> {
    return this.client.getHealth();
  }

  async getUsageCost(days?: number): Promise<Record<string, unknown>> {
    return this.client.getUsageCost(days);
  }
}

// ── Session Key Helpers ────────────────────────────────────────────────
// These ensure DM and group chats NEVER share a session key.
// The gateway format is: agent:<agentId>:<rest>
// <rest> differentiates contexts: "main" (DM), "team:<teamId>" (group).

/**
 * Build a gateway session key for a specific chat context.
 * - DM:    agent:<agentId>:main
 * - Group: agent:<agentId>:team:<teamId>
 */
export function buildSessionKey(
  agentId: string,
  context: { type: "dm" } | { type: "team"; teamId: string },
): string {
  const normalized = agentId.toLowerCase().trim();
  if (context.type === "team") {
    return `agent:${normalized}:team:${context.teamId.toLowerCase().trim()}`;
  }
  return `agent:${normalized}:main`;
}

/**
 * Build a local chat ID for the SQLite store.
 * - DM:    dm:<agentId>
 * - Group: team:<teamId>
 */
export function buildChatId(
  context: { type: "dm"; agentId: string } | { type: "team"; teamId: string },
): string {
  if (context.type === "team") {
    return `team:${context.teamId}`;
  }
  return `dm:${context.agentId}`;
}

// ── Singleton ──────────────────────────────────────────────────────────

let _adapter: GatewayAdapter | null = null;

/**
 * Get the gateway adapter singleton.
 * Default: OpenClawAdapter.
 * Can be replaced with a different backend for testing or alternative gateways.
 */
export function getAdapter(): GatewayAdapter {
  if (!_adapter) {
    _adapter = new OpenClawAdapter();
  }
  return _adapter;
}

/**
 * Replace the gateway adapter (useful for testing or alternative backends).
 */
export function setAdapter(adapter: GatewayAdapter): void {
  _adapter = adapter;
}
