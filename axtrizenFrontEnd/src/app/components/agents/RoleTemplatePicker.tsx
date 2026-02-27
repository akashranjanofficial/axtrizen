/**
 * RoleTemplatePicker — lets users browse and select predefined agent role templates
 * during agent creation.  Grouped by category with search.
 */
import { useState, useMemo } from "react";
import { Search, X, Check, Sparkles } from "lucide-react";
import {
  ROLE_TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplatesByCategory,
  type RoleTemplate,
} from "../../data/role-templates";

interface RoleTemplatePickerProps {
  /** Currently selected template (null = none) */
  selectedTemplateId: string | null;
  /** Called when the user picks a template */
  onSelect: (template: RoleTemplate) => void;
  /** Called when the user clears the selection */
  onClear: () => void;
}

export function RoleTemplatePicker({
  selectedTemplateId,
  onSelect,
  onClear,
}: RoleTemplatePickerProps) {
  const [search, setSearch] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const grouped = useMemo(() => getTemplatesByCategory(), []);
  const categoryOrder = ["engineering", "management", "qa", "devops", "data", "design"];

  const filteredTemplates = useMemo(() => {
    if (!search.trim()) return null; // show grouped view
    const q = search.toLowerCase();
    return ROLE_TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.tagline.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.languages.some((l) => l.toLowerCase().includes(q)),
    );
  }, [search]);

  const selectedTemplate = ROLE_TEMPLATES.find((t) => t.id === selectedTemplateId);

  // If a template is already selected, show a compact summary
  if (selectedTemplate) {
    return (
      <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{selectedTemplate.emoji}</span>
          <div>
            <p className="text-sm font-medium text-foreground">{selectedTemplate.name}</p>
            <p className="text-xs text-muted-foreground">{selectedTemplate.tagline}</p>
          </div>
        </div>
        <button
          onClick={onClear}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Clear template"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        <span>Start from a template (optional)</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
          className="w-full bg-muted border border-border rounded-lg pl-9 pr-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
        />
      </div>

      {/* Template list */}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted/50">
        {filteredTemplates ? (
          // Flat search results
          filteredTemplates.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">No templates match your search</p>
          ) : (
            <div className="divide-y divide-border">
              {filteredTemplates.map((t) => (
                <TemplateRow key={t.id} template={t} onSelect={onSelect} />
              ))}
            </div>
          )
        ) : (
          // Grouped by category
          categoryOrder.map((cat) => {
            const templates = grouped[cat];
            if (!templates?.length) return null;
            const meta = TEMPLATE_CATEGORIES[cat];
            const isExpanded = expandedCategory === cat;

            return (
              <div key={cat}>
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  <span>
                    {meta.icon} {meta.label} ({templates.length})
                  </span>
                  <span className="text-[10px]">{isExpanded ? "▾" : "▸"}</span>
                </button>
                {isExpanded && (
                  <div className="divide-y divide-border">
                    {templates.map((t) => (
                      <TemplateRow key={t.id} template={t} onSelect={onSelect} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TemplateRow({
  template,
  onSelect,
}: {
  template: RoleTemplate;
  onSelect: (t: RoleTemplate) => void;
}) {
  return (
    <button
      onClick={() => onSelect(template)}
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 transition-colors text-left"
    >
      <span className="text-xl flex-shrink-0">{template.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{template.name}</p>
        <p className="text-[11px] text-muted-foreground truncate">{template.tagline}</p>
      </div>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border flex-shrink-0">
        {template.agentType}
      </span>
    </button>
  );
}
