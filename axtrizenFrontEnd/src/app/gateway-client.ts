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
  senderName?: string; // e.g. "Backend", "Manager", "FrontEndDev1"
  senderLabel?: string; // e.g. "system", "assistant", "manager"
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

/** Streaming delta event — text chunks and tool use events */
export type StreamDelta = {
  runId: string;
  sessionKey?: string;
} & (
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; toolName: string; toolInput: string }
  | { type: "tool_result"; toolName: string; output: string; error?: string }
  | { type: "thinking"; text: string }
  | { type: "started" }
  | { type: "error"; message: string }
);

type StreamCallback = (delta: StreamDelta) => void;

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

// ── Client ─────────────────────────────────────────────────────────────

export class OpenClawGatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private streamCallbacks = new Map<string, StreamCallback>();
  private idCounter = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1000;
  private closed = false;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

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
      // Don't send connect immediately — wait for connect.challenge from Gateway.
      // Queue a fallback connect after 750ms in case challenge isn't received.
      this.connectNonce = null;
      this.connectSent = false;
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
      }
      this.connectTimer = setTimeout(() => {
        this.sendConnectFrame();
      }, 750);
    };

    this.ws.onmessage = (evt) => {
      this.handleMessage(String(evt.data));
    };

    this.ws.onclose = (evt) => {
      // Flush ALL pending requests immediately so callers get an error
      // instead of hanging until the 120s timeout.
      this.flushPending(
        new Error(`WebSocket closed: code=${evt.code} reason=${evt.reason || "unknown"}`),
      );
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
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
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
    if (this.connectSent) {
      return;
    }
    this.connectSent = true;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    const params: Record<string, unknown> = {
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

    // Include nonce from connect.challenge if available
    if (this.connectNonce) {
      params.nonce = this.connectNonce;
    }

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
        // Handle connect.challenge: Gateway requires nonce-signed handshake
        if (parsed.event === "connect.challenge") {
          const payload = parsed.payload as { nonce?: string } | undefined;
          if (payload?.nonce) {
            this.connectNonce = payload.nonce;
            this.sendConnectFrame();
          }
          return;
        }

        // ── Chat streaming events — route to per-run callbacks ──
        if (parsed.event === "chat") {
          this.handleChatEvent(parsed.payload);
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
          // Route "accepted" as a started event to stream callback
          const runId = parsed.payload?.runId || parsed.id;
          const cb = this.streamCallbacks.get(parsed.id);
          if (cb && status === "accepted") {
            cb({ runId, type: "started" });
          }
          return;
        }

        // Clean up stream callback when done
        this.streamCallbacks.delete(parsed.id);

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

  /**
   * Parse chat streaming events and route to the appropriate run callback.
   * OpenClaw sends: { state: "delta"|"started"|"final"|"error", runId, ... }
   */
  private handleChatEvent(payload: Record<string, unknown> | undefined) {
    if (!payload) return;

    const runId = (payload.runId as string) || "";
    const state = payload.state as string;

    // Find the stream callback by checking all registered run IDs
    // The runId in events may differ from the request ID, so we try matching
    let cb: StreamCallback | undefined;
    for (const [, callback] of this.streamCallbacks) {
      cb = callback;
      break; // For now, route to the first (most recent) callback
    }
    if (!cb) return;

    if (state === "delta") {
      const delta = payload.delta as Record<string, unknown> | undefined;
      const message = payload.message as Record<string, unknown> | undefined;

      // Text delta
      const text = (delta?.text as string) || "";
      if (text) {
        cb({ runId, type: "text_delta", text });
      }

      // Tool use events from message content blocks
      const content = (message?.content ?? delta?.content) as
        | Array<Record<string, unknown>>
        | undefined;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_use") {
            cb({
              runId,
              type: "tool_start",
              toolName: (block.name as string) || "unknown",
              toolInput:
                typeof block.input === "string"
                  ? block.input
                  : JSON.stringify(block.input ?? {}, null, 2),
            });
          }
          if (block.type === "tool_result") {
            const resultContent = block.content as string | Array<{ text?: string }> | undefined;
            const output =
              typeof resultContent === "string"
                ? resultContent
                : Array.isArray(resultContent)
                  ? resultContent.map((c) => c.text || "").join("\n")
                  : JSON.stringify(block);
            cb({
              runId,
              type: "tool_result",
              toolName: (block.name as string) || (block.tool_use_id as string) || "unknown",
              output,
              error: block.is_error ? output : undefined,
            });
          }
        }
      }

      // Thinking delta
      const thinking = (delta?.thinking as string) || "";
      if (thinking) {
        cb({ runId, type: "thinking", text: thinking });
      }
    }

    if (state === "error") {
      cb({
        runId,
        type: "error",
        message: (payload.errorMessage as string) || "Unknown error",
      });
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

  /**
   * Send a message to an agent with streaming support.
   * The onDelta callback fires for each text chunk and tool event.
   * Returns the final response when complete.
   */
  async sendAgentMessageStreaming(
    message: string,
    agentId: string | undefined,
    sessionKey: string | undefined,
    onDelta: StreamCallback,
  ): Promise<{
    runId?: string;
    status?: string;
    summary?: string;
    result?: {
      payloads?: Array<{ text?: string; mediaUrl?: string | null; mediaUrls?: string[] }>;
      meta?: unknown;
    };
  }> {
    const idempotencyKey = `ax-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const id = this.nextId();

    // Register the stream callback before sending
    this.streamCallbacks.set(id, onDelta);

    const frame = {
      type: "req",
      id,
      method: "agent",
      params: {
        message,
        agentId,
        sessionKey,
        deliver: false,
        timeout: 600,
        idempotencyKey,
      },
    };

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.streamCallbacks.delete(id);
      throw new Error("gateway not connected");
    }

    const timeoutMs = 630_000;

    const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as Record<string, unknown>),
        reject,
        expectFinal: true,
      });

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          this.streamCallbacks.delete(id);
          reject(new Error(`Streaming request timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
    });

    this.ws.send(JSON.stringify(frame));

    const result = await promise;
    return {
      runId: result.runId as string | undefined,
      status: result.status as string | undefined,
      summary: result.summary as string | undefined,
      result: result.result as
        | {
            payloads?: Array<{ text?: string; mediaUrl?: string | null; mediaUrls?: string[] }>;
            meta?: unknown;
          }
        | undefined,
    };
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
