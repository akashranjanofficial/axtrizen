/**
 * AgentCreationWizard — 4-step wizard for comprehensive agent configuration.
 *
 * Steps:
 *   1. Identity      — Name, role, template, type, model, working directory, SOUL.md, IDENTITY.md
 *   2. Skills        — Browse + select skills from 950+ catalog + AI recommendations
 *   3. Capabilities  — Bundles, tool permissions, security level, context budget, risk acknowledgement
 *   4. Review        — Summary before creation + "Save as Template"
 *
 * Sprint S3 — US-2.1.3, US-2.1.4, US-2.1.5, US-1.2.3
 */

import { useState, useEffect, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Folder,
  Package,
  Shield,
  AlertTriangle,
  Loader2,
  Sparkles,
  Trash2,
  Bot,
  Zap,
  Save,
  Lock,
  Settings2,
  Cpu,
} from "lucide-react";
import { RoleTemplatePicker } from "./agents/RoleTemplatePicker";
import { type RoleTemplate } from "../data/role-templates";
import {
  isTauri,
  catalogSearch,
  catalogCategories,
  agentSkillsBatchInstall,
  getSkillBundles,
  skillRecommendations,
  createAgentWithConfig,
  saveAgentTemplate,
  listAgentTemplates,
  type SkillCatalogEntry,
  type CategoryCount,
  type InstallSkillRequest,
  type SkillBundle,
  type SkillRecommendation,
  type AgentTemplate,
  type CreateAgentWithConfigRequest,
} from "../tauri-api";

// ── Step definitions ───────────────────────────────────────────────

const STEPS = [
  { id: "identity", label: "Identity", icon: Bot },
  { id: "skills", label: "Skills", icon: Package },
  { id: "capabilities", label: "Capabilities", icon: Settings2 },
  { id: "review", label: "Review", icon: Check },
] as const;

type StepId = (typeof STEPS)[number]["id"];

// ── Tool Permission Categories ────────────────────────────────────

const TOOL_PERMISSION_CATEGORIES = [
  { id: "filesystem", label: "File System", desc: "Read/write files, create directories" },
  { id: "network", label: "Network", desc: "HTTP requests, API calls, web fetches" },
  { id: "process", label: "Process Execution", desc: "Run shell commands, spawn processes" },
  { id: "browser", label: "Browser", desc: "Web browsing, screenshots, DOM interaction" },
  { id: "database", label: "Database", desc: "SQL queries, data persistence" },
  { id: "code_execution", label: "Code Execution", desc: "Execute Python, Node.js, etc." },
  { id: "system", label: "System", desc: "Environment variables, OS-level access" },
] as const;

type ToolPermissionLevel = "deny" | "ask" | "allow";

const SECURITY_LEVELS = [
  { id: "sandbox", label: "Sandbox", desc: "Fully isolated, no system access", icon: Lock, color: "text-green-400" },
  { id: "restricted", label: "Restricted", desc: "Limited filesystem + network, no shell", icon: Shield, color: "text-blue-400" },
  { id: "standard", label: "Standard", desc: "Normal permissions with confirmation prompts", icon: Settings2, color: "text-yellow-400" },
  { id: "unrestricted", label: "Unrestricted", desc: "Full system access (use with caution)", icon: AlertTriangle, color: "text-red-400" },
] as const;

type SecurityLevel = (typeof SECURITY_LEVELS)[number]["id"];

// ── Types ──────────────────────────────────────────────────────────

interface ToolPermissions {
  filesystem: ToolPermissionLevel;
  network: ToolPermissionLevel;
  process: ToolPermissionLevel;
  browser: ToolPermissionLevel;
  database: ToolPermissionLevel;
  code_execution: ToolPermissionLevel;
  system: ToolPermissionLevel;
}

const DEFAULT_TOOL_PERMISSIONS: ToolPermissions = {
  filesystem: "ask",
  network: "ask",
  process: "deny",
  browser: "deny",
  database: "ask",
  code_execution: "deny",
  system: "deny",
};

