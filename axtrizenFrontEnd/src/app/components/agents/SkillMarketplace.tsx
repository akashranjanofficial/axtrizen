/**
 * SkillMarketplace — Browse and install OpenClaw skills from the Agent Settings.
 *
 * Skills give agents new abilities like docker-sandbox, github-pr-creator,
 * web-search, etc.  This component shows available skills, their install
 * status, and lets the user install/toggle them.
 */

import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Download,
  CheckCircle,
  Loader2,
  Package,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
} from "lucide-react";
import { skillsStatus, skillsInstall, skillsUpdate, isTauri } from "../../tauri-api";

// Skill metadata for the marketplace catalog
interface SkillCatalogEntry {
  key: string;
  name: string;
  description: string;
  category: "coding" | "communication" | "devops" | "research" | "media" | "productivity" | "integration";
  icon: string;
  popular?: boolean;
}

// Status from the backend
interface SkillStatus {
  key: string;
  installed: boolean;
  enabled: boolean;
  version?: string;
}

// ── Catalog of available skills ──────────────────────────────────

const SKILL_CATALOG: SkillCatalogEntry[] = [
  // Coding
  { key: "docker-sandbox", name: "Docker Sandbox", description: "Run code in isolated Docker containers with full filesystem access", category: "coding", icon: "🐳", popular: true },
  { key: "coding-agent", name: "Coding Agent", description: "Enhanced code generation with multi-file editing and refactoring", category: "coding", icon: "💻", popular: true },
  { key: "canvas", name: "Canvas", description: "Visual code editing canvas with drag-and-drop blocks", category: "coding", icon: "🎨" },

  // DevOps
  { key: "github", name: "GitHub", description: "Create PRs, review code, manage issues, and automate workflows", category: "devops", icon: "🐙", popular: true },
  { key: "cloudflare-tunnel", name: "Cloudflare Tunnel", description: "Expose local ports to the internet for deploy previews", category: "devops", icon: "☁️" },
  { key: "healthcheck", name: "Healthcheck", description: "Monitor service health and uptime with configurable checks", category: "devops", icon: "❤️" },
  { key: "tmux", name: "Tmux", description: "Manage terminal multiplexer sessions for parallel tasks", category: "devops", icon: "🖥️" },

  // Communication
  { key: "slack", name: "Slack", description: "Send messages, receive commands, and post status updates to Slack", category: "communication", icon: "💬", popular: true },
  { key: "discord", name: "Discord", description: "Interact with Discord servers and channels", category: "communication", icon: "🎮" },
  { key: "imsg", name: "iMessage", description: "Send and receive iMessages (macOS only)", category: "communication", icon: "📱" },

  // Research
  { key: "web-search", name: "Web Search", description: "Search the web and scrape pages for up-to-date information", category: "research", icon: "🔍", popular: true },
  { key: "summarize", name: "Summarize", description: "Condense long documents, articles, and conversations", category: "research", icon: "📝" },
  { key: "oracle", name: "Oracle", description: "Query structured knowledge bases and documentation", category: "research", icon: "🔮" },

  // Media
  { key: "openai-image-gen", name: "Image Generation", description: "Generate images using DALL-E or similar models", category: "media", icon: "🖼️" },
  { key: "openai-whisper", name: "Whisper (Local)", description: "Transcribe audio files using local Whisper model", category: "media", icon: "🎤" },
  { key: "video-frames", name: "Video Frames", description: "Extract and analyze frames from video files", category: "media", icon: "🎬" },
  { key: "peekaboo", name: "Peekaboo", description: "Screenshot capture and visual analysis tool", category: "media", icon: "📸" },

  // Productivity
  { key: "notion", name: "Notion", description: "Read and write Notion pages and databases", category: "productivity", icon: "📓" },
  { key: "obsidian", name: "Obsidian", description: "Manage Obsidian vaults — create, search, and link notes", category: "productivity", icon: "💎" },
  { key: "trello", name: "Trello", description: "Manage Trello boards, lists, and cards", category: "productivity", icon: "📋" },
  { key: "things-mac", name: "Things (macOS)", description: "Create and manage tasks in Things 3", category: "productivity", icon: "✅" },
  { key: "apple-reminders", name: "Apple Reminders", description: "Manage Apple Reminders (macOS only)", category: "productivity", icon: "🔔" },

  // Integration
  { key: "weather", name: "Weather", description: "Get weather forecasts and current conditions", category: "integration", icon: "🌤️" },
  { key: "spotify-player", name: "Spotify", description: "Control Spotify playback and browse music", category: "integration", icon: "🎵" },
  { key: "skill-creator", name: "Skill Creator", description: "Create new custom skills using the SDK", category: "integration", icon: "🔧" },
];

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  coding: { label: "Coding", icon: "💻" },
  devops: { label: "DevOps & CI/CD", icon: "🚀" },
  communication: { label: "Communication", icon: "💬" },
  research: { label: "Research", icon: "🔍" },
  media: { label: "Media", icon: "🎬" },
  productivity: { label: "Productivity", icon: "📋" },
  integration: { label: "Integrations", icon: "🔌" },
};

interface SkillMarketplaceProps {
  agentId: string;
}

