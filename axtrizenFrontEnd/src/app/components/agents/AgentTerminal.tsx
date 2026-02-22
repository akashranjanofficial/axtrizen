import { Terminal as TerminalIcon, Download, Trash2, Maximize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { writePty, getSettings } from "../../tauri-api";
import { Agent } from "../AgentsView";
import { TerminalComponent } from "../TerminalComponent";

interface AgentTerminalProps {
  agent: Agent;
  visible?: boolean;
}

// Track which agents have already had onboarding run
const onboardedAgents = new Set<string>();

export function AgentTerminal({ agent, visible = true }: AgentTerminalProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const onboardedRef = useRef(false);

  // Auto-run onboarding command ONLY ONCE per agent
  useEffect(() => {
    if (onboardedAgents.has(agent.id) || onboardedRef.current) {
      return;
    }
    onboardedRef.current = true;
    onboardedAgents.add(agent.id);

    const timer = setTimeout(async () => {
      console.log(`Sending initial command to agent ${agent.id}...`);

      let openclawDir = "~/Desktop/openclaw";
      try {
        const settings = await getSettings();
        if (settings.openclaw_path) {
          openclawDir = settings.openclaw_path;
        }
      } catch (err) {
        console.warn("Could not fetch settings, using default path:", err);
      }

      const riskFlag = agent.acceptedRisk ? " --accept-risk" : "";
      const initCmd = `cd ${openclawDir} && node openclaw.mjs onboard${riskFlag} || echo "Could not find openclaw.mjs in ${openclawDir}"`;
      writePty(agent.id, initCmd + "\n");
    }, 1500);
    return () => clearTimeout(timer);
  }, [agent.id]);

  // CRITICAL: Always render the SAME component tree regardless of visibility.
  // Changing the tree structure would cause React to unmount/remount TerminalComponent,
  // destroying the xterm.js instance and losing all terminal output.
  // Use CSS visibility + positioning instead of display:none or conditional rendering.
  return (
    <div
      className={`p-4 h-full flex flex-col ${isExpanded ? "fixed inset-0 z-50 bg-background p-6" : ""}`}
      style={
        visible
          ? {}
          : {
              visibility: "hidden",
              position: "absolute",
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              overflow: "hidden",
            }
      }
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

      {/* Terminal Content - XTerm.js (always mounted, never unmounted) */}
      <div className="flex-1 rounded-2xl border border-border bg-black overflow-hidden shadow-2xl">
        <TerminalComponent id={agent.id} className="h-full" visible={visible} />
      </div>

      {/* Helper message */}
      <div className="mt-2 text-xs text-muted-foreground flex justify-between">
        <span>Connects to local shell. Run 'node openclaw.mjs onboard' to start.</span>
        <span>Status: {agent.status}</span>
      </div>
    </div>
  );
}

/**
 * Clean up onboarding tracking when an agent is deleted
 */
export function clearAgentOnboarding(agentId: string) {
  onboardedAgents.delete(agentId);
}
