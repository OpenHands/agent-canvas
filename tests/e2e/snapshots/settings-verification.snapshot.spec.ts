import { test, expect, Page } from "@playwright/test";
import { seedLocalStorage } from "./support/seed-local-storage";

/**
 * Visual snapshot tests for:
 *   - /settings/verification  (Confirmation Mode toggle + Security Analyzer)
 *   - /settings/condenser     (Schema-driven condenser form)
 *
 * The verification page is now fully schema-driven (no hand-written header
 * for the confirmation-mode toggle), and `confirmation_mode` is a
 * `prominence: "major"` field so it lives in the Advanced/All views, not
 * Basic. Each verification test therefore switches to the "All" view
 * before snapshotting so both the critic-related and confirmation-mode
 * controls are on screen.
 *
 * MSW provides the default settings (confirmation_mode: false) so the first
 * verification snapshot shows the toggle in the OFF position with a dimmed
 * Save Changes button. Toggling it ON reveals the Security Analyzer dropdown
 * and enables Save Changes — captured in the second snapshot.
 *
 * There is no separate "dirty" snapshot for confirmation mode because clicking
 * the toggle IS the dirty action — the "ON" snapshot already captures the
 * dirty/enabled-Save-Changes state.
 */

async function dismissConsentModal(page: Page) {
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

async function setupMocks(page: Page) {
  await seedLocalStorage(page);
}

test.describe("Settings – Verification & Condenser Visual Snapshots", () => {
  test.setTimeout(60_000);

  /**
   * Helper: wait for the schema-driven verification page to be ready, then
   * switch to the "All" view so `confirmation_mode` (a `major`-prominence
   * field) is rendered alongside the `critic_enabled` toggle.
   *
   * Readiness signal: the "Enable Critic" label is the first critical-
   * prominence field and is always visible once the schema is loaded,
   * regardless of view. The underlying checkbox is `hidden` in the DOM
   * (styled toggle pattern), so we assert on the label text instead.
   */
  async function waitForVerificationPage(page: Page) {
    await expect(
      page.getByTestId("sdk-settings-verification.critic_enabled"),
    ).toBeAttached({
      timeout: 10_000,
    });
    await page.getByTestId("sdk-section-all-toggle").click();
    // The visible label is "Confirmation Mode" — the schema's raw "Confirmation
    // mode" goes through the i18n translation table (SCHEMA$CONFIRMATION_MODE$LABEL).
    await expect(page.getByText("Confirmation Mode")).toBeVisible({
      timeout: 5_000,
    });
  }

  async function ensureCriticEnabled(page: Page) {
    const apiKeyInput = page.getByTestId(
      "sdk-settings-verification.critic_api_key",
    );
    if (!(await apiKeyInput.isVisible())) {
      await page
        .locator(
          `label:has([data-testid="sdk-settings-verification.critic_enabled"])`,
        )
        .click();
    }
    await expect(apiKeyInput).toBeVisible({ timeout: 5_000 });
  }

  test("verification settings with confirmation mode OFF (default)", async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto("/settings/verification");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    await waitForVerificationPage(page);

    // Security Analyzer combobox must NOT be present when confirmation_mode
    // is off (it depends_on the toggle). HeroUI Autocomplete does not
    // forward data-testid, so match by accessible role + label (case
    // insensitive since the schema label is "Security analyzer").
    await expect(
      page.getByRole("combobox", { name: /security analyzer/i }),
    ).toHaveCount(0);

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("verification-settings-off.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("verification settings with critic enabled shows API key guidance", async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto("/settings/verification");
    await dismissConsentModal(page);
    await waitForVerificationPage(page);

    await ensureCriticEnabled(page);
    await expect(
      page.getByText(
        /Critic API Key is the same as your OpenHands Provider LLM Key/i,
      ),
    ).toBeVisible();

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot(
      "verification-settings-critic-enabled.png",
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

    // The schema-rendered SettingsSwitch's underlying <input type="checkbox">
    // is `hidden`; clicking the visible label that wraps it activates the
    // form control through standard HTML label–control association. The
    // testId now comes from SchemaField's `sdk-settings-${field.key}` scheme.
    await page
      .locator(`label:has([data-testid="sdk-settings-confirmation_mode"])`)
      .click();

    // Security Analyzer dropdown should now appear.
    await expect(
      page.getByRole("combobox", { name: /security analyzer/i }),
    ).toBeVisible({ timeout: 5_000 });

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("verification-settings-on.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("condenser settings page renders schema form", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/settings/condenser");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    // The wrapper div with data-testid should be present once the form renders
    await expect(page.getByTestId("condenser-settings-screen")).toBeAttached({
      timeout: 5_000,
    });
    await expect(
      page.getByText(/Enable (default condenser|Memory Condensation)/i),
    ).toBeVisible({ timeout: 15_000 });

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("condenser-settings.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });
});
