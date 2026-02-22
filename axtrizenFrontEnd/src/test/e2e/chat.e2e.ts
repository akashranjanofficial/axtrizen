import { browser, $, $$, expect } from "@wdio/globals";

/**
 * Chat E2E Tests
 *
 * Navigates to the Chat view and tests search, agent/team
 * selection, and message input.
 */
describe("Chat E2E", () => {
  before(async () => {
    // Navigate to the app and go to Chat view
    await browser.url("http://localhost:5174");
    await browser.pause(2000);
    const chatBtn = await $('[data-testid="nav-chat"]');
    await chatBtn.click();
    await browser.pause(1000);
  });

  it("should display the chat search input", async () => {
    const search = await $('[data-testid="chat-search"]');
    await expect(search).toBeExisting();
  });

  it("should have a message input field", async () => {
    const input = await $('[data-testid="chat-input"]');
    await expect(input).toBeExisting();
  });

  it("should have a send button", async () => {
    const sendBtn = await $('[data-testid="chat-send"]');
    await expect(sendBtn).toBeExisting();
  });

  it("should type in the search field", async () => {
    const search = await $('[data-testid="chat-search"]');
    await search.click();
    await browser.pause(200);
    await search.setValue("test search");
    await browser.pause(500);

    const value = await search.getValue();
    expect(value).toBe("test search");

    // Clear search by selecting all and deleting
    await search.click();
    await browser.keys(["Meta", "a"]);
    await browser.keys(["Backspace"]);
    await browser.pause(300);
  });

  it("should select first agent chat if available", async () => {
    const agentItems = await $$('[data-testid^="chat-agent-"]');
    if (agentItems.length > 0) {
      await agentItems[0].click();
      await browser.pause(1000);

      // The chat header area should update
      const header = await $("h2, [class*='font-semibold']");
      await expect(header).toBeExisting();
    }
  });

  it("should select team chat if available", async () => {
    const teamItems = await $$('[data-testid^="chat-team-"]');
    if (teamItems.length > 0) {
      await teamItems[0].click();
      await browser.pause(1000);

      // Team header should show
      const header = await $("h2, [class*='font-semibold']");
      await expect(header).toBeExisting();
    }
  });

  it("should type a message in the input field", async () => {
    const input = await $('[data-testid="chat-input"]');
    const isEnabled = await input.isEnabled();

    if (!isEnabled) {
      // Input is disabled when not connected to Gateway — that's expected
      console.log("Chat input disabled (no gateway) — skipping type test");
      return;
    }

    await input.click();
    await browser.pause(200);
    await input.addValue("Hello from E2E test");
    await browser.pause(300);

    const value = await input.getValue();
    expect(value).toContain("Hello from E2E test");

    // Clear the input
    await input.click();
    await browser.keys(["Meta", "a"]);
    await browser.keys(["Backspace"]);
    await browser.pause(300);
  });
});
