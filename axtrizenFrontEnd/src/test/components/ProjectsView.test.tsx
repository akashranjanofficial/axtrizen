import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProjectsView } from "../../app/components/ProjectsView";
import * as tauriApi from "../../app/tauri-api";

// Mock the entire tauri-api module
vi.mock("../../app/tauri-api", () => ({
  getProjects: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getExecutionStatus: vi
    .fn()
    .mockResolvedValue({ status: "idle", phase: "requirements", logs: [] }),
  getTeams: vi.fn().mockResolvedValue([]),
  getWorkflowTemplates: vi.fn().mockResolvedValue([]),
  getProjectWorkflowTemplate: vi.fn().mockResolvedValue(null),
  startProjectExecution: vi.fn(),
  stopProjectExecution: vi.fn(),
  isTauri: vi.fn(() => true),
}));

describe("ProjectsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    (tauriApi.getProjects as any).mockResolvedValue([
      {
        id: "proj-1",
        name: "Nexus Engine",
        description: "Core AI engine",
        team_id: null,
        status: "Active",
        phase: "Execution",
        workspace_path: "/tmp/nexus",
        created_at: new Date().toISOString(),
      },
      {
        id: "proj-2",
        name: "Legacy API",
        description: "Old restful API",
        team_id: null,
        status: "Archived",
        phase: "Completed",
        workspace_path: null,
        created_at: new Date().toISOString(),
      },
    ]);
  });

  it("renders loading state initially", async () => {
    // Delay the resolution to check loading state
    let resolveProjects: any;
    (tauriApi.getProjects as any).mockImplementation(() => {
      return new Promise((resolve) => {
        resolveProjects = resolve;
      });
    });

    render(<ProjectsView />);

    expect(screen.getByText("Loading projects...")).toBeInTheDocument();

    // Resolve to unblock
    await act(async () => {
      resolveProjects([]);
    });
  });

  it("renders the list of projects after loading", async () => {
    render(<ProjectsView />);

    await waitFor(() => {
      expect(screen.getByText("Nexus Engine")).toBeInTheDocument();
      expect(screen.getByText("Legacy API")).toBeInTheDocument();
    });
  });

  it("shows the Create Project form when clicking the Plus button", async () => {
    render(<ProjectsView />);

    await waitFor(() => {
      expect(screen.getByText("Nexus Engine")).toBeInTheDocument();
    });

    const createBtn = screen.getByTestId("create-project-btn");
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText("Create New Project")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("e.g. Website Overhaul 2026")).toBeInTheDocument();
    });
  });

  it("selects a project and displays details in the main view", async () => {
    render(<ProjectsView />);

    await waitFor(() => {
      expect(screen.getByText("Nexus Engine")).toBeInTheDocument();
    });

    // Find the project sidebar card and click it
    const projectCard = screen.getByText("Nexus Engine").closest("button");
    expect(projectCard).not.toBeNull();

    fireEvent.click(projectCard!);

    await waitFor(() => {
      const headings = screen.getAllByText("Nexus Engine");
      expect(headings.length).toBeGreaterThan(1);
    });
  });
});
