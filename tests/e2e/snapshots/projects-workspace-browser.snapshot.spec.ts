import { expect, test } from "@playwright/test";
import { seedLocalStorage } from "./support/seed-local-storage";

test("captures /projects workspace browser state", async ({ page }) => {
  test.setTimeout(60_000);

  await seedLocalStorage(page, {
    extra: [
      ["analytics-consent", "true"],
      ["openhands-telemetry-first-use", "true"],
    ],
  });

  await page.goto("/conversations", { waitUntil: "domcontentloaded" });

  const consentDialog = page.getByRole("dialog", {
    name: "Help improve OpenHands",
  });
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 5000 })
    .catch(() => undefined);
  await expect(consentDialog).toHaveCount(0, { timeout: 5000 });

  // The home screen is now a chat-first launcher (#514) — the workspace
  // dropdown lives inside OpenWorkspaceDialog, opened via "Open workspace".
  const openWorkspaceButton = page.getByTestId("open-workspace-button");
  await expect(openWorkspaceButton).toBeEnabled({ timeout: 15_000 });
  await openWorkspaceButton.click();
  await expect(page.getByTestId("open-workspace-dialog-body")).toBeVisible();

  const workspaceDropdown = page.getByTestId("workspace-dropdown");
  await expect(workspaceDropdown).toBeEnabled({ timeout: 15_000 });
  await workspaceDropdown.click();
  await page.getByTestId("add-workspaces-button").click();

  const modal = page.getByTestId("folder-browser-modal");
  await expect(modal).toBeVisible();
  await expect(page.getByTestId("folder-browser-current-path")).toHaveText(
    "/projects",
  );
  await expect(
    page.getByTestId("folder-browser-sidebar-/projects"),
  ).toBeVisible();
  await expect(page.getByTestId("folder-browser-entry-demo-app")).toBeVisible();

  await page.mouse.move(5, 5);
  await expect(modal).toHaveScreenshot("projects-workspace-browser.png");

  await page.getByTestId("folder-browser-entry-demo-app").click();
  await expect(page.getByTestId("folder-browser-current-path")).toHaveText(
    "/projects/demo-app",
  );
  await expect(
    page.getByTestId("folder-browser-entry-web-client"),
  ).toBeVisible();
});
