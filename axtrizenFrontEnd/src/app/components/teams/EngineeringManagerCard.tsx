import { Plus, MoreHorizontal } from "lucide-react";

export interface Manager {
  id: string;
  name: string;
  role: "Engineering Manager";
  specialty: string;
  avatar: string;
  reports: string[]; // Agent IDs
}

interface EngineeringManagerCardProps {
  manager: Manager;
  reportingAgents: any[]; // Using any[] for now to avoid circular deps, will fix later
  onAddAgent: (managerId: string) => void;
  onManageTeam: (manager: Manager) => void;
}

export function EngineeringManagerCard({
  manager,
  reportingAgents,
  onAddAgent,
  onManageTeam,
}: EngineeringManagerCardProps) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 relative group overflow-hidden">
      {/* Glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <img
              src={manager.avatar}
              alt={manager.name}
              className="w-16 h-16 rounded-xl object-cover border-2 border-border"
            />
            <div>
              <h3 className="text-lg font-bold text-foreground">{manager.name}</h3>
              <div className="flex items-center gap-2 text-sm text-primary">
                <span className="font-medium">AI Engineering Manager</span>
                <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                <span className="text-muted-foreground">{manager.specialty}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onManageTeam(manager)}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>

        {/* Team Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-muted rounded-xl p-3 border border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Team Size
            </div>
            <div className="text-xl font-bold text-foreground">{reportingAgents.length} Agents</div>
          </div>
          <div className="bg-muted rounded-xl p-3 border border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Active Tasks
            </div>
            <div className="text-xl font-bold text-green-500">8</div>
          </div>
        </div>

        {/* Direct Reports */}
        <div>
          <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-3 flex items-center justify-between">
            Direct Reports
            <span className="text-xs text-primary cursor-pointer hover:underline">View All</span>
          </h4>
          <div className="flex items-center gap-2">
            {reportingAgents.slice(0, 4).map((agent) => (
              <div
                key={agent.id}
                className="relative group/agent cursor-pointer"
                title={agent.name}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-muted to-muted/80 border border-border flex items-center justify-center text-lg">
                  {agent.avatar}
                </div>
                <div
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${
                    agent.status === "active"
                      ? "bg-green-500"
                      : agent.status === "busy"
                        ? "bg-red-500"
                        : "bg-gray-500"
                  }`}
                />
              </div>
            ))}

            {/* Add Agent Button */}
            <button
              onClick={() => onAddAgent(manager.id)}
              className="w-10 h-10 rounded-full border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-muted transition-all"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
