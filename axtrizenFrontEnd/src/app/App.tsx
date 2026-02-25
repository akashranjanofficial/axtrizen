import { Bot, DollarSign, Cpu, FolderOpen, Bell, Search, User, Sun, Moon, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { AgentsView } from "./components/AgentsView";
import { ChatWindow } from "./components/ChatWindow";
import { Dashboard } from "./components/Dashboard";
import { ProjectsView } from "./components/ProjectsView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { TeamsView } from "./components/TeamsView";
import { activityStore, type ActivityEvent } from "./stores/activity-store";
import { agentStore } from "./stores/agent-store";
import { connectToGateway } from "./tauri-api";

export default function App() {
  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Chat navigation target (used when navigating from TeamsView)
  const [chatTarget, setChatTarget] = useState<{
    type: "agent" | "team";
    id: string;
  } | null>(null);

  // Navigate to chat with a specific target
  const openGroupChat = (teamId: string) => {
    setChatTarget({ type: "team", id: teamId });
    setActiveMenu("chat");
  };

  // Initialize Gateway connection
  useEffect(() => {
    let cancelled = false;

    const tryConnect = async (attempt: number) => {
      if (cancelled) {
        return;
      }
      try {
        const ok = await connectToGateway();
        if (ok) {
          console.log("✅ Connected to OpenClaw Gateway");
        }
      } catch (err) {
        console.warn(`Gateway connect attempt ${attempt} failed:`, err);
        // Retry once after 3s (Gateway might still be starting)
        if (attempt < 3 && !cancelled) {
          setTimeout(() => tryConnect(attempt + 1), 3000);
        } else {
          console.error("❌ Could not connect to Gateway after retries. Is `openclaw` running?");
        }
      }
    };

    tryConnect(1);
    return () => {
      cancelled = true;
    };
  }, []);

  // Intercept external link clicks — open in system browser, not WebView
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) {
        return;
      }
      const href = target.getAttribute("href");
      if (!href) {
        return;
      }

      // Allow in-app navigation (anchors, javascript:, etc.)
      if (href.startsWith("#") || href.startsWith("javascript:")) {
        return;
      }

      // Allow the app's own dev server URLs
      if (
        href.startsWith("http://localhost:5174") ||
        href.startsWith("http://127.0.0.1:5174") ||
        href.startsWith("tauri://")
      ) {
        return;
      }

      // External URL — prevent WebView navigation, open in system browser
      e.preventDefault();
      e.stopPropagation();
      import("@tauri-apps/plugin-opener")
        .then(({ openUrl }) => openUrl(href))
        .catch((err) => {
          console.warn("Failed to open URL in browser:", err);
          window.open(href, "_blank");
        });
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  // Toggle theme class on document
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const searchResults = searchQuery.trim()
    ? agentStore
        .getAgents()
        .filter(
          (a) =>
            a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.id.toLowerCase().includes(searchQuery.toLowerCase()),
        )
    : [];

  // Notifications state
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<ActivityEvent[]>(
    activityStore.getEvents().slice(0, 10),
  );
  useEffect(() => {
    const unsub = activityStore.subscribe(() => {
      setNotifications(activityStore.getEvents().slice(0, 10));
    });
    return unsub;
  }, []);

  // Profile dropdown
  const [showProfile, setShowProfile] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden transition-colors duration-300">
      {/* Mesh Gradient Background - Only visible in dark mode or adapted for light */}
      {theme === "dark" && (
        <>
          {/* Subtle gradient for Corona theme, mostly black */}
          <div className="fixed inset-0 bg-background opacity-100 pointer-events-none" />
          <div className="fixed inset-0 bg-[radial-gradient(circle_at_30%_20%,var(--primary),transparent_70%)] opacity-10 pointer-events-none" />
        </>
      )}

      {/* Light mode gradient */}
      {theme === "light" && <div className="fixed inset-0 bg-background pointer-events-none" />}

      {/* Sidebar */}
      <Sidebar
        activeMenu={activeMenu}
        onMenuChange={setActiveMenu}
        isCollapsed={sidebarCollapsed}
        onCollapseToggle={() => setSidebarCollapsed((prev) => !prev)}
      />

      {/* Content */}
      <div
        className={`relative z-10 transition-all duration-300 ${sidebarCollapsed ? "ml-20" : "ml-64"}`}
      >
        {/* ChatWindow is always mounted to preserve state & WebSocket connection */}
        <div style={{ display: activeMenu === "chat" ? "block" : "none" }}>
          <ChatWindow chatTarget={chatTarget} />
        </div>

        {/* AgentsView is always mounted to preserve terminal PTY sessions */}
        <div style={{ display: activeMenu === "agents" ? "block" : "none" }}>
          <AgentsView />
        </div>

        {activeMenu === "projects" ? (
          <ProjectsView />
        ) : activeMenu === "teams" ? (
          <TeamsView onOpenGroupChat={openGroupChat} />
        ) : activeMenu === "settings" ? (
          <SettingsView />
        ) : activeMenu !== "chat" && activeMenu !== "agents" ? (
          <>
            {/* Top Navigation */}
            <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-20">
              <div className="px-6 py-4">
                <div className="flex items-center justify-between">
                  {/* Page Title */}
                  <div>
                    <h1 className="text-xl font-medium">Mission Control</h1>
                    <p className="text-xs text-muted-foreground">
                      Monitor and manage your AI agent fleet
                    </p>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-3">
                    {/* Search */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          setShowSearch(!showSearch);
                          setShowNotifications(false);
                          setShowProfile(false);
                          setTimeout(() => searchRef.current?.focus(), 100);
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <Search className="h-5 w-5" />
                      </button>
                      {showSearch && (
                        <div className="absolute right-0 top-12 w-80 rounded-2xl border border-border bg-card shadow-2xl p-4 z-50">
                          <div className="flex items-center gap-2 mb-3">
                            <Search className="h-4 w-4 text-muted-foreground" />
                            <input
                              ref={searchRef}
                              type="text"
                              placeholder="Search agents..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                            />
                            <button
                              onClick={() => {
                                setShowSearch(false);
                                setSearchQuery("");
                              }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          {searchQuery.trim() && (
                            <div className="space-y-1 max-h-60 overflow-y-auto">
                              {searchResults.length > 0 ? (
                                searchResults.map((a) => (
                                  <button
                                    key={a.id}
                                    onClick={() => {
                                      setActiveMenu("agents");
                                      setShowSearch(false);
                                      setSearchQuery("");
                                    }}
                                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted text-left"
                                  >
                                    <Bot className="h-4 w-4 text-primary" />
                                    <div>
                                      <p className="text-sm font-medium text-foreground">
                                        {a.name}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {a.id} · {a.status}
                                      </p>
                                    </div>
                                  </button>
                                ))
                              ) : (
                                <p className="text-xs text-muted-foreground text-center py-4">
                                  No results found
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Theme Toggle */}
                    <button
                      onClick={toggleTheme}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {theme === "dark" ? (
                        <Sun className="h-5 w-5" />
                      ) : (
                        <Moon className="h-5 w-5" />
                      )}
                    </button>

                    {/* Notifications */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          setShowNotifications(!showNotifications);
                          setShowSearch(false);
                          setShowProfile(false);
                        }}
                        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <Bell className="h-5 w-5" />
                        {notifications.length > 0 && (
                          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
                        )}
                      </button>
                      {showNotifications && (
                        <div className="absolute right-0 top-12 w-80 rounded-2xl border border-border bg-card shadow-2xl z-50">
                          <div className="p-4 border-b border-border flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                            <span className="text-xs text-muted-foreground">
                              {notifications.length} events
                            </span>
                          </div>
                          <div className="max-h-72 overflow-y-auto">
                            {notifications.length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-8">
                                No notifications
                              </p>
                            ) : (
                              notifications.map((n) => (
                                <div
                                  key={n.id}
                                  className="px-4 py-3 border-b border-border/50 hover:bg-muted/50"
                                >
                                  <p className="text-sm text-foreground">
                                    <span className="font-medium">{n.agent}</span>{" "}
                                    <span className="text-muted-foreground">{n.action}</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {n.timestamp}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* User Profile */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          setShowProfile(!showProfile);
                          setShowSearch(false);
                          setShowNotifications(false);
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <User className="h-5 w-5" />
                      </button>
                      {showProfile && (
                        <div className="absolute right-0 top-12 w-64 rounded-2xl border border-border bg-card shadow-2xl z-50 p-4">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                              <User className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">Akash Ranjan</p>
                              <p className="text-xs text-muted-foreground">Admin</p>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <button
                              onClick={() => {
                                setActiveMenu("settings");
                                setShowProfile(false);
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              Settings
                            </button>
                            <div className="h-px bg-border my-2" />
                            <div className="px-3 py-2 text-xs text-muted-foreground">
                              Axtrizen v1.0.0
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </header>

            {/* Main Content - Now using extracted Dashboard component */}
            <main>
              <Dashboard />
            </main>
          </>
        ) : null}
      </div>
    </div>
  );
}
