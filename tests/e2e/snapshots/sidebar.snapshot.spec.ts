import { test, expect, Page } from "@playwright/test";

/**
 * Visual snapshot tests for the sidebar / conversation panel.
 *
 * MSW pre-seeds three conversations in src/mocks/conversation-handlers.ts:
 *   1. "My New Project"   — execution_status: "waiting_for_confirmation"
 *   2. "Repo Testing"     — execution_status: "idle"
 *   3. "Another Project"  — execution_status: "idle"
 *
 * Three snapshots:
 *   1. conversation-panel — the panel itself with status dots + relative timestamps
 *   2. sidebar-collapsed  — after clicking the collapse toggle (thin icon rail)
 *   3. new-conversation-popover — popover open showing workspace options
 */

async function dismissConsentModal(page: Page) {
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

async function setupMocks(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("openhands-onboarded", "true");
  });
  // Suppress proxy errors for file API (home page workspace scan)
  await page.route("**/api/file/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ path: "/home", subdirs: [] }),
    });
  });
}

test.describe("Sidebar Visual Snapshots", () => {
  test.setTimeout(60_000);

  test("conversation panel shows three conversations with status dots", async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto("/conversations");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    // Wait for all three conversation cards to be present
    const conversationPanel = page.getByTestId("conversation-panel");
    await expect(conversationPanel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("conversation-card")).toHaveCount(3, {
      timeout: 10_000,
    });

    // Scope the screenshot to just the sidebar panel (includes status dots)
    await expect(conversationPanel).toHaveScreenshot(
      "sidebar-conversation-panel.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("sidebar collapses to an icon rail on toggle", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/conversations");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("conversation-panel")).toBeVisible({
      timeout: 15_000,
    });

    // Click the collapse toggle (visible when sidebar is expanded)
    await page.getByTestId("sidebar-collapse-toggle").click();

    // Sidebar should now be in collapsed state
    const sidebarAside = page.locator("aside[data-collapsed='true']");
    await expect(sidebarAside).toBeVisible({ timeout: 5_000 });

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("sidebar-collapsed.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("conversations filter menu opens from the filter toggle button", async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto("/conversations");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("conversation-panel")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("conversation-card")).toHaveCount(3, {
      timeout: 10_000,
    });

    // Click the filter toggle in the Conversations header
    await page.getByTestId("older-conversations-filter-toggle").click();

    // Filter menu should appear
    await expect(
      page.getByTestId("older-conversations-filter-menu"),
    ).toBeVisible({ timeout: 5_000 });

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot(
      "sidebar-filter-menu.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("new conversation popover opens with no-workspace entry", async ({
    page,
  }) => {
    // The `NewConversationButton` component (and its `new-conversation-button`
    // testid) is temporarily removed from the sidebar. The component lives at
    // src/components/features/conversation-panel/new-conversation-button-local.tsx
    // but is commented out in sidebar.tsx (lines 241-244). This test documents
    // the intended snapshot once the button is re-wired. Mark as fixme so CI
    // stays green while the implementation is pending.
    // eslint-disable-next-line playwright/no-skipped-test
    test.fixme(
      true,
      "NewConversationButton is temporarily hidden from the sidebar (sidebar.tsx:241-244)",
    );

    await setupMocks(page);
    await page.goto("/");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    // Find and click the new-conversation trigger in the sidebar
    const newConvButton = page.getByTestId("new-conversation-button");
    await expect(newConvButton).toBeVisible({ timeout: 10_000 });
    await newConvButton.click();

    // Popover should appear
    await expect(page.getByTestId("new-conversation-popover")).toBeVisible({
      timeout: 5_000,
    });

    // "No workspace" entry is always present (no workspaces stored in
    // localStorage in this mock setup)
    await expect(page.getByTestId("launch-no-workspace")).toBeVisible();

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot(
      "sidebar-new-conversation-popover.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });
});
