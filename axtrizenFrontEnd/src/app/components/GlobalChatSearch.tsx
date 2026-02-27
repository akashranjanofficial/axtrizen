/**
 * GlobalChatSearch — Full-text search across all conversations.
 *
 * Sprint 4, Epic 4: A global search bar filters all active and historical
 * chats based on keyword matches. Uses the `search_chat` Tauri command
 * which performs SQLite FTS.
 *
 * Features:
 *   • Debounced search (300ms) to avoid hammering the DB
 *   • Shows message previews with highlighted matches
 *   • Click a result to navigate to that conversation
 *   • Keyboard navigation (Escape to close, Enter to select)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, MessageCircle, Users, Clock } from "lucide-react";
import { searchChat, type ChatMessage } from "../tauri-api";

// ── Types ──────────────────────────────────────────────────────────────

export interface SearchResult {
  message: ChatMessage;
  /** Highlighted snippet of content around the match */
  snippet: string;
  /** Conversation title extracted from the message */
  conversationTitle?: string;
}

export interface GlobalChatSearchProps {
  /** Called when user selects a search result */
  onNavigate?: (sessionKey: string, messageId: string) => void;
  /** Called when search panel is closed */
  onClose?: () => void;
  /** Whether the search panel is open */
  isOpen: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Create a snippet around the first occurrence of `query` in `text`.
 * Highlights the match with <mark> tags.
 */
export function createSnippet(text: string, query: string, contextChars = 60): string {
  if (!query || !text) return text.slice(0, contextChars * 2);
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, contextChars * 2);

  const start = Math.max(0, idx - contextChars);
  const end = Math.min(text.length, idx + query.length + contextChars);
  let snippet = "";
  if (start > 0) snippet += "…";
  snippet += text.slice(start, idx);
  snippet += `<mark>${text.slice(idx, idx + query.length)}</mark>`;
  snippet += text.slice(idx + query.length, end);
  if (end < text.length) snippet += "…";
  return snippet;
}

/**
 * Format a date string to relative time.
 */
export function formatSearchTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

/**
 * Debounce a callback by `delay` ms.
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ── Component ──────────────────────────────────────────────────────────

export function GlobalChatSearch({ onNavigate, onClose, isOpen }: GlobalChatSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  // Execute search on debounced query
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    searchChat(debouncedQuery, 50)
      .then((res) => {
        if (cancelled) return;
        const mapped: SearchResult[] = (res.messages ?? []).map((msg: ChatMessage) => ({
          message: msg,
          snippet: createSnippet(msg.content, debouncedQuery),
          conversationTitle: msg.sender_agent_name
            ? `DM: ${msg.sender_agent_name}`
            : `Conversation`,
        }));
        setResults(mapped);
        setSelectedIdx(0);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[GlobalChatSearch] Search failed:", err);
          setResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose?.();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && results[selectedIdx]) {
        const msg = results[selectedIdx].message;
        onNavigate?.(msg.conversation_id, msg.id);
      }
    },
    [results, selectedIdx, onNavigate, onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
      data-testid="global-chat-search"
    >
      {/* Search header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search all messages…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          data-testid="global-search-input"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border"
          data-testid="global-search-close"
        >
          ESC
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto" data-testid="global-search-results">
        {isSearching && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Searching…
          </div>
        )}

        {!isSearching && debouncedQuery.length >= 2 && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No messages found for "{debouncedQuery}"</p>
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="py-2">
            <p className="px-4 py-1 text-xs text-muted-foreground">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </p>
            {results.map((result, idx) => (
              <button
                key={result.message.id}
                type="button"
                onClick={() => onNavigate?.(result.message.conversation_id, result.message.id)}
                className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors
                  ${idx === selectedIdx ? "bg-muted/30" : ""}`}
                data-testid={`search-result-${idx}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {result.message.sender_agent_name ? (
                    <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium text-foreground">
                    {result.conversationTitle}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                    <Clock className="h-3 w-3" />
                    {formatSearchTime(result.message.created_at)}
                  </span>
                </div>
                <div
                  className="text-sm text-muted-foreground line-clamp-2
                             [&_mark]:bg-yellow-400/30 [&_mark]:text-foreground [&_mark]:rounded-sm [&_mark]:px-0.5"
                  dangerouslySetInnerHTML={{ __html: result.snippet }}
                />
                <div className="text-[10px] text-muted-foreground/50 mt-1">
                  {result.message.role} · {result.message.sender_agent_name ?? "You"}
                </div>
              </button>
            ))}
          </div>
        )}

        {!debouncedQuery && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Type to search across all conversations</p>
            <p className="text-xs mt-1 opacity-60">Minimum 2 characters</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default GlobalChatSearch;
