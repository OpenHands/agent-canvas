import { test, expect, Page } from "@playwright/test";

/**
 * Visual snapshot tests for the MCP page (/mcp).
 *
 * The MCP marketplace catalog is hardcoded in src/constants/mcp-marketplace.ts,
 * so it never requires an API call.  Installed servers are read from
 * settings.agent_settings.mcp_config (SDK format: { mcpServers: { ... } }).
 *
 * Three states are covered:
 *   1. No installed servers – empty installed section, full marketplace visible
 *   2. Two installed servers (one SSE, one stdio)
 *   3. Search query "slack" filtering both sections simultaneously
 */

/**
 * Dismiss the analytics consent modal if MSW shows it (settings return
 * user_consents_to_analytics: null by default in mock mode).
 */
async function dismissConsentModal(page: Page) {
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

/**
 * Wire up the base routes every MCP page test needs.
 *
 * NOTE: Settings requests go to the same-origin Vite dev server where MSW
 * wins over page.route(). We dismiss the consent modal after navigation
 * instead of trying to suppress it here.
 */
async function setupMocks(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("openhands-onboarded", "true");
  });

  await page.route("**/api/conversations/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    });
  });
}

test.describe("MCP Page Visual Snapshots", () => {
  test.setTimeout(60_000);

  test("empty installed section with marketplace renders correctly", async ({
    page,
  }) => {
    // MSW settings have no mcp_config → installed section is empty
    await setupMocks(page);

    await page.goto("/mcp");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    const mcpPage = page.getByTestId("mcp-page");
    await expect(mcpPage).toBeVisible({ timeout: 15_000 });

    await expect(mcpPage).toHaveScreenshot("mcp-empty-installed.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("add custom server editor form renders correctly", async ({ page }) => {
    // The "Add custom server" modal does not depend on settings state so it
    // is reliably testable regardless of MSW's default settings response.
    await setupMocks(page);

    await page.goto("/mcp");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    const mcpPage = page.getByTestId("mcp-page");
    await expect(mcpPage).toBeVisible({ timeout: 15_000 });

    // Open the custom server editor
    await page.getByTestId("mcp-add-custom-server").click();

    // Wait for the editor form to appear inside the modal
    const modal = page.locator(".fixed.inset-0").last();
    await expect(modal).toBeVisible({ timeout: 5_000 });

    await expect(page.getByTestId("root-layout")).toHaveScreenshot(
      "mcp-custom-server-editor.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("search query filters marketplace", async ({ page }) => {
    await setupMocks(page);

    await page.goto("/mcp");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    const mcpPage = page.getByTestId("mcp-page");
    await expect(mcpPage).toBeVisible({ timeout: 15_000 });

    // Type "slack" into the unified search box
    const searchInput = page.getByTestId("mcp-search-input");
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill("slack");

    // Wait for the filtered results to stabilise
    await page.waitForTimeout(300);

    await expect(mcpPage).toHaveScreenshot("mcp-search-filtered.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });
});
