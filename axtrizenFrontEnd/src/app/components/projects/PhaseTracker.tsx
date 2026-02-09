import { CheckCircle2, Circle, Clock } from "lucide-react";

interface PhaseTrackerProps {
  currentPhase: number; // 0-4
}

const PHASES = ["Requirements", "Design", "Development", "Testing", "Deployment"];

export function PhaseTracker({ currentPhase }: PhaseTrackerProps) {
  return (
    <div className="flex items-center justify-between w-full max-w-4xl mx-auto px-4 py-6">
      {PHASES.map((phase, index) => {
        const isCompleted = index < currentPhase;
        const isCurrent = index === currentPhase;
        const isPending = index > currentPhase;

        return (
          <div key={phase} className="flex flex-col items-center relative flex-1">
            {/* Connector Line */}
            {index !== 0 && (
              <div
                className={`absolute top-4 right-[50%] w-full h-0.5 -translate-y-1/2 -z-10 ${
                  index <= currentPhase ? "bg-primary" : "bg-muted"
                }`}
              />
            )}

            {/* Icon Circle */}
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                isCompleted
                  ? "border-green-500 bg-green-500 text-black"
                  : isCurrent
                    ? "border-primary bg-primary/20 text-foreground shadow-[0_0_15px_rgba(175,23,99,0.5)]"
                    : "border-border bg-card text-muted-foreground"
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : isCurrent ? (
                <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
              ) : (
                <Circle className="h-5 w-5" />
              )}
            </div>

            {/* Label */}
            <span
              className={`mt-2 text-xs font-medium transition-colors ${
                isCurrent
                  ? "text-foreground"
                  : isCompleted
                    ? "text-green-500"
                    : "text-muted-foreground"
              }`}
            >
              {phase}
            </span>
          </div>
        );
      })}
    </div>
  );
}
