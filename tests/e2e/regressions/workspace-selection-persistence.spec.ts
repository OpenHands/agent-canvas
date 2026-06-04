import test, { expect, Page } from "@playwright/test";

/**
 * Regression test for issue #1076: selected workspace should persist across
 * navigation in the new-chat view.
 *
 * The workspace-selection-form now backs the selected workspace path in
 * sessionStorage so it survives unmount/remount cycles caused by navigating
 * away from the home page and returning.
 *
 * The dev-mode MSW mock seeds implicit workspace parents under /projects,
 * giving us "demo-app", "sample-tools", "notes-service" in the dropdown
 * without any additional API setup.
 */

const WORKSPACE_NAME = "demo-app";

async function seedLocalStorage(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("openhands-onboarded", "1");
    window.localStorage.setItem("openhands-telemetry-consent", "denied");
    window.localStorage.setItem("analytics-consent", "true");
    window.localStorage.setItem("openhands-telemetry-first-use", "true");
    if (!window.localStorage.getItem("openhands-backends")) {
      window.localStorage.setItem(
        "openhands-backends",
        JSON.stringify([
          {
            id: "default-local",
            name: "Local",
            host: window.location.origin,
            apiKey: "test-session-key",
            kind: "local",
          },
        ]),
      );
    }
    if (!window.localStorage.getItem("openhands-active-backend")) {
      window.localStorage.setItem(
        "openhands-active-backend",
        JSON.stringify({ backendId: "default-local", orgId: null }),
      );
    }
  });
}

async function dismissConsentModal(page: Page) {
  const consentDialog = page.getByRole("dialog", {
    name: "Help improve OpenHands",
  });
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await expect(consentDialog).toHaveCount(0, { timeout: 5000 });
}

async function openWorkspaceDialog(page: Page) {
  const openWorkspaceButton = page.getByTestId("open-workspace-button");
  await expect(openWorkspaceButton).toBeEnabled({ timeout: 15_000 });
  await openWorkspaceButton.click();
  await expect(page.getByTestId("open-workspace-dialog-body")).toBeVisible();
}

async function selectWorkspaceInDropdown(page: Page, workspaceName: string) {
  const dropdown = page.getByTestId("workspace-dropdown");
  await expect(dropdown).toBeEnabled({ timeout: 15_000 });
  await dropdown.click();

  const menu = page.getByTestId("workspace-dropdown-menu");
  await expect(menu).toBeVisible();

  const option = menu.getByText(workspaceName, { exact: true });
  await expect(option).toBeVisible();
  await option.click();
}

test.describe("Workspace selection persistence (#1076)", () => {
  test("selected workspace persists after navigating away and returning", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await seedLocalStorage(page);
    await page.goto("/conversations", { waitUntil: "domcontentloaded" });
    await dismissConsentModal(page);

    // Step 1: Open workspace dialog and select a workspace
    await openWorkspaceDialog(page);
    await selectWorkspaceInDropdown(page, WORKSPACE_NAME);

    // Verify the dropdown now shows the selected workspace
    const dropdown = page.getByTestId("workspace-dropdown");
    await expect(dropdown).toHaveValue(WORKSPACE_NAME);

    // Close the dialog
    await page.getByTestId("close-open-workspace-dialog").click();
    await expect(
      page.getByTestId("open-workspace-dialog-body"),
    ).not.toBeVisible();

    // Step 2: Navigate to settings and back
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("home-screen")).not.toBeVisible({
      timeout: 5000,
    });

    await page.goto("/conversations", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("home-screen")).toBeVisible({
      timeout: 10_000,
    });

    // Step 3: Open workspace dialog again and verify persistence
    await openWorkspaceDialog(page);

    const restoredDropdown = page.getByTestId("workspace-dropdown");
    await expect(restoredDropdown).toBeEnabled({ timeout: 15_000 });
    await expect(restoredDropdown).toHaveValue(WORKSPACE_NAME);
  });

  test("cleared sessionStorage results in empty workspace selection on fresh visit", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await seedLocalStorage(page);

    // Ensure no persisted workspace path
    await page.addInitScript(() => {
      window.sessionStorage.removeItem("oh:home-selected-workspace-path");
    });

    await page.goto("/conversations", { waitUntil: "domcontentloaded" });
    await dismissConsentModal(page);

    await openWorkspaceDialog(page);

    const dropdown = page.getByTestId("workspace-dropdown");
    await expect(dropdown).toBeEnabled({ timeout: 15_000 });

    // The dropdown should be empty (no pre-selected workspace)
    await expect(dropdown).toHaveValue("");
  });
});
