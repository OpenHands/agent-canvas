import { test, expect, Page } from "@playwright/test";

/**
 * Visual snapshot tests for the Secrets Settings page (/settings/secrets).
 *
 * MSW pre-seeds two secrets in src/mocks/secrets-handlers.ts:
 *   - OpenAI_API_Key
 *   - Google_Maps_API_Key
 *
 * All five snapshots tell an iterative story:
 *   1. Default list (two pre-seeded rows)
 *   2. "Add New Secret" form open (empty)
 *   3. Form filled in with name + value
 *   4. After saving — list shows a third secret
 *   5. Delete confirmation modal open
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
  // Keep conversations sidebar quiet (page.route wins for this cross-origin path
  // only; for same-origin MSW takes precedence and we rely on MSW data).
  await page.route("**/api/conversations/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], next_page_id: null }),
    });
  });
}

test.describe("Settings – Secrets Visual Snapshots", () => {
  test.setTimeout(60_000);
  // Run in serial so the MSW secrets Map stays consistent across steps
  test.describe.configure({ mode: "serial" });

  test("secrets list shows two pre-seeded rows", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/settings/secrets");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    // Both secrets must be visible before taking the snapshot
    await expect(
      page.getByTestId("secret-item").first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("secret-item")).toHaveCount(2);

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("secrets-list.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("add-new-secret form opens empty", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/settings/secrets");
    await dismissConsentModal(page);

    await expect(
      page.getByTestId("secret-item").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click the "Add New Secret" button
    await page.getByTestId("add-secret-button").click();

    // The inline form should appear
    await expect(page.getByTestId("value-input")).toBeVisible({ timeout: 5_000 });

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("secrets-add-form.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("add-new-secret form filled with name and value", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/settings/secrets");
    await dismissConsentModal(page);

    await expect(
      page.getByTestId("secret-item").first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("add-secret-button").click();
    await expect(page.getByTestId("value-input")).toBeVisible({ timeout: 5_000 });

    // Fill the secret name field
    await page.getByTestId("name-input").fill("ANTHROPIC_API_KEY");

    // Fill the secret value field
    await page.getByTestId("value-input").fill("sk-ant-snapshot-test-key");

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("secrets-add-form-filled.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("after saving a secret the list shows three rows", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/settings/secrets");
    await dismissConsentModal(page);

    await expect(
      page.getByTestId("secret-item").first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("add-secret-button").click();
    await expect(page.getByTestId("value-input")).toBeVisible({ timeout: 5_000 });

    await page.getByTestId("name-input").fill("ANTHROPIC_API_KEY");
    await page.getByTestId("value-input").fill("sk-ant-snapshot-test-key");

    // Submit the form ("Add secret" is the i18n text for the submit button in add mode)
    await page.getByTestId("submit-button").click();

    // Wait for the form to close and the new secret to appear
    await expect(page.getByTestId("secret-item")).toHaveCount(3, {
      timeout: 10_000,
    });

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("secrets-after-save.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("delete confirmation modal is shown for a secret", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/settings/secrets");
    await dismissConsentModal(page);

    await expect(
      page.getByTestId("secret-item").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click the delete button on the first secret row
    await page.getByTestId("delete-secret-button").first().click();

    // The ConfirmationModal should appear
    await expect(
      page.getByTestId("confirmation-modal"),
    ).toBeVisible({ timeout: 5_000 });

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("secrets-delete-confirm.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });
});
