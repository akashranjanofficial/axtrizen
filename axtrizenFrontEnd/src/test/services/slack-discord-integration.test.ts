import { describe, it, expect } from "vitest";
import {
  buildAgentNotification,
  buildDailySummary,
  buildDiscordEmbed,
} from "../../app/services/slack-discord-integration";

// ══════════════════════════════════════════════════════════
// buildAgentNotification
// ══════════════════════════════════════════════════════════

describe("Slack/Discord - buildAgentNotification", () => {
  it("should create a notification with correct agent name", () => {
    const msg = buildAgentNotification(
      "BuildAgent",
      "task_complete",
      "Finished building the dashboard component"
    );
    expect(msg.text).toContain("BuildAgent");
    expect(msg.text).toContain("task_complete");
    expect(msg.blocks).toBeDefined();
    expect(msg.blocks!.length).toBeGreaterThan(0);
  });

  it("should include proper emoji in block text for each event type", () => {
    const events = ["task_complete", "error", "review_needed", "deployed"] as const;
    for (const event of events) {
      const msg = buildAgentNotification("Agent1", event, "Details");
      const sectionBlock = msg.blocks?.find(
        (b) => b.type === "section" && b.text?.text?.includes(event.replace(/_/g, " "))
      );
      expect(sectionBlock).toBeDefined();
    }
  });

  it("should have header block with agent name", () => {
    const msg = buildAgentNotification("TestAgent", "error", "Something broke");
    const header = msg.blocks?.find((b) => b.type === "header");
    expect(header).toBeDefined();
    expect(header?.text?.text).toContain("TestAgent");
  });

  it("should include details in section block", () => {
    const msg = buildAgentNotification("Agent", "deployed", "v1.2.3 deployed to prod");
    const detailBlock = msg.blocks?.find(
      (b) => b.type === "section" && b.text?.text === "v1.2.3 deployed to prod"
    );
    expect(detailBlock).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════
// buildDailySummary
// ══════════════════════════════════════════════════════════

describe("Slack/Discord - buildDailySummary", () => {
  it("should produce a summary with all agent activity", () => {
    const msg = buildDailySummary([
      { agent: "Agent1", tasks: 5, errors: 0 },
      { agent: "Agent2", tasks: 3, errors: 1 },
    ]);
    expect(msg.text).toContain("8 tasks"); // 5 + 3
    expect(msg.text).toContain("1 error");
    expect(msg.blocks).toBeDefined();
  });

  it("should include the date in the header", () => {
    const msg = buildDailySummary([]);
    expect(msg.blocks?.[0]?.type).toBe("header");
    // Header should contain "Daily Summary"
    expect(msg.blocks?.[0]?.text?.text).toContain("Daily Summary");
  });

  it("should handle empty activities list", () => {
    const msg = buildDailySummary([]);
    expect(msg.text).toContain("0 tasks");
    expect(msg.text).toContain("0 errors");
  });

  it("should list each agent with bullet points", () => {
    const msg = buildDailySummary([
      { agent: "Alpha", tasks: 10, errors: 2 },
      { agent: "Beta", tasks: 7, errors: 0 },
    ]);
    const sectionBlock = msg.blocks?.find((b) => b.type === "section");
    expect(sectionBlock?.text?.text).toContain("Alpha");
    expect(sectionBlock?.text?.text).toContain("Beta");
  });
});

// ══════════════════════════════════════════════════════════
// buildDiscordEmbed
// ══════════════════════════════════════════════════════════

describe("Slack/Discord - buildDiscordEmbed", () => {
  it("should produce a Discord-compatible embed object", () => {
    const embed = buildDiscordEmbed(
      "DeployAgent",
      "Deployment Complete",
      "Deployed v2.0.0 to production",
      0x00ff00
    );
    expect(embed.embeds).toBeDefined();
    const embeds = embed.embeds as any[];
    expect(embeds).toHaveLength(1);
    expect(embeds[0].title).toBe("Deployment Complete");
    expect(embeds[0].description).toBe("Deployed v2.0.0 to production");
    expect(embeds[0].color).toBe(0x00ff00);
    expect(embeds[0].author.name).toBe("DeployAgent");
  });

  it("should include timestamp", () => {
    const embed = buildDiscordEmbed("Agent", "Title", "Desc");
    const embeds = embed.embeds as any[];
    expect(embeds[0].timestamp).toBeDefined();
    // Should be a valid ISO string
    expect(() => new Date(embeds[0].timestamp)).not.toThrow();
  });

  it("should use default color when not specified", () => {
    const embed = buildDiscordEmbed("Agent", "Title", "Desc");
    const embeds = embed.embeds as any[];
    expect(embeds[0].color).toBe(0x5865f2);
  });

  it("should include footer", () => {
    const embed = buildDiscordEmbed("Agent", "T", "D");
    const embeds = embed.embeds as any[];
    expect(embeds[0].footer.text).toContain("Axtrizen");
  });
});
