import { test, expect, Page } from "@playwright/test";
import { seedLocalStorage } from "./support/seed-local-storage";

/**
 * Visual snapshot tests for UI pages.
 *
 * These tests capture screenshots of pages and compare them against
 * baseline images to detect unintended visual regressions.
 *
 * To update baselines after intentional UI changes:
 *   npm run test:e2e:snapshots:update
 */

/** Mock settings response with analytics consent already given */
const SETTINGS_WITH_CONSENT = {
  llm_model: "anthropic/claude-sonnet-4-20250514",
  llm_base_url: "",
  agent: "CodeActAgent",
  language: "en",
  llm_api_key: null,
  llm_api_key_set: true,
  search_api_key_set: false,
  confirmation_mode: false,
  security_analyzer: "llm",
  remote_runtime_resource_factor: 1,
  provider_tokens_set: { github: "" },
  enable_default_condenser: true,
  condenser_max_size: 240,
  enable_sound_notifications: false,
  // Analytics consent already given - modal won't show
  user_consents_to_analytics: false,
  enable_proactive_conversation_starters: false,
  enable_solvability_analysis: false,
  max_budget_per_task: null,
};

/** Mock settings response with analytics consent pending (null = show modal) */
const SETTINGS_WITHOUT_CONSENT = {
  ...SETTINGS_WITH_CONSENT,
  // null means user hasn't made a choice yet - modal will show
  user_consents_to_analytics: null,
};

/**
 * Sets up common API mocks for snapshot tests.
 * @param page - Playwright page
 * @param showConsentModal - Whether to show the analytics consent modal
 */
async function setupMocks(page: Page, showConsentModal = false) {
  await seedLocalStorage(page, { showConsentModal });

  // Mock settings API - consent modal appears when user_consents_to_analytics is null
  const settingsResponse = showConsentModal
    ? SETTINGS_WITHOUT_CONSENT
    : SETTINGS_WITH_CONSENT;

  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(settingsResponse),
      });
    } else {
      await route.continue();
    }
  });

  // Mock settings schemas
  await page.route("**/api/settings/agent-schema", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("**/api/settings/conversation-schema", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  // Mock conversations search for home page
  await page.route("**/api/conversations/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    });
  });

  await page.route("**/api/bash/execute_bash_command", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        command: "",
        exit_code: 0,
        output: "",
      }),
    });
  });

  // Mock file APIs to prevent proxy errors
  await page.route("**/api/file/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ path: "/home", subdirs: [] }),
    });
  });
}

/**
 * Dismisses the analytics consent modal if it appears.
 */
async function dismissConsentModal(page: Page) {
  const consentDialog = page.getByRole("dialog", {
    name: "Help improve OpenHands",
  });
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3000 })
    .catch(() => undefined);
  await expect(consentDialog).toHaveCount(0, { timeout: 3000 });
}

test.describe("UI Visual Snapshots", () => {
  // Increase timeout for this test - modal loading can be slow
  test.setTimeout(60000);

  test("Analytics consent modal renders correctly", async ({ page }) => {
    // Use setupMocks with showConsentModal=true to guarantee modal appears
    await setupMocks(page, true);

    await page.goto("/conversations", { waitUntil: "networkidle" });

    // Wait for the page to stabilize
    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toBeVisible({ timeout: 15000 });

    // Wait for the consent modal (lazy-loaded) with extended timeout
    const consentModal = page.getByRole("dialog", {
      name: "Help improve OpenHands",
    });
    await expect(consentModal).toBeVisible({ timeout: 15000 });

    // Snapshot the full page with the consent modal
    await expect(rootLayout).toHaveScreenshot("analytics-consent-modal.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("Home page renders correctly", async ({ page }) => {
    await setupMocks(page, false);
    await page.goto("/conversations");
    await dismissConsentModal(page);

    const homeScreen = page.getByTestId("home-screen");
    await expect(homeScreen).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("home-screen.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("Settings page renders correctly", async ({ page }) => {
    await setupMocks(page, false);
    await page.goto("/settings");
    await dismissConsentModal(page);

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");

    await expect(rootLayout).toHaveScreenshot("settings-page.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("Settings app page renders correctly", async ({ page }) => {
    await setupMocks(page, false);
    await page.goto("/settings/app");
    await dismissConsentModal(page);

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");

    await expect(rootLayout).toHaveScreenshot("settings-app-page.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("Add backend modal renders correctly", async ({ page }) => {
    await setupMocks(page, false);

    // Mock the server-info health-check endpoint. Without this, the
    // periodic health poll may prevent networkidle or cause hangs.
    await page.route("**/server_info", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version: "mock" }),
      });
    });

    await page.goto("/conversations");
    await dismissConsentModal(page);

    const homeScreen = page.getByTestId("home-screen");
    await expect(homeScreen).toBeVisible({ timeout: 15000 });

    // The backend selector uses openOnHover, so hovering opens the
    // dropdown. Clicking the toggle would close it again, so we hover
    // to open and then click the menu item directly.
    const backendSelector = page.getByTestId("backend-selector");
    await expect(backendSelector).toBeVisible({ timeout: 15_000 });
    await backendSelector.hover();
    await page.getByTestId("add-backend-menu-item").click();

    const addBackendModal = page.getByTestId("add-backend-modal");
    await expect(addBackendModal).toBeVisible({ timeout: 15000 });

    await expect(addBackendModal).toHaveScreenshot("add-backend-modal.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });
});
