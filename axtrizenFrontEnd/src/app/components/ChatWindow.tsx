import {
  Send,
  MessageCircle,
  Bot,
  Wifi,
  WifiOff,
  Loader2,
  RefreshCw,
  AlertCircle,
  Trash2,
  Users,
  Star,
  Search,
  X,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
  getGatewayClient,
  type ChatMessage,
  type AgentInfo,
  type ConnectionStatus,
  type GatewayEvent,
} from "../gateway-client";
import { agentStore } from "../stores/agent-store";
import {
  getTeams,
  getTeamMembers,
  deleteTeam as deleteTauriTeam,
  deleteAgent as deleteTauriAgent,
  type Team,
  type TeamMember,
} from "../tauri-api";

// Strip gateway protocol tags from message content
function sanitizeMessageContent(text: string): string {
  return text
    .replace(/<\/?final>/gi, "")
    .replace(/<\/?error>/gi, "")
    .replace(/<\/?thinking>/gi, "")
    .replace(/<\/?result>/gi, "")
    .trim();
}

// Chat target type
interface ChatTarget {
  type: "agent" | "team";
  id: string;
}

interface ChatWindowProps {
  chatTarget?: ChatTarget | null;
}

export function ChatWindow({ chatTarget }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Map<string, string>>(new Map());

  // Team group chat state
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showMembersPanel, setShowMembersPanel] = useState(false);

  // Phase 2: Enhanced UX state
  const [searchQuery, setSearchQuery] = useState("");
  const [pinnedChats, setPinnedChats] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("axtrizen:pinnedChats");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [lastMessages, setLastMessages] = useState<Map<string, { text: string; time: number }>>(
    new Map(),
  );

  // @mention autocomplete state
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef(getGatewayClient());
  const messageStoreRef = useRef<Map<string, ChatMessage[]>>(new Map());

  // Pin/unpin helper with localStorage persistence
  const togglePin = (chatKey: string) => {
    setPinnedChats((prev) => {
      const next = new Set(prev);
      if (next.has(chatKey)) {
        next.delete(chatKey);
      } else {
        next.add(chatKey);
      }
      localStorage.setItem("axtrizen:pinnedChats", JSON.stringify([...next]));
      return next;
    });
  };

  // Delete a chat (agent or team)
  const handleDeleteChat = async (type: "agent" | "team", id: string) => {
    if (!confirm(`Remove this ${type === "team" ? "team chat" : "agent chat"}?`)) {
      return;
    }
    try {
      if (type === "agent") {
        await deleteTauriAgent(id);
        setAgents((prev) => prev.filter((a) => a.id !== id));
        if (selectedAgent?.id === id) {
          setSelectedAgent(null);
          setMessages([]);
        }
        // Also sync agent store
        agentStore.sync();
      } else {
        await deleteTauriTeam(id);
        setTeams((prev) => prev.filter((t) => t.id !== id));
        if (selectedTeam?.id === id) {
          setSelectedTeam(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error(`Failed to delete ${type}:`, err);
      setError(`Failed to delete ${type}`);
    }
  };

  // Relative time formatter
  const formatRelativeTime = (ts: number): string => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) {
      return "now";
    }
    if (diff < 3600) {
      return `${Math.floor(diff / 60)}m`;
    }
    if (diff < 86400) {
      return `${Math.floor(diff / 3600)}h`;
    }
    return `${Math.floor(diff / 86400)}d`;
  };

  // Update last message when messages change
  useEffect(() => {
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      const chatKey = selectedTeam ? `team:${selectedTeam.id}` : selectedAgent?.id;
      if (chatKey) {
        setLastMessages((prev) => {
          const next = new Map(prev);
          next.set(chatKey, {
            text: last.content.slice(0, 60),
            time: last.timestamp || Date.now(),
          });
          return next;
        });
      }
    }
  }, [messages, selectedAgent, selectedTeam]);

  // Filtered + sorted agents (pinned first, then filtered by search)
  const sortedAgents = agents
    .filter(
      (a) => !searchQuery || (a.name || a.id).toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .toSorted((a, b) => {
      const aPinned = pinnedChats.has(a.id) ? 1 : 0;
      const bPinned = pinnedChats.has(b.id) ? 1 : 0;
      return bPinned - aPinned;
    });

  // Filtered + sorted teams (pinned first, then filtered by search)
  const sortedTeams = teams
    .filter((t) => !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .toSorted((a, b) => {
      const aPinned = pinnedChats.has(`team:${a.id}`) ? 1 : 0;
      const bPinned = pinnedChats.has(`team:${b.id}`) ? 1 : 0;
      return bPinned - aPinned;
    });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAgentThinking]);

  // Handle chatTarget navigation from TeamsView or external
  useEffect(() => {
    if (!chatTarget) {
      return;
    }

    if (chatTarget.type === "agent") {
      // Direct agent chat
      const match = agents.find((a) => a.id === chatTarget.id);
      if (match && match.id !== selectedAgent?.id) {
        setSelectedTeam(null);
        setSelectedAgent(match);
        loadChatHistory(match.id);
      }
    } else if (chatTarget.type === "team") {
      // Team group chat
      const team = teams.find((t) => t.id === chatTarget.id);
      if (team) {
        setSelectedAgent(null);
        setSelectedTeam(team);
        setMessages(messageStoreRef.current.get(`team:${team.id}`) || []);
        // Load team members for the panel
        getTeamMembers(team.id)
          .then(setTeamMembers)
          .catch(() => setTeamMembers([]));
      }
    }
  }, [chatTarget, agents, teams]);

  // Load teams from DB
  const loadTeams = useCallback(async () => {
    try {
      const t = await getTeams();
      setTeams(t);
    } catch (err) {
      console.warn("Failed to load teams:", err);
    }
  }, []);

  // Connect to gateway on mount
  useEffect(() => {
    const client = clientRef.current;

    client.onStatusChange = (status) => {
      setConnectionStatus(status);
      if (status === "connected") {
        setError(null);
        loadAgents();
        loadTeams();
      }
    };

    client.onEvent = (evt: GatewayEvent) => {
      // Handle streaming chat events
      if (evt.event === "chat.token" || evt.event === "chat.delta") {
        const payload = evt.payload as { text?: string } | undefined;
        if (payload?.text) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.status === "sending") {
              return [...prev.slice(0, -1), { ...last, content: last.content + payload.text }];
            }
            return prev;
          });
        }
      }
    };

    client.onError = (err) => {
      setError(err);
    };

    client.connect();

    return () => {
      client.disconnect();
    };
  }, []);

  // Subscribe to agentStore for live status updates
  useEffect(() => {
    const updateStatuses = () => {
      const statusMap = new Map<string, string>();
      for (const agent of agentStore.getAgents()) {
        statusMap.set(agent.id, agent.status);
      }
      setAgentStatuses(statusMap);
    };
    updateStatuses();
    const unsub = agentStore.subscribe(updateStatuses);
    return unsub;
  }, []);

  // Load chat history from gateway for the given agent
  const loadChatHistory = useCallback(async (agentId: string) => {
    try {
      const client = clientRef.current;
      if (client.status !== "connected") {
        return;
      }

      const sessionKey = `agent:${agentId}:main`;
      const result = await client.getChatHistory(sessionKey);

      if (result.messages && result.messages.length > 0) {
        const parsed: ChatMessage[] = result.messages
          // Filter out tool results and non-displayable messages
          .filter((msg) => {
            // Skip tool role messages (raw tool output)
            if (msg.role === "tool") {
              return false;
            }
            // Skip system messages
            if (msg.role === "system") {
              return false;
            }
            return true;
          })
          .map((msg, idx) => {
            // Gateway format: { role, content: [{type, text}] | string, timestamp }
            let text = "";
            if (typeof msg.content === "string") {
              text = msg.content;
            } else if (Array.isArray(msg.content)) {
              text = msg.content
                .filter((c) => c.type === "text" && c.text)
                .map((c) => c.text)
                .join("\n");
            }
            return {
              id: `history-${idx}-${msg.timestamp ?? idx}`,
              role: msg.role as ChatMessage["role"],
              content: sanitizeMessageContent(text),
              timestamp: msg.timestamp ?? Date.now(),
              status: "sent" as const,
            };
          })
          // Filter out empty messages and raw JSON tool output
          .filter((msg) => {
            if (!msg.content) {
              return false;
            }
            // Skip messages that are just JSON objects (tool results rendered as text)
            const trimmed = msg.content.trim();
            if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
              try {
                JSON.parse(trimmed);
                return false;
              } catch {
                /* not JSON, keep it */
              }
            }
            return true;
          });
        setMessages(parsed);
        messageStoreRef.current.set(agentId, parsed);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.warn("Failed to load chat history:", err);
      // Fall back to in-memory store
      setMessages(messageStoreRef.current.get(agentId) || []);
    }
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      const client = clientRef.current;
      const result = await client.listAgents();
      // Filter out the system 'main' agent and legacy group chat agents
      const userAgents = (result.agents ?? []).filter(
        (a) =>
          a.id !== "main" &&
          !a.id.includes("group-chat") &&
          !(a.name || "").toLowerCase().includes("group chat"),
      );
      if (userAgents.length > 0) {
        setAgents(userAgents);
        if (!selectedAgent) {
          setSelectedAgent(userAgents[0]);
          // Load chat history for the first (auto-selected) agent
          loadChatHistory(userAgents[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to list agents:", err);
    }
  }, [selectedAgent, loadChatHistory]);

  const handleSendMessage = async () => {
    const body = messageInput.trim();
    if (!body || isAgentThinking) {
      return;
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: body,
      timestamp: Date.now(),
      status: "sent",
    };

    setMessages((prev) => [...prev, userMsg]);
    setMessageInput("");
    setIsAgentThinking(true);
    setError(null);

    // Add placeholder for assistant response
    const assistantMsgId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        status: "sending",
      },
    ]);

    try {
      const client = clientRef.current;

      let targetAgents: AgentInfo[] = [];
      let targetSessionKey = selectedAgent ? `agent:${selectedAgent.id}:main` : undefined;
      const groupSessionKey = selectedTeam ? `team:${selectedTeam.id}:group` : targetSessionKey;
      let isGroupChatTag = false;

      // Intercept @tags in Group Chats to route to specific agents
      if (selectedTeam) {
        if (!body.includes("@")) {
          throw new Error(
            "You must tag at least one specific agent (e.g., @AgentName) to send a message in a Group Chat.",
          );
        }

        const lowerBody = body.toLowerCase();
        // Sort agents by name length descending to avoid partial matches
        const sortedAgents = [...agents].toSorted(
          (a, b) => (b.name || b.id).length - (a.name || a.id).length,
        );

        const foundAgents = new Map<string, AgentInfo>();
        let remainingBody = lowerBody;

        for (const a of sortedAgents) {
          const name = a.name || a.id;
          const tag = `@${name.toLowerCase()}`;
          if (remainingBody.includes(tag)) {
            foundAgents.set(a.id, a);
            remainingBody = remainingBody.split(tag).join("");
          }
        }

        if (foundAgents.size === 0) {
          throw new Error(
            "Tagged agent(s) not found. Please ensure you are using the correct name(s).",
          );
        }

        targetAgents = Array.from(foundAgents.values());
        isGroupChatTag = true;
      } else if (selectedAgent) {
        targetAgents = [selectedAgent];
      }

      // 1. Inject user's message into group chat transcript natively (only once)
      if (isGroupChatTag && groupSessionKey) {
        client
          .chatInject(groupSessionKey, body)
          .catch((e) => console.warn("Failed to inject user msg", e));
      }

      const assistantMsgIds = targetAgents.map((a) => `${Date.now()}-${a.id}`);

      // Create a placeholder message for each targeted agent
      const placeholders: ChatMessage[] = targetAgents.map((agent, i) => ({
        id: assistantMsgIds[i],
        role: "assistant",
        content: isGroupChatTag ? `Waiting for @${agent.name || agent.id}...` : "Thinking...",
        timestamp: Date.now() + i,
        status: "sending",
      }));

      setMessages((prev) => [...prev, userMsg, ...placeholders]);

      // 2. Send message to target agents in parallel
      await Promise.allSettled(
        targetAgents.map(async (agent, idx) => {
          const msgId = assistantMsgIds[idx];
          const agentSessionKey = `agent:${agent.id}:main`;
          const taggedAgentName = agent.name || agent.id;

          try {
            const response = await client.sendAgentMessage(body, agent.id, agentSessionKey);

            // Build response text from payloads
            const payloads = response.result?.payloads ?? [];
            const responseText =
              payloads
                .map((p) => p.text)
                .filter(Boolean)
                .join("\n") ||
              response.summary ||
              "No reply from agent.";

            const finalResponseText = isGroupChatTag
              ? `**@${taggedAgentName}**: ${responseText}`
              : responseText;

            // 3. Inject assistant's response back into group chat transcript
            if (isGroupChatTag && groupSessionKey) {
              await client
                .chatInject(groupSessionKey, finalResponseText, "assistant")
                .catch((e) => console.warn("Failed to inject response msg", e));
            }

            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, content: finalResponseText, status: "sent" as const } : m,
              ),
            );
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? {
                      ...m,
                      content: `⚠️ Error from @${taggedAgentName}: ${errMsg}`,
                      status: "error" as const,
                    }
                  : m,
              ),
            );
          }
        }),
      );
    } catch (err) {
      // Catch overall errors (e.g., failed to find tags)
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: `⚠️ Error: ${errMsg}`,
          timestamp: Date.now(),
          status: "error",
        },
      ]);
      setError(errMsg);
    } finally {
      setIsAgentThinking(false);
      inputRef.current?.focus();
    }
  };

  // Clear/delete the current chat history
  const handleClearChat = async () => {
    if (!selectedAgent) {
      return;
    }
    const sessionKey = `agent:${selectedAgent.id}:main`;
    try {
      await clientRef.current.resetSession(sessionKey);
    } catch (err) {
      console.warn("Failed to reset session on gateway:", err);
    }
    // Clear local messages
    messageStoreRef.current.set(selectedAgent.id, []);
    setMessages([]);
  };

  // @mention autocomplete logic
  const mentionAgents = agents.filter((a) =>
    (a.name || a.id).toLowerCase().includes(mentionFilter.toLowerCase()),
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMessageInput(val);

    // Detect @ at the start of input or after a space
    const atIndex = val.lastIndexOf("@");
    if (atIndex !== -1 && (atIndex === 0 || val[atIndex - 1] === " ")) {
      const filter = val.slice(atIndex + 1);
      // Only show menu if there's no space after the @filter (still typing the name)
      if (!filter.includes(" ")) {
        setMentionFilter(filter);
        setShowMentionMenu(true);
        setMentionIndex(0);
        return;
      }
    }
    setShowMentionMenu(false);
  };

  const insertMention = (agent: AgentInfo) => {
    const atIndex = messageInput.lastIndexOf("@");
    const before = messageInput.slice(0, atIndex);
    const name = agent.name || agent.id;
    setMessageInput(`${before}@${name} `);
    setShowMentionMenu(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle mention menu navigation
    if (showMentionMenu && mentionAgents.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionAgents.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionAgents[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionMenu(false);
        return;
      }
    }
    // Normal enter sends message
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleReconnect = () => {
    setError(null);
    clientRef.current.disconnect();
    clientRef.current.connect();
  };

  // Status indicator
  const StatusBadge = () => {
    const statusConfig = {
      connected: { icon: Wifi, color: "text-green-400", bg: "bg-green-500/10", label: "Connected" },
      connecting: {
        icon: Loader2,
        color: "text-amber-400",
        bg: "bg-amber-500/10",
        label: "Connecting...",
      },
      disconnected: {
        icon: WifiOff,
        color: "text-muted-foreground",
        bg: "bg-muted",
        label: "Disconnected",
      },
      error: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10", label: "Error" },
    };
    const cfg = statusConfig[connectionStatus];
    const Icon = cfg.icon;

    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${cfg.bg} ${cfg.color}`}
      >
        <Icon className={`h-3 w-3 ${connectionStatus === "connecting" ? "animate-spin" : ""}`} />
        <span>{cfg.label}</span>
        {(connectionStatus === "disconnected" || connectionStatus === "error") && (
          <button
            onClick={handleReconnect}
            className="ml-1 hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-73px)] flex overflow-hidden">
      {/* Left Sidebar — Chats */}
      <div className="w-72 border-r border-border bg-card/50 backdrop-blur-xl flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">Chats</h3>
            <StatusBadge />
          </div>
          <p className="text-xs text-muted-foreground">
            {agents.length} agent{agents.length !== 1 ? "s" : ""} · {teams.length} team
            {teams.length !== 1 ? "s" : ""}
          </p>
        </div>
        {/* Search bar */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              data-testid="chat-search"
              className="w-full rounded-lg border border-border bg-muted py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {sortedAgents.length === 0 &&
            sortedTeams.length === 0 &&
            connectionStatus === "connected" && (
              <div className="p-6 text-center">
                <Bot className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">
                  {searchQuery ? "No matching chats." : "No agents or teams found."}
                </p>
                {!searchQuery && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Create an agent or team first.
                  </p>
                )}
              </div>
            )}
          {connectionStatus !== "connected" && agents.length === 0 && (
            <div className="p-6 text-center">
              <WifiOff className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">Connect to gateway to see chats.</p>
              <button
                onClick={handleReconnect}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Connect now
              </button>
            </div>
          )}

          {/* Team Group Chats */}
          {sortedTeams.length > 0 && (
            <div>
              <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Teams
              </p>
              <div className="space-y-0.5">
                {sortedTeams.map((team) => {
                  const chatKey = `team:${team.id}`;
                  const isPinned = pinnedChats.has(chatKey);
                  const unread = unreadCounts.get(chatKey) || 0;
                  const lastMsg = lastMessages.get(chatKey);
                  return (
                    <button
                      key={chatKey}
                      onClick={() => {
                        if (selectedAgent) {
                          messageStoreRef.current.set(selectedAgent.id, messages);
                        }
                        if (selectedTeam) {
                          messageStoreRef.current.set(`team:${selectedTeam.id}`, messages);
                        }
                        setSelectedAgent(null);
                        setSelectedTeam(team);
                        setMessages(messageStoreRef.current.get(chatKey) || []);
                        // Clear unread
                        setUnreadCounts((prev) => {
                          const n = new Map(prev);
                          n.delete(chatKey);
                          return n;
                        });
                        getTeamMembers(team.id)
                          .then(setTeamMembers)
                          .catch(() => setTeamMembers([]));
                      }}
                      data-testid={`chat-team-${team.id}`}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200 group relative ${
                        selectedTeam?.id === team.id
                          ? "bg-primary/10 border border-primary/30 text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${
                          selectedTeam?.id === team.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-blue-500/20 text-blue-400"
                        }`}
                      >
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-sm font-medium truncate">{team.name}</p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {lastMsg && (
                              <span className="text-[10px] text-muted-foreground">
                                {formatRelativeTime(lastMsg.time)}
                              </span>
                            )}
                            {unread > 0 && (
                              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                                {unread > 9 ? "9+" : unread}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {lastMsg ? lastMsg.text : "Group Chat"}
                        </p>
                      </div>
                      {/* Pin toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(chatKey);
                        }}
                        className={`absolute top-1 right-1 p-1 rounded transition-all ${
                          isPinned
                            ? "text-amber-400 opacity-100"
                            : "text-muted-foreground opacity-0 group-hover:opacity-100"
                        }`}
                        title={isPinned ? "Unpin" : "Pin"}
                      >
                        <Star className={`h-3 w-3 ${isPinned ? "fill-current" : ""}`} />
                      </button>
                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteChat("team", team.id);
                        }}
                        className="absolute bottom-1 right-1 p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 transition-all"
                        title="Delete team chat"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Direct Agent Chats */}
          {sortedAgents.length > 0 && (
            <div>
              <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Direct
              </p>
              <div className="space-y-0.5">
                {sortedAgents.map((agent) => {
                  const chatKey = agent.id;
                  const isPinned = pinnedChats.has(chatKey);
                  const unread = unreadCounts.get(chatKey) || 0;
                  const lastMsg = lastMessages.get(chatKey);
                  const status = agentStatuses.get(agent.id) || "idle";
                  const dotColor: Record<string, string> = {
                    active: "bg-green-500",
                    idle: "bg-amber-500",
                    error: "bg-red-500",
                    dormant: "bg-gray-500",
                  };
                  return (
                    <button
                      key={chatKey}
                      onClick={() => {
                        if (selectedAgent) {
                          messageStoreRef.current.set(selectedAgent.id, messages);
                        }
                        if (selectedTeam) {
                          messageStoreRef.current.set(`team:${selectedTeam.id}`, messages);
                        }
                        setSelectedTeam(null);
                        setSelectedAgent(agent);
                        // Clear unread
                        setUnreadCounts((prev) => {
                          const n = new Map(prev);
                          n.delete(chatKey);
                          return n;
                        });
                        loadChatHistory(agent.id);
                      }}
                      data-testid={`chat-agent-${agent.id}`}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200 group relative ${
                        selectedAgent?.id === agent.id
                          ? "bg-primary/10 border border-primary/30 text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                            selectedAgent?.id === agent.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <Bot className="h-4 w-4" />
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${dotColor[status] || dotColor.idle}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-sm font-medium truncate">{agent.name || agent.id}</p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {lastMsg && (
                              <span className="text-[10px] text-muted-foreground">
                                {formatRelativeTime(lastMsg.time)}
                              </span>
                            )}
                            {unread > 0 && (
                              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                                {unread > 9 ? "9+" : unread}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {lastMsg ? lastMsg.text : agent.id}
                        </p>
                      </div>
                      {/* Pin toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(chatKey);
                        }}
                        className={`absolute top-1 right-1 p-1 rounded transition-all ${
                          isPinned
                            ? "text-amber-400 opacity-100"
                            : "text-muted-foreground opacity-0 group-hover:opacity-100"
                        }`}
                        title={isPinned ? "Unpin" : "Pin"}
                      >
                        <Star className={`h-3 w-3 ${isPinned ? "fill-current" : ""}`} />
                      </button>
                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteChat("agent", agent.id);
                        }}
                        className="absolute bottom-1 right-1 p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 transition-all"
                        title="Delete agent chat"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="h-14 border-b border-border bg-card/50 backdrop-blur-xl flex items-center justify-between px-6">
          {selectedTeam ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20">
                  <Users className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{selectedTeam.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {teamMembers.length} member{teamMembers.length !== 1 ? "s" : ""} · Type{" "}
                    <span className="text-primary font-mono">@</span> to mention
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowMembersPanel(!showMembersPanel)}
                  title="View members"
                  className={`p-2 rounded-lg transition-colors ${
                    showMembersPanel
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Users className="h-4 w-4" />
                </button>
                <button
                  onClick={handleClearChat}
                  title="Clear chat history"
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : selectedAgent ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                  <Bot className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {selectedAgent.name || selectedAgent.id}
                  </h3>
                  <p className="text-xs text-muted-foreground">Direct message</p>
                </div>
              </div>
              <button
                onClick={handleClearChat}
                title="Clear chat history"
                className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a chat to start messaging</p>
          )}
        </div>

        {/* Members Panel (slide-out for group chats) */}
        {selectedTeam && showMembersPanel && (
          <div className="border-b border-border bg-card/30 px-6 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Members ({teamMembers.length})
              </p>
            </div>
            <div className="space-y-2">
              {teamMembers.map((member) => {
                const memberAgent = agents.find((a) => a.id === member.agent_id);
                const status = agentStatuses.get(member.agent_id) || "idle";
                const dotColor: Record<string, string> = {
                  active: "bg-green-500",
                  idle: "bg-amber-500",
                  error: "bg-red-500",
                  dormant: "bg-gray-500",
                };
                return (
                  <div key={member.agent_id} className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${dotColor[status] || dotColor.idle}`} />
                    <span className="text-sm text-foreground">
                      {memberAgent?.name || member.agent_id}
                    </span>
                    <span className="text-xs text-muted-foreground">• {status}</span>
                  </div>
                );
              })}
              {teamMembers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No members yet. Add agents from the Teams view.
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Type <span className="text-primary font-mono">@name</span> in the chat to message a
              specific member
            </p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (selectedAgent || selectedTeam) && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                {selectedTeam ? (
                  <Users className="h-8 w-8 text-primary" />
                ) : (
                  <MessageCircle className="h-8 w-8 text-primary" />
                )}
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                {selectedTeam
                  ? `${selectedTeam.name} Group Chat`
                  : `Chat with ${selectedAgent?.name || selectedAgent?.id}`}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {selectedTeam
                  ? "Type @agent_name to send a message to a specific team member."
                  : "Send a message to assign work, ask questions, or get status updates from your agent."}
              </p>
            </div>
          )}

          {messages.length === 0 && !selectedAgent && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
                <Bot className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">No Agent Selected</h3>
              <p className="text-sm text-muted-foreground">
                Select an agent from the sidebar to start chatting.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : msg.status === "error"
                      ? "bg-red-500/10 border border-red-500/30 text-red-400 rounded-bl-md"
                      : "bg-muted text-foreground rounded-bl-md"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Bot className="h-3 w-3" />
                    <span className="text-xs font-medium opacity-70">
                      {selectedAgent?.name || "Agent"}
                    </span>
                  </div>
                )}
                <div className="chat-markdown text-sm leading-relaxed">
                  {msg.content ? (
                    <ReactMarkdown>{sanitizeMessageContent(msg.content)}</ReactMarkdown>
                  ) : msg.status === "sending" ? null : (
                    <p>...</p>
                  )}
                </div>
                <p
                  className={`text-[10px] mt-1 ${
                    msg.role === "user" ? "text-primary-foreground/50" : "text-muted-foreground"
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}

          {/* Thinking indicator */}
          {isAgentThinking && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-3 w-3 text-muted-foreground" />
                  <div className="flex gap-1">
                    <span
                      className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground ml-1">
                    {selectedAgent
                      ? `${selectedAgent.name || selectedAgent.id} is thinking...`
                      : "Thinking..."}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-6 mb-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 border-t border-border bg-card/50 backdrop-blur-xl relative">
          {/* @mention autocomplete popup */}
          {showMentionMenu && mentionAgents.length > 0 && (
            <div className="absolute bottom-full left-4 right-4 mb-1 bg-card border border-border rounded-xl shadow-2xl max-h-48 overflow-y-auto z-10">
              {mentionAgents.map((agent, idx) => (
                <button
                  key={agent.id}
                  onClick={() => insertMention(agent)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors text-sm ${
                    idx === mentionIndex
                      ? "bg-primary/10 text-foreground"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/20">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                  <span className="font-medium">{agent.name || agent.id}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              data-testid="chat-input"
              type="text"
              value={messageInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                connectionStatus !== "connected"
                  ? "Connect to gateway first..."
                  : !selectedAgent && !selectedTeam
                    ? "Select a chat..."
                    : selectedTeam
                      ? `Message ${selectedTeam.name} team... (type @name to mention)`
                      : `Message ${selectedAgent?.name || selectedAgent?.id}... (type @ to mention)`
              }
              disabled={
                connectionStatus !== "connected" ||
                (!selectedAgent && !selectedTeam) ||
                isAgentThinking
              }
              className="flex-1 rounded-xl border border-border bg-muted py-3 px-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 transition-all"
            />
            <button
              onClick={handleSendMessage}
              data-testid="chat-send"
              disabled={
                !messageInput.trim() ||
                connectionStatus !== "connected" ||
                (!selectedAgent && !selectedTeam) ||
                isAgentThinking
              }
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isAgentThinking ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
