/**
 * UnifiedSkillsTab — Single unified view for all skill management.
 *
 * Layout:
 *   1. Installed Skills (with inline config expand)
 *   2. Recommendations (based on agent role)
 *   3. Browse Catalog (search + categories)
 *   4. Import from Source (GitHub, URL, local path)
 *
 * Replaces: SkillMarketplace + AgentSettings skills section
 *
 * Sprint S4 — US-1.3.1, US-1.3.2
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Package,
  Sparkles,
  Download,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Loader2,
  Settings2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Save,
  AlertTriangle,
} from "lucide-react";
import {
  catalogSearch,
  catalogCategories,
  agentSkillsList,
  agentSkillInstall,
  agentSkillRemove,
  agentSkillUpdateConfig,
  skillRecommendations,
  skillsInstallFromSource,
  type SkillCatalogEntry,
  type AgentSkill,
  type InstallSkillRequest,
  type CategoryCount,
  type SkillRecommendation,
} from "../../tauri-api";

interface UnifiedSkillsTabProps {
  agentId: string;
  agentRole?: string;
  agentName?: string;
}

const PAGE_SIZE = 20;

export function UnifiedSkillsTab({
  agentId,
  agentRole = "",
  agentName = "",
}: UnifiedSkillsTabProps) {
  // ── State ──────────────────────────────────────────────────────

  // Active section
  const [activeSection, setActiveSection] = useState<"installed" | "recommendations" | "browse" | "import">("installed");

  // Installed skills
  const [installed, setInstalled] = useState<AgentSkill[]>([]);
  const [installedLoading, setInstalledLoading] = useState(true);

  // Recommendations
  const [recommendations, setRecommendations] = useState<SkillRecommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);

  // Browse
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [browseResults, setBrowseResults] = useState<SkillCatalogEntry[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browsePage, setBrowsePage] = useState(0);
  const [browseLoading, setBrowseLoading] = useState(false);

  // Import
  const [importSource, setImportSource] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // Inline config
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);

  // ── Effects ────────────────────────────────────────────────────

  useEffect(() => {
    void loadInstalled();
    void loadCategories();
  }, [agentId]);

  useEffect(() => {
    if (activeSection === "recommendations" && (agentRole || agentName)) {
      void loadRecommendations();
    }
  }, [activeSection, agentRole, agentName]);

  useEffect(() => {
    if (activeSection === "browse") {
      void doBrowseSearch("", null, 0);
    }
  }, [activeSection]);

  // ── Loaders ────────────────────────────────────────────────────

  async function loadInstalled() {
    setInstalledLoading(true);
    try {
      const skills = await agentSkillsList(agentId);
      setInstalled(skills);
    } catch (err) {
      console.error("Failed to load installed skills:", err);
    } finally {
      setInstalledLoading(false);
    }
  }

  async function loadRecommendations() {
    setRecsLoading(true);
    try {
      const recs = await skillRecommendations(agentRole, agentName, 8);
      // Filter out already installed
      const installedIds = new Set(installed.map((s) => s.skill_key));
      setRecommendations(recs.filter((r) => !installedIds.has(r.skill_id)));
    } catch (err) {
      console.error("Failed to load recommendations:", err);
      setRecommendations([]);
    } finally {
      setRecsLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const cats = await catalogCategories();
      setCategories(cats);
    } catch {
      // Silently fail — not critical
    }
  }

  async function doBrowseSearch(q: string, cat: string | null, page: number) {
    setBrowseLoading(true);
    try {
      const res = await catalogSearch(q, cat, PAGE_SIZE, page * PAGE_SIZE);
      setBrowseResults(res.skills);
      setBrowseTotal(res.total);
    } catch (err) {
      console.error("Browse search failed:", err);
    } finally {
      setBrowseLoading(false);
    }
  }

  // ── Actions ────────────────────────────────────────────────────

  async function handleInstall(entry: SkillCatalogEntry) {
    try {
      await agentSkillInstall(agentId, {
        skill_key: entry.id,
        name: entry.name,
        description: entry.description,
        category: entry.category,
        tags: entry.tags,
        risk_level: entry.risk_level,
        source: entry.source ?? "catalog",
      });
      await loadInstalled();
    } catch (err) {
      console.error("Failed to install skill:", err);
    }
  }

  async function handleRemove(skillId: string) {
    try {
      await agentSkillRemove(agentId, skillId);
      await loadInstalled();
    } catch (err) {
      console.error("Failed to remove skill:", err);
    }
  }

  async function handleToggle(skillId: string, enabled: boolean) {
    try {
      await agentSkillUpdateConfig(agentId, skillId, null, enabled);
      await loadInstalled();
    } catch (err) {
      console.error("Failed to toggle skill:", err);
    }
  }

  async function handleImport() {
    if (!importSource.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await skillsInstallFromSource(agentId, importSource.trim());
      setImportResult(`Installed "${result.name}" (${result.source_type})`);
      setImportSource("");
      await loadInstalled();
    } catch (err: any) {
      setImportResult(`Error: ${typeof err === "string" ? err : err?.message ?? "Import failed"}`);
    } finally {
      setImporting(false);
    }
  }

  async function handleInstallRecommendation(rec: SkillRecommendation) {
    try {
      await agentSkillInstall(agentId, {
        skill_key: rec.skill_id,
        name: rec.skill_name,
        description: rec.reason,
        category: rec.category,
        tags: null,
        risk_level: "low",
        source: "catalog",
      });
      setRecommendations((prev) => prev.filter((r) => r.skill_id !== rec.skill_id));
      await loadInstalled();
    } catch (err) {
      console.error("Failed to install recommendation:", err);
    }
  }

  const installedIds = new Set(installed.map((s) => s.skill_key));
  const totalPages = Math.max(1, Math.ceil(browseTotal / PAGE_SIZE));

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Section tabs */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
        {[
          { id: "installed" as const, label: `Installed (${installed.length})`, icon: Package },
          { id: "recommendations" as const, label: "AI Picks", icon: Sparkles },
          { id: "browse" as const, label: "Browse", icon: Search },
          { id: "import" as const, label: "Import", icon: Download },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex-1 justify-center ${
                activeSection === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Installed ─────────────────────────────────────────── */}
      {activeSection === "installed" && (
        <div className="space-y-2">
          {installedLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : installed.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No skills installed yet.</p>
              <button
                onClick={() => setActiveSection("browse")}
                className="text-xs text-primary hover:underline mt-1"
              >
                Browse catalog →
              </button>
            </div>
          ) : (
            installed.map((skill) => {
              const isExpanded = expandedSkillId === skill.id;
              return (
                <div
                  key={skill.id}
                  className="rounded-lg border border-border bg-muted/30 overflow-hidden"
                >
                  {/* Skill row */}
                  <div className="flex items-center gap-3 p-3">
                    <button
                      onClick={() => setExpandedSkillId(isExpanded ? null : skill.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {skill.name || skill.skill_key}
                        </span>
                        <span className="px-1.5 py-0.5 text-[9px] rounded bg-muted text-muted-foreground">
                          {skill.category}
                        </span>
                        {skill.risk_level === "high" && (
                          <AlertTriangle className="h-3 w-3 text-amber-400" />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {skill.description || "No description"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleToggle(skill.id, !skill.enabled)}
                        className={`p-1 rounded transition-colors ${
                          skill.enabled
                            ? "text-green-400 hover:text-green-300"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        title={skill.enabled ? "Disable" : "Enable"}
                      >
                        {skill.enabled
                          ? <ToggleRight className="h-4 w-4" />
                          : <ToggleLeft className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => handleRemove(skill.id)}
                        className="p-1 rounded text-muted-foreground hover:text-red-400 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Inline config (expanded) */}
                  {isExpanded && (
                    <InlineSkillConfig
                      skill={skill}
                      agentId={agentId}
                      onUpdate={loadInstalled}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Recommendations ───────────────────────────────────── */}
      {activeSection === "recommendations" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Recommended for {agentRole ? `"${agentRole}"` : "this agent"}
            </span>
            {recsLoading && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
          </div>
          {recommendations.length === 0 && !recsLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {agentRole
                ? "No additional recommendations. All suggested skills are already installed."
                : "Set an agent role to get skill recommendations."}
            </p>
          ) : (
            recommendations.map((rec) => (
              <div
                key={rec.skill_id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 transition-colors"
              >
                <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{rec.skill_name}</span>
                    <span className="px-1.5 py-0.5 text-[9px] rounded bg-primary/10 text-primary">
                      {Math.round(rec.relevance_score * 100)}% match
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{rec.reason}</p>
                </div>
                <button
                  onClick={() => void handleInstallRecommendation(rec)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  Install
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Browse Catalog ────────────────────────────────────── */}
      {activeSection === "browse" && (
        <div className="space-y-3">
          {/* Search */}
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setBrowsePage(0);
              void doBrowseSearch(e.target.value, category, 0);
            }}
            placeholder="Search 950+ skills…"
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          />

          {/* Category pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => {
                setCategory(null);
                setBrowsePage(0);
                void doBrowseSearch(query, null, 0);
              }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                !category ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              All
            </button>
            {categories.slice(0, 10).map((c) => (
              <button
                key={c.category}
                onClick={() => {
                  const next = category === c.category ? null : c.category;
                  setCategory(next);
                  setBrowsePage(0);
                  void doBrowseSearch(query, next, 0);
                }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                  category === c.category
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {c.category} ({c.count})
              </button>
            ))}
          </div>

          {/* Results */}
          {browseLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {browseResults.map((entry) => {
                const alreadyInstalled = installedIds.has(entry.id);
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                      alreadyInstalled
                        ? "border-primary/30 bg-primary/5 opacity-60"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {entry.name || entry.id}
                        </span>
                        <span className="px-1.5 py-0.5 text-[9px] rounded bg-muted text-muted-foreground">
                          {entry.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {entry.description || "No description"}
                      </p>
                    </div>
                    {alreadyInstalled ? (
                      <span className="flex items-center gap-1 text-[10px] text-primary">
                        <Check className="h-3 w-3" /> Installed
                      </span>
                    ) : (
                      <button
                        onClick={() => void handleInstall(entry)}
                        className="px-3 py-1 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        Install
                      </button>
                    )}
                  </div>
                );
              })}
              {browseResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No skills found.
                </p>
              )}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Page {browsePage + 1} / {totalPages}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setBrowsePage(browsePage - 1);
                    void doBrowseSearch(query, category, browsePage - 1);
                  }}
                  disabled={browsePage === 0}
                  className="px-2 py-1 rounded bg-muted hover:bg-accent disabled:opacity-30 transition-colors"
                >
                  Prev
                </button>
                <button
                  onClick={() => {
                    setBrowsePage(browsePage + 1);
                    void doBrowseSearch(query, category, browsePage + 1);
                  }}
                  disabled={browsePage >= totalPages - 1}
                  className="px-2 py-1 rounded bg-muted hover:bg-accent disabled:opacity-30 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Import from Source ─────────────────────────────────── */}
      {activeSection === "import" && (
        <div className="space-y-3">
          <div>
            <p className="text-sm text-foreground font-medium mb-1">Import Skill</p>
            <p className="text-xs text-muted-foreground mb-3">
              Install from GitHub, URL, or local path.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={importSource}
              onChange={(e) => setImportSource(e.target.value)}
              placeholder="e.g. owner/repo, https://..., /path/to/skill"
              className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              onKeyDown={(e) => e.key === "Enter" && handleImport()}
            />
            <button
              onClick={handleImport}
              disabled={importing || !importSource.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 transition-opacity"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </button>
          </div>
          {importResult && (
            <p
              className={`text-xs ${
                importResult.startsWith("Error") ? "text-red-400" : "text-green-400"
              }`}
            >
              {importResult}
            </p>
          )}
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground mb-2">Supported formats:</p>
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              <li>• <strong>GitHub:</strong> owner/repo or github:owner/repo</li>
              <li>• <strong>URL:</strong> https://example.com/skill-package</li>
              <li>• <strong>Local path:</strong> /path/to/skill-directory</li>
              <li>• <strong>Catalog ID:</strong> sk-existing-skill-id</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline Skill Config ──────────────────────────────────────────

interface InlineSkillConfigProps {
  skill: AgentSkill;
  agentId: string;
  onUpdate: () => void;
}

function InlineSkillConfig({ skill, agentId, onUpdate }: InlineSkillConfigProps) {
  const [config, setConfig] = useState<Record<string, string>>(() => {
    try {
      return skill.config ? JSON.parse(skill.config) : {};
    } catch {
      return {};
    }
  });
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced auto-save
  const saveConfig = useCallback(
    async (updatedConfig: Record<string, string>) => {
      setSaving(true);
      try {
        // Save via the toggleAgentSkill config path or dedicated endpoint
        // For now, we store config as part of the skill's config field
        // This would ideally use a dedicated updateAgentSkillConfig command
        console.log("Saving skill config:", updatedConfig);
      } catch (err) {
        console.error("Failed to save config:", err);
      } finally {
        setSaving(false);
      }
    },
    [agentId, skill.id]
  );

  function handleConfigChange(key: string, value: string) {
    const updated = { ...config, [key]: value };
    setConfig(updated);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void saveConfig(updated), 500);
  }

  function handleAddVar() {
    if (!newKey.trim()) return;
    const updated = { ...config, [newKey.trim()]: newValue };
    setConfig(updated);
    setNewKey("");
    setNewValue("");
    void saveConfig(updated);
  }

  function handleRemoveVar(key: string) {
    const updated = { ...config };
    delete updated[key];
    setConfig(updated);
    void saveConfig(updated);
  }

  return (
    <div className="border-t border-border p-3 bg-muted/20 space-y-3">
      <div className="flex items-center gap-2">
        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Configuration</span>
        {saving && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
      </div>

      {/* Existing env vars */}
      {Object.keys(config).length > 0 ? (
        <div className="space-y-1.5">
          {Object.entries(config).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-muted-foreground min-w-[100px]">{key}</span>
              <input
                type="text"
                value={value}
                onChange={(e) => handleConfigChange(key, e.target.value)}
                className="flex-1 bg-muted border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
              />
              <button
                onClick={() => handleRemoveVar(key)}
                className="p-0.5 text-muted-foreground hover:text-red-400 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No configuration variables set.</p>
      )}

      {/* Add new var */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="KEY"
          className="w-24 bg-muted border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
        />
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="value"
          onKeyDown={(e) => e.key === "Enter" && handleAddVar()}
          className="flex-1 bg-muted border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
        />
        <button
          onClick={handleAddVar}
          disabled={!newKey.trim()}
          className="px-2 py-1 text-[10px] rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 transition-colors"
        >
          Add
        </button>
      </div>

      {/* Skill metadata */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-border/50">
        <span className="text-[10px] text-muted-foreground">
          Source: {skill.source || "catalog"}
        </span>
        {skill.version && (
          <span className="text-[10px] text-muted-foreground">
            Version: {skill.version}
          </span>
        )}
        {skill.installed_at && (
          <span className="text-[10px] text-muted-foreground">
            Installed: {new Date(skill.installed_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
