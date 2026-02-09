import { Filter, Clock } from "lucide-react";

interface ActivityItem {
  id: string;
  agent: string;
  action: string;
  timestamp: string;
  status: "success" | "error" | "pending";
  role: "Dev" | "QA" | "Design";
}

// Start with empty - will be populated by real data
const initialActivities: ActivityItem[] = [];

const roleColors = {
  Dev: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  QA: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  Design: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

export function ActivityFeed() {
  const activities = initialActivities;

  return (
    <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl text-foreground">Activity Log</h2>
        <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Filter className="h-4 w-4" />
        </button>
      </div>

      {/* Activity List */}
      {activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
            <Clock className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">No activity yet</p>
          <p className="text-muted-foreground text-xs mt-1">Agent actions will appear here</p>
        </div>
      ) : (
        <div className="space-y-1">
          {activities.map((activity, index) => (
            <div key={activity.id}>
              <div className="flex items-start gap-3 py-3 transition-colors hover:bg-muted/50 rounded-lg px-3 -mx-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${roleColors[activity.role]}`}
                    >
                      {activity.role}
                    </span>
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{activity.agent}</span>{" "}
                      <span className="text-muted-foreground">{activity.action}</span>
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{activity.timestamp}</p>
                </div>
              </div>
              {index < activities.length - 1 && <div className="h-px bg-border mx-3" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
