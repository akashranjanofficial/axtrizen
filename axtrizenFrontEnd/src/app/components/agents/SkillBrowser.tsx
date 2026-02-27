/**
 * SkillBrowser — Sprint S1/S2 replacement for SkillMarketplace.
 *
 * Features:
 *   - 950+ skill catalog from embedded SQLite
 *   - Debounced search (300ms) across name, description, tags
 *   - Category filter pills with counts
 *   - Scrollable grid for smooth rendering at 950+ entries
 *   - Responsive grid: 4 cols (xl), 2 cols (md), 1 col (sm)
 *   - Per-agent install / toggle / remove
 *   - Skill detail modal on card click
 *   - Import from source (GitHub, URL, local path)
 *
 * Sprint S2 — US-1.2.1
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Download,
  CheckCircle,
  Loader2,
  Package,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  Shield,
  Trash2,
  Filter,
  ChevronLeft,
  ChevronRight,
  Zap,
  Plus,
  Link,
  Eye,
} from "lucide-react";
import {
  catalogSearch,
  catalogCategories,
  agentSkillInstall,
  agentSkillsList,
  agentSkillRemove,
  agentSkillUpdateConfig,
  skillsInstallFromSource,
  isTauri,
  type SkillCatalogEntry,
  type AgentSkill,
  type CategoryCount,
  type InstallSkillRequest,
  type CatalogSearchResult,
} from "../../tauri-api";
import { SkillDetailModal } from "./SkillDetailModal";

// ── Risk badge colours ─────────────────────────────────────────────

const RISK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  high: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
  unknown: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
};

function riskColor(risk: string) {
  return RISK_COLORS[risk.toLowerCase()] ?? RISK_COLORS.unknown;
}

// ── Constants ──────────────────────────────────────────────────────

const PAGE_SIZE = 60;

// ── Main component ─────────────────────────────────────────────────

interface SkillBrowserProps {
  agentId: string;
  onSkillChange?: () => void;
}

export function SkillBrowser({ agentId, onSkillChange }: SkillBrowserProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [catalogResult, setCatalogResult] = useState<CatalogSearchResult | null>(null);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [agentSkills, setAgentSkills] = useState<Map<string, AgentSkill>>(new Map());

  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  const [detailSkill, setDetailSkill] = useState<SkillCatalogEntry | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [importSource, setImportSource] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadInitial();
    return () => clearTimeout(searchTimer.current);
  }, [agentId]);

  async function loadInitial() {
    setLoading(true);
    try {
      if (!isTauri()) return;
      const [result, cats, skills] = await Promise.all([
        catalogSearch("", null, PAGE_SIZE, 0),
        catalogCategories(),
        agentSkillsList(agentId),
      ]);
      setCatalogResult(result);
      setCategories(cats);
      setAgentSkills(new Map(skills.map((s) => [s.skill_key, s])));
    } catch (err) {
      console.error("SkillBrowser: load failed", err);
    } finally {
      setLoading(false);
    }
  }

  const doSearch = useCallback(
    async (q: string, cat: string | null, p: number) => {
      setSearchLoading(true);
      try {
        const result = await catalogSearch(q, cat, PAGE_SIZE, p * PAGE_SIZE);
        setCatalogResult(result);
      } catch (err) {
        console.error("SkillBrowser: search failed", err);
      } finally {
        setSearchLoading(false);
      }
    },
    [],
  );

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(0);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void doSearch(value, activeCategory, 0);
    }, 300);
  }

  function handleCategoryChange(cat: string | null) {
    setActiveCategory(cat);
    setPage(0);
    void doSearch(query, cat, 0);
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    void doSearch(query, activeCategory, newPage);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleInstall(entry: SkillCatalogEntry) {
    setInstalling((prev) => new Set(prev).add(entry.id));
    try {
      const req: InstallSkillRequest = {
        skill_key: entry.id,
        name: entry.name,
        description: entry.description,
        category: entry.category,
        tags: entry.tags,
        risk_level: entry.risk_level,
        source: entry.source ?? "antigravity-catalog",
        version: null,
        config: null,
      };
      await agentSkillInstall(agentId, req);
      const skills = await agentSkillsList(agentId);
      setAgentSkills(new Map(skills.map((s) => [s.skill_key, s])));
      onSkillChange?.();
    } catch (err) {
      console.error(`Install failed for ${entry.id}:`, err);
    } finally {
      setInstalling((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  }

  async function handleToggle(skillKey: string, currentlyEnabled: boolean) {
    setToggling((prev) => new Set(prev).add(skillKey));
    try {
      await agentSkillUpdateConfig(agentId, skillKey, null, !currentlyEnabled);
      setAgentSkills((prev) => {
        const map = new Map(prev);
        const s = map.get(skillKey);
        if (s) map.set(skillKey, { ...s, enabled: !currentlyEnabled });
        return map;
      });
    } catch (err) {
      console.error(`Toggle failed for ${skillKey}:`, err);
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(skillKey);
        return next;
      });
    }
  }

  async function handleRemove(skillKey: string) {
    setRemoving((prev) => new Set(prev).add(skillKey));
    try {
      await agentSkillRemove(agentId, skillKey);
      setAgentSkills((prev) => {
        const map = new Map(prev);
        map.delete(skillKey);
        return map;
      });
      onSkillChange?.();
    } catch (err) {
      console.error(`Remove failed for ${skillKey}:`, err);
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(skillKey);
        return next;
      });
    }
  }

  async function handleImport() {
    if (!importSource.trim()) return;
    setImportLoading(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const result = await skillsInstallFromSource(agentId, importSource.trim());
      setImportSuccess(`Installed "${result.name}" from ${result.source_type}`);
      setImportSource("");
      const skills = await agentSkillsList(agentId);
      setAgentSkills(new Map(skills.map((s) => [s.skill_key, s])));
      onSkillChange?.();
    } catch (err: any) {
      setImportError(typeof err === "string" ? err : err?.message ?? "Import failed");
    } finally {
      setImportLoading(false);
    }
  }

  const total = catalogResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const skills = catalogResult?.skills ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Skill Browser</h3>
          <span className="text-xs text-muted-foreground">{total.toLocaleString()} skills</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowImport((p) => !p)}
            className={`p-1.5 rounded-md transition-colors ${
              showImport ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground hover:text-foreground"
            }`}
            title="Import from source"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => loadInitial()}
            disabled={loading}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Import from source */}
      {showImport && (
        <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Import skill from GitHub, URL, or local path</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={importSource}
              onChange={(e) => setImportSource(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleImport()}
              placeholder="owner/repo, https://..., or ./path"
              className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
            />
            <button
              onClick={handleImport}
              disabled={importLoading || !importSource.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
            >
              {importLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link className="h-3 w-3" />}
              Install
            </button>
          </div>
          {importError && <p className="text-xs text-red-400">{importError}</p>}
          {importSuccess && <p className="text-xs text-green-400">{importSuccess}</p>}
          <p className="text-[10px] text-muted-foreground">
            Examples: <code>vercel/ai</code>, <code>https://github.com/owner/skill</code>, <code>./my-skills/custom</code>
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search 950+ skills…"
          className="w-full bg-muted border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
        />
        {searchLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleCategoryChange(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
            !activeCategory ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          <Filter className="h-3 w-3" />
          All
        </button>
        {categories.map(({ category, count }) => (
          <button
            key={category}
            onClick={() => handleCategoryChange(activeCategory === category ? null : category)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeCategory === category
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {category} ({count})
          </button>
        ))}
      </div>

      {/* Skill grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground text-sm">Loading catalog…</span>
        </div>
      ) : skills.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No skills match your search.</div>
      ) : (
        <>
          <div ref={scrollRef} className="max-h-[500px] overflow-y-auto pr-1 scroll-smooth">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {skills.map((entry) => {
                const installed = agentSkills.get(entry.id);
                const isInstalled = !!installed;
                const isEnabled = installed?.enabled ?? false;
                const isInstallingThis = installing.has(entry.id);
                const isTogglingThis = toggling.has(entry.id);
                const isRemovingThis = removing.has(entry.id);
                const risk = riskColor(entry.risk_level);

                return (
                  <div
                    key={entry.id}
                    className="p-3 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors cursor-pointer group"
                    onClick={() => setDetailSkill(entry)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground truncate">{entry.name || entry.id}</p>
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${risk.bg} ${risk.text} border ${risk.border} flex items-center gap-0.5`}
                          >
                            {entry.risk_level === "high" ? (
                              <AlertTriangle className="h-2.5 w-2.5" />
                            ) : (
                              <Shield className="h-2.5 w-2.5" />
                            )}
                            {entry.risk_level.toUpperCase()}
                          </span>
                          <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-muted text-muted-foreground">
                            {entry.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
                          {entry.description || "No description available."}
                        </p>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {isInstalled ? (
                          <>
                            <button
                              onClick={() => handleToggle(entry.id, isEnabled)}
                              disabled={isTogglingThis}
                              className={`p-1.5 rounded-md transition-colors ${
                                isEnabled ? "text-green-400 hover:bg-green-500/10" : "text-muted-foreground hover:bg-muted"
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
                            <button
                              onClick={() => handleRemove(entry.id)}
                              disabled={isRemovingThis}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Remove"
                            >
                              {isRemovingThis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleInstall(entry)}
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
                    {isInstalled && (
                      <div className="flex items-center gap-1 mt-2 text-[10px] text-green-400">
                        <CheckCircle className="h-3 w-3" />
                        <span>Installed{installed?.version ? ` v${installed.version}` : ""}</span>
                        <span className="text-muted-foreground">· {isEnabled ? "Enabled" : "Disabled"}</span>
                      </div>
                    )}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 flex items-center gap-1 text-[10px] text-primary">
                      <Eye className="h-3 w-3" />
                      Click for details
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages} · {total.toLocaleString()} total
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 0}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      {detailSkill && (
        <SkillDetailModal
          skill={detailSkill}
          installed={agentSkills.get(detailSkill.id) ?? null}
          onClose={() => setDetailSkill(null)}
          onInstall={async (s) => { await handleInstall(s); }}
          onRemove={async (key) => { await handleRemove(key); setDetailSkill(null); }}
          onToggle={async (key, enabled) => { await handleToggle(key, enabled); }}
          installing={installing.has(detailSkill.id)}
        />
      )}
    </div>
  );
}
