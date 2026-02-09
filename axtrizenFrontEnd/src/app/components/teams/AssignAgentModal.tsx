import { X, Search } from "lucide-react";
import { useState } from "react";
import { Manager } from "./EngineeringManagerCard";

interface Agent {
  id: string;
  name: string;
  role: string;
  avatar: string;
  status: string;
}

interface AssignAgentModalProps {
  manager: Manager;
  allAgents: Agent[];
  onClose: () => void;
  onAssign: (managerId: string, agentId: string) => void;
}

export function AssignAgentModal({ manager, allAgents, onClose, onAssign }: AssignAgentModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter out agents already assigned to this manager
  const availableAgents = allAgents.filter(
    (a) =>
      !manager.reports.includes(a.id) &&
      (a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.role.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl relative flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground">Assign to {manager.name}</h2>
            <p className="text-sm text-muted-foreground">Select agents to add to this team</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-border bg-muted/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search available agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2 text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {availableAgents.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No available agents found.</div>
          ) : (
            availableAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => onAssign(manager.id, agent.id)}
                className="w-full p-3 flex items-center gap-3 hover:bg-muted rounded-xl transition-colors group text-left"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-muted to-muted/80 border border-border flex items-center justify-center text-lg">
                  {agent.avatar}
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {agent.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">{agent.role}</p>
                </div>
                <div className="px-3 py-1 rounded-full bg-muted border border-border text-xs text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary group-hover:border-primary/50 transition-all">
                  Assign
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
