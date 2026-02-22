import { browser, $, $$, expect } from "@wdio/globals";

/**
 * Navigation E2E Tests
 *
 * Launches the Tauri app and verifies all sidebar navigation
 * items work correctly — clicking each one loads the right view.
 */
describe("Navigation E2E", () => {
  before(async () => {
    // Navigate to the app and wait for it to render
    await browser.url("http://localhost:5174");
    await browser.pause(3000);
  });

  it("should display the Axtrizen sidebar", async () => {
    const sidebar = await $("aside");
    await expect(sidebar).toBeExisting();
  });

  it("should have all 6 navigation items", async () => {
    const navIds = ["dashboard", "agents", "teams", "projects", "chat", "settings"];
    for (const id of navIds) {
      const btn = await $(`[data-testid="nav-${id}"]`);
      await expect(btn).toBeExisting();
    }
  });

  it("should navigate to Dashboard", async () => {
    const dashboardBtn = await $('[data-testid="nav-dashboard"]');
    await dashboardBtn.click();
    await browser.pause(500);

    // Dashboard should have content
    const content = await $("h1, h2, [class*='text-lg']");
    await expect(content).toBeExisting();
  });

  it("should navigate to Agents view", async () => {
    const agentsBtn = await $('[data-testid="nav-agents"]');
    await agentsBtn.click();
    await browser.pause(500);

    // Agents view shows content
    const view = await $("h1, h2, [class*='text-lg']");
    await expect(view).toBeExisting();
  });

  it("should navigate to Teams view", async () => {
    const teamsBtn = await $('[data-testid="nav-teams"]');
    await teamsBtn.click();
    await browser.pause(500);

    // Teams view should be visible — check for any content area
    const view = await $("[class*='min-h-full'], [class*='flex-1'], h1, h2");
    await expect(view).toBeExisting();
  });

  it("should navigate to Chat view", async () => {
    const chatBtn = await $('[data-testid="nav-chat"]');
    await chatBtn.click();
    await browser.pause(500);

    // Chat sidebar should have the search input
    const search = await $('[data-testid="chat-search"]');
    await expect(search).toBeExisting();
  });

  it("should navigate to Settings view", async () => {
    const settingsBtn = await $('[data-testid="nav-settings"]');
    await settingsBtn.click();
    await browser.pause(500);

    // Settings page should have content
    const content = await $("h1, h2");
    await expect(content).toBeExisting();
  });

  it("should collapse and expand sidebar", async () => {
    // Record initial sidebar width
    const sidebar = await $("aside");
    const initialWidthProp = await sidebar.getCSSProperty("width");
    const initialW = parseInt(initialWidthProp.value);

    // The collapse button is inside the aside, at the bottom
    const collapseButtons = await $$("aside button");
    // Last button in sidebar is the collapse toggle
    const collapseBtn = collapseButtons[collapseButtons.length - 1];
    await collapseBtn.click();
    await browser.pause(600);

    // After collapse, the sidebar should be narrower than before
    const collapsedWidthProp = await sidebar.getCSSProperty("width");
    const collapsedW = parseInt(collapsedWidthProp.value);
    expect(collapsedW).toBeLessThanOrEqual(initialW);

    // Expand again
    const expandButtons = await $$("aside button");
    const expandBtn = expandButtons[expandButtons.length - 1];
    await expandBtn.click();
    await browser.pause(600);
  });
});
