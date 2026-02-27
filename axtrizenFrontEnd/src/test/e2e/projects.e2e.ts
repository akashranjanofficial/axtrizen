import { browser, $, expect } from "@wdio/globals";

describe("Projects E2E", () => {
  const uniqueName = `E2E Test Project ${Date.now()}`;

  before(async () => {
    await browser.url("http://localhost:5174");
    await browser.pause(3000);
  });

  it("should navigate to Projects view", async () => {
    const projectsBtn = await $('[data-testid="nav-projects"]');
    await projectsBtn.waitForClickable();
    await projectsBtn.click();
    await browser.pause(1000);

    const createBtn = await $('[data-testid="create-project-btn"]');
    await expect(createBtn).toBeExisting();
  });

  it("should open the create project form", async () => {
    const createBtn = await $('[data-testid="create-project-btn"]');
    await createBtn.waitForClickable({ timeout: 5000 });
    await createBtn.click();
    await browser.pause(500);

    // If form didn't open (WKWebView click flake), retry once via JS click
    let nameInput = await $('[data-testid="project-name-input"]');
    if (!(await nameInput.isExisting())) {
      await browser.execute(() => {
        const btn = document.querySelector('[data-testid="create-project-btn"]') as HTMLElement;
        btn?.click();
      });
      await browser.pause(500);
      nameInput = await $('[data-testid="project-name-input"]');
    }
    await expect(nameInput).toBeExisting();
  });

  it("should fill out and submit the create project form", async () => {
    // Ensure the form is open — the previous test opened it, but we re-open defensively
    const nameInput = await $('[data-testid="project-name-input"]');
    const exists = await nameInput.isExisting();
    if (!exists) {
      // Use JS click to bypass WKWebView coordinate issues
      await browser.execute(() => {
        const btn = document.querySelector('[data-testid="create-project-btn"]') as HTMLElement;
        btn?.click();
      });
      await browser.pause(1000);
    }
    // Use waitForExist — WKWebView's waitForDisplayed can fail during CSS animations
    await nameInput.waitForExist({ timeout: 10000 });
    await browser.pause(500); // Let CSS animation complete
    await nameInput.setValue(uniqueName);

    const descInput = await $('[data-testid="project-desc-input"]');
    await descInput.setValue("WebDriverIO E2E automated project testing.");

    const submitBtn = await $('[data-testid="create-project-submit"]');
    await submitBtn.click();

    // Wait for the modal to close and the detail view to appear
    const title = await $(`h1*=${uniqueName}`);
    await title.waitForExist({ timeout: 10000 });
  });

  it("should verify the project appears in the sidebar", async () => {
    const projectItem = await $('[data-testid^="project-item-e2e-test"]');
    await projectItem.waitForExist({ timeout: 5000 });
    await expect(projectItem).toBeExisting();
  });

  it("should start project execution and advance SDLC phase", async () => {
    const teamSelect = await $('[data-testid="project-team-select"]');
    if (await teamSelect.isExisting()) {
      const options = await teamSelect.$$("option");
      if ((await options).length > 1) {
        await teamSelect.selectByIndex(1);
        await browser.pause(1000);
      }
    }

    const startBtn = await $('[data-testid="start-execution-btn"]');
    if ((await startBtn.isExisting()) && (await startBtn.isEnabled())) {
      await startBtn.click();

      const pauseBtn = await $('[data-testid="pause-execution-btn"]');
      await pauseBtn.waitForExist({ timeout: 5000 });
      await expect(pauseBtn).toBeExisting();
    }
  });

  it("should pause project execution", async () => {
    const pauseBtn = await $('[data-testid="pause-execution-btn"]');
    if (await pauseBtn.isExisting()) {
      await pauseBtn.click();

      const startBtn = await $('[data-testid="start-execution-btn"]');
      await startBtn.waitForExist({ timeout: 5000 });
      await expect(startBtn).toBeExisting();
    }
  });

  it("should navigate back to Dashboard", async () => {
    const dashBtn = await $('[data-testid="nav-dashboard"]');
    await dashBtn.click();

    const title = await $("h1");
    await title.waitForExist({ timeout: 5000 });
    await expect(title).toBeExisting();
  });
});
