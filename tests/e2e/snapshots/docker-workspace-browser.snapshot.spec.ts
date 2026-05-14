import { expect, test } from "@playwright/test";

test("captures Docker /projects workspace browser state", async ({ page }) => {
  test.setTimeout(60_000);

  await page.addInitScript(() => {
    window.localStorage.setItem("analytics-consent", "true");
    window.localStorage.setItem("openhands-telemetry-consent", "denied");
    window.localStorage.setItem("openhands-telemetry-first-use", "true");
    window.localStorage.setItem("openhands-onboarded", "1");
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
  await expect(modal).toHaveScreenshot("docker-projects-workspace-browser.png");

  await page.getByTestId("folder-browser-entry-demo-app").click();
  await expect(page.getByTestId("folder-browser-current-path")).toHaveText(
    "/projects/demo-app",
  );
  await expect(
    page.getByTestId("folder-browser-entry-web-client"),
  ).toBeVisible();
});
