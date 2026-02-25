import {
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Loader2,
  MessageSquare,
  Globe,
  Mic,
  Smartphone,
  Hash,
  Video,
  MessagesSquare,
  Box,
  Terminal,
  Cpu,
  Search,
  Plus,
  Trash2,
  Key,
  Database,
  ExternalLink,
  Radio,
  Server,
  Shield,
  Cloud,
  Gamepad2,
  Anchor,
  Bot,
} from "lucide-react";
import { useState, useEffect } from "react";
import { getAgentConfig, saveAgentConfig, getSettings, isTauri } from "../../tauri-api";
import { Agent } from "../AgentsView";

interface AgentSettingsProps {
  agent: Agent;
}

// Known skills list for quick selection
const KNOWN_SKILLS = [
  "apple-notes",
  "apple-reminders",
  "bear-notes",
  "blogwatcher",
  "blucli",
  "bluebubbles",
  "camsnap",
  "canvas",
  "clawhub",
  "coding-agent",
  "discord",
  "eightctl",
  "food-order",
  "gemini",
  "gifgrep",
  "github",
  "gog",
  "goplaces",
  "healthcheck",
  "himalaya",
  "imsg",
  "local-places",
  "mcporter",
  "model-usage",
  "nano-banana-pro",
  "nano-pdf",
  "notion",
  "obsidian",
  "openai-image-gen",
  "openai-whisper",
  "openai-whisper-api",
  "openhue",
  "oracle",
  "ordercli",
  "peekaboo",
  "sag",
  "session-logs",
  "sherpa-onnx-tts",
  "skill-creator",
  "slack",
  "songsee",
  "sonoscli",
  "spotify-player",
  "summarize",
  "things-mac",
  "tmux",
  "trello",
  "video-frames",
  "voice-call",
  "wacli",
  "weather",
];

const MODEL_PROVIDERS = [
  { id: "openai", name: "OpenAI", url: "https://api.openai.com/v1" },
  { id: "anthropic", name: "Anthropic", url: "https://api.anthropic.com/v1" },
  { id: "google", name: "Google Gemini", url: "https://generativelanguage.googleapis.com" },
  { id: "deepseek", name: "DeepSeek", url: "https://api.deepseek.com" },
  { id: "mistral", name: "Mistral", url: "https://api.mistral.ai/v1" },
  { id: "openrouter", name: "OpenRouter", url: "https://openrouter.ai/api/v1" },
  { id: "xai", name: "xAI (Grok)", url: "https://api.x.ai/v1" },
  { id: "perplexity", name: "Perplexity", url: "https://api.perplexity.ai" },
];

