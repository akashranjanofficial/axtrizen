import { Bot, DollarSign, Cpu, FolderOpen, Bell, Search, User, Sun, Moon } from "lucide-react";
import { useState, useEffect } from "react";
import { AgentsView } from "./components/AgentsView";
import { ChatWindow } from "./components/ChatWindow";
import { Dashboard } from "./components/Dashboard";
import { ProjectsView } from "./components/ProjectsView";
import { Sidebar } from "./components/Sidebar";
import { TeamsView } from "./components/TeamsView";

export default function App() {
  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  // Toggle theme class on document
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

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
      <Sidebar activeMenu={activeMenu} onMenuChange={setActiveMenu} />

      {/* Content */}
      <div className="relative z-10 ml-64">
        {/* Render Chat View */}
        {activeMenu === "chat" ? (
          <ChatWindow />
        ) : activeMenu === "agents" ? (
          <AgentsView />
        ) : activeMenu === "projects" ? (
          <ProjectsView />
        ) : activeMenu === "teams" ? (
          <TeamsView />
        ) : (
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
                    <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                      <Search className="h-5 w-5" />
                    </button>
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
                    <button className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                      <Bell className="h-5 w-5" />
                      <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
                    </button>
                    <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                      <User className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </header>

            {/* Main Content - Now using extracted Dashboard component */}
            <main>
              <Dashboard />
            </main>
          </>
        )}
      </div>
    </div>
  );
}
