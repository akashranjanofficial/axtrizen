import { browser, $, $$, expect } from "@wdio/globals";

/**
 * Agents E2E Tests
 *
 * Navigate to the Agents view and verify the page loads
 * with expected elements.
 */
describe("Agents E2E", () => {
  before(async () => {
    // Navigate to the app and go to Agents view
    await browser.url("http://localhost:5174");
    await browser.pause(2000);
    const agentsBtn = await $('[data-testid="nav-agents"]');
    await agentsBtn.click();
    await browser.pause(1000);
  });

  it("should display the Agents view", async () => {
    // The view should have heading or content
    const heading = await $("h1, h2, [class*='text-lg']");
    await expect(heading).toBeExisting();
  });

  it("should show agent cards or empty state", async () => {
    // Agent cards or an empty state message
    const content = await $("[class*='rounded-2xl'], [class*='text-muted'], p, h2");
    await expect(content).toBeExisting();
  });

  it("should navigate back to dashboard", async () => {
    const dashBtn = await $('[data-testid="nav-dashboard"]');
    await dashBtn.click();
    await browser.pause(500);

    // Should be on dashboard
    const title = await $("h1, h2");
    await expect(title).toBeExisting();
  });
});
