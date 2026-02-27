/**
 * Slack / Discord Integration Service
 * Sprint 6, Epic 7 — Team communication bridge for agents
 *
 * Allows agents to send notifications, respond to mentions,
 * and forward chat summaries to external messaging platforms.
 */

import { invoke } from "@tauri-apps/api/core";

// ── Types ──────────────────────────────────────────────────

export interface SlackConfig {
  webhookUrl: string;
  botToken?: string;
  defaultChannel?: string;
}

export interface DiscordConfig {
  webhookUrl: string;
  botToken?: string;
  defaultChannel?: string;
}

export interface IntegrationMessage {
  channel: string;
  text: string;
  blocks?: MessageBlock[];
  threadTs?: string;
}

export interface MessageBlock {
  type: "section" | "header" | "divider" | "context" | "actions";
  text?: { type: "mrkdwn" | "plain_text"; text: string };
  elements?: unknown[];
}

export interface IntegrationStatus {
  connected: boolean;
  platform: "slack" | "discord";
  lastPing?: string;
  error?: string;
}

export interface MentionEvent {
  platform: "slack" | "discord";
  channel: string;
  user: string;
  text: string;
  timestamp: string;
  threadTs?: string;
}

// ── Formatting Helpers ─────────────────────────────────────

/**
 * Build a Slack-style markdown notification for an agent event.
 */
export function buildAgentNotification(
  agentName: string,
  event: "task_complete" | "error" | "review_needed" | "deployed",
  details: string
): IntegrationMessage {
  const emoji: Record<string, string> = {
    task_complete: ":white_check_mark:",
    error: ":x:",
    review_needed: ":eyes:",
    deployed: ":rocket:",
  };

  const color: Record<string, string> = {
    task_complete: "#36a64f",
    error: "#ff0000",
    review_needed: "#ffaa00",
    deployed: "#0066ff",
  };

  const title = `${emoji[event] || ":robot_face:"} Agent *${agentName}* — ${event.replace(/_/g, " ")}`;

  return {
    channel: "",
    text: `${agentName}: ${event} — ${details}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `Agent: ${agentName}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: title },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: details },
      },
    ],
  };
}

/**
 * Build a daily summary message for a list of agent activities.
 */
export function buildDailySummary(
  activities: { agent: string; tasks: number; errors: number }[]
): IntegrationMessage {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const totalTasks = activities.reduce((s, a) => s + a.tasks, 0);
  const totalErrors = activities.reduce((s, a) => s + a.errors, 0);

  const rows = activities
    .map(
      (a) =>
        `• *${a.agent}*: ${a.tasks} tasks, ${a.errors} errors`
    )
    .join("\n");

  return {
    channel: "",
    text: `Daily Summary — ${date}: ${totalTasks} tasks, ${totalErrors} errors`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `:bar_chart: Daily Summary — ${date}` },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Total:* ${totalTasks} tasks completed, ${totalErrors} errors\n\n${rows}`,
        },
      },
    ],
  };
}

/**
 * Format a Discord embed-style message from an agent event.
 */
export function buildDiscordEmbed(
  agentName: string,
  title: string,
  description: string,
  color: number = 0x5865f2
): Record<string, unknown> {
  return {
    embeds: [
      {
        title,
        description,
        color,
        author: { name: agentName },
        timestamp: new Date().toISOString(),
        footer: { text: "Axtrizen AI Agent Platform" },
      },
    ],
  };
}

// ── Platform Service ───────────────────────────────────────

export class IntegrationService {
  private slackConfig: SlackConfig | null = null;
  private discordConfig: DiscordConfig | null = null;

  // ── Slack ──

  async configureSlack(config: SlackConfig): Promise<void> {
    await invoke<void>("slack_configure", { config });
    this.slackConfig = config;
  }

  async sendSlack(message: IntegrationMessage): Promise<void> {
    const channel =
      message.channel || this.slackConfig?.defaultChannel || "#general";
    await invoke<void>("slack_send", {
      channel,
      text: message.text,
      blocks: message.blocks ? JSON.stringify(message.blocks) : undefined,
      threadTs: message.threadTs,
    });
  }

  async slackStatus(): Promise<IntegrationStatus> {
    return invoke<IntegrationStatus>("slack_status");
  }

  // ── Discord ──

  async configureDiscord(config: DiscordConfig): Promise<void> {
    await invoke<void>("discord_configure", { config });
    this.discordConfig = config;
  }

  async sendDiscord(message: IntegrationMessage): Promise<void> {
    const channel =
      message.channel || this.discordConfig?.defaultChannel || "general";
    await invoke<void>("discord_send", {
      channel,
      text: message.text,
      blocks: message.blocks ? JSON.stringify(message.blocks) : undefined,
    });
  }

  async discordStatus(): Promise<IntegrationStatus> {
    return invoke<IntegrationStatus>("discord_status");
  }

  // ── Mentions handler ──

  async handleMention(event: MentionEvent): Promise<string> {
    return invoke<string>("integration_handle_mention", {
      platform: event.platform,
      channel: event.channel,
      user: event.user,
      text: event.text,
      timestamp: event.timestamp,
      threadTs: event.threadTs,
    });
  }

  // ── Convenience ──

  /**
   * Send to whichever platform is configured (prefers Slack).
   */
  async notify(message: IntegrationMessage): Promise<void> {
    if (this.slackConfig) {
      await this.sendSlack(message);
    } else if (this.discordConfig) {
      await this.sendDiscord(message);
    }
  }
}

/** Singleton integration service */
export const integrations = new IntegrationService();
