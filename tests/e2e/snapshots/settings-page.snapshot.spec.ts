import { test, expect, Page } from "@playwright/test";

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
  // Pre-set localStorage to skip onboarding
  await page.addInitScript(() => {
    window.localStorage.setItem("openhands-onboarded", "true");
  });

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
}

test.describe("UI Visual Snapshots", () => {
  test("Analytics consent modal renders correctly", async ({ page }) => {
    // This test specifically captures the consent modal appearance
    await setupMocks(page, true);

    await page.goto("/conversations");

    // Wait for the consent modal to be visible
    const consentModal = page.getByRole("dialog", {
      name: "Help improve OpenHands",
    });
    await expect(consentModal).toBeVisible();

    // Snapshot the full page with the consent modal
    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("analytics-consent-modal.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("Home page renders correctly", async ({ page }) => {
    // Consent already given - no modal
    await setupMocks(page, false);

    await page.goto("/conversations");

    // Wait for the home screen to be visible
    const homeScreen = page.getByTestId("home-screen");
    await expect(homeScreen).toBeVisible();

    // Ensure no consent modal is showing
    const consentModal = page.getByRole("dialog", {
      name: "Help improve OpenHands",
    });
    await expect(consentModal).toHaveCount(0);

    await page.waitForLoadState("networkidle");

    // Snapshot full layout for consistency
    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("home-screen.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("Settings page renders correctly", async ({ page }) => {
    await setupMocks(page, false);

    await page.goto("/settings");

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toBeVisible();

    // Ensure no consent modal is showing
    const consentModal = page.getByRole("dialog", {
      name: "Help improve OpenHands",
    });
    await expect(consentModal).toHaveCount(0);

    await page.waitForLoadState("networkidle");

    await expect(rootLayout).toHaveScreenshot("settings-page.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("Settings app page renders correctly", async ({ page }) => {
    await setupMocks(page, false);

    await page.goto("/settings/app");

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toBeVisible();

    // Ensure no consent modal is showing
    const consentModal = page.getByRole("dialog", {
      name: "Help improve OpenHands",
    });
    await expect(consentModal).toHaveCount(0);

    await page.waitForLoadState("networkidle");

    await expect(rootLayout).toHaveScreenshot("settings-app-page.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });
});
