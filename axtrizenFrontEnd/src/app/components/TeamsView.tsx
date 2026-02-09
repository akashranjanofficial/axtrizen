import { Search, Users, UserPlus } from "lucide-react";
import { useState, useEffect } from "react";
import { mockDataStore, User } from "../data/mockData";

export function TeamsView() {
  const [managers, setManagers] = useState<User[]>(mockDataStore.getManagers());
  const [agents, setAgents] = useState<User[]>(mockDataStore.getAgents());
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateManager, setShowCreateManager] = useState(false);

  // Subscribe to data changes
  useEffect(() => {
    const unsubscribe = mockDataStore.subscribe(() => {
      setManagers([...mockDataStore.getManagers()]);
      setAgents([...mockDataStore.getAgents()]);
    });
    return unsubscribe;
  }, []);

  // Filter managers based on search
  const filteredManagers = managers.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.specialty?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="h-[calc(100vh-73px)] relative overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border bg-card/50 backdrop-blur-xl flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            Engineering Teams
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage AI Engineering Managers and their reports
          </p>
        </div>

        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search managers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 w-64"
            />
          </div>
          <button
            onClick={() => setShowCreateManager(true)}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium flex items-center gap-2 transition-colors"
          >
            <UserPlus className="h-4 w-4" /> New AI Manager
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredManagers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mb-6">
              <Users className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-medium text-foreground mb-2">No Teams Yet</h2>
            <p className="text-muted-foreground max-w-sm">
              Create an AI Manager to start organizing your agents into teams. Managers supervise
              and coordinate groups of agents.
            </p>
            <button
              onClick={() => setShowCreateManager(true)}
              className="mt-6 px-6 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium flex items-center gap-2 transition-colors"
            >
              <UserPlus className="h-4 w-4" /> Create First Manager
            </button>
          </div>
        ) : (
          <>
            {/* Manager Grid - placeholder for when managers exist */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredManagers.map((manager) => (
                <div key={manager.id} className="p-6 rounded-2xl border border-border bg-card">
                  <div className="flex items-center gap-4 mb-4">
                    <img
                      src={manager.avatar}
                      alt={manager.name}
                      className="w-12 h-12 rounded-xl object-cover"
                    />
                    <div>
                      <h3 className="font-medium text-foreground">{manager.name}</h3>
                      <p className="text-sm text-muted-foreground">{manager.specialty}</p>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {manager.reports?.length || 0} agents reporting
                  </div>
                </div>
              ))}
            </div>

            {/* Unassigned Pool Area */}
            <div className="mt-8 pt-8 border-t border-border">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Unassigned Agents
              </h3>
              <div className="flex gap-4 flex-wrap">
                {agents.filter((a) => !a.managerId).length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-border text-muted-foreground text-sm">
                    {agents.length === 0
                      ? "No agents created yet."
                      : "All agents currently assigned."}
                  </div>
                ) : (
                  agents
                    .filter((a) => !a.managerId)
                    .map((agent) => (
                      <div
                        key={agent.id}
                        className="p-3 bg-card rounded-xl border border-border flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-sm">
                          {agent.avatar}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground">{agent.name}</div>
                          <div className="text-xs text-muted-foreground">{agent.role}</div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create Manager Modal placeholder */}
      {showCreateManager && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Create AI Manager</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Manager creation will be available after agent creation is working.
            </p>
            <button
              onClick={() => setShowCreateManager(false)}
              className="w-full py-3 rounded-xl border border-border text-foreground hover:bg-muted"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
