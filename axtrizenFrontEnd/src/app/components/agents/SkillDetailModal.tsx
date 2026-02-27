/**
 * SkillDetailModal — shows full skill details with README, tags, risk info,
 * and install/configure actions.
 *
 * Sprint S2 — US-1.2.1 AC10
 */

import { useState } from "react";
import {
  X,
  Download,
  CheckCircle,
  Loader2,
  Shield,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  Trash2,
  ExternalLink,
  Tag,
  Folder,
  Calendar,
} from "lucide-react";
import type { SkillCatalogEntry, AgentSkill, InstallSkillRequest } from "../../tauri-api";

const RISK_INFO: Record<string, { label: string; color: string; desc: string }> = {
  low: { label: "Low Risk", color: "text-green-400", desc: "Safe for most use cases — no system access" },
  medium: { label: "Medium Risk", color: "text-amber-400", desc: "May access files or network — review before enabling" },
  high: { label: "High Risk", color: "text-red-400", desc: "Can execute commands or modify system — use with caution" },
  unknown: { label: "Unknown Risk", color: "text-muted-foreground", desc: "Risk level not assessed — treat as medium" },
};

interface SkillDetailModalProps {
  skill: SkillCatalogEntry;
  installed?: AgentSkill | null;
  onClose: () => void;
  onInstall: (skill: SkillCatalogEntry) => Promise<void>;
  onRemove: (skillKey: string) => Promise<void>;
  onToggle: (skillKey: string, enabled: boolean) => Promise<void>;
  installing?: boolean;
}

export function SkillDetailModal({
  skill,
  installed,
  onClose,
  onInstall,
  onRemove,
  onToggle,
  installing,
}: SkillDetailModalProps) {
  const [removing, setRemoving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const risk = RISK_INFO[skill.risk_level?.toLowerCase()] ?? RISK_INFO.unknown;
  const tags: string[] = (() => {
    if (!skill.tags) return [];
    try {
      return JSON.parse(skill.tags);
    } catch {
      return skill.tags.split(",").map((t) => t.trim());
    }
  })();

  async function handleRemove() {
    setRemoving(true);
    try {
      await onRemove(skill.id);
    } finally {
      setRemoving(false);
    }
  }

  async function handleToggle() {
    if (!installed) return;
    setToggling(true);
    try {
      await onToggle(skill.id, installed.enabled);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl relative flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-bold text-foreground pr-8">
            {skill.name || skill.id}
          </h2>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-muted text-muted-foreground">
              {skill.category}
            </span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded flex items-center gap-1 ${risk.color}`}>
              {skill.risk_level === "high" ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <Shield className="h-3 w-3" />
              )}
              {risk.label}
            </span>
            {installed && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-500/10 text-green-400 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Installed
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Description */}
          <div>
            <p className="text-sm text-foreground leading-relaxed">
              {skill.description || "No description available for this skill."}
            </p>
          </div>

          {/* Risk info */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Shield className={`h-4 w-4 ${risk.color}`} />
              <span className={`text-sm font-medium ${risk.color}`}>{risk.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">{risk.desc}</p>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tags</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground border border-border"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-1.5 text-xs">
            {skill.source_path && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Folder className="h-3.5 w-3.5" />
                <span className="font-mono">{skill.source_path}</span>
              </div>
            )}
            {skill.source && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
                <span>{skill.source}</span>
              </div>
            )}
            {skill.date_added && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>Added: {skill.date_added}</span>
              </div>
            )}
          </div>

          {/* Installed skill config info */}
          {installed && (
            <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Installation Info
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Status</span>
                <span className={installed.enabled ? "text-green-400" : "text-muted-foreground"}>
                  {installed.enabled ? "Enabled" : "Disabled"}
                </span>
                {installed.version && (
                  <>
                    <span className="text-muted-foreground">Version</span>
                    <span className="text-foreground">{installed.version}</span>
                  </>
                )}
                {installed.installed_at && (
                  <>
                    <span className="text-muted-foreground">Installed</span>
                    <span className="text-foreground">{installed.installed_at}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          {installed ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggle}
                disabled={toggling}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  installed.enabled
                    ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {toggling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : installed.enabled ? (
                  <ToggleRight className="h-4 w-4" />
                ) : (
                  <ToggleLeft className="h-4 w-4" />
                )}
                {installed.enabled ? "Enabled" : "Disabled"}
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                {removing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Remove
              </button>
            </div>
          ) : (
            <button
              onClick={() => onInstall(skill)}
              disabled={installing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {installing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Installing…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Install Skill
                </>
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