export function AgentSettings({ agent }: AgentSettingsProps) {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [skillSearch, setSkillSearch] = useState("");
  const [addingEnvVar, setAddingEnvVar] = useState<string | null>(null);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [openclawPath, setOpenclawPath] = useState<string | null>(null);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, [agent]);

  const resolveOpenclawPath = async (): Promise<string> => {
    if (openclawPath) {
      return openclawPath;
    }
    try {
      const settings = await getSettings();
      const p = settings.openclaw_path || "/Users/akashranjan/Desktop/openclaw";
      setOpenclawPath(p);
      return p;
    } catch {
      return "/Users/akashranjan/Desktop/openclaw";
    }
  };

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const path = await resolveOpenclawPath();

      // Load both config sources and merge them:
      // 1. Project-local config ({openclawPath}/openclaw.json) — browser, sandbox, tts
      // 2. Home config (~/.openclaw/openclaw.json) — channels, auth, agents, gateway, plugins
      let localConfig: any = {};
      let homeConfig: any = {};

      try {
        localConfig = await getAgentConfig(path);
      } catch {
        // Local config may not exist yet
      }

      try {
        // getOpenClawConfig reads from ~/.openclaw/openclaw.json
        const { getOpenClawConfig } = await import("../../tauri-api");
        const oc = await getOpenClawConfig();
        if (oc) {
          homeConfig = oc;
        }
      } catch {
        // Home config may not exist
      }

      // Deep merge: homeConfig is the primary source for channels/auth/gateway,
      // localConfig overrides for browser/sandbox/tts
      const merged = { ...homeConfig, ...localConfig };
      // Preserve home config's channels, plugins, auth, gateway, agents sections
      // (local config typically doesn't have these)
      if (homeConfig.channels) {
        merged.channels = homeConfig.channels;
      }
      if (homeConfig.plugins) {
        merged.plugins = homeConfig.plugins;
      }
      if (homeConfig.auth) {
        merged.auth = homeConfig.auth;
      }
      if (homeConfig.gateway) {
        merged.gateway = homeConfig.gateway;
      }
      if (homeConfig.agents) {
        merged.agents = homeConfig.agents;
      }

      setConfig(merged);
    } catch (err: any) {
      console.error("Failed to load config:", err);
      setError("Could not load config. Make sure the OpenClaw path is correct in Settings.");
      setConfig({});
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccessMsg(null);
    setError(null);
    try {
      const path = await resolveOpenclawPath();
      await saveAgentConfig(path, config);
      setSuccessMsg("Configuration saved successfully!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Failed to save:", err);
      setError("Failed to save configuration: " + String(err));
    } finally {
      setSaving(false);
    }
  };

  const updateNestedConfig = (path: string[], value: any) => {
    setConfig((prev: any) => {
      const newConfig = JSON.parse(JSON.stringify(prev || {})); // Deep copy
      let current = newConfig;
      for (let i = 0; i < path.length - 1; i++) {
        if (!current[path[i]]) {
          current[path[i]] = {};
        }
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return newConfig;
    });
  };

  const toggleSection = (path: string[], enabled: boolean, defaultObj: any = {}) => {
    if (enabled) {
      updateNestedConfig(path, defaultObj);
    } else {
      setConfig((prev: any) => {
        const newConfig = JSON.parse(JSON.stringify(prev || {}));
        let current = newConfig;
        for (let i = 0; i < path.length - 1; i++) {
          if (!current[path[i]]) {
            return newConfig;
          }
          current = current[path[i]];
        }
        delete current[path[path.length - 1]];
        return newConfig;
      });
    }
  };

  if (loading || config === null) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 pb-24 bg-background min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-20 py-4 border-b border-border/50 -mx-6 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20">
            <SettingsIcon className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">Configuration</h3>
            <p className="text-xs text-muted-foreground">Manage channels, models, and skills</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadConfig}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/50 disabled:opacity-50 font-medium"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 flex items-center gap-2 text-destructive animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 flex items-center gap-2 text-green-500 animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}

      {/* --- Model Configuration --- */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary" />
          <h4 className="text-lg font-semibold text-foreground">Models & Providers</h4>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
          {/* Primary Model */}
          <div className="max-w-md">
            <Input
              label="Primary Reasoning Model"
              value={config?.models?.primary}
              onChange={(v) => updateNestedConfig(["models", "primary"], v)}
              placeholder="e.g. claude-3-5-sonnet-20240620"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MODEL_PROVIDERS.map((provider) => {
              const providerConfig = config?.models?.providers?.[provider.id];
              const enabled = !!providerConfig;

              return (
                <div
                  key={provider.id}
                  className={`p-4 rounded-xl border transition-all ${providerConfig ? "border-primary/50 bg-primary/5" : "border-border bg-card/50 hover:bg-card"}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium flex items-center gap-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      {provider.name}
                    </div>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateNestedConfig(["models", "providers", provider.id], {
                            baseUrl: provider.url,
                          });
                        } else {
                          toggleSection(["models", "providers", provider.id], false);
                        }
                      }}
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                    />
                  </div>
                  {enabled && (
                    <div className="space-y-3 animate-in fade-in">
                      <Input
                        label="API Key"
                        type="password"
                        value={providerConfig.apiKey}
                        onChange={(v) =>
                          updateNestedConfig(["models", "providers", provider.id, "apiKey"], v)
                        }
                      />
                      <Input
                        label="Base URL"
                        value={providerConfig.baseUrl}
                        onChange={(v) =>
                          updateNestedConfig(["models", "providers", provider.id, "baseUrl"], v)
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* --- Skills Configuration (Universal) --- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Box className="h-5 w-5 text-yellow-500" />
            <h4 className="text-lg font-semibold text-foreground">Skills</h4>
          </div>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search skills..."
              value={skillSearch}
              onChange={(e) => setSkillSearch(e.target.value)}
              className="pl-9 pr-4 py-1.5 rounded-lg border border-border bg-card text-sm focus:ring-1 focus:ring-primary focus:outline-none w-64"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {KNOWN_SKILLS.filter((s) => s.toLowerCase().includes(skillSearch.toLowerCase()))
            .toSorted()
            .map((skillId) => {
              const isEnabled = !!config?.skills?.entries?.[skillId]?.enabled;
              const skillConf = config?.skills?.entries?.[skillId] || {};
              const hasEnv = skillConf.env && Object.keys(skillConf.env).length > 0;

              return (
                <div
                  key={skillId}
                  className={`p-4 rounded-xl border transition-all ${isEnabled ? "border-yellow-500/50 bg-yellow-500/5" : "border-border bg-card/50 hover:bg-card"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{skillId}</span>
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) =>
                        toggleSection(["skills", "entries", skillId], e.target.checked, {
                          enabled: true,
                          env: {},
                        })
                      }
                      className="rounded border-border text-yellow-500 focus:ring-yellow-500 h-4 w-4"
                    />
                  </div>

                  {isEnabled && (
                    <div className="space-y-3 mt-4 pt-3 border-t border-border/50">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground uppercase font-bold tracking-wider">
                          <span>Env Vars</span>
                          <button
                            onClick={() => {
                              // Toggle add mode for this skill
                              setAddingEnvVar((prev) => (prev === skillId ? null : skillId));
                              setNewEnvKey("");
                            }}
                            className="hover:text-foreground transition-colors"
                            title="Add Variable"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Add New Var Input */}
                        {addingEnvVar === skillId && (
                          <div className="flex gap-2 items-center animate-in fade-in slide-in-from-top-1">
                            <input
                              autoFocus
                              type="text"
                              value={newEnvKey}
                              onChange={(e) => setNewEnvKey(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newEnvKey.trim()) {
                                  updateNestedConfig(
                                    ["skills", "entries", skillId, "env", newEnvKey.trim()],
                                    "",
                                  );
                                  setAddingEnvVar(null);
                                  setNewEnvKey("");
                                }
                              }}
                              className="flex-1 min-w-0 bg-muted/50 border border-primary/50 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                              placeholder="KEY_NAME"
                            />
                            <button
                              onClick={() => {
                                if (newEnvKey.trim()) {
                                  updateNestedConfig(
                                    ["skills", "entries", skillId, "env", newEnvKey.trim()],
                                    "",
                                  );
                                  setAddingEnvVar(null);
                                  setNewEnvKey("");
                                }
                              }}
                              className="bg-primary text-primary-foreground p-1 rounded hover:bg-primary/90"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        )}

                        {skillConf.env &&
                          Object.entries(skillConf.env).map(([key, val]: any) => (
                            <div key={key} className="flex gap-2 items-center group">
                              <div className="bg-muted px-2 py-1 rounded text-xs font-mono text-muted-foreground select-none">
                                {key}
                              </div>
                              <input
                                type="password"
                                value={val}
                                onChange={(e) =>
                                  updateNestedConfig(
                                    ["skills", "entries", skillId, "env", key],
                                    e.target.value,
                                  )
                                }
                                className="flex-1 min-w-0 bg-transparent border-b border-border text-xs py-1 focus:outline-none focus:border-yellow-500 transition-colors"
                                placeholder="Value"
                              />
                              <button
                                onClick={() => {
                                  const newEnv = { ...skillConf.env };
                                  delete newEnv[key];
                                  updateNestedConfig(["skills", "entries", skillId, "env"], newEnv);
                                }}
                                className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        {(!skillConf.env || Object.keys(skillConf.env).length === 0) &&
                          !addingEnvVar && (
                            <div className="text-xs text-muted-foreground italic">
                              No environment variables set.
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </section>

      {/* --- Messaging Channels --- */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-500" />
          <h4 className="text-lg font-semibold text-foreground">Messaging Channels</h4>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── Telegram ── */}
          <ChannelCard
            icon={<MessagesSquare className="h-5 w-5 text-blue-400" />}
            title="Telegram"
            enabled={!!config?.channels?.telegram}
            onToggle={(v) =>
              toggleSection(["channels", "telegram"], v, { botToken: "", enabled: true })
            }
            portalUrl="https://t.me/BotFather"
            portalLabel="Open @BotFather"
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Chat with @BotFather → /newbot → copy the token.
              </p>
              <Input
                label="Bot Token"
                value={config?.channels?.telegram?.botToken}
                onChange={(v) => updateNestedConfig(["channels", "telegram", "botToken"], v)}
                placeholder="123456:ABC-DEF1234ghIkl..."
                type="password"
              />
            </div>
          </ChannelCard>

          {/* ── Slack ── */}
          <ChannelCard
            icon={<Hash className="h-5 w-5 text-purple-500" />}
            title="Slack"
            enabled={!!config?.channels?.slack}
            onToggle={(v) =>
              toggleSection(["channels", "slack"], v, { botToken: "", appToken: "", enabled: true })
            }
            portalUrl="https://api.slack.com/apps"
            portalLabel="Open Slack Apps"
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Create a Slack App → enable Socket Mode → copy Bot Token + App Token.
              </p>
              <Input
                label="Bot Token (xoxb-...)"
                value={config?.channels?.slack?.botToken}
                onChange={(v) => updateNestedConfig(["channels", "slack", "botToken"], v)}
                type="password"
              />
              <Input
                label="App Token (xapp-...)"
                value={config?.channels?.slack?.appToken}
                onChange={(v) => updateNestedConfig(["channels", "slack", "appToken"], v)}
                type="password"
              />
              <Input
                label="Signing Secret (HTTP mode only)"
                value={config?.channels?.slack?.signingSecret}
                onChange={(v) => updateNestedConfig(["channels", "slack", "signingSecret"], v)}
                type="password"
                placeholder="Optional for Socket Mode"
              />
            </div>
          </ChannelCard>

          {/* ── Discord ── */}
          <ChannelCard
            icon={<MessageSquare className="h-5 w-5 text-indigo-500" />}
            title="Discord"
            enabled={!!config?.channels?.discord}
            onToggle={(v) =>
              toggleSection(["channels", "discord"], v, { token: "", enabled: true })
            }
            portalUrl="https://discord.com/developers/applications"
            portalLabel="Open Discord Dev Portal"
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                New Application → Bot → Add Bot → Reset Token → copy token. Enable Message Content
                Intent.
              </p>
              <Input
                label="Bot Token"
                value={config?.channels?.discord?.token}
                onChange={(v) => updateNestedConfig(["channels", "discord", "token"], v)}
                type="password"
              />
              <Input
                label="Application ID"
                value={config?.channels?.discord?.applicationId}
                onChange={(v) => updateNestedConfig(["channels", "discord", "applicationId"], v)}
              />
            </div>
          </ChannelCard>

          {/* ── Microsoft Teams ── */}
          <ChannelCard
            icon={<Video className="h-5 w-5 text-blue-600" />}
            title="Microsoft Teams"
            enabled={!!config?.channels?.msteams}
            onToggle={(v) =>
              toggleSection(["channels", "msteams"], v, {
                appId: "",
                appPassword: "",
                tenantId: "",
                enabled: true,
              })
            }
            portalUrl="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
            portalLabel="Open Azure Portal"
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Azure Bot → Configuration → copy App ID, Tenant ID. Certificates & secrets → New
                client secret.
              </p>
              <Input
                label="App ID (Microsoft App ID)"
                value={config?.channels?.msteams?.appId}
                onChange={(v) => updateNestedConfig(["channels", "msteams", "appId"], v)}
              />
              <Input
                label="App Password (Client Secret)"
                value={config?.channels?.msteams?.appPassword}
                onChange={(v) => updateNestedConfig(["channels", "msteams", "appPassword"], v)}
                type="password"
              />
              <Input
                label="Tenant ID (Directory ID)"
                value={config?.channels?.msteams?.tenantId}
                onChange={(v) => updateNestedConfig(["channels", "msteams", "tenantId"], v)}
                placeholder="12345678-abcd-1234-abcd-1234567890ab"
              />
            </div>
          </ChannelCard>

          {/* ── WhatsApp ── */}
          <ChannelCard
            icon={<MessageSquare className="h-5 w-5 text-green-500" />}
            title="WhatsApp"
            enabled={!!config?.channels?.whatsapp}
            onToggle={(v) =>
              toggleSection(["channels", "whatsapp"], v, { selfChatMode: true, enabled: true })
            }
          >
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <p className="text-xs text-green-400">
                  📱 WhatsApp uses QR code authentication. Run{" "}
                  <code className="bg-muted px-1 rounded">openclaw channels login</code> in the
                  terminal to scan the QR code with your phone.
                </p>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm text-foreground">Self Chat Mode</span>
                <input
                  type="checkbox"
                  checked={!!config?.channels?.whatsapp?.selfChatMode}
                  onChange={(e) =>
                    updateNestedConfig(["channels", "whatsapp", "selfChatMode"], e.target.checked)
                  }
                  className="rounded border-border text-primary"
                />
              </div>
              <Input
                label="Auth Directory"
                value={config?.channels?.whatsapp?.authDir}
                onChange={(v) => updateNestedConfig(["channels", "whatsapp", "authDir"], v)}
                placeholder="~/.openclaw/wa-auth"
              />
            </div>
          </ChannelCard>

          {/* ── Signal ── */}
          <ChannelCard
            icon={<Smartphone className="h-5 w-5 text-blue-400" />}
            title="Signal"
            enabled={!!config?.channels?.signal}
            onToggle={(v) =>
              toggleSection(["channels", "signal"], v, { account: "", enabled: true })
            }
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Requires signal-cli. Run{" "}
                <code className="bg-muted px-1 rounded">openclaw onboard</code> to auto-install.
              </p>
              <Input
                label="Phone Number (E.164)"
                value={config?.channels?.signal?.account}
                onChange={(v: string) => updateNestedConfig(["channels", "signal", "account"], v)}
                placeholder="+1234567890"
              />
              <FilePathInput
                label="CLI Path"
                value={config?.channels?.signal?.cliPath}
                onChange={(v: string) => updateNestedConfig(["channels", "signal", "cliPath"], v)}
                placeholder="signal-cli (auto-detected)"
                mode="file"
              />
            </div>
          </ChannelCard>

          {/* ── iMessage ── */}
          <ChannelCard
            icon={<MessageSquare className="h-5 w-5 text-gray-400" />}
            title="iMessage (macOS)"
            enabled={!!config?.channels?.imessage}
            onToggle={(v) => toggleSection(["channels", "imessage"], v, { enabled: true })}
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Requires macOS + Full Disk Access for Messages DB. Uses{" "}
                <code className="bg-muted px-1 rounded">imsg</code> CLI.
              </p>
              <FilePathInput
                label="CLI Path"
                value={config?.channels?.imessage?.cliPath}
                onChange={(v: string) => updateNestedConfig(["channels", "imessage", "cliPath"], v)}
                placeholder="imsg"
                mode="file"
              />
            </div>
          </ChannelCard>

          {/* ── Google Chat ── */}
          <ChannelCard
            icon={<MessageSquare className="h-5 w-5 text-green-600" />}
            title="Google Chat"
            enabled={!!config?.channels?.googlechat}
            onToggle={(v) => toggleSection(["channels", "googlechat"], v, { enabled: true })}
            portalUrl="https://console.cloud.google.com/apis/credentials"
            portalLabel="Open Google Cloud Console"
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Requires a Google Cloud service account JSON file. Set Chat API scopes and configure
                webhook URL.
              </p>
              <FilePathInput
                label="Service Account File"
                value={config?.channels?.googlechat?.serviceAccountFile}
                onChange={(v: string) =>
                  updateNestedConfig(["channels", "googlechat", "serviceAccountFile"], v)
                }
                placeholder="/path/to/service-account.json"
                mode="file"
                filters={[{ name: "JSON", extensions: ["json"] }]}
              />
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Audience Type
                </label>
                <select
                  value={config?.channels?.googlechat?.audienceType || "app-url"}
                  onChange={(e) =>
                    updateNestedConfig(["channels", "googlechat", "audienceType"], e.target.value)
                  }
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="app-url">App URL (recommended)</option>
                  <option value="project-number">Project Number</option>
                </select>
              </div>
              <Input
                label="Audience Value"
                value={config?.channels?.googlechat?.audience}
                onChange={(v) => updateNestedConfig(["channels", "googlechat", "audience"], v)}
                placeholder={
                  config?.channels?.googlechat?.audienceType === "project-number"
                    ? "1234567890"
                    : "https://your.host/googlechat"
                }
              />
            </div>
          </ChannelCard>

          {/* ── Twitch ── */}
          <ChannelCard
            icon={<Gamepad2 className="h-5 w-5 text-purple-400" />}
            title="Twitch"
            enabled={!!config?.channels?.twitch}
            onToggle={(v) => toggleSection(["channels", "twitch"], v, { enabled: true })}
            portalUrl="https://dev.twitch.tv/console"
            portalLabel="Open Twitch Dev Console"
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Create a Twitch application → generate OAuth token at{" "}
                <a
                  href="https://twitchtokengenerator.com/"
                  target="_blank"
                  rel="noopener"
                  className="text-primary hover:underline"
                >
                  twitchtokengenerator.com
                </a>
              </p>
              <Input
                label="OAuth Token (oauth:...)"
                value={config?.channels?.twitch?.accessToken}
                onChange={(v) => updateNestedConfig(["channels", "twitch", "accessToken"], v)}
                type="password"
                placeholder="oauth:abc123..."
              />
              <Input
                label="Client ID"
                value={config?.channels?.twitch?.clientId}
                onChange={(v) => updateNestedConfig(["channels", "twitch", "clientId"], v)}
              />
              <Input
                label="Bot Username"
                value={config?.channels?.twitch?.botUsername}
                onChange={(v) => updateNestedConfig(["channels", "twitch", "botUsername"], v)}
                placeholder="your_bot_name"
              />
              <Input
                label="Channels (comma-separated)"
                value={config?.channels?.twitch?.channels?.join?.(", ")}
                onChange={(v) =>
                  updateNestedConfig(
                    ["channels", "twitch", "channels"],
                    v
                      .split(",")
                      .map((s: string) => s.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="channel1, channel2"
              />
            </div>
          </ChannelCard>

          {/* ── Feishu / Lark ── */}
          <ChannelCard
            icon={<MessagesSquare className="h-5 w-5 text-blue-500" />}
            title="Feishu / Lark"
            enabled={!!config?.channels?.feishu}
            onToggle={(v) => toggleSection(["channels", "feishu"], v, { enabled: true })}
            portalUrl="https://open.feishu.cn"
            portalLabel="Open Feishu Platform"
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Go to Feishu Open Platform → create app → copy App ID + App Secret.
              </p>
              <Input
                label="App ID"
                value={config?.channels?.feishu?.appId}
                onChange={(v) => updateNestedConfig(["channels", "feishu", "appId"], v)}
              />
              <Input
                label="App Secret"
                value={config?.channels?.feishu?.appSecret}
                onChange={(v) => updateNestedConfig(["channels", "feishu", "appSecret"], v)}
                type="password"
              />
            </div>
          </ChannelCard>

          {/* ── Zalo Official Account ── */}
          <ChannelCard
            icon={<MessageSquare className="h-5 w-5 text-blue-600" />}
            title="Zalo OA"
            enabled={!!config?.channels?.zalo}
            onToggle={(v) => toggleSection(["channels", "zalo"], v, { enabled: true })}
            portalUrl="https://bot.zaloplatforms.com"
            portalLabel="Open Zalo Bot Platform"
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Create Zalo OA → get OA ID, Secret Key, and Access Token from the dashboard.
              </p>
              <Input
                label="OA Secret Key"
                value={config?.channels?.zalo?.oaSecretKey}
                onChange={(v) => updateNestedConfig(["channels", "zalo", "oaSecretKey"], v)}
                type="password"
              />
              <Input
                label="Access Token"
                value={config?.channels?.zalo?.accessToken}
                onChange={(v) => updateNestedConfig(["channels", "zalo", "accessToken"], v)}
                type="password"
              />
              <Input
                label="Webhook URL (https://...)"
                value={config?.channels?.zalo?.webhookUrl}
                onChange={(v) => updateNestedConfig(["channels", "zalo", "webhookUrl"], v)}
                placeholder="https://your-server/zalo-webhook"
              />
            </div>
          </ChannelCard>

          {/* ── Zalo Personal ── */}
          <ChannelCard
            icon={<MessageSquare className="h-5 w-5 text-blue-500" />}
            title="Zalo Personal"
            enabled={!!config?.channels?.zalouser}
            onToggle={(v) => toggleSection(["channels", "zalouser"], v, { enabled: true })}
          >
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-xs text-blue-400">
                  📱 Zalo Personal uses QR code login via{" "}
                  <code className="bg-muted px-1 rounded">zca</code> CLI. Run{" "}
                  <code className="bg-muted px-1 rounded">openclaw onboard</code> in the terminal to
                  authenticate.
                </p>
              </div>
              <Input
                label="Profile Name"
                value={config?.channels?.zalouser?.profile}
                onChange={(v) => updateNestedConfig(["channels", "zalouser", "profile"], v)}
                placeholder="default"
              />
            </div>
          </ChannelCard>

          {/* ── Matrix ── */}
          <ChannelCard
            icon={<Shield className="h-5 w-5 text-green-400" />}
            title="Matrix"
            enabled={!!config?.channels?.matrix}
            onToggle={(v) => toggleSection(["channels", "matrix"], v, { enabled: true })}
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Enter your Matrix homeserver URL and authenticate with either an access token or
                password.
              </p>
              <Input
                label="Homeserver URL"
                value={config?.channels?.matrix?.homeserver}
                onChange={(v) => updateNestedConfig(["channels", "matrix", "homeserver"], v)}
                placeholder="https://matrix.org"
              />
              <Input
                label="User ID"
                value={config?.channels?.matrix?.userId}
                onChange={(v) => updateNestedConfig(["channels", "matrix", "userId"], v)}
                placeholder="@bot:matrix.org"
              />
              <Input
                label="Access Token"
                value={config?.channels?.matrix?.accessToken}
                onChange={(v) => updateNestedConfig(["channels", "matrix", "accessToken"], v)}
                type="password"
                placeholder="Use token OR password"
              />
              <Input
                label="Password (alternative)"
                value={config?.channels?.matrix?.password}
                onChange={(v) => updateNestedConfig(["channels", "matrix", "password"], v)}
                type="password"
                placeholder="Alternative to token"
              />
              <Input
                label="Device Name"
                value={config?.channels?.matrix?.deviceName}
                onChange={(v) => updateNestedConfig(["channels", "matrix", "deviceName"], v)}
                placeholder="OpenClaw Gateway"
              />
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm text-foreground">End-to-End Encryption (E2EE)</span>
                <input
                  type="checkbox"
                  checked={!!config?.channels?.matrix?.encryption}
                  onChange={(e) =>
                    updateNestedConfig(["channels", "matrix", "encryption"], e.target.checked)
                  }
                  className="rounded border-border text-primary"
                />
              </div>
            </div>
          </ChannelCard>

          {/* ── Mattermost ── */}
          <ChannelCard
            icon={<MessagesSquare className="h-5 w-5 text-blue-500" />}
            title="Mattermost"
            enabled={!!config?.channels?.mattermost}
            onToggle={(v) => toggleSection(["channels", "mattermost"], v, { enabled: true })}
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Mattermost System Console → Integrations → Bot Accounts → create bot → copy token.
              </p>
              <Input
                label="Bot Token"
                value={config?.channels?.mattermost?.botToken}
                onChange={(v) => updateNestedConfig(["channels", "mattermost", "botToken"], v)}
                type="password"
              />
              <Input
                label="Server Base URL"
                value={config?.channels?.mattermost?.baseUrl}
                onChange={(v) => updateNestedConfig(["channels", "mattermost", "baseUrl"], v)}
                placeholder="https://chat.example.com"
              />
            </div>
          </ChannelCard>

          {/* ── Nextcloud Talk ── */}
          <ChannelCard
            icon={<Cloud className="h-5 w-5 text-blue-400" />}
            title="Nextcloud Talk"
            enabled={!!config?.channels?.["nextcloud-talk"]}
            onToggle={(v) => toggleSection(["channels", "nextcloud-talk"], v, { enabled: true })}
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                SSH into Nextcloud → run{" "}
                <code className="bg-muted px-1 rounded">occ talk:bot:install</code> → copy the
                shared secret.
              </p>
              <Input
                label="Instance URL"
                value={config?.channels?.["nextcloud-talk"]?.baseUrl}
                onChange={(v) => updateNestedConfig(["channels", "nextcloud-talk", "baseUrl"], v)}
                placeholder="https://cloud.example.com"
              />
              <Input
                label="Bot Secret"
                value={config?.channels?.["nextcloud-talk"]?.botSecret}
                onChange={(v) => updateNestedConfig(["channels", "nextcloud-talk", "botSecret"], v)}
                type="password"
              />
            </div>
          </ChannelCard>

          {/* ── BlueBubbles ── */}
          <ChannelCard
            icon={<MessageSquare className="h-5 w-5 text-blue-300" />}
            title="BlueBubbles"
            enabled={!!config?.channels?.bluebubbles}
            onToggle={(v) => toggleSection(["channels", "bluebubbles"], v, { enabled: true })}
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Find server URL and password in the BlueBubbles Server app under Connection /
                Settings.
              </p>
              <Input
                label="Server URL"
                value={config?.channels?.bluebubbles?.serverUrl}
                onChange={(v) => updateNestedConfig(["channels", "bluebubbles", "serverUrl"], v)}
                placeholder="http://192.168.1.100:1234"
              />
              <Input
                label="Password"
                value={config?.channels?.bluebubbles?.password}
                onChange={(v) => updateNestedConfig(["channels", "bluebubbles", "password"], v)}
                type="password"
              />
              <Input
                label="Webhook Path"
                value={config?.channels?.bluebubbles?.webhookPath}
                onChange={(v) => updateNestedConfig(["channels", "bluebubbles", "webhookPath"], v)}
                placeholder="/bluebubbles-webhook"
              />
            </div>
          </ChannelCard>

          {/* ── Tlon (Urbit) ── */}
          <ChannelCard
            icon={<Anchor className="h-5 w-5 text-gray-400" />}
            title="Tlon (Urbit)"
            enabled={!!config?.channels?.tlon}
            onToggle={(v) => toggleSection(["channels", "tlon"], v, { enabled: true })}
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Enter your Urbit ship name, URL, and login code.
              </p>
              <Input
                label="Ship Name"
                value={config?.channels?.tlon?.ship}
                onChange={(v) => updateNestedConfig(["channels", "tlon", "ship"], v)}
                placeholder="~sampel-palnet"
              />
              <Input
                label="Ship URL"
                value={config?.channels?.tlon?.url}
                onChange={(v) => updateNestedConfig(["channels", "tlon", "url"], v)}
                placeholder="https://your-ship-host"
              />
              <Input
                label="Login Code"
                value={config?.channels?.tlon?.code}
                onChange={(v) => updateNestedConfig(["channels", "tlon", "code"], v)}
                type="password"
                placeholder="lidlut-tabwed-pillex-ridrup"
              />
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm text-foreground">Auto-discover Channels</span>
                <input
                  type="checkbox"
                  checked={config?.channels?.tlon?.autoDiscoverChannels !== false}
                  onChange={(e) =>
                    updateNestedConfig(
                      ["channels", "tlon", "autoDiscoverChannels"],
                      e.target.checked,
                    )
                  }
                  className="rounded border-border text-primary"
                />
              </div>
            </div>
          </ChannelCard>
        </div>
      </section>

      {/* --- Capabilities --- */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Box className="h-5 w-5 text-orange-500" />
          <h4 className="text-lg font-semibold text-foreground">Core Capabilities</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Browser */}
          <ChannelCard
            icon={<Globe className="h-5 w-5 text-orange-400" />}
            title="Web Browser"
            enabled={!!config?.browser?.enabled}
            onToggle={(v) => updateNestedConfig(["browser", "enabled"], v)}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm text-foreground">Headless Mode</span>
                <input
                  type="checkbox"
                  checked={!!config?.browser?.headless}
                  onChange={(e) => updateNestedConfig(["browser", "headless"], e.target.checked)}
                  className="rounded border-border text-primary"
                />
              </div>
              <FilePathInput
                label="Executable Path"
                value={config?.browser?.executablePath}
                onChange={(v: string) => updateNestedConfig(["browser", "executablePath"], v)}
                placeholder="/usr/bin/google-chrome"
                mode="file"
              />
            </div>
          </ChannelCard>

          {/* TTS */}
          <ChannelCard
            icon={<Mic className="h-5 w-5 text-pink-500" />}
            title="Text-to-Speech"
            enabled={!!config?.tts?.enabled}
            onToggle={(v) => updateNestedConfig(["tts", "enabled"], v)}
          >
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Provider
                </label>
                <select
                  value={config?.tts?.provider || "elevenlabs"}
                  onChange={(e) => updateNestedConfig(["tts", "provider"], e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="openai">OpenAI</option>
                  <option value="edge">Edge (Free)</option>
                </select>
              </div>
              {config?.tts?.provider === "elevenlabs" && (
                <>
                  <Input
                    label="API Key"
                    value={config?.tts?.elevenlabs?.apiKey}
                    onChange={(v) => updateNestedConfig(["tts", "elevenlabs", "apiKey"], v)}
                    type="password"
                  />
                  <Input
                    label="Voice ID"
                    value={config?.tts?.elevenlabs?.voiceId}
                    onChange={(v) => updateNestedConfig(["tts", "elevenlabs", "voiceId"], v)}
                  />
                </>
              )}
            </div>
          </ChannelCard>

          {/* Sandbox */}
          <div className="p-4 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                <Terminal className="h-5 w-5 text-gray-500" />
              </div>
              <span className="font-medium">Sandbox</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Mode</span>
              <select
                value={config?.sandbox?.mode || "auto"}
                onChange={(e) => updateNestedConfig(["sandbox", "mode"], e.target.value)}
                className="rounded-lg border border-border bg-muted px-2 py-1 text-sm text-foreground focus:outline-none"
              >
                <option value="auto">Auto</option>
                <option value="docker">Docker</option>
                <option value="local">Local</option>
              </select>
            </div>
          </div>

          {/* Agent-to-Agent Messaging */}
          <ChannelCard
            icon={<Bot className="h-5 w-5 text-emerald-500" />}
            title="Agent-to-Agent Messaging"
            enabled={!!config?.tools?.agentToAgent?.enabled}
            onToggle={(v: boolean) => updateNestedConfig(["tools", "agentToAgent", "enabled"], v)}
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Allow this agent to send messages to other agents. Agents can collaborate on tasks
                automatically.
              </p>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Allow Agents
                </label>
                <input
                  type="text"
                  value={config?.tools?.agentToAgent?.allow?.join(", ") || "*"}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateNestedConfig(
                      ["tools", "agentToAgent", "allow"],
                      e.target.value
                        .split(",")
                        .map((s: string) => s.trim())
                        .filter(Boolean),
                    )
                  }
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                  placeholder="* (all agents)"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Max Ping-Pong Turns (0–5)
                </label>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={config?.session?.agentToAgent?.maxPingPongTurns ?? 5}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateNestedConfig(
                      ["session", "agentToAgent", "maxPingPongTurns"],
                      Number(e.target.value),
                    )
                  }
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </ChannelCard>
        </div>
      </section>
    </div>
  );
}

// --- Helper Components ---

function ChannelCard({ icon, title, enabled, onToggle, children, portalUrl, portalLabel }: any) {
  const handleOpenPortal = async (url: string) => {
    try {
      if (isTauri()) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
      } else {
        window.open(url, "_blank");
      }
    } catch (err) {
      console.error("Failed to open URL:", err);
      window.open(url, "_blank");
    }
  };

  return (
    <div
      className={`p-4 rounded-xl border transition-all duration-200 ${enabled ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-muted/50"}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${enabled ? "bg-background" : "bg-muted"}`}>{icon}</div>
          <span
            className={`font-semibold ${enabled ? "text-foreground" : "text-muted-foreground"}`}
          >
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {portalUrl && enabled && (
            <button
              onClick={() => handleOpenPortal(portalUrl)}
              className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={portalLabel || "Open Developer Portal"}
            >
              <ExternalLink className="h-3 w-3" />
              <span className="hidden sm:inline">{portalLabel || "Open Portal"}</span>
            </button>
          )}
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-5 w-5 rounded border-border text-primary focus:ring-primary cursor-pointer"
          />
        </div>
      </div>
      {enabled && (
        <div className="mt-4 pt-3 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text" }: any) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground/50"
      />
    </div>
  );
}

function FilePathInput({ label, value, onChange, placeholder, mode = "file", filters }: any) {
  const handleBrowse = async () => {
    try {
      if (isTauri()) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        if (mode === "folder") {
          const selected = await open({
            directory: true,
            multiple: false,
            title: `Select ${label}`,
          });
          if (selected) {
            onChange(selected);
          }
        } else {
          const selected = await open({
            directory: false,
            multiple: false,
            title: `Select ${label}`,
            filters: filters || undefined,
          });
          if (selected) {
            onChange(selected);
          }
        }
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  };

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground/50"
        />
        <button
          onClick={handleBrowse}
          className="px-3 py-2 rounded-lg border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-sm"
          title="Browse..."
        >
          📂
        </button>
      </div>
    </div>
  );
}
