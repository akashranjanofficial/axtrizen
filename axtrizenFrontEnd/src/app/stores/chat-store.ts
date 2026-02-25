/**
 * Chat Store — SQLite-backed message persistence for Axtrizen.
 *
 * This store is the single source of truth for chat messages.
 * Messages are saved to the local SQLite database via Tauri commands
 * and kept in memory for fast rendering.
 *
 * Key design:
 *  - Each chat has a unique `chatId` (e.g., "dm:manager", "team:engg-team")
 *  - Messages are stored per chatId, never shared between DM and group
 *  - The store persists messages across page refreshes via SQLite
 */

import {
  saveChatMessage,
  getConversationHistory,
  deleteConversation,
  getAllConversations,
} from "../tauri-api";
import { buildChatId, buildSessionKey } from "../services/gateway-adapter";

// ── Types ──────────────────────────────────────────────────────────────

export interface StoredMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  senderName?: string;
  senderLabel?: string;
  timestamp: number;
  status: "sending" | "sent" | "error";
  metadata?: Record<string, unknown>;
}

export type ChatContext = { type: "dm"; agentId: string } | { type: "team"; teamId: string };

type Listener = () => void;

// ── Chat Store ─────────────────────────────────────────────────────────

class ChatStore {
  /** In-memory message cache, keyed by chatId */
  private messagesByChat = new Map<string, StoredMessage[]>();

  /** Active chatId */
  private _activeChatId: string | null = null;

  /** Listeners for store changes */
  private listeners = new Set<Listener>();

  // ── Getters ──

  get activeChatId(): string | null {
    return this._activeChatId;
  }

  /** Get messages for the active chat */
  getActiveMessages(): StoredMessage[] {
    if (!this._activeChatId) return [];
    return this.messagesByChat.get(this._activeChatId) ?? [];
  }

  /** Get messages for any chat */
  getMessages(chatId: string): StoredMessage[] {
    return this.messagesByChat.get(chatId) ?? [];
  }

  // ── Actions ──

  /** Switch to a different chat and load messages from DB */
  async setActiveChat(context: ChatContext): Promise<void> {
    const chatId = buildChatId(context);
    this._activeChatId = chatId;

    // Load from DB if not already in memory
    if (!this.messagesByChat.has(chatId)) {
      await this.loadFromDb(chatId, context);
    }
    this.notify();
  }

  /** Load messages from SQLite for a given chatId */
  private async loadFromDb(chatId: string, context: ChatContext): Promise<void> {
    try {
      // Build the session key that was used when saving
      const sessionKey =
        context.type === "dm"
          ? buildSessionKey(context.agentId, { type: "dm" })
          : `team-chat:${context.teamId}`;

      const result = await getConversationHistory(sessionKey, 200);
      const dbMessages: StoredMessage[] = (result.messages ?? []).map((m: any) => ({
        id: m.id,
        chatId,
        role: m.role ?? "assistant",
        content: m.content ?? "",
        senderName: m.sender_agent_name,
        timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
        status: "sent" as const,
      }));
      this.messagesByChat.set(chatId, dbMessages);
    } catch (err) {
      console.warn(`Failed to load chat history for ${chatId}:`, err);
      this.messagesByChat.set(chatId, []);
    }
  }

  /** Add a message to the active chat and persist to DB */
  async addMessage(context: ChatContext, msg: Omit<StoredMessage, "chatId">): Promise<void> {
    const chatId = buildChatId(context);
    const fullMsg: StoredMessage = { ...msg, chatId };

    // Update in-memory
    const current = this.messagesByChat.get(chatId) ?? [];
    this.messagesByChat.set(chatId, [...current, fullMsg]);
    this.notify();

    // Persist to DB (fire-and-forget, don't block UI)
    const sessionKey =
      context.type === "dm"
        ? buildSessionKey(context.agentId, { type: "dm" })
        : `team-chat:${context.teamId}`;

    saveChatMessage({
      sessionKey,
      role: msg.role,
      content: msg.content,
      senderAgentName: msg.senderName,
      conversationType: context.type === "team" ? "group" : "direct",
      agentId: context.type === "dm" ? context.agentId : undefined,
      teamId: context.type === "team" ? context.teamId : undefined,
      title: context.type === "dm" ? `DM: ${context.agentId}` : `Team: ${context.teamId}`,
    }).catch((err) => console.warn("Failed to save message to DB:", err));
  }

  /** Update a message in place (e.g., status change, content update from streaming) */
  updateMessage(chatId: string, msgId: string, updates: Partial<StoredMessage>): void {
    const msgs = this.messagesByChat.get(chatId);
    if (!msgs) return;
    const idx = msgs.findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    msgs[idx] = { ...msgs[idx], ...updates };
    this.messagesByChat.set(chatId, [...msgs]);
    this.notify();
  }

  /** Clear all messages for a chat */
  async clearChat(context: ChatContext): Promise<void> {
    const chatId = buildChatId(context);
    this.messagesByChat.set(chatId, []);
    this.notify();

    // Also delete from DB
    try {
      const convs = await getAllConversations();
      const sessionKey =
        context.type === "dm"
          ? buildSessionKey(context.agentId, { type: "dm" })
          : `team-chat:${context.teamId}`;
      const conv = convs.conversations?.find((c: any) => c.session_key === sessionKey);
      if (conv?.id) {
        await deleteConversation(conv.id);
      }
    } catch (err) {
      console.warn("Failed to delete conversation from DB:", err);
    }
  }

  /** Build the gateway session key for sending messages in a given context */
  getSessionKey(agentId: string, context: ChatContext): string {
    if (context.type === "team") {
      return buildSessionKey(agentId, { type: "team", teamId: context.teamId });
    }
    return buildSessionKey(agentId, { type: "dm" });
  }

  // ── Subscriptions ──

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) {
      fn();
    }
  }
}

export const chatStore = new ChatStore();
