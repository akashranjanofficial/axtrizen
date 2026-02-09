import { FolderOpen, Plus, Search } from "lucide-react";
import { useState } from "react";

export interface Project {
  id: string;
  name: string;
  status: "active" | "planning" | "paused" | "completed";
  progress: number;
}

// Start with empty projects - user will create them
const initialProjects: Project[] = [];

export function ProjectsView() {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="h-[calc(100vh-73px)] flex">
      {/* Left Sidebar */}
      <div className="w-80 border-r border-border bg-card/50 backdrop-blur-xl flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg text-foreground">Projects</h2>
            <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground hover:bg-accent transition-all">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Search */}
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

        {/* Project List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <FolderOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm mb-2">No projects yet</p>
              <button className="text-primary text-sm hover:underline">
                Create your first project
              </button>
            </div>
          ) : (
            filteredProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedProject(project)}
                className={`group w-full rounded-xl p-3 text-left transition-all mb-2 ${
                  selectedProject?.id === project.id
                    ? "bg-primary/20 border border-primary/50"
                    : "border border-transparent hover:bg-muted hover:border-border"
                }`}
              >
                <p className="text-sm text-foreground truncate mb-1">{project.name}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="capitalize">{project.status}</span>
                  <span>{project.progress}%</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total Projects</span>
            <span className="text-foreground">{projects.length}</span>
          </div>
        </div>
      </div>

      {/* Main Detail View */}
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <div className="w-24 h-24 rounded-2xl bg-muted flex items-center justify-center mb-6">
          <FolderOpen className="h-10 w-10 opacity-50" />
        </div>
        <h2 className="text-xl font-medium text-foreground mb-2">
          {projects.length === 0 ? "No Projects Yet" : "Select a Project"}
        </h2>
        <p className="max-w-xs text-center">
          {projects.length === 0
            ? "Click the + button to create your first project."
            : "Choose a project from the sidebar to view details."}
        </p>
      </div>
    </div>
  );
}
