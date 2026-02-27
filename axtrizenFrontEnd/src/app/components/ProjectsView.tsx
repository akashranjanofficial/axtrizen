import { confirm } from "@tauri-apps/plugin-dialog";
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
  Activity,
  Pencil,
  Save,
  X,
  ExternalLink,
  Loader2,
  Square,
  MessageSquare,
  Send,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { ProjectBoard } from "./ProjectBoard";
import { FileBrowser } from "./FileBrowser";
import { FileCheck, FileCode } from "lucide-react";
import Markdown from "react-markdown";
import { SmartProjectSetupWizard } from "./projects/SmartProjectSetupWizard";
import {
  getProjects,
  createProject,
  deleteProject,
  updateProject,
  getTeams,
  pickFolder,
  startProjectExecution,
  stopProjectExecution,
  getExecutionStatus,
  resumeProjectExecution,
  restartWithFeedback,
  getProjectWorkflowTemplate,
  getWorkflowTemplates,
  setProjectWorkflowTemplate,
  type Project,
  type Team,
  type ExecutionLogEntry,
  type WorkflowTemplate,
  type WorkflowTemplateSummary,
} from "../tauri-api";

// ========== Editable drafts type ==========
interface EditDraft {
  name: string;
  description: string;
  workspacePath: string;
}

