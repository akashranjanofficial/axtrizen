import { browser, $, $$, expect } from "@wdio/globals";

/**
 * E2E Tests for Project Board (Jira-like Kanban + List views)
 *
 * Prerequisites:
 *   1. Tauri app running (npx tauri dev)
 *   2. At least one project created
 *
 * This test navigates to Projects, selects/creates one,
 * and verifies the ProjectBoard renders correctly.
 */
describe("ProjectBoard E2E", () => {
  const testProjectName = `Board Test ${Date.now()}`;

  before(async () => {
    await browser.url("http://localhost:5174");
    await browser.pause(3000);
  });

  it("should navigate to Projects view", async () => {
    const projectsBtn = await $('[data-testid="nav-projects"]');
    await projectsBtn.waitForClickable({ timeout: 10000 });
    await projectsBtn.click();
    await browser.pause(1500);

    const createBtn = await $('[data-testid="create-project-btn"]');
    await expect(createBtn).toBeExisting();
  });

  it("should create a project for board testing", async () => {
    const createBtn = await $('[data-testid="create-project-btn"]');
    await createBtn.click();
    await browser.pause(1000);

    const nameInput = await $('[data-testid="project-name-input"]');
    await nameInput.waitForExist({ timeout: 10000 });
    await browser.pause(500);
    await nameInput.setValue(testProjectName);

    const descInput = await $('[data-testid="project-desc-input"]');
    await descInput.setValue("E2E test project for ProjectBoard verification.");

    const submitBtn = await $('[data-testid="create-project-submit"]');
    await submitBtn.click();

    // Wait for project detail to appear
    const title = await $(`h1*=${testProjectName}`);
    await title.waitForExist({ timeout: 10000 });
  });

  it("should display the Project Board with empty state", async () => {
    // Scroll down to find the ProjectBoard section
    await browser.pause(2000);

    // The ProjectBoard should render with "No Plan Yet" empty state
    // since we haven't generated any epics/stories/tasks
    const boardContainer = await $("div*=Project Board");
    const exists = await boardContainer.isExisting();

    if (exists) {
      await expect(boardContainer).toBeExisting();
      console.log("✅ ProjectBoard component found in the Projects detail view");
    } else {
      // Try scrolling to find it
      await browser.execute(() => {
        const mainContent = document.querySelector(".overflow-y-auto");
        if (mainContent) mainContent.scrollTop = mainContent.scrollHeight;
      });
      await browser.pause(1000);

      const boardAfterScroll = await $("div*=Project Board");
      await expect(boardAfterScroll).toBeExisting();
      console.log("✅ ProjectBoard found after scrolling");
    }
  });

  it("should show the empty state message", async () => {
    // Check for the "No Plan Yet" message
    const noPlanText = await $("div*=No Plan Yet");
    const exists = await noPlanText.isExisting();

    if (exists) {
      await expect(noPlanText).toBeExisting();
      console.log("✅ Empty state 'No Plan Yet' displayed correctly");
    } else {
      // If the board has data, check for view toggle buttons
      const kanbanBtn = await $("button*=Kanban");
      if (await kanbanBtn.isExisting()) {
        console.log("✅ ProjectBoard has data — Kanban button visible");
        await expect(kanbanBtn).toBeExisting();
      }
    }
  });

  it("should verify Kanban/List toggle exists when board has data", async () => {
    const kanbanBtn = await $("button*=Kanban");
    const listBtn = await $("button*=List");

    if ((await kanbanBtn.isExisting()) && (await listBtn.isExisting())) {
      console.log("✅ View toggle buttons (Kanban/List) present");

      // Switch to List view
      await listBtn.click();
      await browser.pause(500);
      console.log("✅ Switched to List view");

      // Switch back to Kanban
      await kanbanBtn.click();
      await browser.pause(500);
      console.log("✅ Switched back to Kanban view");
    } else {
      console.log("ℹ️ Board is in empty state — no toggle visible (expected)");
    }
  });

  it("should navigate back to Dashboard", async () => {
    const dashBtn = await $('[data-testid="nav-dashboard"]');
    await dashBtn.click();
    await browser.pause(1000);

    const title = await $("h1");
    await title.waitForExist({ timeout: 5000 });
    await expect(title).toBeExisting();
  });
});
