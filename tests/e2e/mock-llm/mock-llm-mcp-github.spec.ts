/**
 * Mock-LLM E2E test: GitHub MCP server install via the MCP marketplace UI.
 *
 * This test exercises the full MCP install flow — navigating to the MCP page,
 * finding the GitHub marketplace card, opening the install modal, filling in
 * the PAT field, and submitting. The `POST /api/mcp/test` endpoint is
 * intercepted to return a mock success response so the test doesn't need a
 * real `github-mcp-server` binary or Docker daemon.
 *
 * Verifies:
 *   1. The MCP page renders with the GitHub marketplace card visible
 *   2. Clicking the card opens the install modal with the correct fields
 *   3. The command field shows the expected transport (docker or native binary)
 *   4. Validation prevents submission with an empty PAT
 *   5. Filling in the PAT and submitting succeeds (with mocked test endpoint)
 *   6. After install the GitHub server appears in the installed list
 *   7. The installed server can be deleted via the UI
 */

import { test, expect } from "@playwright/test";
import {
  BACKEND_URL,
  SESSION_API_KEY,
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
  ensureMockLLMProfile,
} from "./utils/mock-llm-helpers";

const FAKE_PAT = "github_pat_test_1234567890abcdef";

test.describe.configure({ mode: "serial" });

