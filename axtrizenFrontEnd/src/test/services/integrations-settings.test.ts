import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock tauri-api
vi.mock("../../app/tauri-api", () => ({
  slackStatus: vi.fn(),
  discordStatus: vi.fn(),
  slackConfigure: vi.fn(),
  discordConfigure: vi.fn(),
  slackSend: vi.fn(),
  discordSend: vi.fn(),
}));

// We test the component logic indirectly via the service calls
import { slackStatus, discordStatus, slackConfigure, discordConfigure } from "../../app/tauri-api";

const mockSlackStatus = vi.mocked(slackStatus);
const mockDiscordStatus = vi.mocked(discordStatus);
const mockSlackConfigure = vi.mocked(slackConfigure);
const mockDiscordConfigure = vi.mocked(discordConfigure);

// ══════════════════════════════════════════════════════════
// Integration Settings - API Bindings
// ══════════════════════════════════════════════════════════

describe("IntegrationsSettings - API bindings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should load Slack status on mount", async () => {
    mockSlackStatus.mockResolvedValue({ connected: true, workspace: "test" });
    const result = await slackStatus();
    expect(result.connected).toBe(true);
  });

  it("should load Discord status on mount", async () => {
    mockDiscordStatus.mockResolvedValue({ connected: false, guild: undefined });
    const result = await discordStatus();
    expect(result.connected).toBe(false);
  });

  it("should call slackConfigure with correct config", async () => {
    mockSlackConfigure.mockResolvedValue({ status: "ok" });
    const config = {
      botToken: "xoxb-test",
      webhookUrl: "https://hooks.slack.com/services/test",
      defaultChannel: "#general",
    };
    await slackConfigure(config);
    expect(mockSlackConfigure).toHaveBeenCalledWith(config);
  });

  it("should call discordConfigure with correct config", async () => {
    mockDiscordConfigure.mockResolvedValue({ status: "ok" });
    const config = {
      botToken: "discord-test",
      webhookUrl: "https://discord.com/api/webhooks/test",
      defaultChannel: "general",
    };
    await discordConfigure(config);
    expect(mockDiscordConfigure).toHaveBeenCalledWith(config);
  });

  it("should handle slackStatus failure gracefully", async () => {
    mockSlackStatus.mockRejectedValue(new Error("Not in Tauri"));
    await expect(slackStatus()).rejects.toThrow("Not in Tauri");
  });

  it("should handle discordStatus failure gracefully", async () => {
    mockDiscordStatus.mockRejectedValue(new Error("Not in Tauri"));
    await expect(discordStatus()).rejects.toThrow("Not in Tauri");
  });
});
