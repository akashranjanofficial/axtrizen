import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { TeamsView } from "../../app/components/TeamsView";
import * as tauriApi from "../../app/tauri-api";

// Mock the entire tauri-api module
vi.mock("../../app/tauri-api", () => ({
  getTeams: vi.fn(),
  getTeamMembers: vi.fn(),
  createTeam: vi.fn(),
  deleteTeam: vi.fn(),
  addTeamMember: vi.fn(),
  removeTeamMember: vi.fn(),
  createAgent: vi.fn(),
  isTauri: vi.fn(() => true),
}));

describe("TeamsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    (tauriApi.getTeams as any).mockResolvedValue([
      {
        id: "team-1",
        name: "Frontend Squad",
        description: "Building the UI",
        created_at: new Date().toISOString(),
      },
      {
        id: "team-2",
        name: "Backend Core",
        description: "Rust APIs",
        created_at: new Date().toISOString(),
      },
    ]);

    (tauriApi.getTeamMembers as any).mockResolvedValue([]);
  });

  it("renders loading state initially", async () => {
    // Delay the resolution to check loading state
    let resolveTeams: any;
    (tauriApi.getTeams as any).mockImplementation(() => {
      return new Promise((resolve) => {
        resolveTeams = resolve;
      });
    });

    render(<TeamsView />);

    expect(screen.getByText("Loading teams...")).toBeInTheDocument();

    // Resolve to unblock
    await act(async () => {
      resolveTeams([]);
    });
  });

  it("renders the list of teams after loading", async () => {
    render(<TeamsView />);

    // Wait for teams to load and appear
    await waitFor(() => {
      expect(screen.getByText("Frontend Squad")).toBeInTheDocument();
      expect(screen.getByText("Backend Core")).toBeInTheDocument();
    });

    expect(screen.getByText("Building the UI")).toBeInTheDocument();
  });

  it("shows the Create Team form when the Plus button is clicked", async () => {
    render(<TeamsView />);

    // Wait for the teams list to load
    await waitFor(() => {
      expect(screen.getByText("Frontend Squad")).toBeInTheDocument();
    });

    // The Plus button has a lucide-react Plus icon. Easiest path is finding the button.
    // However, it doesn't have an aria-label. Let's find by SVG or closest container.
    // The Teams header does have `Teams` text. We can find the button near it or just click the first recognizable button.
    // An alternative is using querySelector, but React Testing Library prefers text/role.

    // Let's rely on the "No teams found" or the empty state of right panel to identify initial render vs creation mode
    // Actually the button is a <button> next to "Teams" h2.
    // Let's use getByRole. Usually it's the only button in the header (or one of few).
    const buttons = screen.getAllByRole("button");
    // the plus button is usually the first one in the sidebar header
    fireEvent.click(buttons[0]);

    // Now the Create Team form should be visible
    await waitFor(() => {
      expect(screen.getByText("Create New Team")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("e.g. Frontend Squad")).toBeInTheDocument();
    });
  });

  it("selects a team and displays its details", async () => {
    render(<TeamsView />);

    // Wait for the teams list to load
    await waitFor(() => {
      expect(screen.getByText("Frontend Squad")).toBeInTheDocument();
    });

    // Click on the team card
    const teamCard = screen.getByText("Frontend Squad").closest("button");
    expect(teamCard).not.toBeNull();

    fireEvent.click(teamCard!);

    // Right panel should now show the team details
    await waitFor(() => {
      // The header for the main panel
      const headings = screen.getAllByText("Frontend Squad");
      expect(headings.length).toBeGreaterThan(1); // One in sidebar, one in main view
      expect(screen.getByText("Open Group Chat")).toBeInTheDocument();
    });
  });
});
