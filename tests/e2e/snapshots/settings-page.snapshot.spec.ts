import { test, expect } from "@playwright/test";

/**
 * Visual snapshot tests for UI pages.
 *
 * These tests capture screenshots of pages and compare them against
 * baseline images to detect unintended visual regressions.
 *
 * To update baselines after intentional UI changes:
 *   npm run test:e2e:snapshots:update
 */
test.describe("UI Visual Snapshots", () => {
  test.beforeEach(async ({ page }) => {
    // Pre-set localStorage to skip consent dialogs and onboarding
    await page.addInitScript(() => {
      window.localStorage.setItem("analytics-consent", "true");
      window.localStorage.setItem("openhands-onboarded", "true");
    });

    // Mock settings API to return consistent data for snapshots
    await page.route("**/api/settings", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
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
            user_consents_to_analytics: false,
            enable_proactive_conversation_starters: false,
            enable_solvability_analysis: false,
            max_budget_per_task: null,
          }),
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
  });

  test("Home page renders correctly", async ({ page }) => {
    await page.goto("/conversations");

    // Wait for the home screen to be visible
    const homeScreen = page.getByTestId("home-screen");
    await expect(homeScreen).toBeVisible();

    // Wait for any loading states to resolve
    await page.waitForLoadState("networkidle");

    // Take a snapshot of the home screen
    await expect(homeScreen).toHaveScreenshot("home-screen.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("Settings page renders correctly", async ({ page }) => {
    await page.goto("/settings");

    // Wait for the root layout to be visible (settings is nested)
    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toBeVisible();

    await page.waitForLoadState("networkidle");

    // Snapshot the main content area
    await expect(rootLayout).toHaveScreenshot("settings-page.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("Settings app page renders correctly", async ({ page }) => {
    await page.goto("/settings/app");

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toBeVisible();

    await page.waitForLoadState("networkidle");

    await expect(rootLayout).toHaveScreenshot("settings-app-page.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });
});
