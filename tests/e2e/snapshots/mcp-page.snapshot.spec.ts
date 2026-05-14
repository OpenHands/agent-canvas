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

  /**
   * Iterative snapshot test: install the Slack server from the marketplace.
   *
   * Simulates the full user journey with one snapshot per step:
   *   step 1 – marketplace view with Slack card visible
   *   step 2 – Slack install modal open with empty fields
   *   step 3 – Slack install modal with bot-token and team-ID filled in
   *   step 4 – after clicking Install, Slack card appears in Installed section
   *
   * The MSW settings PATCH handler persists the new mcp_config so the
   * refetch shows the installed server without any page.route() trickery.
   */
  test("install Slack from marketplace (iterative snapshots)", async ({
    page,
  }) => {
    await setupMocks(page);

    await page.goto("/mcp");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    const mcpPage = page.getByTestId("mcp-page");
    const rootLayout = page.getByTestId("root-layout");
    await expect(mcpPage).toBeVisible({ timeout: 15_000 });

    await test.step("step 1 – marketplace before install", async () => {
      await expect(
        page.getByTestId("mcp-marketplace-card-slack"),
      ).toBeVisible({ timeout: 5_000 });
      await expect(mcpPage).toHaveScreenshot("mcp-slack-install-1-marketplace.png", {
        animations: "disabled",
        maxDiffPixelRatio: 0.01,
      });
    });

    await test.step("step 2 – Slack install modal open", async () => {
      await page.getByTestId("mcp-marketplace-card-slack").click();
      await expect(page.getByTestId("mcp-install-modal")).toBeVisible({
        timeout: 5_000,
      });
      await expect(rootLayout).toHaveScreenshot("mcp-slack-install-2-modal.png", {
        animations: "disabled",
        maxDiffPixelRatio: 0.01,
      });
    });

    await test.step("step 3 – fill in bot token and team ID", async () => {
      await page
        .getByTestId("mcp-install-field-SLACK_BOT_TOKEN")
        .fill("xoxb-test-bot-token-1234567890");
      await page
        .getByTestId("mcp-install-field-SLACK_TEAM_ID")
        .fill("T01ABC123");
      await expect(rootLayout).toHaveScreenshot("mcp-slack-install-3-filled.png", {
        animations: "disabled",
        maxDiffPixelRatio: 0.01,
      });
    });

    await test.step("step 4 – submit and confirm Slack is installed", async () => {
      await page.getByTestId("mcp-install-submit").click();

      // Modal should disappear once the mutation completes
      await expect(page.getByTestId("mcp-install-modal")).not.toBeVisible({
        timeout: 10_000,
      });
      await page.waitForLoadState("networkidle");

      // The installed section should now contain a Slack server card
      await expect(page.getByTestId("mcp-server-item")).toBeVisible({
        timeout: 10_000,
      });
      // Brief wait to let the toast and any animations settle
      await page.waitForTimeout(400);

      await expect(mcpPage).toHaveScreenshot("mcp-slack-install-4-installed.png", {
        animations: "disabled",
        maxDiffPixelRatio: 0.01,
      });
    });
  });

  /**
   * Iterative snapshot test: manually add a custom SSE server via the editor.
   *
   * Simulates the full user journey with one snapshot per step:
   *   step 1 – custom server editor open (SSE type, empty fields)
   *   step 2 – URL field filled in
   *   step 3 – API key field filled in (optional field shown)
   *   step 4 – after clicking Add Server, the custom server appears installed
   *
   * Uses the same MSW settings PATCH + GET refetch flow as the marketplace
   * install test so no page.route() overrides are needed.
   */
  test("add custom SSE server via editor (iterative snapshots)", async ({
    page,
  }) => {
    await setupMocks(page);

    await page.goto("/mcp");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    const mcpPage = page.getByTestId("mcp-page");
    const rootLayout = page.getByTestId("root-layout");
    await expect(mcpPage).toBeVisible({ timeout: 15_000 });

    await test.step("step 1 – custom server editor open (empty)", async () => {
      await page.getByTestId("mcp-add-custom-server").click();
      await expect(page.getByTestId("mcp-custom-editor")).toBeVisible({
        timeout: 5_000,
      });
      await expect(rootLayout).toHaveScreenshot(
        "mcp-custom-server-1-editor-open.png",
        { animations: "disabled", maxDiffPixelRatio: 0.01 },
      );
    });

    await test.step("step 2 – URL filled in", async () => {
      await page
        .getByTestId("url-input")
        .fill("https://api.example-mcp.com/sse");
      await expect(rootLayout).toHaveScreenshot(
        "mcp-custom-server-2-url-filled.png",
        { animations: "disabled", maxDiffPixelRatio: 0.01 },
      );
    });

    await test.step("step 3 – API key filled in (optional)", async () => {
      await page.getByTestId("api-key-input").fill("test-api-key-xyz-123");
      await expect(rootLayout).toHaveScreenshot(
        "mcp-custom-server-3-all-filled.png",
        { animations: "disabled", maxDiffPixelRatio: 0.01 },
      );
    });

    await test.step("step 4 – save and confirm custom server is installed", async () => {
      await page.getByTestId("submit-button").click();

      // Editor modal should close
      await expect(page.getByTestId("mcp-custom-editor")).not.toBeVisible({
        timeout: 10_000,
      });
      await page.waitForLoadState("networkidle");

      // Installed section should now contain the custom SSE server
      await expect(page.getByTestId("mcp-server-item")).toBeVisible({
        timeout: 10_000,
      });
      await page.waitForTimeout(400);

      await expect(mcpPage).toHaveScreenshot(
        "mcp-custom-server-4-installed.png",
        { animations: "disabled", maxDiffPixelRatio: 0.01 },
      );
    });
  });
});