export function SkillMarketplace({ agentId }: SkillMarketplaceProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Map<string, SkillStatus>>(new Map());
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Load skill statuses on mount
  useEffect(() => {
    loadStatuses();
  }, [agentId]);

  async function loadStatuses() {
    setLoading(true);
    try {
      if (isTauri()) {
        const result = await skillsStatus(agentId);
        // Result shape varies — normalize to a map
        const map = new Map<string, SkillStatus>();
        if (result && typeof result === "object") {
          const skills = Array.isArray(result) ? result : (result as Record<string, unknown>).skills;
          if (Array.isArray(skills)) {
            for (const s of skills) {
              const sk = s as Record<string, unknown>;
              map.set(sk.key as string, {
                key: sk.key as string,
                installed: Boolean(sk.installed),
                enabled: Boolean(sk.enabled),
                version: sk.version as string | undefined,
              });
            }
          }
        }
        setStatuses(map);
      }
    } catch (err) {
      console.error("Failed to load skill statuses:", err);
    }
    setLoading(false);
  }

  async function handleInstall(key: string) {
    setInstalling((prev) => new Set(prev).add(key));
    try {
      if (isTauri()) {
        await skillsInstall(key);
        // Refresh statuses
        await loadStatuses();
      }
    } catch (err) {
      console.error(`Failed to install skill ${key}:`, err);
    }
    setInstalling((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  async function handleToggle(key: string, currentlyEnabled: boolean) {
    setToggling((prev) => new Set(prev).add(key));
    try {
      if (isTauri()) {
        await skillsUpdate(key, !currentlyEnabled);
        // Update local state immediately
        setStatuses((prev) => {
          const map = new Map(prev);
          const existing = map.get(key);
          if (existing) {
            map.set(key, { ...existing, enabled: !currentlyEnabled });
          }
          return map;
        });
      }
    } catch (err) {
      console.error(`Failed to toggle skill ${key}:`, err);
    }
    setToggling((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  // Filter catalog
  const filteredCatalog = useMemo(() => {
    let results = SKILL_CATALOG;
    if (search.trim()) {
      const q = search.toLowerCase();
      results = results.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.key.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q),
      );
    }
    if (activeCategory) {
      results = results.filter((s) => s.category === activeCategory);
    }
    return results;
  }, [search, activeCategory]);

  // Group by category for display
  const grouped = useMemo(() => {
    const map: Record<string, SkillCatalogEntry[]> = {};
    for (const s of filteredCatalog) {
      if (!map[s.category]) map[s.category] = [];
      map[s.category].push(s);
    }
    return map;
  }, [filteredCatalog]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Skill Marketplace</h3>
        </div>
        <button
          onClick={() => loadStatuses()}
          disabled={loading}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills…"
          className="w-full bg-muted border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
        />
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            !activeCategory
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          All
        </button>
        {Object.entries(CATEGORY_LABELS).map(([key, { label, icon }]) => (
          <button
            key={key}
            onClick={() => setActiveCategory((prev) => (prev === key ? null : key))}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeCategory === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Skill grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground text-sm">Loading skills…</span>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, skills]) => {
            const meta = CATEGORY_LABELS[category];
            return (
              <div key={category}>
                <h4 className="text-sm font-medium text-muted-foreground mb-3">
                  {meta?.icon} {meta?.label ?? category}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {skills.map((skill) => {
                    const status = statuses.get(skill.key);
                    const isInstalled = status?.installed ?? false;
                    const isEnabled = status?.enabled ?? false;
                    const isInstallingThis = installing.has(skill.key);
                    const isTogglingThis = toggling.has(skill.key);

                    return (
                      <div
                        key={skill.key}
                        className="p-3 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xl flex-shrink-0">{skill.icon}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {skill.name}
                                </p>
                                {skill.popular && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    POPULAR
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                                {skill.description}
                              </p>
                            </div>
                          </div>

                          {/* Action button */}
                          <div className="flex-shrink-0">
                            {isInstalled ? (
                              <button
                                onClick={() => handleToggle(skill.key, isEnabled)}
                                disabled={isTogglingThis}
                                className={`p-1.5 rounded-md transition-colors ${
                                  isEnabled
                                    ? "text-green-400 hover:bg-green-500/10"
                                    : "text-muted-foreground hover:bg-muted"
                                }`}
                                title={isEnabled ? "Disable" : "Enable"}
                              >
                                {isTogglingThis ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : isEnabled ? (
                                  <ToggleRight className="h-5 w-5" />
                                ) : (
                                  <ToggleLeft className="h-5 w-5" />
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleInstall(skill.key)}
                                disabled={isInstallingThis}
                                className="px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                {isInstallingThis ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Installing
                                  </>
                                ) : (
                                  <>
                                    <Download className="h-3 w-3" />
                                    Install
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Installed indicator */}
                        {isInstalled && (
                          <div className="flex items-center gap-1 mt-2 text-[10px] text-green-400">
                            <CheckCircle className="h-3 w-3" />
                            <span>Installed{status?.version ? ` v${status.version}` : ""}</span>
                            <span className="text-muted-foreground">
                              · {isEnabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filteredCatalog.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No skills match your search.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
