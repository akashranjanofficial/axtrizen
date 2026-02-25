import { Terminal as TerminalIcon, Download, Trash2, Maximize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { writePty, stopAgent, getSettings, isOpenClawConfigured } from "../../tauri-api";
import { Agent } from "../AgentsView";
import { TerminalComponent, killPtySession, type TerminalHandle } from "../TerminalComponent";

interface AgentTerminalProps {
  agent: Agent;
  visible?: boolean;
}

// Persist onboarded agents in sessionStorage to survive page reloads
function getOnboardedAgents(): Set<string> {
  try {
    const stored = sessionStorage.getItem("onboarded_agents");
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}
function markOnboarded(agentId: string) {
  const set = getOnboardedAgents();
  set.add(agentId);
  sessionStorage.setItem("onboarded_agents", JSON.stringify([...set]));
}

export function AgentTerminal({ agent, visible = true }: AgentTerminalProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isKilling, setIsKilling] = useState(false);
  const onboardedRef = useRef(false);
  const termRef = useRef<TerminalHandle | null>(null);

  // Export terminal content as text file
  const handleExport = () => {
    const buffer = termRef.current?.getBuffer?.();
    if (!buffer) {
      return;
    }
    const blob = new Blob([buffer], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agent.name || agent.id}-terminal-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Kill the PTY session
  const handleKill = async () => {
    if (!confirm(`Kill terminal session for ${agent.name || agent.id}?`)) {
      return;
    }
    setIsKilling(true);
    try {
      await stopAgent(agent.id);
      killPtySession(agent.id);
    } catch (err) {
      console.error("Failed to kill PTY:", err);
    } finally {
      setIsKilling(false);
    }
  };

  // Auto-run onboarding command ONLY ONCE per agent, ONLY if not already configured
  useEffect(() => {
    if (getOnboardedAgents().has(agent.id) || onboardedRef.current) {
      return;
    }
    onboardedRef.current = true;
    markOnboarded(agent.id);

    const timer = setTimeout(async () => {
      // Check if OpenClaw is already configured — skip onboarding if so
      try {
        const configured = await isOpenClawConfigured();
        if (configured) {
          console.log(`Agent ${agent.id}: OpenClaw already configured, skipping onboarding.`);
          writePty(agent.id, `echo "\\x1b[32m✓ Agent ready. OpenClaw is configured.\\x1b[0m"\n`);
          return;
        }
      } catch (err) {
        console.warn("Could not check config status:", err);
      }

      console.log(`Sending initial onboarding command to agent ${agent.id}...`);

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
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={handleKill}
            disabled={isKilling}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive hover:border-destructive/50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {isKilling ? "Killing..." : "Kill"}
          </button>
        </div>
      </div>

      {/* Terminal Content - XTerm.js (always mounted, never unmounted) */}
      <div className="flex-1 rounded-2xl border border-border bg-black overflow-hidden shadow-2xl">
        <TerminalComponent ref={termRef} id={agent.id} className="h-full" visible={visible} />
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
  const set = getOnboardedAgents();
  set.delete(agentId);
  sessionStorage.setItem("onboarded_agents", JSON.stringify([...set]));
}
