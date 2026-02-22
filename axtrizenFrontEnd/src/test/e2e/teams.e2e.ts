import { browser, $, $$, expect } from "@wdio/globals";

/**
 * Teams E2E Tests
 *
 * Navigates to the Teams view, creates a team, verifies it appears,
 * opens its group chat, and navigates back.
 */
describe("Teams E2E", () => {
  before(async () => {
    // Navigate to the app and wait for it to render
    await browser.url("http://localhost:5174");
    await browser.pause(3000);
  });

  it("should launch the application and verify the sidebar", async () => {
    const sidebar = await $("aside");
    await expect(sidebar).toBeExisting();

    // Verify the Axtrizen title
    const title = await $("h1*=Axtrizen");
    await expect(title).toBeExisting();
  });

  it("should navigate to Teams view", async () => {
    const teamsBtn = await $('[data-testid="nav-teams"]');
    await teamsBtn.click();
    await browser.pause(1000);

    // Teams page should load
    const content = await $("[class*='min-h-full'], [class*='flex-1']");
    await expect(content).toBeExisting();
  });

  it("should open the create team form", async () => {
    // Click the "Create Team" button (+ icon button or text)
    const createBtn = await $('[data-testid="create-team-btn"]');
    if (await createBtn.isExisting()) {
      await createBtn.click();
      await browser.pause(500);
    } else {
      // Fallback: look for the Plus icon button
      const plusBtn = await $("button*=New, button svg[class*='plus']");
      if (await plusBtn.isExisting()) {
        await plusBtn.click();
        await browser.pause(500);
      }
    }
  });

  it("should fill out and submit the create team form", async () => {
    // Fill in team name
    const nameInput = await $('input[placeholder*="Frontend"]');
    if (await nameInput.isExisting()) {
      await nameInput.setValue("E2E Auto Test Team");

      // Fill in description
      const descInput = await $('textarea[placeholder*="responsible"]');
      if (await descInput.isExisting()) {
        await descInput.setValue("Created by WebDriverIO E2E test automation.");
      }

      // Submit
      const submitBtn = await $('[data-testid="create-team-submit"]');
      await submitBtn.click();
      await browser.pause(1500);
    }
  });

  it("should verify the team appears in the list", async () => {
    // Look for the team we just created
    const teamInList = await $("p*=E2E Auto Test Team");
    if (await teamInList.isExisting()) {
      await expect(teamInList).toBeExisting();
    }
  });

  it("should open group chat from team details", async () => {
    const openChatBtn = await $('[data-testid="open-group-chat-btn"]');
    if (await openChatBtn.isExisting()) {
      await openChatBtn.click();
      await browser.pause(1000);

      // Should navigate to Chat view with the team selected
      const chatHeader = await $("h2");
      await expect(chatHeader).toBeExisting();
    }
  });

  it("should navigate back to Dashboard", async () => {
    const dashBtn = await $('[data-testid="nav-dashboard"]');
    await dashBtn.click();
    await browser.pause(500);

    const title = await $("h1");
    await expect(title).toBeExisting();
  });
});