interface WizardState {
  name: string;
  role: string;
  type: "worker" | "manager";
  folderPath: string;
  acceptedRisk: boolean;
  selectedTemplateId: string | null;
  selectedSkills: Map<string, SkillCatalogEntry>;
  selectedBundleIds: Set<string>;
  modelProfile: string;
  soulMd: string;
  identityMd: string;
  toolPermissions: ToolPermissions;
  securityLevel: SecurityLevel;
  contextBudget: number;
}

interface AgentCreationWizardProps {
  onClose: () => void;
  onInitialize: (
    name: string,
    role: string,
    workingDir: string,
    type: "worker" | "manager",
    acceptedRisk: boolean,
    skills: InstallSkillRequest[],
  ) => Promise<void>;
}

// ── Main Component ─────────────────────────────────────────────────

export function AgentCreationWizard({ onClose, onInitialize }: AgentCreationWizardProps) {
  const [step, setStep] = useState<StepId>("identity");
  const [isCreating, setIsCreating] = useState(false);

  const [state, setState] = useState<WizardState>({
    name: "",
    role: "",
    type: "worker",
    folderPath: "",
    acceptedRisk: false,
    selectedTemplateId: null,
    selectedSkills: new Map(),
    selectedBundleIds: new Set(),
    modelProfile: "default",
    soulMd: "",
    identityMd: "",
    toolPermissions: { ...DEFAULT_TOOL_PERMISSIONS },
    securityLevel: "standard",
    contextBudget: 128000,
  });

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  // Track dirty state for ESC confirmation
  const isDirty = !!(state.name || state.role || state.folderPath || state.selectedSkills.size > 0 || state.selectedBundleIds.size > 0 || state.soulMd || state.identityMd);

  // ESC handler with dirty-state confirmation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (isDirty) {
          if (window.confirm("You have unsaved changes. Discard and close?")) {
            onClose();
          }
        } else {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDirty, onClose]);

  function canProceed(): boolean {
    switch (step) {
      case "identity":
        return !!state.name.trim() && !!state.folderPath.trim();
      case "skills":
        return true; // optional
      case "capabilities":
        return state.acceptedRisk;
      case "review":
        return state.acceptedRisk && !!state.name.trim() && !!state.folderPath.trim();
      default:
        return false;
    }
  }

  function goNext() {
    if (stepIndex < STEPS.length - 1) {
      setStep(STEPS[stepIndex + 1].id);
    }
  }

  function goBack() {
    if (stepIndex > 0) {
      setStep(STEPS[stepIndex - 1].id);
    }
  }

  async function handleCreate() {
    if (!canProceed()) return;
    setIsCreating(true);
    try {
      // Use createAgentWithConfig for full agent setup (local SQLite: skills, config, metadata)
      const config: CreateAgentWithConfigRequest = {
        name: state.name,
        role: state.role,
        agent_type: state.type,
        folder_path: state.folderPath,
        model_profile: state.modelProfile,
        soul_md: state.soulMd,
        identity_md: state.identityMd,
        skill_ids: Array.from(state.selectedSkills.keys()),
        bundle_ids: Array.from(state.selectedBundleIds),
        tool_permissions: JSON.stringify(state.toolPermissions),
        security_level: state.securityLevel,
        context_budget: state.contextBudget,
      };

      const result = await createAgentWithConfig(config);

      if (result.skills_failed.length > 0) {
        // Partial failure — agent created but some skills failed
        console.warn(`Agent created but ${result.skills_failed.length} skills failed:`, result.skills_failed);
      }

      // Call onInitialize for Gateway provisioning + sidebar refresh
      const skills: InstallSkillRequest[] = Array.from(state.selectedSkills.values()).map((s) => ({
        skill_key: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        tags: s.tags,
        risk_level: s.risk_level,
        source: s.source ?? "antigravity-catalog",
      }));
      await onInitialize(state.name, state.role, state.folderPath, state.type, state.acceptedRisk, skills);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
      console.error("Failed to create agent:", err);
      alert(`Failed to create agent: ${msg}`);
    } finally {
      setIsCreating(false);
    }
  }

  /** Quick Create — skip to review with sensible defaults */
  function handleQuickCreate() {
    setState((prev) => ({
      ...prev,
      acceptedRisk: true,
    }));
    setStep("review");
  }

  function handleClose() {
    if (isDirty) {
      if (window.confirm("You have unsaved changes. Discard and close?")) {
        onClose();
      }
    } else {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[85vh]">
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Step indicator */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">Create New Agent</h2>
            {step === "identity" && (
              <button
                onClick={handleQuickCreate}
                disabled={!state.name.trim() || !state.folderPath.trim()}
                className="text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline"
              >
                Quick Create →
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = s.id === step;
              const isDone = i < stepIndex;
              return (
                <div key={s.id} className="flex items-center gap-2 flex-1">
                  <button
                    onClick={() => (i <= stepIndex ? setStep(s.id) : undefined)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isDone
                          ? "bg-primary/20 text-primary cursor-pointer"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                    {s.label}
                  </button>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-px ${
                        i < stepIndex ? "bg-primary" : "bg-border"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === "identity" && (
            <IdentityStep state={state} setState={setState} />
          )}
          {step === "skills" && (
            <SkillsStep state={state} setState={setState} />
          )}
          {step === "capabilities" && (
            <CapabilitiesStep state={state} setState={setState} />
          )}
          {step === "review" && <ReviewStep state={state} />}
        </div>

        {/* Footer navigation */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <button
            onClick={goBack}
            disabled={stepIndex === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {step === "review" ? (
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  try {
                    const template: AgentTemplate = {
                      id: "",
                      name: state.name || "Untitled Template",
                      description: state.role || null,
                      agent_type: state.type,
                      role: state.role,
                      model_profile: state.modelProfile,
                      soul_md: state.soulMd,
                      identity_md: state.identityMd,
                      skill_ids: Array.from(state.selectedSkills.keys()),
                      bundle_ids: Array.from(state.selectedBundleIds),
                      tool_permissions: JSON.stringify(state.toolPermissions),
                      security_level: state.securityLevel,
                      context_budget: state.contextBudget,
                      created_at: null,
                    };
                    await saveAgentTemplate(template);
                  } catch (err) {
                    console.error("Failed to save template:", err);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Save className="h-4 w-4" />
                Save as Template
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating || !canProceed()}
                data-testid="create-agent-submit"
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Create Agent
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={goNext}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Identity ──────────────────────────────────────────────

const MODEL_PROFILES = [
  { id: "default", label: "System Default", desc: "Uses the configured model" },
  { id: "claude-sonnet", label: "Claude Sonnet", desc: "Balanced speed and quality" },
  { id: "claude-opus", label: "Claude Opus", desc: "Maximum quality, slower" },
  { id: "gpt-4o", label: "GPT-4o", desc: "OpenAI flagship model" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", desc: "Fast and affordable" },
  { id: "deepseek-r1", label: "DeepSeek R1", desc: "Open-source reasoning model" },
];

function IdentityStep({
  state,
  setState,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  const handleTemplateSelect = (template: RoleTemplate) => {
    setState((prev) => ({
      ...prev,
      selectedTemplateId: template.id,
      name: template.name,
      role: template.tagline,
      type: template.agentType,
    }));
  };

  return (
    <div className="space-y-4">
      {/* Role Template */}
      <RoleTemplatePicker
        selectedTemplateId={state.selectedTemplateId}
        onSelect={handleTemplateSelect}
        onClear={() => setState((prev) => ({ ...prev, selectedTemplateId: null }))}
      />

      {/* Name */}
      <div>
        <label className="block text-sm text-muted-foreground mb-1">Agent Name</label>
        <input
          type="text"
          value={state.name}
          onChange={(e) => setState((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="e.g. Code Reviewer"
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary"
        />
      </div>

      {/* Type */}
      <div>
        <label className="block text-sm text-muted-foreground mb-1">Agent Type</label>
        <select
          value={state.type}
          onChange={(e) => setState((prev) => ({ ...prev, type: e.target.value as "worker" | "manager" }))}
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary"
        >
          <option value="worker">Worker (Standard execution agent)</option>
          <option value="manager">Manager (Delegates tasks to teams)</option>
        </select>
      </div>

      {/* Role */}
      <div>
        <label className="block text-sm text-muted-foreground mb-1">Role</label>
        <input
          type="text"
          value={state.role}
          onChange={(e) => setState((prev) => ({ ...prev, role: e.target.value }))}
          placeholder="e.g. DevOps"
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary"
        />
      </div>

      {/* Model Profile */}
      <div>
        <label className="block text-sm text-muted-foreground mb-1">Model Profile</label>
        <select
          value={state.modelProfile}
          onChange={(e) => setState((prev) => ({ ...prev, modelProfile: e.target.value }))}
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary"
        >
          {MODEL_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} — {p.desc}
            </option>
          ))}
        </select>
      </div>

      {/* Working Directory */}
      <div>
        <label className="block text-sm text-muted-foreground mb-1">Working Directory</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={state.folderPath}
            onChange={(e) => setState((prev) => ({ ...prev, folderPath: e.target.value }))}
            placeholder="/path/to/project"
            className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary"
          />
          <button
            onClick={async () => {
              try {
                if (isTauri()) {
                  const { open } = await import("@tauri-apps/plugin-dialog");
                  const selected = await open({
                    directory: true,
                    multiple: false,
                    title: "Select Working Directory",
                  });
                  if (selected) {
                    setState((prev) => ({ ...prev, folderPath: selected as string }));
                  }
                }
              } catch (err) {
                console.error("Failed to open folder dialog:", err);
              }
            }}
            className="px-3 py-2 bg-muted hover:bg-accent rounded-lg text-muted-foreground transition-colors"
          >
            <Folder className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Select the folder where this agent will operate.
        </p>
      </div>

      {/* SOUL.md */}
      <div>
        <label className="block text-sm text-muted-foreground mb-1">
          SOUL.md <span className="text-[10px] text-muted-foreground">(optional — personality & constraints)</span>
        </label>
        <textarea
          value={state.soulMd}
          onChange={(e) => setState((prev) => ({ ...prev, soulMd: e.target.value }))}
          placeholder="You are a meticulous code reviewer who prioritizes security and readability..."
          rows={3}
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-primary resize-y"
        />
      </div>

      {/* IDENTITY.md */}
      <div>
        <label className="block text-sm text-muted-foreground mb-1">
          IDENTITY.md <span className="text-[10px] text-muted-foreground">(optional — expertise & background)</span>
        </label>
        <textarea
          value={state.identityMd}
          onChange={(e) => setState((prev) => ({ ...prev, identityMd: e.target.value }))}
          placeholder="Expert in TypeScript, React, Node.js with 10+ years of experience..."
          rows={3}
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-primary resize-y"
        />
      </div>
    </div>
  );
}

// ── Step 2: Skills + Recommendations ─────────────────────────────

const SKILL_PAGE_SIZE = 20;

function SkillsStep({
  state,
  setState,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [results, setResults] = useState<SkillCatalogEntry[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Recommendations state
  const [recommendations, setRecommendations] = useState<SkillRecommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);

  useEffect(() => {
    void loadCategories();
    void doSearch("", null, 0);
  }, []);

  // Load recommendations whenever role or name changes
  useEffect(() => {
    if (state.role || state.name) {
      void loadRecommendations();
    }
  }, [state.role, state.name]);

  async function loadRecommendations() {
    setRecsLoading(true);
    try {
      const recs = await skillRecommendations(state.role, state.name, 8);
      setRecommendations(recs);
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
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  }

  async function doSearch(q: string, cat: string | null, p: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await catalogSearch(q, cat, SKILL_PAGE_SIZE, p * SKILL_PAGE_SIZE);
      setResults(res.skills);
      setTotal(res.total);
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message ?? "Unknown error";
      console.error("Skills search failed:", msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(q: string) {
    setQuery(q);
    setPage(0);
    void doSearch(q, category, 0);
  }

  function handleCategoryChange(cat: string | null) {
    setCategory(cat);
    setPage(0);
    void doSearch(query, cat, 0);
  }

  function toggleSkill(entry: SkillCatalogEntry) {
    setState((prev) => {
      const map = new Map(prev.selectedSkills);
      if (map.has(entry.id)) {
        map.delete(entry.id);
      } else {
        map.set(entry.id, entry);
      }
      return { ...prev, selectedSkills: map };
    });
  }

  function addRecommendedSkill(rec: SkillRecommendation) {
    // Construct a SkillCatalogEntry from the recommendation
    const entry: SkillCatalogEntry = {
      id: rec.skill_id,
      name: rec.skill_name,
      description: rec.reason,
      category: rec.category,
      tags: null,
      risk_level: "low",
      source: null,
      source_path: null,
      date_added: null,
    };
    setState((prev) => {
      const map = new Map(prev.selectedSkills);
      if (!map.has(entry.id)) {
        map.set(entry.id, entry);
      }
      return { ...prev, selectedSkills: map };
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / SKILL_PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Select Skills</h3>
          <p className="text-xs text-muted-foreground">
            Choose skills for your agent ({state.selectedSkills.size} selected)
          </p>
        </div>
        {state.selectedSkills.size > 0 && (
          <button
            onClick={() => setState((prev) => ({ ...prev, selectedSkills: new Map() }))}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* AI Recommendations */}
      {(state.role || state.name) && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-primary">Recommended for "{state.role || state.name}"</span>
            {recsLoading && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
          </div>
          {recommendations.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {recommendations.map((rec) => {
                const alreadySelected = state.selectedSkills.has(rec.skill_id);
                return (
                  <button
                    key={rec.skill_id}
                    onClick={() => !alreadySelected && addRecommendedSkill(rec)}
                    disabled={alreadySelected}
                    title={`${rec.reason} (${Math.round(rec.relevance_score * 100)}% match)`}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border transition-colors ${
                      alreadySelected
                        ? "bg-primary/20 text-primary border-primary/40 opacity-60 cursor-default"
                        : "bg-muted text-foreground border-border hover:border-primary/50 hover:bg-primary/10 cursor-pointer"
                    }`}
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    {rec.skill_name}
                    {alreadySelected && <Check className="h-2.5 w-2.5" />}
                  </button>
                );
              })}
            </div>
          ) : !recsLoading ? (
            <p className="text-xs text-muted-foreground">No recommendations available for this role.</p>
          ) : null}
        </div>
      )}

      {/* Selected skills chips */}
      {state.selectedSkills.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(state.selectedSkills.values()).map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-primary/10 text-primary border border-primary/30"
            >
              {s.name || s.id}
              <button
                onClick={() => toggleSkill(s)}
                className="hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search skills…"
        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
      />

      {/* Categories */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => handleCategoryChange(null)}
          className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
            !category ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          All
        </button>
        {categories.slice(0, 12).map((c) => (
          <button
            key={c.category}
            onClick={() => handleCategoryChange(category === c.category ? null : c.category)}
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

      {/* Results list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {results.map((entry) => {
            const selected = state.selectedSkills.has(entry.id);
            return (
              <button
                key={entry.id}
                onClick={() => toggleSkill(entry)}
                className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                  selected
                    ? "border-primary/50 bg-primary/10"
                    : "border-border hover:border-primary/30 hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {entry.name || entry.id}
                      </p>
                      <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-muted text-muted-foreground">
                        {entry.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                      {entry.description || "No description"}
                    </p>
                  </div>
                  <div
                    className={`flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center ${
                      selected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-border"
                    }`}
                  >
                    {selected && <Check className="h-3 w-3" />}
                  </div>
                </div>
              </button>
            );
          })}
          {results.length === 0 && !error && (
            <p className="text-center text-sm text-muted-foreground py-4">No skills found.</p>
          )}
          {error && (
            <div className="text-center py-4 space-y-2">
              <p className="text-sm text-red-400">Failed to load skills catalog</p>
              <p className="text-xs text-muted-foreground">{error}</p>
              <button
                onClick={() => doSearch("", null, 0)}
                className="text-xs text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page + 1} / {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => {
                setPage(page - 1);
                void doSearch(query, category, page - 1);
              }}
              disabled={page === 0}
              className="px-2 py-1 rounded bg-muted hover:bg-accent disabled:opacity-30 transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => {
                setPage(page + 1);
                void doSearch(query, category, page + 1);
              }}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded bg-muted hover:bg-accent disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Capabilities (Bundles + Permissions + Security + Context Budget) ──

function CapabilitiesStep({
  state,
  setState,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  const [bundles, setBundles] = useState<SkillBundle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadBundles();
  }, []);

  async function loadBundles() {
    setLoading(true);
    try {
      const b = await getSkillBundles();
      setBundles(b);
    } catch (err) {
      console.error("Failed to load bundles:", err);
    } finally {
      setLoading(false);
    }
  }

  function toggleBundle(id: string) {
    setState((prev) => {
      const set = new Set(prev.selectedBundleIds);
      if (set.has(id)) {
        set.delete(id);
      } else {
        set.add(id);
      }
      return { ...prev, selectedBundleIds: set };
    });
  }

  function setPermission(categoryId: string, level: ToolPermissionLevel) {
    setState((prev) => ({
      ...prev,
      toolPermissions: {
        ...prev.toolPermissions,
        [categoryId]: level,
      },
    }));
  }

  return (
    <div className="space-y-6">
      {/* Bundles */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-1">Skill Bundles</h3>
        <p className="text-xs text-muted-foreground mb-3">
          One-click skill packs for common roles (optional)
        </p>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : bundles.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No bundles available.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {bundles.map((bundle) => {
              const selected = state.selectedBundleIds.has(bundle.id);
              const skillCount = (() => {
                try {
                  return JSON.parse(bundle.skill_keys).length;
                } catch {
                  return 0;
                }
              })();

              return (
                <button
                  key={bundle.id}
                  onClick={() => toggleBundle(bundle.id)}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    selected
                      ? "border-primary/50 bg-primary/10"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{bundle.icon ?? "📦"}</span>
                    <p className="text-sm font-medium text-foreground">{bundle.name}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                    {bundle.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                    <Package className="h-3 w-3" />
                    {skillCount} skills
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tool Permission Matrix */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-1">Tool Permissions</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Control what this agent can access (per category)
        </p>
        <div className="space-y-2">
          {TOOL_PERMISSION_CATEGORIES.map((cat) => {
            const currentLevel = state.toolPermissions[cat.id as keyof ToolPermissions];
            return (
              <div key={cat.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border border-border">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{cat.label}</p>
                  <p className="text-[10px] text-muted-foreground">{cat.desc}</p>
                </div>
                <select
                  value={currentLevel}
                  onChange={(e) => setPermission(cat.id, e.target.value as ToolPermissionLevel)}
                  className="ml-3 bg-muted border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="deny">Deny</option>
                  <option value="ask">Ask</option>
                  <option value="allow">Allow</option>
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Security Level */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-1">Security Level</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Overall security posture for this agent
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SECURITY_LEVELS.map((level) => {
            const Icon = level.icon;
            const isActive = state.securityLevel === level.id;
            return (
              <button
                key={level.id}
                onClick={() => setState((prev) => ({ ...prev, securityLevel: level.id as SecurityLevel }))}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  isActive
                    ? "border-primary/50 bg-primary/10"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-4 w-4 ${level.color}`} />
                  <span className="text-xs font-medium text-foreground">{level.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{level.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Context Budget */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-1">Context Budget</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Maximum token limit for agent context window
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={8000}
            max={200000}
            step={8000}
            value={state.contextBudget}
            onChange={(e) => setState((prev) => ({ ...prev, contextBudget: parseInt(e.target.value) }))}
            className="flex-1 accent-primary"
          />
          <div className="flex items-center gap-1.5 min-w-[100px]">
            <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-mono text-foreground">
              {(state.contextBudget / 1000).toFixed(0)}k
            </span>
          </div>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>8k (minimal)</span>
          <span>128k (standard)</span>
          <span>200k (maximum)</span>
        </div>
      </div>

      {/* Risk acceptance */}
      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
        <p className="text-xs text-amber-400 mb-2">
          <AlertTriangle className="inline h-3 w-3 mr-1" />
          <strong>Security Notice:</strong> AI agents can execute commands on your system. A bad
          prompt can trick them into doing unsafe things.
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          Recommended: Use sandboxing, allowlists, and least-privilege tools.
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={state.acceptedRisk}
            onChange={(e) => setState((prev) => ({ ...prev, acceptedRisk: e.target.checked }))}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm text-foreground">
            I understand this is powerful and inherently risky. Continue.
          </span>
        </label>
      </div>
    </div>
  );
}

// ── Step 4: Review ────────────────────────────────────────────────

function ReviewStep({ state }: { state: WizardState }) {
  const secLevel = SECURITY_LEVELS.find((l) => l.id === state.securityLevel);
  const SecIcon = secLevel?.icon ?? Shield;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-foreground">Review Agent</h3>

      <div className="space-y-3 text-sm">
        {/* Identity */}
        <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Identity
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">Name</span>
            <span className="text-foreground font-medium">{state.name || "—"}</span>
            <span className="text-muted-foreground">Role</span>
            <span className="text-foreground">{state.role || "—"}</span>
            <span className="text-muted-foreground">Type</span>
            <span className="text-foreground capitalize">{state.type}</span>
            <span className="text-muted-foreground">Model</span>
            <span className="text-foreground">
              {MODEL_PROFILES.find((p) => p.id === state.modelProfile)?.label || state.modelProfile}
            </span>
            <span className="text-muted-foreground">Working Dir</span>
            <span className="text-foreground truncate font-mono text-xs">
              {state.folderPath || "—"}
            </span>
          </div>

          {/* SOUL.md / IDENTITY.md previews */}
          {(state.soulMd || state.identityMd) && (
            <div className="mt-2 space-y-2">
              {state.soulMd && (
                <div>
                  <span className="text-xs text-muted-foreground">SOUL.md</span>
                  <p className="text-xs text-foreground/80 font-mono bg-muted rounded p-1.5 mt-0.5 line-clamp-2">
                    {state.soulMd}
                  </p>
                </div>
              )}
              {state.identityMd && (
                <div>
                  <span className="text-xs text-muted-foreground">IDENTITY.md</span>
                  <p className="text-xs text-foreground/80 font-mono bg-muted rounded p-1.5 mt-0.5 line-clamp-2">
                    {state.identityMd}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Skills */}
        <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Skills ({state.selectedSkills.size})
          </p>
          {state.selectedSkills.size === 0 ? (
            <p className="text-xs text-muted-foreground">No skills selected (can be added later)</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {Array.from(state.selectedSkills.values()).map((s) => (
                <span
                  key={s.id}
                  className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/30"
                >
                  {s.name || s.id}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Bundles */}
        {state.selectedBundleIds.size > 0 && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Bundles ({state.selectedBundleIds.size})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(state.selectedBundleIds).map((id) => (
                <span
                  key={id}
                  className="px-2 py-0.5 text-xs rounded-full bg-accent text-foreground border border-border"
                >
                  {id.replace("bundle-", "").replace(/-/g, " ")}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Capabilities Summary */}
        <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Capabilities
          </p>

          {/* Security Level */}
          <div className="flex items-center gap-2">
            <SecIcon className={`h-4 w-4 ${secLevel?.color ?? "text-muted-foreground"}`} />
            <span className="text-xs text-foreground font-medium">{secLevel?.label ?? state.securityLevel}</span>
            <span className="text-[10px] text-muted-foreground">— {secLevel?.desc}</span>
          </div>

          {/* Context Budget */}
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-foreground">
              Context: {(state.contextBudget / 1000).toFixed(0)}k tokens
            </span>
          </div>

          {/* Tool Permissions Grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
            {TOOL_PERMISSION_CATEGORIES.map((cat) => {
              const level = state.toolPermissions[cat.id as keyof ToolPermissions];
              const levelColor =
                level === "allow" ? "text-green-400" :
                level === "ask" ? "text-yellow-400" :
                "text-red-400";
              return (
                <div key={cat.id} className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{cat.label}</span>
                  <span className={`text-[11px] font-medium capitalize ${levelColor}`}>{level}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Risk */}
        <div className="flex items-center gap-2 text-xs">
          {state.acceptedRisk ? (
            <>
              <Shield className="h-4 w-4 text-green-400" />
              <span className="text-green-400">Risk acknowledged</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span className="text-amber-400">Risk acknowledgement required (go back)</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
