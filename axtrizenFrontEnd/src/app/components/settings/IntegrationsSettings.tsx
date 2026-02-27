import { Loader2, MessageSquare, CheckCircle2, XCircle, Send } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import {
  slackConfigure,
  slackStatus,
  slackSend,
  discordConfigure,
  discordStatus,
  discordSend,
  type SlackConfig,
  type DiscordConfig,
  type IntegrationMessage,
} from "../../tauri-api";

interface PlatformState {
  connected: boolean;
  webhookUrl: string;
  botToken: string;
  defaultChannel: string;
  testing: boolean;
  saving: boolean;
  testResult: "success" | "error" | null;
  testMessage: string;
}

const DEFAULT_STATE: PlatformState = {
  connected: false,
  webhookUrl: "",
  botToken: "",
  defaultChannel: "",
  testing: false,
  saving: false,
  testResult: null,
  testMessage: "",
};

export function IntegrationsSettings() {
  const [slack, setSlack] = useState<PlatformState>({
    ...DEFAULT_STATE,
    defaultChannel: "#general",
  });
  const [discord, setDiscord] = useState<PlatformState>({
    ...DEFAULT_STATE,
    defaultChannel: "general",
  });
  const [loading, setLoading] = useState(true);

  // Load current status on mount
  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [slackSt, discordSt] = await Promise.allSettled([slackStatus(), discordStatus()]);
      if (slackSt.status === "fulfilled") {
        setSlack((prev) => ({ ...prev, connected: slackSt.value.connected }));
      }
      if (discordSt.status === "fulfilled") {
        setDiscord((prev) => ({ ...prev, connected: discordSt.value.connected }));
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Slack handlers
  const handleSlackSave = async () => {
    if (!slack.webhookUrl.trim()) return;
    setSlack((prev) => ({ ...prev, saving: true }));
    try {
      const config: SlackConfig = {
        botToken: slack.botToken,
        webhookUrl: slack.webhookUrl,
        defaultChannel: slack.defaultChannel || "#general",
      };
      await slackConfigure(config);
      setSlack((prev) => ({ ...prev, saving: false, connected: true }));
    } catch (err) {
      setSlack((prev) => ({
        ...prev,
        saving: false,
        testResult: "error",
        testMessage: String(err),
      }));
    }
  };

  const handleSlackTest = async () => {
    setSlack((prev) => ({ ...prev, testing: true, testResult: null }));
    try {
      const msg: IntegrationMessage = {
        channel: slack.defaultChannel || "#general",
        text: "🧪 Test message from Axtrizen AI! If you see this, your Slack integration is working.",
      };
      await slackSend(msg);
      setSlack((prev) => ({
        ...prev,
        testing: false,
        testResult: "success",
        testMessage: "Message sent! Check your Slack channel.",
      }));
    } catch (err) {
      setSlack((prev) => ({
        ...prev,
        testing: false,
        testResult: "error",
        testMessage: String(err),
      }));
    }
  };

  // Discord handlers
  const handleDiscordSave = async () => {
    if (!discord.webhookUrl.trim()) return;
    setDiscord((prev) => ({ ...prev, saving: true }));
    try {
      const config: DiscordConfig = {
        botToken: discord.botToken,
        webhookUrl: discord.webhookUrl,
        defaultChannel: discord.defaultChannel || "general",
      };
      await discordConfigure(config);
      setDiscord((prev) => ({ ...prev, saving: false, connected: true }));
    } catch (err) {
      setDiscord((prev) => ({
        ...prev,
        saving: false,
        testResult: "error",
        testMessage: String(err),
      }));
    }
  };

  const handleDiscordTest = async () => {
    setDiscord((prev) => ({ ...prev, testing: true, testResult: null }));
    try {
      const msg: IntegrationMessage = {
        channel: discord.defaultChannel || "general",
        text: "🧪 Test message from Axtrizen AI! If you see this, your Discord integration is working.",
      };
      await discordSend(msg);
      setDiscord((prev) => ({
        ...prev,
        testing: false,
        testResult: "success",
        testMessage: "Message sent! Check your Discord channel.",
      }));
    } catch (err) {
      setDiscord((prev) => ({
        ...prev,
        testing: false,
        testResult: "error",
        testMessage: String(err),
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Slack */}
      <PlatformCard
        name="Slack"
        icon="💬"
        state={slack}
        onWebhookChange={(v) => setSlack((prev) => ({ ...prev, webhookUrl: v }))}
        onTokenChange={(v) => setSlack((prev) => ({ ...prev, botToken: v }))}
        onChannelChange={(v) => setSlack((prev) => ({ ...prev, defaultChannel: v }))}
        onSave={handleSlackSave}
        onTest={handleSlackTest}
        channelPlaceholder="#general"
      />

      {/* Discord */}
      <PlatformCard
        name="Discord"
        icon="🎮"
        state={discord}
        onWebhookChange={(v) => setDiscord((prev) => ({ ...prev, webhookUrl: v }))}
        onTokenChange={(v) => setDiscord((prev) => ({ ...prev, botToken: v }))}
        onChannelChange={(v) => setDiscord((prev) => ({ ...prev, defaultChannel: v }))}
        onSave={handleDiscordSave}
        onTest={handleDiscordTest}
        channelPlaceholder="general"
      />
    </div>
  );
}

// ── Reusable Platform Card ─────────────────────────────────────────

function PlatformCard({
  name,
  icon,
  state,
  onWebhookChange,
  onTokenChange,
  onChannelChange,
  onSave,
  onTest,
  channelPlaceholder,
}: {
  name: string;
  icon: string;
  state: PlatformState;
  onWebhookChange: (v: string) => void;
  onTokenChange: (v: string) => void;
  onChannelChange: (v: string) => void;
  onSave: () => void;
  onTest: () => void;
  channelPlaceholder: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-xl p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <h4 className="text-foreground font-medium">{name}</h4>
            <p className="text-xs text-muted-foreground">
              Send agent updates to your {name} workspace
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {state.connected ? (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <XCircle className="h-3 w-3" /> Not configured
            </span>
          )}
        </div>
      </div>

      {/* Webhook URL */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Webhook URL</label>
        <input
          type="url"
          value={state.webhookUrl}
          onChange={(e) => onWebhookChange(e.target.value)}
          placeholder={`https://hooks.${name.toLowerCase()}.com/services/...`}
          className="w-full rounded-xl border border-border bg-muted py-2.5 px-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Bot Token (optional) */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Bot Token{" "}
          <span className="text-muted-foreground/50">(optional — for @mention support)</span>
        </label>
        <input
          type="password"
          value={state.botToken}
          onChange={(e) => onTokenChange(e.target.value)}
          placeholder="xoxb-... or Bot token"
          className="w-full rounded-xl border border-border bg-muted py-2.5 px-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Default Channel */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Default Channel</label>
        <input
          type="text"
          value={state.defaultChannel}
          onChange={(e) => onChannelChange(e.target.value)}
          placeholder={channelPlaceholder}
          className="w-full rounded-xl border border-border bg-muted py-2.5 px-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onSave}
          disabled={!state.webhookUrl.trim() || state.saving}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {state.saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageSquare className="h-4 w-4" />
          )}
          {state.saving ? "Saving..." : "Save"}
        </button>

        <button
          onClick={onTest}
          disabled={!state.connected || state.testing}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          {state.testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {state.testing ? "Testing..." : "Test Connection"}
        </button>
      </div>

      {/* Test Result */}
      {state.testResult && (
        <div
          className={`rounded-xl p-3 text-sm ${
            state.testResult === "success"
              ? "bg-green-500/10 border border-green-500/20 text-green-400"
              : "bg-destructive/10 border border-destructive/20 text-destructive"
          }`}
        >
          {state.testResult === "success" ? "✅" : "❌"} {state.testMessage}
        </div>
      )}
    </div>
  );
}
