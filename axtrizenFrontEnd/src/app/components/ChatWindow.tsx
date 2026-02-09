import { Search, Plus, Send, MessageCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { mockDataStore, User, ChatThread } from "../data/mockData";

export function ChatWindow() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedThread, setSelectedThread] = useState<ChatThread | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [allUsers, setAllUsers] = useState<User[]>(mockDataStore.getAllUsers());
  const [threads, setThreads] = useState<ChatThread[]>(mockDataStore.getThreads());

  // Subscribe to data changes
  useEffect(() => {
    const unsubscribe = mockDataStore.subscribe(() => {
      setAllUsers([...mockDataStore.getAllUsers()]);
      setThreads([...mockDataStore.getThreads()]);
    });
    return unsubscribe;
  }, []);

  // Filter users for sidebar
  const filteredUsers = allUsers.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.role.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const statusColors = {
    online: "bg-green-500",
    offline: "bg-gray-500",
    busy: "bg-red-500",
  };

  const handleSendMessage = () => {
    if (!messageInput.trim()) {
      return;
    }
    // TODO: Connect to OpenClaw chat API
    setMessageInput("");
  };

  const hasContacts = allUsers.length > 0 || threads.length > 0;
  const hasSelection = selectedUser || selectedThread;

  return (
    <div className="h-[calc(100vh-73px)] flex">
      {/* Left Sidebar - Contact/Thread List */}
      <div className="w-80 border-r border-border bg-card/50 backdrop-blur-xl flex flex-col">
        {/* Search Bar */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search people, groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Create Button */}
        <div className="p-4 border-b border-border">
          <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground transition-all hover:border-primary/50 hover:bg-muted hover:text-foreground">
            <Plus className="h-4 w-4" />
            New Chat
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {!hasContacts ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <MessageCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm mb-2">No contacts yet</p>
              <p className="text-muted-foreground text-xs">Create agents to chat with them</p>
            </div>
          ) : (
            <>
              {/* Threads Section */}
              {threads.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
                    Teams & Groups
                  </h3>
                  {threads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() => {
                        setSelectedThread(thread);
                        setSelectedUser(null);
                      }}
                      className={`group w-full rounded-xl p-3 text-left transition-all mb-1 ${
                        selectedThread?.id === thread.id
                          ? "bg-primary/20 border border-primary/50"
                          : "border border-transparent hover:bg-muted hover:border-border"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-lg">
                          👥
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{thread.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {thread.lastMessage}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Users Section */}
              {filteredUsers.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
                    People
                  </h3>
                  {filteredUsers.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => {
                        setSelectedUser(user);
                        setSelectedThread(null);
                      }}
                      className={`group w-full rounded-xl p-3 text-left transition-all mb-1 ${
                        selectedUser?.id === user.id
                          ? "bg-primary/20 border border-primary/50"
                          : "border border-transparent hover:bg-muted hover:border-border"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-lg">
                            {user.avatar}
                          </div>
                          <div
                            className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background ${statusColors[user.status]}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{user.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.role}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right - Chat Area */}
      <div className="flex-1 flex flex-col">
        {!hasSelection ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-24 h-24 rounded-2xl bg-muted flex items-center justify-center mb-6">
              <MessageCircle className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-medium text-foreground mb-2">
              {hasContacts ? "Select a Conversation" : "No Conversations Yet"}
            </h2>
            <p className="text-muted-foreground max-w-sm">
              {hasContacts
                ? "Choose a person or group from the sidebar to start chatting."
                : "Create agents to start conversations. Each agent can be messaged directly."}
            </p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-border bg-card/50 backdrop-blur-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-lg">
                  {selectedThread ? "👥" : selectedUser?.avatar}
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {selectedThread?.name || selectedUser?.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedThread
                      ? `${selectedThread.participants.length} members`
                      : selectedUser?.role}
                  </p>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-sm">No messages yet</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Start a conversation by sending a message
                </p>
              </div>
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-border bg-card/50">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 rounded-xl border border-border bg-muted px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
                <button
                  onClick={handleSendMessage}
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