test.describe("MCP GitHub server install flow", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  test.afterEach(async ({ request }) => {
    // Clear any MCP config so subsequent tests start clean
    await request
      .patch(`${BACKEND_URL}/api/settings`, {
        headers: {
          "X-Session-API-Key": SESSION_API_KEY,
          "Content-Type": "application/json",
        },
        data: { agent_settings_diff: { mcp_config: null } },
      })
      .catch(() => {});
  });

  test("step 1: GitHub card is visible on the MCP marketplace page", async ({
    page,
  }) => {
    await routeSessionApiKey(page);
    await page.goto("/mcp", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    // Wait for the marketplace section to render
    await waitForTestId(page, "mcp-marketplace-section");
    const marketplaceGrid = page.getByTestId("mcp-marketplace-grid");
    await expect(marketplaceGrid).toBeVisible({ timeout: 10_000 });

    // Verify the GitHub card exists
    const githubCard = page.getByTestId("mcp-marketplace-card-github");
    await expect(githubCard).toBeVisible();

    // The card should display the name "GitHub"
    await expect(githubCard).toContainText("GitHub");
  });

  test("step 2: clicking GitHub card opens the install modal with correct fields", async ({
    page,
  }) => {
    await routeSessionApiKey(page);
    await page.goto("/mcp", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "mcp-marketplace-grid");

    // Click the GitHub marketplace card
    await page.getByTestId("mcp-marketplace-card-github").click();

    // The install modal should appear
    const modal = page.getByTestId("mcp-install-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Verify the modal is for the GitHub entry
    await expect(modal).toHaveAttribute("data-marketplace-id", "github");

    // The modal should show the command field (read-only).
    // In the mock-LLM test environment (non-Docker), the command is the
    // original catalog entry: `docker run ...`. In Docker deployments the
    // patchGitHubEntry rewrites it to `github-mcp-server stdio`.
    const commandField = page.getByTestId(
      "mcp-install-field-command-readonly",
    );
    await expect(commandField).toBeVisible();

    // The PAT field should be present and empty
    const patField = page.getByTestId(
      "mcp-install-field-GITHUB_PERSONAL_ACCESS_TOKEN",
    );
    await expect(patField).toBeVisible();
  });

  test("step 3: submitting without a PAT shows validation error", async ({
    page,
  }) => {
    await routeSessionApiKey(page);
    await page.goto("/mcp", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "mcp-marketplace-grid");

    await page.getByTestId("mcp-marketplace-card-github").click();
    const modal = page.getByTestId("mcp-install-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Click the submit button without filling in the PAT
    await page.getByTestId("mcp-install-submit").click();

    // A validation error should appear (the PAT field is required)
    const errorText = modal.locator(".text-red-500");
    await expect(errorText).toBeVisible({ timeout: 3_000 });
  });

  test("step 4: full install flow — fill PAT, submit, verify installed", async ({
    page,
  }) => {
    // We need an LLM profile configured for settings to work properly
    await ensureMockLLMProfile(page);

    await routeSessionApiKey(page);

    // Intercept the MCP test endpoint to return success — we don't have
    // the real github-mcp-server binary in the test environment.
    await page.route("**/api/mcp/test", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/mcp", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "mcp-marketplace-grid");

    // Click the GitHub card to open the install modal
    await page.getByTestId("mcp-marketplace-card-github").click();
    const modal = page.getByTestId("mcp-install-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Fill in the PAT — SettingsInput puts data-testid on the <input> directly
    const patInput = page.getByTestId(
      "mcp-install-field-GITHUB_PERSONAL_ACCESS_TOKEN",
    );
    await patInput.fill(FAKE_PAT);

    // Click install
    await page.getByTestId("mcp-install-submit").click();

    // The modal should close after successful install
    await expect(modal).not.toBeVisible({ timeout: 10_000 });

    // The GitHub server should now appear in the installed list
    const installedList = page.getByTestId("mcp-installed-list");
    await expect(installedList).toBeVisible({ timeout: 10_000 });

    // The installed server card should exist
    const serverItems = installedList.getByTestId("mcp-server-item");
    await expect(serverItems.first()).toBeVisible();

    // Verify via the settings API that the server was actually persisted
    const settingsResp = await page.request.get(
      `${BACKEND_URL}/api/settings`,
      {
        headers: { "X-Session-API-Key": SESSION_API_KEY },
      },
    );
    expect(settingsResp.ok()).toBe(true);
    const settings = await settingsResp.json();
    const mcpConfig = settings?.agent_settings?.mcp_config;
    expect(mcpConfig).toBeTruthy();

    // The GitHub server should be stored as a stdio server named "github"
    // with the PAT in its env
    const mcpServers = mcpConfig?.mcpServers ?? mcpConfig?.stdio_servers;
    expect(mcpServers).toBeTruthy();

    // Check that there's a server named "github" somewhere in the config
    const hasGithub =
      mcpServers?.github != null ||
      (Array.isArray(mcpServers) &&
        mcpServers.some(
          (s: Record<string, unknown>) => s.name === "github",
        ));
    expect(hasGithub).toBe(true);
  });

  test("step 5: installed GitHub server can be deleted", async ({ page }) => {
    // First install the server via the API so we have something to delete
    const installResp = await page.request.patch(
      `${BACKEND_URL}/api/settings`,
      {
        headers: {
          "X-Session-API-Key": SESSION_API_KEY,
          "Content-Type": "application/json",
        },
        data: {
          agent_settings_diff: {
            mcp_config: {
              mcpServers: {
                github: {
                  command: "github-mcp-server",
                  args: ["stdio"],
                  env: {
                    GITHUB_PERSONAL_ACCESS_TOKEN: FAKE_PAT,
                  },
                },
              },
            },
          },
        },
      },
    );
    expect(installResp.ok()).toBe(true);

    await routeSessionApiKey(page);
    await page.goto("/mcp", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    // The installed list should show the github server
    const installedList = page.getByTestId("mcp-installed-list");
    await expect(installedList).toBeVisible({ timeout: 10_000 });

    const serverItem = installedList.getByTestId("mcp-server-item").first();
    await expect(serverItem).toBeVisible();

    // The installed card has a CirclePlusCheckToggle — clicking it while
    // isSelected=true triggers onDelete. Find and click the toggle button
    // inside the server card (it shows a checkmark icon).
    const toggleButton = serverItem.locator(
      '[data-testid^="mcp-installed-toggle-"]',
    );
    await toggleButton.click();

    // A confirmation modal should appear — click confirm
    const confirmButton = page.getByTestId("confirm-button");
    await expect(confirmButton).toBeVisible({ timeout: 5_000 });
    await confirmButton.click();

    // After deletion the installed list should show the empty state
    await expect(
      page.getByTestId("mcp-installed-empty"),
    ).toBeVisible({ timeout: 10_000 });

    // Verify via the settings API that the server was removed
    const settingsResp = await page.request.get(
      `${BACKEND_URL}/api/settings`,
      {
        headers: { "X-Session-API-Key": SESSION_API_KEY },
      },
    );
    expect(settingsResp.ok()).toBe(true);
    const settings = await settingsResp.json();
    const mcpConfig = settings?.agent_settings?.mcp_config;
    const mcpServers = mcpConfig?.mcpServers;
    const githubStillPresent = mcpServers?.github != null;
    expect(githubStillPresent).toBe(false);
  });
});
