import { formatDistanceToNow } from "date-fns";
import {
  Users,
  UserPlus,
  Bot,
  Plus,
  Search,
  Trash2,
  Calendar,
  Shield,
  MessageSquare,
  Pencil,
  Check,
  X as XIcon,
  AlertTriangle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { agentStore } from "../stores/agent-store";
import {
  getTeams,
  createTeam,
  deleteTeam,
  updateTeam,
  getTeamMembers,
  addTeamMember,
  removeTeamMember,
  type Team,
  type TeamMember,
} from "../tauri-api";

export function TeamsView({ onOpenGroupChat }: { onOpenGroupChat?: (teamId: string) => void }) {
  // Global agents from store
  const [allAgents, setAllAgents] = useState(agentStore.getAgents());

  // Teams state
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // UI State
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [newTeamManagerId, setNewTeamManagerId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [addingAgentId, setAddingAgentId] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // Rename state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editManagerId, setEditManagerId] = useState("");

  // Delete confirmation modal state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteAlsoAgent, setDeleteAlsoAgent] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sub to agents
  useEffect(() => {
    const unsub = agentStore.subscribe(() => setAllAgents(agentStore.getAgents()));
    return unsub;
  }, []);

  const fetchTeams = async () => {
    try {
      const data = await getTeams();
      setTeams(data);
      if (selectedTeam) {
        const updated = data.find((t) => t.id === selectedTeam.id);
        setSelectedTeam(updated || null);
      }
    } catch (err) {
      console.error("Failed to fetch teams:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMembers = async (teamId: string) => {
    try {
      const members = await getTeamMembers(teamId);
      setTeamMembers(members);
    } catch (err) {
      console.error("Failed to fetch members:", err);
    }
  };

  useEffect(() => {
    fetchTeams();
    const int = setInterval(fetchTeams, 10000);
    return () => clearInterval(int);
  }, []);

  useEffect(() => {
    if (selectedTeam) {
      fetchMembers(selectedTeam.id);
    } else {
      setTeamMembers([]);
    }
  }, [selectedTeam]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) {
      return;
    }

    try {
      // Create Team in SQLite (no agent creation needed)
      const team = await createTeam(
        newTeamName,
        newTeamDesc.trim() || null,
        newTeamManagerId || null,
      );

      await fetchTeams();
      setSelectedTeam(team);
      setIsCreating(false);
      setNewTeamName("");
      setNewTeamDesc("");
      setNewTeamManagerId("");
    } catch (err) {
      console.error("Failed to create team:", err);
    }
  };

  // Open delete confirmation modal (don't delete yet)
  const handleDeleteTeam = (id: string) => {
    setDeleteConfirmId(id);
    setDeleteAlsoAgent(true);
  };

  // Actually delete when user confirms in the modal
  const confirmDelete = async () => {
    if (!deleteConfirmId) {
      return;
    }
    setIsDeleting(true);
    try {
      // Find and optionally delete the group chat agent
      if (deleteAlsoAgent) {
        const team = teams.find((t) => t.id === deleteConfirmId);
        if (team) {
          const groupChatName = `${team.name} - Group Chat`.toLowerCase();
          const agent = allAgents.find((a) => a.name.toLowerCase() === groupChatName);
          if (agent) {
            try {
              await agentStore.removeAgent(agent.id);
            } catch (err) {
              console.warn("Failed to remove group chat agent:", err);
            }
          }
        }
      }
      await deleteTeam(deleteConfirmId);
      if (selectedTeam?.id === deleteConfirmId) {
        setSelectedTeam(null);
      }
      await fetchTeams();
    } catch (err) {
      console.error("Failed to delete team:", err);
    } finally {
      setDeleteConfirmId(null);
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmId(null);
  };

  const handleAddMember = async () => {
    if (!selectedTeam || !addingAgentId) {
      return;
    }
    setAddError(null);
    try {
      console.log("[AddMember] Calling add_team_member:", selectedTeam.id, addingAgentId);
      await addTeamMember(selectedTeam.id, addingAgentId);
      console.log("[AddMember] Success!");
      await fetchMembers(selectedTeam.id);
      setAddingAgentId(""); // Clear selection after adding
    } catch (err) {
      const msg = typeof err === "string" ? err : (err as any)?.message || JSON.stringify(err);
      console.error("Failed to add member:", err);
      setAddError(msg);
    }
  };

  const handleRemoveMember = async (agentId: string) => {
    if (!selectedTeam) {
      return;
    }
    try {
      await removeTeamMember(selectedTeam.id, agentId);
      await fetchMembers(selectedTeam.id);
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  const filteredTeams = teams.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const teamsByManager: Record<string, Team[]> = {};
  const unmanagedTeams: Team[] = [];

  filteredTeams.forEach((team) => {
    if (team.manager_id) {
      if (!teamsByManager[team.manager_id]) {
        teamsByManager[team.manager_id] = [];
      }
      teamsByManager[team.manager_id].push(team);
    } else {
      unmanagedTeams.push(team);
    }
  });

  const renderTeamButton = (team: Team) => (
    <button
      key={team.id}
      onClick={() => {
        setSelectedTeam(team);
        setIsCreating(false);
      }}
      className={`group w-full rounded-xl p-3 text-left transition-all ${
        selectedTeam?.id === team.id
          ? "bg-primary/10 border border-primary/30"
          : "border border-border bg-card hover:border-primary/50"
      }`}
    >
      <div className="flex items-start justify-between mb-1">
        <p className="text-sm font-medium text-foreground truncate">{team.name}</p>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate max-w-[150px]">{team.description || "No description"}</span>
        <span>{formatDistanceToNow(new Date(team.created_at), { addSuffix: true })}</span>
      </div>
    </button>
  );

  // Open the group chat for the selected team
  const handleOpenGroupChat = () => {
    if (!selectedTeam || !onOpenGroupChat) {
      return;
    }
    onOpenGroupChat(selectedTeam.id);
  };

  // Start rename mode prefilling with current team data
  const handleStartRename = () => {
    if (!selectedTeam) {
      return;
    }
    setEditName(selectedTeam.name);
    setEditDesc(selectedTeam.description || "");
    setEditManagerId(selectedTeam.manager_id || "");
    setIsEditingName(true);
  };

  // Save the rename via Tauri IPC
  const handleRenameTeam = async () => {
    if (!selectedTeam || !editName.trim()) {
      return;
    }
    try {
      const updated = await updateTeam(
        selectedTeam.id,
        editName.trim(),
        editDesc.trim() || null,
        editManagerId || null,
      );
      setSelectedTeam(updated);
      setIsEditingName(false);
      await fetchTeams();
    } catch (err) {
      console.error("Failed to rename team:", err);
    }
  };

  // Helpers to get agent details for rendering team members
  const getAgentDetails = (agentId: string) => allAgents.find((a) => a.id === agentId);

  // Agents that are not yet in the selected team
  const availableAgents = allAgents.filter(
    (a) => !teamMembers.some((m) => m.agent_id === a.id) && a.role !== "team_group_chat",
  );

  const statusConfig: Record<string, { color: string; dot: string }> = {
    active: { color: "text-green-400", dot: "bg-green-500" },
    idle: { color: "text-amber-400", dot: "bg-amber-500" },
    error: { color: "text-red-400", dot: "bg-red-500" },
    dormant: { color: "text-gray-400", dot: "bg-gray-500" },
  };

  return (
    <div className="h-[calc(100vh-73px)] flex">
      {/* Left Sidebar */}
      <div className="w-80 border-r border-border bg-card/50 backdrop-blur-xl flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Teams
            </h2>
            <button
              onClick={() => setIsCreating(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search teams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-background py-2 pl-10 pr-4 text-sm focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Team List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading && teams.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading teams...</div>
          ) : filteredTeams.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-foreground text-sm font-medium">No teams found</p>
            </div>
          ) : (
            <>
              {Object.entries(teamsByManager).map(([managerId, mTeams]) => {
                const manager = allAgents.find((a) => a.id === managerId);
                return (
                  <div key={managerId} className="mb-6">
                    <div className="flex items-center gap-2 mb-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <Bot className="w-3.5 h-3.5" />
                      {manager ? manager.name : "Unknown Manager"}
                    </div>
                    <div className="space-y-2">{mTeams.map(renderTeamButton)}</div>
                  </div>
                );
              })}

              {unmanagedTeams.length > 0 && (
                <div className="mb-4">
                  {Object.keys(teamsByManager).length > 0 && (
                    <div className="flex items-center gap-2 mb-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <Users className="w-3.5 h-3.5" />
                      Unmanaged Teams
                    </div>
                  )}
                  <div className="space-y-2">{unmanagedTeams.map(renderTeamButton)}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Detail View */}
      <div className="flex-1 bg-background relative overflow-y-auto">
        {isCreating ? (
          <div className="max-w-2xl mx-auto p-8 pt-12 animate-in fade-in">
            <h1 className="text-3xl font-semibold mb-2">Create New Team</h1>
            <p className="text-muted-foreground mb-8">
              Group your AI agents together. A group chat will be automatically created.
            </p>

            <form
              onSubmit={handleCreateTeam}
              className="space-y-6 bg-card/50 backdrop-blur-xl border border-border p-6 rounded-2xl"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Team Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Frontend Squad"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <textarea
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" /> Manager (Optional)
                </label>
                <select
                  value={newTeamManagerId}
                  onChange={(e) => setNewTeamManagerId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none appearance-none"
                >
                  <option value="">No Manager (Flat Team)</option>
                  {allAgents
                    .filter((a) => a.type === "manager")
                    .map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTeamName.trim()}
                  data-testid="create-team-submit"
                  className="px-6 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  Create Team
                </button>
              </div>
            </form>
          </div>
        ) : selectedTeam ? (
          <div className="min-h-full p-8 pt-10">
            {/* Header Card */}
            <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-6 mb-8 relative group">
              <div className="absolute top-0 right-0 p-6 flex gap-2">
                <button
                  onClick={handleOpenGroupChat}
                  data-testid="open-group-chat-btn"
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-sm transition-colors font-medium"
                >
                  <MessageSquare className="w-4 h-4" />
                  Open Group Chat
                </button>
                <button
                  onClick={() => handleDeleteTeam(selectedTeam.id)}
                  className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Delete team"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  {isEditingName ? (
                    <div className="space-y-2">
                      <input
                        autoFocus
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleRenameTeam();
                          }
                          if (e.key === "Escape") {
                            setIsEditingName(false);
                          }
                        }}
                        className="w-full text-xl font-semibold bg-background border border-primary rounded-lg px-3 py-1 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="Team description (optional)"
                        className="w-full text-sm bg-background border border-border rounded-lg px-3 py-1 focus:border-primary focus:outline-none text-muted-foreground"
                      />
                      <select
                        value={editManagerId}
                        onChange={(e) => setEditManagerId(e.target.value)}
                        className="w-full text-sm bg-background border border-border rounded-lg px-3 py-1 focus:border-primary focus:outline-none text-foreground appearance-none mt-1"
                      >
                        <option value="">No Manager (Flat Team)</option>
                        {allAgents
                          .filter((a) => a.type === "manager")
                          .map((manager) => (
                            <option key={manager.id} value={manager.id}>
                              {manager.name}
                            </option>
                          ))}
                      </select>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={handleRenameTeam}
                          className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
                        >
                          <Check className="w-3 h-3" /> Save
                        </button>
                        <button
                          onClick={() => setIsEditingName(false)}
                          className="flex items-center gap-1 px-3 py-1 bg-muted text-muted-foreground rounded-lg text-sm hover:bg-muted/80"
                        >
                          <XIcon className="w-3 h-3" /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="group/name flex items-center gap-2">
                      <h1 className="text-2xl font-semibold">{selectedTeam.name}</h1>
                      <button
                        onClick={handleStartRename}
                        title="Rename team"
                        className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {!isEditingName && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" /> Created{" "}
                      {new Date(selectedTeam.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              {!isEditingName && selectedTeam.description && (
                <p className="text-muted-foreground mt-4 text-sm max-w-2xl">
                  {selectedTeam.description}
                </p>
              )}
            </div>

            {/* Members Section */}
            <div className="bg-card/30 border border-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" /> Team Members ({teamMembers.length})
                </h3>

                {/* Add Member Controls */}
                <div className="flex gap-2">
                  <select
                    value={addingAgentId}
                    onChange={(e) => setAddingAgentId(e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none max-w-[200px]"
                  >
                    <option value="">Select agent to add...</option>
                    {availableAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.role})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddMember}
                    disabled={!addingAgentId}
                    className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" /> Add
                  </button>
                </div>
                {addError && <p className="text-xs text-red-400 mt-2">{addError}</p>}
              </div>

              {/* Members Grid */}
              {teamMembers.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-xl text-muted-foreground">
                  No members assigned to this team yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {teamMembers.map((member) => {
                    const agent = getAgentDetails(member.agent_id);
                    if (!agent) {
                      return null;
                    }
                    const cfg = statusConfig[agent.status] || statusConfig.idle;

                    return (
                      <div
                        key={member.agent_id}
                        className="p-4 rounded-xl border border-border bg-card/50 flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-lg">
                            {agent.avatar || "🤖"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate text-foreground">
                              {agent.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span
                            className={`w-2 h-2 rounded-full ${cfg.dot}`}
                            title={agent.status}
                          />
                          <button
                            onClick={() => handleRemoveMember(agent.id)}
                            className="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove from team"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-grid-white/[0.02]">
            <div className="w-24 h-24 rounded-full bg-primary/5 flex items-center justify-center mb-6 border border-primary/10">
              <Users className="h-10 w-10 text-primary/50" />
            </div>
            <h2 className="text-2xl font-medium text-foreground mb-3">
              {teams.length === 0 ? "Welcome to Teams" : "Select a Team"}
            </h2>
            <p className="max-w-md text-center text-sm mb-8">
              {teams.length === 0
                ? "Group your AI agents into specialized teams to collaborate on specific projects."
                : "Choose a team from the sidebar to view its members and manage assignments."}
            </p>
            {teams.length === 0 && (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
              >
                <Plus className="w-5 h-5" />
                Create First Team
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Delete Team</h3>
                <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete{" "}
              <strong className="text-foreground">
                {teams.find((t) => t.id === deleteConfirmId)?.name}
              </strong>{" "}
              and all its member assignments?
            </p>

            {/* Option to also delete group chat agent */}
            <label className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border cursor-pointer mb-6 hover:bg-muted transition-colors">
              <input
                type="checkbox"
                checked={deleteAlsoAgent}
                onChange={(e) => setDeleteAlsoAgent(e.target.checked)}
                className="w-4 h-4 rounded accent-primary"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Also delete group chat agent</p>
                <p className="text-xs text-muted-foreground">
                  Remove the team's Group Chat agent and its history
                </p>
              </div>
            </label>

            <div className="flex justify-end gap-3">
              <button
                onClick={cancelDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg text-sm bg-red-500 text-white font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete Team"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
