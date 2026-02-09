import { Terminal as TerminalIcon, Download, Trash2, Maximize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { writePty } from "../../tauri-api";
import { Agent } from "../AgentsView";
import { TerminalComponent } from "../TerminalComponent";

interface AgentTerminalProps {
  agent: Agent;
}

export function AgentTerminal({ agent }: AgentTerminalProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-run onboarding command if agent is being initialized
  // We can use a ref or simple effect with timeout to ensure PTY is ready
  useEffect(() => {
    // Small delay to ensure PTY is created and xterm is ready
    const timer = setTimeout(() => {
      console.log("Sending initial command to PTY...");
      // Simplified init command to prevent syntax issues
      // Try to find openclaw.mjs in standard location
      const initCmd =
        'cd ~/Desktop/openclaw && node openclaw.mjs onboard || echo "Could not find openclaw.mjs"';
      writePty(agent.id, initCmd + "\n");
    }, 1000);
    return () => clearTimeout(timer);
  }, [agent.id]);

  return (
    <div
      className={`p-4 h-full flex flex-col ${isExpanded ? "fixed inset-0 z-50 bg-background p-6" : ""}`}
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <TerminalIcon className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-foreground">Agent Terminal</h3>
            <p className="text-xs text-muted-foreground">Internal PTY Session</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Maximize2 className="h-4 w-4" />
            {isExpanded ? "Minimize" : "Expand"}
          </button>
          <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50">
            <Trash2 className="h-4 w-4" />
            Kill
          </button>
        </div>
      </div>

      {/* Terminal Content - XTerm.js */}
      <div className="flex-1 rounded-2xl border border-border bg-black overflow-hidden shadow-2xl">
        <TerminalComponent id={agent.id} className="h-full" />
      </div>

      {/* Helper message */}
      <div className="mt-2 text-xs text-muted-foreground flex justify-between">
        <span>Connects to local shell. Run 'node openclaw.mjs onboard' to start.</span>
        <span>Status: {agent.status}</span>
      </div>
    </div>
  );
}
