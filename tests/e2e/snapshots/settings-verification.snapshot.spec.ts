import { test, expect, Page } from "@playwright/test";

/**
 * Visual snapshot tests for:
 *   - /settings/verification  (Confirmation Mode toggle + Security Analyzer)
 *   - /settings/condenser     (Schema-driven condenser form)
 *
 * MSW provides the default settings (confirmation_mode: false) so the first
 * verification snapshot shows the toggle in the OFF position with a dimmed
 * Save Changes button.  Toggling it ON reveals the Security Analyzer dropdown
 * and enables Save Changes — captured in the second snapshot.
 *
 * Three snapshots, not four: there is no separate "dirty" snapshot because
 * clicking the toggle IS the dirty action — the "ON" snapshot already captures
 * the dirty/enabled-Save-Changes state.
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
}

test.describe("Settings – Verification & Condenser Visual Snapshots", () => {
  test.setTimeout(60_000);

  /**
   * Helper: wait for the verification page to be ready by checking for the
   * "Enable Confirmation Mode" label text (visible once settings are loaded).
   * The underlying checkbox is `hidden` in the DOM (a styled toggle pattern),
   * so we cannot use toBeVisible() on the checkbox itself.
   */
  async function waitForVerificationPage(page: Page) {
    await expect(
      page.getByText("Enable Confirmation Mode"),
    ).toBeVisible({ timeout: 10_000 });
  }

  test("verification settings with confirmation mode OFF (default)", async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto("/settings/verification");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    await waitForVerificationPage(page);

    // Security Analyzer combobox must NOT be present when toggle is off.
    // HeroUI Autocomplete does not forward data-testid; use role + label.
    await expect(
      page.getByRole("combobox", { name: /Security Analyzer/ }),
    ).toHaveCount(0);

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot(
      "verification-settings-off.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("verification settings with confirmation mode ON shows security analyzer", async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto("/settings/verification");
    await dismissConsentModal(page);
    await waitForVerificationPage(page);

    // The underlying <input type="checkbox"> is `hidden`; clicking the visible
    // label that wraps it activates the form control through standard HTML
    // label–control association.
    await page
      .locator(`label:has([data-testid="confirmation-mode-toggle"])`)
      .click();

    // Security Analyzer dropdown should now appear.
    // The HeroUI Autocomplete component does not forward data-testid to the DOM;
    // match by accessible role + label instead.
    await expect(
      page.getByRole("combobox", { name: /Security Analyzer/ }),
    ).toBeVisible({ timeout: 5_000 });

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot(
      "verification-settings-on.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("condenser settings page renders schema form", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/settings/condenser");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    // Wait for the condenser form to render: the schema provides
    // "Enable default condenser" as the first field label
    await expect(
      page.getByText("Enable default condenser"),
    ).toBeVisible({ timeout: 15_000 });

    // The wrapper div with data-testid should be present once the form renders
    await expect(
      page.getByTestId("condenser-settings-screen"),
    ).toBeAttached({ timeout: 5_000 });

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("condenser-settings.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });
});
