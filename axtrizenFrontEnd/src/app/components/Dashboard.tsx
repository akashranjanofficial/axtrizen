import { Bot, DollarSign, Cpu, FolderOpen } from "lucide-react";
import { ActivityFeed } from "./ActivityFeed";
import { AgentStatusList } from "./AgentStatusList";
import { MetricsCard } from "./MetricsCard";

export function Dashboard() {
  return (
    <div className="px-6 py-8">
      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricsCard title="Active Agents" value="0" icon={Bot} />
        <MetricsCard title="Session Cost" value="$0.00" icon={DollarSign} />
        <MetricsCard title="System Memory" value="0 MB" icon={Cpu} />
        <MetricsCard title="Active Projects" value="0" icon={FolderOpen} />
      </div>

      {/* Main Grid - Activity Feed and Agent Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed - Takes up 2 columns */}
        <div className="lg:col-span-2">
          <ActivityFeed />
        </div>

        {/* Agent Status List - Takes up 1 column */}
        <div className="lg:col-span-1">
          <AgentStatusList />
        </div>
      </div>

      {/* Additional Info Section */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* System Status */}
        <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6">
          <h3 className="text-lg font-medium mb-4">System Status</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">CPU Usage</span>
                <span>0%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full w-[0%] rounded-full bg-primary transition-all duration-500" />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Memory</span>
                <span>0%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full w-[0%] rounded-full bg-primary transition-all duration-500" />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Network</span>
                <span>0%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full w-[0%] rounded-full bg-primary transition-all duration-500" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
