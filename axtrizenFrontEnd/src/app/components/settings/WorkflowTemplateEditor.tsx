import { useState, useEffect, useCallback } from "react";
import {
  Layers,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Edit3,
  Save,
} from "lucide-react";
import {
  getWorkflowTemplates,
  getWorkflowTemplate,
  setProjectWorkflowTemplate,
  type WorkflowTemplate,
  type WorkflowTemplateSummary,
  type WorkflowPhase,
  type PhaseType,
} from "../../tauri-api";

const PHASE_TYPES: { value: PhaseType; label: string; desc: string }[] = [
  { value: "Planning", label: "Planning", desc: "Manager coordinates, agents propose plans" },
  { value: "Collaborative", label: "Collaborative", desc: "Group discussion between all agents" },
  { value: "Execution", label: "Execution", desc: "Each agent works independently, manager reviews" },
  { value: "Review", label: "Review", desc: "Agents review each other's output" },
  { value: "Delivery", label: "Delivery", desc: "Final report generation" },
];

const DEFAULT_PHASE: WorkflowPhase = {
  id: "",
  name: "",
  emoji: "📋",
  phase_type: "Planning",
  prompt_template: "",
  saves_files: false,
};

export function WorkflowTemplateEditor() {
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      const ts = await getWorkflowTemplates();
      setTemplates(ts);
    } catch (err) {
      console.error("Failed to load templates:", err);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const selectTemplate = async (id: string) => {
    setSelectedId(id);
    setEditMode(false);
    setLoading(true);
    try {
      const t = await getWorkflowTemplate(id);
      setTemplate(t);
    } catch (err) {
      console.error("Failed to load template:", err);
    } finally {
      setLoading(false);
    }
  };

  const updatePhase = (phaseIdx: number, updates: Partial<WorkflowPhase>) => {
    if (!template) return;
    const phases = [...template.phases];
    phases[phaseIdx] = { ...phases[phaseIdx], ...updates };
    setTemplate({ ...template, phases });
  };

  const addPhase = () => {
    if (!template) return;
    const newPhase: WorkflowPhase = {
      ...DEFAULT_PHASE,
      id: `phase_${template.phases.length + 1}`,
      name: `Phase ${template.phases.length + 1}`,
    };
    setTemplate({ ...template, phases: [...template.phases, newPhase] });
    setExpandedPhase(newPhase.id);
  };

  const removePhase = (idx: number) => {
    if (!template || template.phases.length <= 1) return;
    const phases = template.phases.filter((_, i) => i !== idx);
    setTemplate({ ...template, phases });
  };

  const movePhase = (idx: number, direction: -1 | 1) => {
    if (!template) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= template.phases.length) return;
    const phases = [...template.phases];
    [phases[idx], phases[newIdx]] = [phases[newIdx], phases[idx]];
    setTemplate({ ...template, phases });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          Workflow Templates
        </h2>
      </div>

      {/* Template List */}
      <div className="grid grid-cols-2 gap-3">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => selectTemplate(t.id)}
            className={`text-left p-4 rounded-xl border transition-all ${
              selectedId === t.id
                ? "border-primary bg-primary/10"
                : "border-border bg-card/50 hover:border-primary/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{t.icon}</span>
              <span className="font-medium text-sm text-foreground">{t.name}</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {t.domain}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {t.phase_count} phases
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Template Detail / Editor */}
      {loading && (
        <div className="text-center text-muted-foreground py-8">Loading template...</div>
      )}

      {template && !loading && (
        <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{template.icon}</span>
              <div>
                <h3 className="font-semibold text-foreground">{template.name}</h3>
                <p className="text-xs text-muted-foreground">{template.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditMode(!editMode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                  editMode
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {editMode ? <Eye className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                {editMode ? "Preview" : "Edit"}
              </button>
            </div>
          </div>

          {/* Template Info */}
          <div className="p-5 border-b border-border">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Domain</span>
                <p className="font-medium text-foreground">{template.domain}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Phases</span>
                <p className="font-medium text-foreground">{template.phases.length}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Recommended Roles</span>
                <p className="font-medium text-foreground text-xs">
                  {template.recommended_roles.slice(0, 3).join(", ")}
                  {template.recommended_roles.length > 3 && "..."}
                </p>
              </div>
            </div>
          </div>

          {/* Board Labels */}
          <div className="p-5 border-b border-border">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Board Labels
            </h4>
            <div className="grid grid-cols-4 gap-3 text-sm">
              {Object.entries(template.board_labels).map(([key, value]) => (
                <div key={key}>
                  <span className="text-[10px] text-muted-foreground capitalize">{key}</span>
                  {editMode ? (
                    <input
                      value={value}
                      onChange={(e) =>
                        setTemplate({
                          ...template,
                          board_labels: { ...template.board_labels, [key]: e.target.value },
                        })
                      }
                      className="w-full mt-1 px-2 py-1 rounded-md bg-background border border-border text-xs text-foreground"
                    />
                  ) : (
                    <p className="font-medium text-foreground">{value}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Phases */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Workflow Phases
              </h4>
              {editMode && (
                <button
                  onClick={addPhase}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-primary hover:bg-primary/10 transition-all"
                >
                  <Plus className="h-3 w-3" /> Add Phase
                </button>
              )}
            </div>

            <div className="space-y-2">
              {template.phases.map((phase, idx) => {
                const isExpanded = expandedPhase === phase.id;
                return (
                  <div
                    key={phase.id}
                    className="rounded-xl border border-border bg-background/50 overflow-hidden"
                  >
                    {/* Phase Header */}
                    <button
                      onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
                      className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        {editMode && (
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                        )}
                        <span className="text-sm">{phase.emoji}</span>
                        <span className="text-sm font-medium text-foreground">{phase.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {phase.phase_type}
                        </span>
                        {phase.saves_files && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                            saves files
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {editMode && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); movePhase(idx, -1); }}
                              className="p-1 text-muted-foreground hover:text-foreground"
                              disabled={idx === 0}
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); movePhase(idx, 1); }}
                              className="p-1 text-muted-foreground hover:text-foreground"
                              disabled={idx === template.phases.length - 1}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); removePhase(idx); }}
                              className="p-1 text-red-400 hover:text-red-300"
                              disabled={template.phases.length <= 1}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Phase Detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                        {editMode ? (
                          <>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="text-[10px] text-muted-foreground">Name</label>
                                <input
                                  value={phase.name}
                                  onChange={(e) => updatePhase(idx, { name: e.target.value })}
                                  className="w-full mt-1 px-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted-foreground">Emoji</label>
                                <input
                                  value={phase.emoji}
                                  onChange={(e) => updatePhase(idx, { emoji: e.target.value })}
                                  className="w-full mt-1 px-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted-foreground">Type</label>
                                <select
                                  value={phase.phase_type}
                                  onChange={(e) =>
                                    updatePhase(idx, { phase_type: e.target.value as PhaseType })
                                  }
                                  className="w-full mt-1 px-2 py-1.5 rounded-md bg-background border border-border text-xs text-foreground"
                                >
                                  {PHASE_TYPES.map((pt) => (
                                    <option key={pt.value} value={pt.value}>
                                      {pt.label} — {pt.desc}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={phase.saves_files}
                                  onChange={(e) => updatePhase(idx, { saves_files: e.target.checked })}
                                  className="rounded"
                                />
                                Saves files to workspace
                              </label>
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground">Prompt Template</label>
                              <textarea
                                value={phase.prompt_template}
                                onChange={(e) => updatePhase(idx, { prompt_template: e.target.value })}
                                rows={5}
                                className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-border text-xs text-foreground font-mono resize-vertical"
                                placeholder="Use {{project_name}}, {{requirements}}, {{agent_names}} as variables..."
                              />
                            </div>
                            {phase.manager_prompt !== undefined && (
                              <div>
                                <label className="text-[10px] text-muted-foreground">
                                  Manager Prompt (optional)
                                </label>
                                <textarea
                                  value={phase.manager_prompt || ""}
                                  onChange={(e) =>
                                    updatePhase(idx, {
                                      manager_prompt: e.target.value || undefined,
                                    })
                                  }
                                  rows={3}
                                  className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-border text-xs text-foreground font-mono resize-vertical"
                                />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="space-y-2">
                            <div>
                              <span className="text-[10px] text-muted-foreground">Prompt Template</span>
                              <pre className="mt-1 text-xs text-foreground/80 whitespace-pre-wrap bg-background/50 rounded-lg p-3 border border-border max-h-40 overflow-y-auto font-mono">
                                {phase.prompt_template}
                              </pre>
                            </div>
                            {phase.manager_prompt && (
                              <div>
                                <span className="text-[10px] text-muted-foreground">Manager Prompt</span>
                                <pre className="mt-1 text-xs text-foreground/80 whitespace-pre-wrap bg-background/50 rounded-lg p-3 border border-border max-h-32 overflow-y-auto font-mono">
                                  {phase.manager_prompt}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Phase Flow Preview */}
          <div className="px-5 pb-5">
            <div className="flex items-center gap-1 flex-wrap">
              {template.phases.map((phase, idx) => (
                <div key={phase.id} className="flex items-center gap-1">
                  <span className="text-xs bg-muted px-2 py-1 rounded-lg text-foreground">
                    {phase.emoji} {phase.name}
                  </span>
                  {idx < template.phases.length - 1 && (
                    <span className="text-muted-foreground text-xs">→</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!selectedId && !loading && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Select a template above to view or edit its workflow phases
        </div>
      )}
    </div>
  );
}
