import { LucideIcon } from "lucide-react";

interface MetricsCardProps {
  title: string;
  value: string;
  trend?: string;
  icon: LucideIcon;
}

export function MetricsCard({ title, value, trend, icon: Icon }: MetricsCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card backdrop-blur-xl p-6 transition-all duration-300 hover:bg-muted hover:border-primary/50 hover:shadow-[0_0_30px_rgba(175,23,99,0.3)]">
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-transparent to-purple-600/0 opacity-0 group-hover:opacity-20 transition-opacity duration-300" />

      <div className="relative z-10 flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-2">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl text-foreground">{value}</p>
            {trend && <span className="text-sm text-green-500 font-medium">{trend}</span>}
          </div>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary p-2.5 shadow-lg">
          <Icon className="h-6 w-6 text-primary-foreground" />
        </div>
      </div>
    </div>
  );
}
