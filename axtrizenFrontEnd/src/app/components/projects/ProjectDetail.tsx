import { useState } from "react";
import { KanbanBoard } from "./KanbanBoard";
import { PhaseTracker } from "./PhaseTracker";
import { Project } from "./ProjectList";
// import { ArtifactBrowser } from './ArtifactBrowser';

interface ProjectDetailProps {
  project: Project;
}

export function ProjectDetail({ project }: ProjectDetailProps) {
  const [activeTab, setActiveTab] = useState<"tasks" | "settings">("tasks");

  const tabs = [
    { id: "tasks", label: "Tasks" },
    // { id: 'artifacts', label: 'Artifacts' }, // Deferred: Will be implemented later
    { id: "settings", label: "Settings" },
  ] as const;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-xl p-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
              <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-500 border border-green-500/50 uppercase tracking-wide">
                {project.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">TeamForge v2.0 Redesign Initiative</p>
          </div>

          <div className="text-right">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              Overall Progress
            </span>
            <div className="flex items-center gap-2">
              <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${project.progress}%` }} />
              </div>
              <span className="text-sm font-mono text-foreground">{project.progress}%</span>
            </div>
          </div>
        </div>

        {/* Phase Tracker */}
        <PhaseTracker currentPhase={2} />

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border -mb-6 mt-4 pb-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "tasks" | "settings")}
              className={`px-6 py-3 text-sm transition-all relative font-medium ${
                activeTab === tab.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden bg-background/50">
        {/* {activeTab === 'tasks' && <KanbanBoard />} */}
        {activeTab === "tasks" && (
          <div className="h-full bg-background/50 text-foreground overflow-y-auto w-full">
            <KanbanBoard />
          </div>
        )}
        {/* {activeTab === 'artifacts' && <ArtifactBrowser />} */}
        {activeTab === "settings" && (
          <div className="p-8 text-muted-foreground text-center">Project Settings Placeholder</div>
        )}
      </div>
    </div>
  );
}
