import {
  LayoutDashboard,
  Bot,
  Users,
  FolderOpen,
  MessageSquare,
  Settings,
  ChevronLeft,
} from "lucide-react";

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

const menuItems: MenuItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "agents", label: "Agents", icon: Bot },
  { icon: Users, label: "Teams", id: "teams" },
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  activeMenu: string;
  onMenuChange: (menuId: string) => void;
  isCollapsed: boolean;
  onCollapseToggle: () => void;
}

export function Sidebar({ activeMenu, onMenuChange, isCollapsed, onCollapseToggle }: SidebarProps) {
  return (
    <aside
      className={`fixed left-0 top-0 z-20 h-screen border-r border-border bg-card/50 backdrop-blur-xl transition-all duration-300 ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Logo Section */}
      <div className="flex h-[73px] items-center justify-between border-b border-border px-6">
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg">
              <Bot className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-medium text-foreground">Axtrizen</h1>
              <p className="text-xs text-muted-foreground">Agentic AI platform</p>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg mx-auto">
            <Bot className="h-6 w-6 text-primary-foreground" />
          </div>
        )}
      </div>

      {/* Navigation Menu */}
      <nav className="p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeMenu === item.id;

            return (
              <li key={item.id}>
                <button
                  onClick={() => onMenuChange(item.id)}
                  data-testid={`nav-${item.id}`}
                  className={`group relative flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all duration-200 ${
                    isActive
                      ? "bg-primary/10 border border-primary/50 text-primary shadow-[0_0_20px_rgba(175,23,99,0.2)]"
                      : "border border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                  )}

                  <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? "text-primary" : ""}`} />

                  {!isCollapsed && <span className="text-sm">{item.label}</span>}

                  {/* Hover glow effect */}
                  {!isActive && (
                    <div className="absolute inset-0 rounded-xl bg-primary/0 opacity-0 transition-opacity duration-200 group-hover:opacity-5" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse Toggle Button */}
      <div className="absolute bottom-6 left-0 right-0 px-4">
        <button
          onClick={onCollapseToggle}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-muted-foreground transition-all hover:border-primary/50 hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft
            className={`h-5 w-5 transition-transform duration-300 ${isCollapsed ? "rotate-180" : ""}`}
          />
          {!isCollapsed && <span className="text-sm">Collapse</span>}
        </button>
      </div>

      {/* Stats Footer */}
      {!isCollapsed && (
        <div className="absolute bottom-24 left-0 right-0 mx-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Storage Used</span>
            <span className="text-xs text-foreground">2.4 / 10 GB</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-[24%] rounded-full bg-primary" />
          </div>
        </div>
      )}
    </aside>
  );
}
