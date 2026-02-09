import { Search, Plus, Play, Pause, Folder } from "lucide-react";
import { useState } from "react";

export interface Project {
  id: string;
  name: string;
  status: "planning" | "active" | "paused" | "completed";
  progress: number;
}

const mockProjects: Project[] = [
  { id: "1", name: "TeamForge v2", status: "active", progress: 45 },
  { id: "2", name: "E-commerce Platform", status: "planning", progress: 10 },
  { id: "3", name: "Legacy Migration", status: "paused", progress: 78 },
  { id: "4", name: "Internal Tools", status: "completed", progress: 100 },
];

const statusColors = {
  active: "bg-green-500",
  planning: "bg-blue-500",
  paused: "bg-yellow-500",
  completed: "bg-gray-500",
};

interface ProjectListProps {
  selectedProject: Project;
  onSelect: (project: Project) => void;
}

export function ProjectList({ selectedProject, onSelect }: ProjectListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProjects = mockProjects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="w-80 border-r border-border bg-card/50 backdrop-blur-xl flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg text-foreground">Projects</h2>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-all">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-border bg-muted py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredProjects.map((project) => (
          <button
            key={project.id}
            onClick={() => onSelect(project)}
            className={`w-full rounded-xl p-3 text-left transition-all mb-2 group ${
              selectedProject.id === project.id
                ? "bg-primary/20 border border-primary/50"
                : "border border-transparent hover:bg-muted hover:border-border"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div
                className={`h-8 w-8 rounded-lg flex items-center justify-center text-foreground ${
                  selectedProject.id === project.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <Folder className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">{project.name}</h3>
                <span className="text-xs text-muted-foreground capitalize">{project.status}</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${statusColors[project.status]}`}
                style={{ width: `${project.progress}%` }}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