export function ProjectsView() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [availableTemplates, setAvailableTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("software_development");
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const selectedProjectRef = useRef<Project | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({ name: "", description: "", workspacePath: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const isEditingRef = useRef(false);

  // Orchestration state
  const [executionLogs, setExecutionLogs] = useState<ExecutionLogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const activityFeedRef = useRef<HTMLDivElement>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feedback state
  const [waitingForFeedback, setWaitingForFeedback] = useState(false);
  const [feedbackPhase, setFeedbackPhase] = useState("");
  const [feedbackInput, setFeedbackInput] = useState("");
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);

  // Final report state
  const [finalReport, setFinalReport] = useState<string | null>(null);

  // Revision feedback state (post-completion)
  const [revisionFeedback, setRevisionFeedback] = useState("");
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);

  // Workflow template state
  const [projectTemplate, setProjectTemplate] = useState<WorkflowTemplate | null>(null);

  // View state
  const [activeTab, setActiveTab] = useState<"board" | "files">("board");

  // Keep refs in sync so polling callback sees latest state
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    selectedProjectRef.current = selectedProject;
    setTeamDropdownOpen(false);
    // Only reset draft when switching projects (not during polling updates while editing)
    if (!isEditingRef.current && selectedProject) {
      setDraft({
        name: selectedProject.name,
        description: selectedProject.description || "",
        workspacePath: selectedProject.workspace_path || "",
      });
    }
  }, [selectedProject]);

  // Load the workflow template when a project is selected
  useEffect(() => {
    if (!selectedProject) {
      setProjectTemplate(null);
      return;
    }
    getProjectWorkflowTemplate(selectedProject.id)
      .then(setProjectTemplate)
      .catch(() => setProjectTemplate(null));
  }, [selectedProject?.id]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!teamDropdownOpen) {
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTeamDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [teamDropdownOpen]);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data);
      const current = selectedProjectRef.current;
      // Skip updating selectedProject while user is editing to avoid resetting the draft
      if (current && !isEditingRef.current) {
        const updatedSelected = data.find((p) => p.id === current.id);
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
  }, []);

  const fetchTeams = async () => {
    try {
      const dbTeams = await getTeams();
      setTeams(dbTeams);
    } catch (error) {
      console.error("Failed to fetch teams:", error);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchTeams();
    const interval = setInterval(fetchProjects, 10_000);
    return () => clearInterval(interval);
  }, []);

  // ========== Computed: unsaved changes ==========
  const hasUnsavedChanges =
    isEditing &&
    selectedProject &&
    (draft.name !== selectedProject.name ||
      draft.description !== (selectedProject.description || "") ||
      draft.workspacePath !== (selectedProject.workspace_path || ""));

  // ========== Handlers ==========

  // Fetch workflow templates when opening the create form
  useEffect(() => {
    if (isCreating) {
      getWorkflowTemplates()
        .then(setAvailableTemplates)
        .catch((err) => console.warn("Failed to load templates:", err));
    }
  }, [isCreating]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      return;
    }
    try {
      const project = await createProject(newProjectName, newProjectDesc.trim() || null, null);
      // Assign the selected workflow template
      if (selectedTemplateId) {
        await setProjectWorkflowTemplate(project.id, selectedTemplateId).catch((err) =>
          console.warn("Failed to assign template:", err),
        );
      }
      await fetchProjects();
      setSelectedProject(project);
      setIsCreating(false);
      setNewProjectName("");
      setNewProjectDesc("");
      setSelectedTemplateId("software_development");
    } catch (error) {
      console.error("Failed to create project:", error);
    }
  };

  const handleDeleteProject = async (id: string) => {
    const isConfirmed = await confirm(
      "Are you sure you want to delete this project? This will remove its workspace directory permanently.",
      { title: "Delete Project", kind: "warning" },
    );
    if (!isConfirmed) {
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
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "paused":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "completed":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const handleStartProject = async (project: Project) => {
    setExecutionError(null);
    setIsExecuting(true);
    setExecutionLogs([]);
    // Clear any previous safety timeout
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    try {
      await startProjectExecution(project.id);
      // Safety timeout: if no logs arrive within 60s, check execution status
      safetyTimeoutRef.current = setTimeout(async () => {
        safetyTimeoutRef.current = null;
        try {
          const status = await getExecutionStatus(project.id);
          if (status.status !== "running" && status.logs.length === 0) {
            setIsExecuting(false);
            setExecutionError(
              "Execution may have failed to start. Please check that the Gateway is running and try again.",
            );
          }
        } catch {
          // Ignore — if we can't fetch status, the execution might still be starting
        }
      }, 60000);
    } catch (error) {
      console.error("Failed to start project execution:", error);
      setExecutionError(String(error));
      setIsExecuting(false);
    }
  };

  const handlePauseProject = async (project: Project) => {
    try {
      await stopProjectExecution(project.id);
      setIsExecuting(false);
    } catch (error) {
      console.error("Failed to stop project execution:", error);
    }
  };

  const handleRevisionSubmit = async (project: Project) => {
    if (!revisionFeedback.trim()) return;
    setIsSubmittingRevision(true);
    setExecutionError(null);
    setIsExecuting(true);
    setExecutionLogs([]);
    setFinalReport(null);
    try {
      await restartWithFeedback(project.id, revisionFeedback.trim());
      setRevisionFeedback("");
      // Safety timeout same as handleStartProject
      safetyTimeoutRef.current = setTimeout(async () => {
        safetyTimeoutRef.current = null;
        try {
          const status = await getExecutionStatus(project.id);
          if (status.status !== "running" && status.logs.length === 0) {
            setIsExecuting(false);
            setExecutionError(
              "Revision execution may have failed to start. Please check that the Gateway is running.",
            );
          }
        } catch {
          // Ignore
        }
      }, 60000);
    } catch (error) {
      console.error("Failed to restart with feedback:", error);
      setExecutionError(String(error));
      setIsExecuting(false);
    } finally {
      setIsSubmittingRevision(false);
    }
  };

  // Listen for orchestration events from Tauri backend
  useEffect(() => {
    let unlistenLog: (() => void) | undefined;
    let unlistenPhase: (() => void) | undefined;
    let unlistenComplete: (() => void) | undefined;
    let unlistenFeedback: (() => void) | undefined;
    let unlistenFinalReport: (() => void) | undefined;

    const setup = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");

        unlistenLog = await listen<{ projectId: string; log: ExecutionLogEntry }>(
          "project-execution-log",
          (event) => {
            const currentProject = selectedProjectRef.current;
            if (currentProject && event.payload.projectId === currentProject.id) {
              setExecutionLogs((prev) => [...prev, event.payload.log]);
              // Auto-scroll the activity feed
              setTimeout(
                () =>
                  activityFeedRef.current?.scrollTo({
                    top: activityFeedRef.current.scrollHeight,
                    behavior: "smooth",
                  }),
                100,
              );
            }
          },
        );

        unlistenPhase = await listen<{ projectId: string; phase: string }>(
          "project-phase-changed",
          (event) => {
            const currentProject = selectedProjectRef.current;
            if (currentProject && event.payload.projectId === currentProject.id) {
              setSelectedProject({
                ...currentProject,
                phase: event.payload.phase,
                status: "active",
              });
              setProjects((prev) =>
                prev.map((p) =>
                  p.id === currentProject.id
                    ? { ...p, phase: event.payload.phase, status: "active" }
                    : p,
                ),
              );
            }
          },
        );

        unlistenComplete = await listen<{ projectId: string }>(
          "project-execution-completed",
          (event) => {
            const currentProject = selectedProjectRef.current;
            if (currentProject && event.payload.projectId === currentProject.id) {
              setIsExecuting(false);
              setWaitingForFeedback(false);
              setSelectedProject({ ...currentProject, status: "completed", phase: "deployment" });
              setProjects((prev) =>
                prev.map((p) =>
                  p.id === currentProject.id
                    ? { ...p, status: "completed", phase: "deployment" }
                    : p,
                ),
              );
            }
          },
        );

        unlistenFeedback = await listen<{ projectId: string; phase: string; summary: string }>(
          "project-feedback-requested",
          (event) => {
            const currentProject = selectedProjectRef.current;
            if (currentProject && event.payload.projectId === currentProject.id) {
              setWaitingForFeedback(true);
              setFeedbackPhase(event.payload.phase);
              // Auto-scroll to the feedback input
              setTimeout(
                () =>
                  activityFeedRef.current?.scrollTo({
                    top: activityFeedRef.current.scrollHeight,
                    behavior: "smooth",
                  }),
                200,
              );
            }
          },
        );
        unlistenFinalReport = await listen<{
          projectId: string;
          report: string;
          workspacePath: string | null;
        }>("project-final-report", (event) => {
          const currentProject = selectedProjectRef.current;
          if (currentProject && event.payload.projectId === currentProject.id) {
            setFinalReport(event.payload.report);
          }
        });
      } catch (err) {
        console.warn("Failed to set up Tauri event listeners:", err);
      }
    };

    setup();

    return () => {
      unlistenLog?.();
      unlistenPhase?.();
      unlistenComplete?.();
      unlistenFeedback?.();
      unlistenFinalReport?.();
      // Clean up safety timeout on unmount
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
      }
    };
  }, []);

  // Load existing execution logs when selecting a project
  const selectedProjectId = selectedProject?.id ?? null;

  // Load final report from workspace if it exists (for completed projects)
  useEffect(() => {
    if (!selectedProjectId) {
      setFinalReport(null);
      return;
    }
    const loadReport = async () => {
      try {
        const proj = projects.find((p) => p.id === selectedProjectId);
        if (proj?.status === "completed" && proj?.workspace_path) {
          const { invoke } = await import("@tauri-apps/api/core");
          const report: string = await invoke("read_file_content", {
            path: proj.workspace_path + "/FINAL_REPORT.md",
          });
          // Strip the markdown header we added
          const lines = report.split("\n");
          const dashIndex = lines.findIndex((l: string) => l.startsWith("---"));
          setFinalReport(
            dashIndex >= 0
              ? lines
                  .slice(dashIndex + 2)
                  .join("\n")
                  .trim()
              : report,
          );
        }
        // Don't clear finalReport in the else branch — it may already be set
        // via the real-time "project-final-report" Tauri event listener.
      } catch {
        // Don't clear finalReport on error — it may have been set by the event listener
        // before the file was written or before the project status updated.
      }
    };
    loadReport();
  }, [selectedProjectId, projects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setExecutionLogs([]);
      setIsExecuting(false);
      return;
    }
    getExecutionStatus(selectedProjectId)
      .then((status) => {
        // DB returns logs DESC (newest first), reverse to chronological for display
        const logs = status.logs || [];
        setExecutionLogs(logs.toReversed());
        setIsExecuting(status.status === "running");
      })
      .catch(() => {
        setExecutionLogs([]);
        setIsExecuting(false);
      });
  }, [selectedProjectId]);

  const handleAssignTeam = async (project: Project, teamId: string | null) => {
    try {
      const updated = await updateProject(
        project.id,
        project.name,
        project.description,
        teamId,
        project.status,
        project.phase,
        project.workspace_path,
      );
      setSelectedProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (error) {
      console.error("Failed to assign team to project:", error);
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedProject || !hasUnsavedChanges) {
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateProject(
        selectedProject.id,
        draft.name.trim(),
        draft.description.trim() || null,
        selectedProject.team_id,
        selectedProject.status,
        selectedProject.phase,
        draft.workspacePath.trim() || null,
      );
      setSelectedProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error("Failed to save project:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    if (!selectedProject) {
      return;
    }
    setDraft({
      name: selectedProject.name,
      description: selectedProject.description || "",
      workspacePath: selectedProject.workspace_path || "",
    });
    setIsEditing(false);
  };

  const handlePickWorkspace = async () => {
    try {
      const path = await pickFolder("Select Project Workspace");
      if (path) {
        setDraft((prev) => ({ ...prev, workspacePath: path }));
        if (!isEditing) {
          setIsEditing(true);
        }
      }
    } catch (error) {
      console.error("Failed to pick folder:", error);
    }
  };

  const handleOpenWorkspace = async () => {
    if (!selectedProject?.workspace_path) {
      return;
    }
    try {
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(selectedProject.workspace_path);
    } catch (error) {
      console.error("Failed to open workspace:", error);
    }
  };

  const enterEditMode = () => {
    if (!selectedProject) {
      return;
    }
    setDraft({
      name: selectedProject.name,
      description: selectedProject.description || "",
      workspacePath: selectedProject.workspace_path || "",
    });
    setIsEditing(true);
  };

  // ========== Workflow phases (dynamic from template) ==========
  const phaseOrder = projectTemplate
    ? ["draft", ...projectTemplate.phases.map(p => p.id), "completed"]
    : ["draft", "planning", "design", "development", "testing", "completed"];

  const phaseDisplayNames: Record<string, string> = projectTemplate
    ? Object.fromEntries([
        ["draft", "Draft"],
        ...projectTemplate.phases.map(p => [p.id, p.name]),
        ["completed", "Completed"],
      ])
    : {};

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
                data-testid={`project-item-${project.name.replace(/\s+/g, "-").toLowerCase()}`}
                onClick={() => {
                  setIsEditing(false);
                  setSelectedProject(project);
                }}
                className={`group w-full rounded-xl p-3 text-left transition-all relative ${
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
                  <span className="truncate max-w-[120px]">{project.phase}</span>
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
                  data-testid="project-name-input"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Website Overhaul 2026"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Workflow Template Picker */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Workflow Template</label>
                <p className="text-xs text-muted-foreground">
                  Choose the execution workflow for this project. This determines the phases,
                  prompts, and board labels used during orchestration.
                </p>
                {availableTemplates.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {availableTemplates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTemplateId(t.id)}
                        className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                          selectedTemplateId === t.id
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                            : "border-border bg-background hover:bg-muted/50"
                        }`}
                      >
                        <span className="text-xl mt-0.5">{t.icon}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{t.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {t.description}
                          </p>
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            {t.phase_count} phases · {t.domain}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-xl">
                    Loading templates…
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Requirements & Context</label>
                <textarea
                  data-testid="project-desc-input"
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Describe the goals, requirements, and scope of this project..."
                  rows={6}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none font-mono"
                />
              </div>

              {/* AI Team Suggestion (Sprint S5) */}
              <SmartProjectSetupWizard description={newProjectDesc} />

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
                  data-testid="create-project-submit"
                  disabled={!newProjectName.trim()}
                  className="px-6 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        ) : selectedProject ? (
          <div className="min-h-full p-8 pt-10 pb-24">
            {/* Success toast */}
            {saveSuccess && (
              <div className="fixed top-6 right-6 z-50 bg-green-500/10 border border-green-500/30 text-green-500 px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium animate-in slide-in-from-top-2 duration-200 shadow-lg">
                <CheckCircle2 className="w-4 h-4" />
                Changes saved successfully
              </div>
            )}

            {/* Project Header Card */}
            <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-6 mb-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-6 flex items-center gap-2">
                {!isEditing && (
                  <button
                    data-testid="edit-project-btn"
                    onClick={enterEditMode}
                    className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-lg text-sm transition-colors font-medium"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                )}
                {isExecuting ? (
                  <button
                    data-testid="pause-execution-btn"
                    onClick={() => handlePauseProject(selectedProject)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-sm transition-colors font-medium"
                  >
                    <Square className="w-4 h-4" /> Stop Execution
                  </button>
                ) : selectedProject.status === "completed" ? (
                  <span className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-500 border border-green-500/20 rounded-lg text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4" /> Completed
                  </span>
                ) : (selectedProject.status === "active" || selectedProject.status === "paused" || selectedProject.status === "error") &&
                  selectedProject.phase &&
                  selectedProject.phase !== "requirements" &&
                  selectedProject.phase !== "completed" ? (
                  <button
                    data-testid="resume-execution-btn"
                    onClick={() => handleStartProject(selectedProject)}
                    disabled={!selectedProject.team_id || isExecuting}
                    title={!selectedProject.team_id ? "Assign a team first" : `Resume from ${selectedProject.phase} phase`}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-sm transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play className="w-4 h-4" /> Resume Execution
                  </button>
                ) : (
                  <button
                    data-testid="start-execution-btn"
                    onClick={() => handleStartProject(selectedProject)}
                    disabled={!selectedProject.team_id || isExecuting}
                    title={!selectedProject.team_id ? "Assign a team first" : ""}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/20 rounded-lg text-sm transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play className="w-4 h-4" /> Start Execution
                  </button>
                )}
                <button
                  onClick={() => handleDeleteProject(selectedProject.id)}
                  className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/20 opacity-60 hover:opacity-100"
                  title="Delete Project"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 text-sm text-primary font-medium mb-2">
                <FolderOpen className="w-4 h-4" /> Project Workspace
              </div>

              {/* Editable Project Name */}
              {isEditing ? (
                <input
                  type="text"
                  data-testid="edit-project-name"
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  className="text-3xl font-semibold mb-4 pr-48 w-full bg-transparent border-b-2 border-primary/30 focus:border-primary focus:outline-none py-1 text-foreground"
                  placeholder="Project name"
                />
              ) : (
                <h1 className="text-3xl font-semibold mb-4 pr-48">{selectedProject.name}</h1>
              )}

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
                {/* Final Report — shown when project is completed */}
                {selectedProject.status === "completed" && finalReport && (
                  <div className="bg-green-500/5 border-2 border-green-500/30 rounded-2xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-green-400">
                      <FileCheck className="w-5 h-5" />
                      Final Deliverables Report
                    </h3>
                    <div className="report-markdown text-sm text-muted-foreground leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-green-400 [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-4 [&_h3]:mb-2 [&_strong]:text-foreground [&_strong]:font-medium [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:my-0.5 [&_table]:w-full [&_table]:my-3 [&_table]:border-collapse [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground [&_th]:border-b [&_th]:border-border [&_th]:pb-2 [&_th]:pr-4 [&_td]:text-xs [&_td]:py-1.5 [&_td]:pr-4 [&_td]:border-b [&_td]:border-border/50 [&_code]:bg-muted/50 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-muted/30 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:my-3 [&_pre]:overflow-x-auto [&_p]:my-1.5 [&_hr]:border-border/30 [&_hr]:my-4">
                      <Markdown>{finalReport}</Markdown>
                    </div>
                    {selectedProject.workspace_path && (
                      <div className="mt-4 pt-4 border-t border-green-500/20 flex items-center gap-3">
                        <button
                          onClick={async () => {
                            try {
                              const { invoke } = await import("@tauri-apps/api/core");
                              await invoke("open_workspace", {
                                path: selectedProject.workspace_path!,
                              });
                            } catch (e) {
                              console.error("Failed to open workspace", e);
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/30 rounded-lg text-sm font-medium transition-colors"
                        >
                          <FolderOpen className="w-4 h-4" />
                          Open Project Workspace
                        </button>
                        <span className="text-xs text-muted-foreground font-mono">
                          {selectedProject.workspace_path}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Post-Completion Feedback — request revisions after project is done */}
                {selectedProject.status === "completed" && !isExecuting && (
                  <div className="bg-blue-500/5 border-2 border-blue-500/30 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-blue-400">
                      <MessageSquare className="w-5 h-5" />
                      Request Revisions
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      Provide feedback on the deliverables and the agents will revise accordingly.
                    </p>
                    <textarea
                      value={revisionFeedback}
                      onChange={(e) => setRevisionFeedback(e.target.value)}
                      placeholder="Describe what needs to be changed, improved, or added..."
                      rows={4}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 resize-y mb-3"
                      disabled={isSubmittingRevision}
                    />
                    <button
                      onClick={() => handleRevisionSubmit(selectedProject)}
                      disabled={!revisionFeedback.trim() || isSubmittingRevision}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmittingRevision ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {isSubmittingRevision ? "Revising..." : "Revise"}
                    </button>
                  </div>
                )}

                {/* Requirements Section */}
                <div className="bg-card/30 border border-border rounded-2xl p-6">
                  <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Requirements
                    {!isEditing && (
                      <button
                        onClick={enterEditMode}
                        className="ml-auto p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Edit requirements"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </h3>
                  {isEditing ? (
                    <textarea
                      data-testid="edit-project-desc"
                      value={draft.description}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="Describe the goals, requirements, and scope of this project..."
                      rows={8}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y font-mono"
                    />
                  ) : selectedProject.description ? (
                    <div
                      className="bg-muted/30 border border-border rounded-xl p-4 cursor-pointer hover:border-primary/30 transition-colors"
                      onClick={enterEditMode}
                    >
                      <pre className="text-sm font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto">
                        {selectedProject.description}
                      </pre>
                    </div>
                  ) : (
                    <div
                      className="bg-muted/30 border border-border border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/30 transition-colors"
                      onClick={enterEditMode}
                    >
                      <p className="text-muted-foreground text-sm">Click to add requirements...</p>
                    </div>
                  )}
                </div>

                {/* Workflow Phase Progress */}
                <div className="bg-card/30 border border-border rounded-2xl p-6">
                  <h3 className="text-lg font-medium mb-6">
                    {projectTemplate ? `${projectTemplate.icon} ${projectTemplate.name}` : "Workflow"} Progress
                  </h3>

                  <div className="relative">
                    {/* Progress Line */}
                    {(() => {
                      const currentIndex = phaseOrder.indexOf(selectedProject.phase.toLowerCase());
                      const progressWidth =
                        currentIndex >= 0
                          ? `${(currentIndex / (phaseOrder.length - 1)) * 100}%`
                          : "0%";
                      return (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/40 transition-all duration-500"
                            style={{ width: progressWidth }}
                          />
                        </div>
                      );
                    })()}

                    {/* Phase Nodes */}
                    <div className="relative flex justify-between">
                      {phaseOrder.map((phase, i) => {
                        const currentIndex = phaseOrder.indexOf(
                          selectedProject.phase.toLowerCase(),
                        );
                        const isPast = i < currentIndex;
                        const isActive = i === currentIndex;

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
                              data-testid={`phase-node-${phase}`}
                              className={`text-[10px] font-medium uppercase tracking-wider mt-1 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                            >
                              {phaseDisplayNames[phase] || phase}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Tabs for Board vs Files */}
                <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-xl w-max mb-4 border border-border">
                  <button
                    onClick={() => setActiveTab("board")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeTab === "board"
                        ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Square className="w-4 h-4" />
                    Board
                  </button>
                  <button
                    onClick={() => setActiveTab("files")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeTab === "files"
                        ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <FileCode className="w-4 h-4" />
                    Workspace Files
                  </button>
                </div>

                {/* Tab Content */}
                <div className="mb-6">
                  {activeTab === "board" ? (
                    <ProjectBoard projectId={selectedProject.id} boardLabels={projectTemplate?.board_labels} />
                  ) : (
                    <div className="bg-card/30 border border-border rounded-2xl overflow-hidden min-h-[500px] max-h-[800px] flex">
                      {selectedProject.workspace_path ? (
                        <FileBrowser workspacePath={selectedProject.workspace_path} />
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
                          <FolderOpen className="w-12 h-12 mb-4 opacity-20" />
                          <p>No workspace path available for this project.</p>
                          <p className="text-sm mt-2 opacity-60">
                            Start execution or check project settings to generate a workspace.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Live Activity Feed */}
                {(executionLogs.length > 0 || isExecuting) && (
                  <div className="bg-card/30 border border-border rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-medium">Execution Activity</h3>
                      </div>
                      {isExecuting && (
                        <span className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Running
                        </span>
                      )}
                    </div>

                    {executionError && (
                      <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                        {executionError}
                      </div>
                    )}

                    <div
                      ref={activityFeedRef}
                      className="space-y-2 max-h-80 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-border"
                    >
                      {executionLogs.map((log) => (
                        <div
                          key={log.id}
                          className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                            log.event_type === "error"
                              ? "bg-red-500/5 border-red-500/20"
                              : log.event_type === "phase_started" ||
                                  log.event_type === "phase_completed"
                                ? "bg-primary/5 border-primary/20"
                                : "bg-muted/30 border-border"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              {log.agent_name && (
                                <span className="text-xs font-semibold text-primary truncate">
                                  @{log.agent_name}
                                </span>
                              )}
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider font-medium">
                                {log.phase}
                              </span>
                            </div>
                            <p className="text-sm text-foreground/80">
                              {log.content || log.event_type}
                            </p>
                          </div>
                        </div>
                      ))}
                      {isExecuting && executionLogs.length === 0 && (
                        <div className="flex items-center justify-center py-8 gap-3 text-muted-foreground">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="text-sm">Initializing orchestration engine...</span>
                        </div>
                      )}

                      {/* Feedback Input — shown when orchestrator pauses between phases */}
                      {waitingForFeedback && selectedProject && (
                        <div className="mt-4 p-4 bg-primary/5 border-2 border-primary/30 rounded-xl animate-pulse-subtle">
                          <div className="flex items-center gap-2 mb-3">
                            <MessageSquare className="w-4 h-4 text-primary" />
                            <span className="text-sm font-semibold text-primary">
                              {feedbackPhase.toUpperCase()} Phase Complete — Your Feedback
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-3">
                            Review the output above and provide feedback to guide the next phase, or
                            click Continue to proceed.
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={feedbackInput}
                              onChange={(e) => setFeedbackInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !isSendingFeedback) {
                                  const feedback = feedbackInput.trim() || "continue";
                                  setIsSendingFeedback(true);
                                  resumeProjectExecution(selectedProject.id, feedback)
                                    .then(() => {
                                      setWaitingForFeedback(false);
                                      setFeedbackInput("");
                                    })
                                    .catch((err) => setExecutionError(String(err)))
                                    .finally(() => setIsSendingFeedback(false));
                                }
                              }}
                              placeholder="Type feedback or press Enter to continue..."
                              className="flex-1 px-3 py-2 bg-background/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                              disabled={isSendingFeedback}
                            />
                            <button
                              onClick={() => {
                                const feedback = feedbackInput.trim() || "continue";
                                setIsSendingFeedback(true);
                                resumeProjectExecution(selectedProject.id, feedback)
                                  .then(() => {
                                    setWaitingForFeedback(false);
                                    setFeedbackInput("");
                                  })
                                  .catch((err) => setExecutionError(String(err)))
                                  .finally(() => setIsSendingFeedback(false));
                              }}
                              disabled={isSendingFeedback}
                              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {isSendingFeedback ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              {feedbackInput.trim() ? "Send" : "Continue"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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

                    <div className="relative" data-testid="project-team-select" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={() => setTeamDropdownOpen(!teamDropdownOpen)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 flex items-center justify-between"
                      >
                        <span className="truncate">
                          {selectedProject.team_id
                            ? teams.find((t) => t.id === selectedProject.team_id)?.name ||
                              "Unknown Team"
                            : "-- No Team Assigned --"}
                        </span>
                        <svg
                          className={`w-4 h-4 text-muted-foreground transition-transform ${teamDropdownOpen ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>

                      {teamDropdownOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-lg shadow-xl overflow-hidden">
                          <button
                            type="button"
                            onClick={() => {
                              handleAssignTeam(selectedProject, null);
                              setTeamDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-primary/10 transition-colors flex items-center gap-2 ${
                              !selectedProject.team_id
                                ? "text-primary font-medium bg-primary/5"
                                : "text-foreground"
                            }`}
                          >
                            {!selectedProject.team_id && (
                              <svg
                                className="w-4 h-4 text-primary"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                            <span>-- No Team Assigned --</span>
                          </button>
                          {teams.map((team) => (
                            <button
                              key={team.id}
                              type="button"
                              data-testid={`team-option-${team.name.replace(/\s+/g, "-").toLowerCase()}`}
                              onClick={() => {
                                handleAssignTeam(selectedProject, team.id);
                                setTeamDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-primary/10 transition-colors flex items-center gap-2 ${
                                selectedProject.team_id === team.id
                                  ? "text-primary font-medium bg-primary/5"
                                  : "text-foreground"
                              }`}
                            >
                              {selectedProject.team_id === team.id && (
                                <svg
                                  className="w-4 h-4 text-primary"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                              <span>{team.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {selectedProject.team_id && (
                      <p className="text-xs text-muted-foreground mt-3 font-mono break-all">
                        {selectedProject.team_id}
                      </p>
                    )}
                  </div>
                </div>

                {/* Workspace */}
                <div className="bg-card/30 border border-border rounded-2xl p-6">
                  <h3 className="text-sm font-medium mb-4 text-muted-foreground uppercase tracking-wider">
                    Workspace
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Local Path</span>
                      {isEditing ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            data-testid="edit-workspace-path"
                            value={draft.workspacePath}
                            onChange={(e) =>
                              setDraft((prev) => ({ ...prev, workspacePath: e.target.value }))
                            }
                            placeholder="/path/to/workspace"
                            className="flex-1 text-xs bg-background border border-border rounded-lg px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                          />
                          <button
                            type="button"
                            data-testid="browse-workspace-btn"
                            onClick={handlePickWorkspace}
                            className="px-3 py-2 text-xs font-medium bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors whitespace-nowrap"
                          >
                            Browse…
                          </button>
                        </div>
                      ) : (
                        <code
                          className="text-xs max-w-full overflow-hidden text-ellipsis block bg-muted p-2 rounded-lg border border-border cursor-pointer hover:border-primary/30 transition-colors"
                          title={selectedProject.workspace_path || ""}
                          onClick={enterEditMode}
                        >
                          {selectedProject.workspace_path || "Click to set workspace path"}
                        </code>
                      )}
                    </div>
                    {(selectedProject.workspace_path || draft.workspacePath) && (
                      <button
                        onClick={handleOpenWorkspace}
                        className="w-full py-2 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open in File Explorer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Save / Discard Bar — sticky at the bottom */}
            {hasUnsavedChanges && (
              <div className="fixed bottom-0 left-80 right-0 bg-card/95 backdrop-blur-xl border-t border-border px-8 py-4 flex items-center justify-between z-40 animate-in slide-in-from-bottom-4 duration-200">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-sm text-muted-foreground">You have unsaved changes</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDiscardChanges}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" /> Discard
                  </button>
                  <button
                    type="button"
                    data-testid="save-project-btn"
                    onClick={handleSaveChanges}
                    disabled={isSaving || !draft.name.trim()}
                    className="flex items-center gap-2 px-5 py-2 text-sm bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
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
