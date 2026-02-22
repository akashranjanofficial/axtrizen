import { formatDistanceToNow } from "date-fns";
import {
  FolderOpen,
  Plus,
  Search,
  Trash2,
  Calendar,
  FileText,
  CheckCircle2,
  Play,
  Pause,
  Activity,
} from "lucide-react";
import { useState, useEffect } from "react";
import { getProjects, createProject, deleteProject, type Project } from "../tauri-api";

export function ProjectsView() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = async () => {
    try {
      const data = await getProjects();
      setProjects(data);
      if (selectedProject) {
        // Keep the currently selected project updated if it still exists
        const updatedSelected = data.find((p) => p.id === selectedProject.id);
        if (updatedSelected) {
          setSelectedProject(updatedSelected);
        } else {
          setSelectedProject(null);
        }
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    // Poll for updates every 10 seconds
    const interval = setInterval(fetchProjects, 10_000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      return;
    }

    try {
      const project = await createProject(
        newProjectName,
        newProjectDesc.trim() || null,
        null, // team_id
      );
      await fetchProjects();
      setSelectedProject(project);
      setIsCreating(false);
      setNewProjectName("");
      setNewProjectDesc("");
    } catch (error) {
      console.error("Failed to create project:", error);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this project? This will remove its workspace directory permanently.",
      )
    ) {
      return;
    }

    try {
      await deleteProject(id);
      if (selectedProject?.id === id) {
        setSelectedProject(null);
      }
      await fetchProjects();
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return "text-green-500 bg-green-500/10 border-green-500/20";
      case "paused":
        return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
      case "completed":
        return "text-blue-500 bg-blue-500/10 border-blue-500/20";
      default:
        return "text-muted-foreground bg-muted border-border"; // draft
    }
  };

  return (
    <div className="h-[calc(100vh-73px)] flex">
      {/* Left Sidebar */}
      <div className="w-80 border-r border-border bg-card/50 backdrop-blur-xl flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              Projects
            </h2>
            <button
              data-testid="create-project-btn"
              onClick={() => setIsCreating(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
            >
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
              className="w-full rounded-xl border border-border bg-background py-2 pl-10 pr-4 text-sm focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Project List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading && projects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Loading projects...
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
                <FolderOpen className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-foreground text-sm font-medium">No projects found</p>
              <p className="text-muted-foreground text-xs mt-1 px-4">
                {searchQuery
                  ? "Try a different search term"
                  : "Create a new project to get started"}
              </p>
            </div>
          ) : (
            filteredProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedProject(project)}
                className={`group w-full rounded-xl p-3 text-left transition-all ${
                  selectedProject?.id === project.id
                    ? "bg-primary/10 border border-primary/30"
                    : "border border-border bg-card hover:border-primary/50"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-medium text-foreground truncate pr-2">
                    {project.name}
                  </p>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border capitalize whitespace-nowrap ${getStatusColor(project.status)}`}
                  >
                    {project.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate max-w-[120px]">{project.phase} metadata</span>
                  <span>
                    {formatDistanceToNow(new Date(project.created_at), { addSuffix: true })}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-3 bg-muted/30">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-muted-foreground">Total Projects</span>
            <span className="font-medium text-foreground bg-background px-2 py-0.5 rounded-md border border-border">
              {projects.length}
            </span>
          </div>
        </div>
      </div>

      {/* Main Detail View */}
      <div className="flex-1 bg-background relative overflow-y-auto">
        {isCreating ? (
          <div className="max-w-2xl mx-auto p-8 pt-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="mb-8">
              <h1 className="text-3xl font-semibold mb-2">Create New Project</h1>
              <p className="text-muted-foreground">
                Set up a new workspace for your AI team to execute.
              </p>
            </div>

            <form
              onSubmit={handleCreateProject}
              className="space-y-6 bg-card/50 backdrop-blur-xl border border-border p-6 rounded-2xl"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Website Overhaul 2026"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Requirements & Context</label>
                <textarea
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Describe the goals, requirements, and scope of this project..."
                  rows={6}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newProjectName.trim()}
                  className="px-6 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        ) : selectedProject ? (
          <div className="min-h-full p-8 pt-10">
            {/* Project Header Card */}
            <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-6 mb-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-6 flex items-center gap-2">
                <button className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/20 rounded-lg text-sm transition-colors font-medium">
                  <Play className="w-4 h-4" /> Start Execution
                </button>
                <button
                  onClick={() => handleDeleteProject(selectedProject.id)}
                  className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/20 opacity-0 group-hover:opacity-100"
                  title="Delete Project"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 text-sm text-primary font-medium mb-2">
                <FolderOpen className="w-4 h-4" /> Project Workspace
              </div>
              <h1 className="text-3xl font-semibold mb-4 pr-48">{selectedProject.name}</h1>

              <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Status:{" "}
                  <span
                    className={`capitalize font-medium ${getStatusColor(selectedProject.status)} bg-transparent border-0 p-0`}
                  >
                    {selectedProject.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Phase:{" "}
                  <span className="capitalize font-medium text-foreground">
                    {selectedProject.phase}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Created: {new Date(selectedProject.created_at).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  ID: <span className="font-mono text-xs">{selectedProject.id.split("-")[0]}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Content Area (2 cols) */}
              <div className="lg:col-span-2 space-y-6">
                {/* Requirements Section */}
                <div className="bg-card/30 border border-border rounded-2xl p-6">
                  <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Requirements
                  </h3>
                  {selectedProject.description ? (
                    <div className="bg-muted/30 border border-border rounded-xl p-4">
                      <pre className="text-sm font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto">
                        {selectedProject.description}
                      </pre>
                    </div>
                  ) : (
                    <div className="bg-muted/30 border border-border border-dashed rounded-xl p-8 text-center">
                      <p className="text-muted-foreground text-sm">No requirements specified.</p>
                    </div>
                  )}
                </div>

                {/* SDLC Phase Progress */}
                <div className="bg-card/30 border border-border rounded-2xl p-6">
                  <h3 className="text-lg font-medium mb-6">SDLC Progress</h3>

                  <div className="relative">
                    {/* Progress Line */}
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/20 w-1/4"></div>
                    </div>

                    {/* Phase Nodes */}
                    <div className="relative flex justify-between">
                      {["Requirements", "Design", "Development", "Testing", "Deployment"].map(
                        (phase, i) => {
                          const isActive =
                            selectedProject.phase.toLowerCase() === phase.toLowerCase();
                          const isPast = i === 0; // Temporary logic until real phases

                          return (
                            <div key={phase} className="flex flex-col items-center gap-2">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center border-2 z-10 transition-colors ${
                                  isActive
                                    ? "bg-primary border-primary text-primary-foreground ring-4 ring-primary/20"
                                    : isPast
                                      ? "bg-primary border-primary text-primary-foreground"
                                      : "bg-card border-border text-muted-foreground"
                                }`}
                              >
                                {isPast && !isActive ? (
                                  <CheckCircle2 className="w-4 h-4" />
                                ) : (
                                  <span className="text-xs font-medium">{i + 1}</span>
                                )}
                              </div>
                              <span
                                className={`text-xs font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}
                              >
                                {phase}
                              </span>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar Info (1 col) */}
              <div className="space-y-6">
                {/* Assigned Team */}
                <div className="bg-card/30 border border-border rounded-2xl p-6">
                  <h3 className="text-sm font-medium mb-4 text-muted-foreground uppercase tracking-wider">
                    Assigned Team
                  </h3>
                  <div className="bg-muted/50 border border-border rounded-xl p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <span className="text-2xl">👥</span>
                    </div>
                    {selectedProject.team_id ? (
                      <p className="text-sm font-medium">Team ID: {selectedProject.team_id}</p>
                    ) : (
                      <>
                        <p className="text-sm font-medium mb-1 shrink">No team Assigned</p>
                        <button className="text-xs text-primary hover:underline">
                          Select Team
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Workspace Data */}
                <div className="bg-card/30 border border-border rounded-2xl p-6">
                  <h3 className="text-sm font-medium mb-4 text-muted-foreground uppercase tracking-wider">
                    Workspace
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Local Path</span>
                      <code
                        className="text-xs max-w-full overflow-hidden text-ellipsis block bg-muted p-2 rounded-lg border border-border"
                        title={selectedProject.workspace_path || ""}
                      >
                        {selectedProject.workspace_path || "Not created"}
                      </code>
                    </div>
                    {selectedProject.workspace_path && (
                      <button className="w-full py-2 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors">
                        Open in File Explorer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-grid-white/[0.02]">
            <div className="w-24 h-24 rounded-full bg-primary/5 flex items-center justify-center mb-6 border border-primary/10">
              <FolderOpen className="h-10 w-10 text-primary/50" />
            </div>
            <h2 className="text-2xl font-medium text-foreground mb-3">
              {projects.length === 0 ? "Welcome to Projects" : "Select a Project"}
            </h2>
            <p className="max-w-md text-center text-sm mb-8">
              {projects.length === 0
                ? "Projects are where your AI team collaboratively works on a specific app, feature, or goal. Create your first one to get started."
                : "Choose a project from the sidebar to view its requirements, manage its team, and monitor its SDLC progress."}
            </p>
            {projects.length === 0 && (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
              >
                <Plus className="w-5 h-5" />
                Create First Project
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
