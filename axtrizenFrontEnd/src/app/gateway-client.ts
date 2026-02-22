/**
 * Browser-native WebSocket client for OpenClaw Gateway JSON-RPC protocol.
 *
 * Protocol flow:
 *   1. Connect via WebSocket
 *   2. Send "connect" request with client info + auth token
 *   3. Gateway responds with "hello.ok"
 *   4. Client sends requests (e.g. "agent", "chat.send", "agents.list")
 *   5. Gateway sends responses and streaming events
 */

import { getGatewayToken, getSettings, getAgentConfig } from "./tauri-api";

// ── Types ──────────────────────────────────────────────────────────────

export type GatewayEvent = {
  event: string;
  payload?: unknown;
  seq?: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  status?: "sending" | "sent" | "error";
};

export type AgentInfo = {
  id: string;
  name?: string;
};

export type SessionInfo = {
  key: string;
  label?: string;
  displayName?: string;
  derivedTitle?: string;
  lastMessagePreview?: string;
  updatedAt?: number | null;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  expectFinal: boolean;
};

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

// ── Client ─────────────────────────────────────────────────────────────

export class OpenClawGatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private idCounter = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1000;
  private closed = false;

  // Public state
  status: ConnectionStatus = "disconnected";
  gatewayUrl = "ws://127.0.0.1:18789";
  token?: string;

  // Callbacks
  onStatusChange?: (status: ConnectionStatus) => void;
  onEvent?: (evt: GatewayEvent) => void;
  onError?: (err: string) => void;

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.onStatusChange?.(s);
  }

  private nextId(): string {
    return `req-${++this.idCounter}-${Date.now()}`;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  async connect() {
    this.closed = false;
    this.setStatus("connecting");

    // Resolve gateway URL and token from settings
    let openclawPath = "";
    try {
      const settings = await getSettings();
      if (settings.gateway_url) {
        this.gatewayUrl = settings.gateway_url;
      }
      openclawPath = settings.openclaw_path || "";
    } catch {
      /* use defaults */
    }

    // Try to get the auth token — first from ~/.openclaw/openclaw.json
    try {
      const tok = await getGatewayToken();
      if (tok) {
        this.token = tok;
      }
    } catch {
      /* no token from home dir */
    }

    // Fallback: read token from the install dir's openclaw.json
    if (!this.token && openclawPath) {
      try {
        const installConfig = await getAgentConfig(openclawPath);
        const tok = installConfig?.gateway?.auth?.token;
        if (tok) {
          this.token = tok;
        }
      } catch {
        /* no install config */
      }
    }

    this.doConnect();
  }

  private doConnect() {
    if (this.closed) {
      return;
    }
    try {
      this.ws = new WebSocket(this.gatewayUrl);
    } catch (err) {
      this.setStatus("error");
      this.onError?.(`Failed to create WebSocket: ${err}`);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.sendConnectFrame();
    };

    this.ws.onmessage = (evt) => {
      this.handleMessage(String(evt.data));
    };

    this.ws.onclose = (_evt) => {
      if (!this.closed) {
        this.setStatus("disconnected");
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.setStatus("error");
      this.onError?.("WebSocket connection error");
    };
  }

  disconnect() {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, "client disconnect");
      this.ws = null;
    }
    this.flushPending(new Error("disconnected"));
    this.setStatus("disconnected");
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 1.5, 15_000);
  }

  // ── Protocol ─────────────────────────────────────────────────────────

  private sendConnectFrame() {
    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "gateway-client",
        displayName: "Axtrizen AI",
        version: "0.1.0",
        platform: "browser",
        mode: "ui",
        instanceId: `axtrizen-${Date.now()}`,
      },
      caps: ["tool-events"],
      auth: this.token ? { token: this.token } : undefined,
      role: "operator",
      scopes: ["operator.admin", "operator.write"],
    };

    this.request<{ protocol?: number }>("connect", params)
      .then(() => {
        this.backoffMs = 1000;
        this.setStatus("connected");
      })
      .catch((err) => {
        this.onError?.(`Gateway handshake failed: ${err.message}`);
        this.setStatus("error");
        this.ws?.close(1008, "connect failed");
      });
  }

  private handleMessage(raw: string) {
    try {
      const parsed = JSON.parse(raw);

      // Event frame: { type: "evt", event: "...", payload: ..., seq: ... }
      if (parsed.type === "evt") {
        // Handle connect challenge (nonce)
        if (parsed.event === "connect.challenge") {
          // Simplified: we don't do device auth in the browser
          return;
        }
        this.onEvent?.(parsed as GatewayEvent);
        return;
      }

      // Response frame: { type: "res", id: "...", ok: bool, payload/error: ... }
      if (parsed.type === "res") {
        const pending = this.pending.get(parsed.id);
        if (!pending) {
          return;
        }

        // If expectFinal and status is "accepted", keep waiting
        const status = parsed.payload?.status;
        if (pending.expectFinal && status === "accepted") {
          return;
        }

        this.pending.delete(parsed.id);
        if (parsed.ok) {
          pending.resolve(parsed.payload);
        } else {
          pending.reject(new Error(parsed.error?.message ?? "unknown gateway error"));
        }
      }
    } catch {
      // parse error, ignore
    }
  }

  private flushPending(err: Error) {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }

  // ── Core request ─────────────────────────────────────────────────────

  async request<T = Record<string, unknown>>(
    method: string,
    params?: unknown,
    opts?: { expectFinal?: boolean; timeoutMs?: number },
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("gateway not connected");
    }

    const id = this.nextId();
    const frame = { type: "req", id, method, params };
    const expectFinal = opts?.expectFinal ?? false;
    const timeoutMs = opts?.timeoutMs ?? 120_000;

    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        expectFinal,
      });

      // Timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
    });

    this.ws.send(JSON.stringify(frame));
    return promise;
  }

  // ── High-level API ───────────────────────────────────────────────────

  /** Send a message to an agent and wait for the full reply */
  async sendAgentMessage(
    message: string,
    agentId?: string,
    sessionKey?: string,
  ): Promise<{
    runId?: string;
    status?: string;
    summary?: string;
    result?: {
      payloads?: Array<{ text?: string; mediaUrl?: string | null; mediaUrls?: string[] }>;
      meta?: unknown;
    };
  }> {
    return this.request(
      "agent",
      {
        message,
        agentId,
        sessionKey,
        deliver: false,
        timeout: 600,
        idempotencyKey: `ax-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
      { expectFinal: true, timeoutMs: 630_000 },
    );
  }

  /** List all configured agents */
  async listAgents(): Promise<{
    defaultId: string;
    mainKey: string;
    agents: AgentInfo[];
  }> {
    return this.request("agents.list", {});
  }

  /** List sessions */
  async listSessions(opts?: {
    limit?: number;
    includeDerivedTitles?: boolean;
    includeLastMessage?: boolean;
  }): Promise<{
    sessions: SessionInfo[];
    count: number;
  }> {
    return this.request("sessions.list", {
      limit: opts?.limit ?? 20,
      includeDerivedTitles: opts?.includeDerivedTitles ?? true,
      includeLastMessage: opts?.includeLastMessage ?? true,
    });
  }

  /** Get gateway status */
  async getStatus(): Promise<Record<string, unknown>> {
    return this.request("status");
  }

  /** Load chat history for a session from gateway's persisted transcripts */
  async getChatHistory(
    sessionKey: string,
    limit?: number,
  ): Promise<{
    sessionKey: string;
    sessionId?: string;
    messages: Array<{
      role: string;
      content: Array<{ type: string; text?: string }> | string;
      timestamp?: number;
    }>;
  }> {
    return this.request("chat.history", {
      sessionKey,
      limit: limit ?? 100,
    });
  }

  /** Inject a message into a session transcript (without triggering an agent run) */
  async chatInject(sessionKey: string, message: string, label?: string): Promise<void> {
    return this.request("chat.inject", {
      sessionKey,
      message,
      label,
    });
  }

  /** Get gateway health (memory, uptime, version) */
  async getHealth(): Promise<Record<string, unknown>> {
    return this.request("health");
  }

  /** Get usage cost summary */
  async getUsageCost(days?: number): Promise<Record<string, unknown>> {
    return this.request("usage.cost", { days: days ?? 1 });
  }

  /** Reset/clear a session's chat history */
  async resetSession(sessionKey: string): Promise<void> {
    return this.request("sessions.reset", { key: sessionKey });
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

let _instance: OpenClawGatewayClient | null = null;

export function getGatewayClient(): OpenClawGatewayClient {
  if (!_instance) {
    _instance = new OpenClawGatewayClient();
  }
  return _instance;
}
