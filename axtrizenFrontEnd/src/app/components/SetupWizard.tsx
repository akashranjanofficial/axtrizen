import { useState } from "react";
import { Bot, Zap, ArrowRight, CheckCircle2, Loader2, Wifi, WifiOff } from "lucide-react";
import { connectToGateway, createAgent } from "../tauri-api";

type Step = "welcome" | "gateway" | "agent";

/**
 * SetupWizard — 3-step first-run experience.
 * Shown when localStorage lacks 'axtrizen_setup_complete'.
 */
export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>("welcome");
  const [gatewayOk, setGatewayOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentRole, setAgentRole] = useState("developer");
  const [creating, setCreating] = useState(false);

  const checkGateway = async () => {
    setChecking(true);
    try {
      const ok = await connectToGateway();
      setGatewayOk(ok);
    } catch {
      setGatewayOk(false);
    } finally {
      setChecking(false);
    }
  };

  const handleCreateAgent = async () => {
    if (!agentName.trim()) return;
    setCreating(true);
    try {
      await createAgent(agentName.trim(), agentRole, "~/.axtrizen/workspace", "worker");
      finish();
    } catch (err) {
      console.error("Failed to create agent:", err);
      finish(); // Still complete setup even if agent creation fails
    }
  };

  const finish = () => {
    localStorage.setItem("axtrizen_setup_complete", "true");
    onComplete();
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-lg mx-auto p-8">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-12">
          {(["welcome", "gateway", "agent"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step === s
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : ["welcome", "gateway", "agent"].indexOf(step) > i
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {["welcome", "gateway", "agent"].indexOf(step) > i ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 2 && <div className="w-12 h-0.5 bg-border" />}
            </div>
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === "welcome" && (
          <div className="text-center animate-in fade-in">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6 border border-primary/20">
              <Zap className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-3">Welcome to Axtrizen AI</h1>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Multi-agent orchestration platform for autonomous software development. Let&apos;s get
              you set up in 2 minutes.
            </p>
            <button
              onClick={() => {
                setStep("gateway");
                checkGateway();
              }}
              className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
            >
              Get Started <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Step 2: Gateway */}
        {step === "gateway" && (
          <div className="text-center animate-in fade-in">
            <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-6 border border-blue-500/20">
              {gatewayOk ? (
                <Wifi className="w-10 h-10 text-green-500" />
              ) : gatewayOk === false ? (
                <WifiOff className="w-10 h-10 text-red-500" />
              ) : (
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              )}
            </div>
            <h1 className="text-2xl font-bold mb-3">OpenClaw Gateway</h1>
            <p className="text-muted-foreground mb-6">
              Axtrizen connects to the OpenClaw Gateway for AI agent reasoning.
            </p>

            <div
              className={`p-4 rounded-xl border mb-6 ${
                gatewayOk
                  ? "border-green-500/30 bg-green-500/5"
                  : gatewayOk === false
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-border bg-muted/30"
              }`}
            >
              {checking ? (
                <p className="text-sm text-muted-foreground">Checking connection...</p>
              ) : gatewayOk ? (
                <p className="text-sm text-green-500 font-medium">
                  ✅ Connected to Gateway at ws://127.0.0.1:18789
                </p>
              ) : gatewayOk === false ? (
                <div>
                  <p className="text-sm text-red-400 font-medium mb-2">Gateway not reachable</p>
                  <p className="text-xs text-muted-foreground">
                    Run <code className="bg-muted px-1.5 py-0.5 rounded">openclaw</code> in your
                    terminal to start the Gateway.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex justify-center gap-3">
              {gatewayOk === false && (
                <button
                  onClick={checkGateway}
                  disabled={checking}
                  className="px-6 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  Retry Connection
                </button>
              )}
              <button
                onClick={() => setStep("agent")}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90"
              >
                {gatewayOk ? "Next" : "Skip for Now"} <ArrowRight className="w-4 h-4 inline ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: First Agent */}
        {step === "agent" && (
          <div className="animate-in fade-in">
            <div className="text-center mb-8">
              <div className="w-20 h-20 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-6 border border-purple-500/20">
                <Bot className="w-10 h-10 text-purple-500" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Create Your First Agent</h1>
              <p className="text-muted-foreground text-sm">
                Agents are AI workers that build software for you.
              </p>
            </div>

            <div className="space-y-4 bg-card/50 border border-border rounded-2xl p-6">
              <div>
                <label className="text-sm font-medium block mb-1.5">Agent Name</label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. Atlas, Nova, Coder-1"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Role</label>
                <select
                  value={agentRole}
                  onChange={(e) => setAgentRole(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none appearance-none"
                >
                  <option value="developer">Developer</option>
                  <option value="designer">Designer</option>
                  <option value="qa_engineer">QA Engineer</option>
                  <option value="devops">DevOps</option>
                  <option value="architect">Architect</option>
                  <option value="tech_lead">Tech Lead</option>
                </select>
              </div>
            </div>

            <div className="flex justify-between mt-8">
              <button
                onClick={finish}
                className="px-6 py-2.5 text-muted-foreground hover:text-foreground text-sm"
              >
                Skip
              </button>
              <button
                onClick={handleCreateAgent}
                disabled={!agentName.trim() || creating}
                className="px-8 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
                {creating ? "Creating..." : "Create & Finish"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
