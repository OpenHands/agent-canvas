import { test, expect, Page } from "@playwright/test";

/**
 * Visual snapshot tests for the 4-step onboarding modal.
 *
 * The modal is shown automatically on first visit when the
 * `openhands-onboarded` key is absent from localStorage.
 * It lives on the home route (`routes/home.tsx` → `OnboardingHost`).
 *
 * Steps:
 *   0. Choose agent  — agent cards; OpenHands selected, others "coming soon"
 *   1. Check backend — backend form + connection status banner
 *   2. Setup LLM     — LLM settings form (pre-filled with Anthropic/Claude Opus)
 *   3. Say hello     — pre-filled message input to start a conversation
 *
 * All four slides are mounted at once; inactive slides are translated
 * off-screen and clipped by `overflow: clip`. We wait for the
 * `data-current-step` attribute on the slide rail instead of relying on
 * `toBeVisible()` for the step container elements, which can be unreliable
 * for absolutely-positioned off-screen slides.
 *
 * In MSW mock mode `/server_info` returns HTTP 200 so the backend health
 * probe in step 1 resolves to "connected", enabling the Next button.
 */

test.describe.configure({ mode: "serial" });

async function setupMocks(page: Page) {
  // Intentionally do NOT set openhands-onboarded so the modal appears
  await page.addInitScript(() => {
    window.localStorage.removeItem("openhands-onboarded");
  });
}

async function dismissConsentModal(page: Page) {
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

/**
 * Wait for the slide rail to display the given step index as current.
 * More reliable than checking child visibility since inactive slides remain
 * in the DOM (absolute-positioned, clipped by overflow:clip).
 */
async function waitForStep(page: Page, step: number) {
  await expect(page.getByTestId("onboarding-slide-rail")).toHaveAttribute(
    "data-current-step",
    String(step),
    { timeout: 15_000 },
  );
}

test.describe("Onboarding Modal Visual Snapshots", () => {
  test.setTimeout(60_000);

  test("onboarding step 0 shows agent selection cards", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/conversations");
    await dismissConsentModal(page);

    // Modal appears because openhands-onboarded is absent
    await expect(page.getByTestId("onboarding-modal")).toBeVisible({
      timeout: 10_000,
    });
    await waitForStep(page, 0);

    const modal = page.getByTestId("onboarding-modal");
    await expect(modal).toHaveScreenshot("onboarding-step-0-choose-agent.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("onboarding step 1 shows backend connection form", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/conversations");
    await dismissConsentModal(page);

    await expect(page.getByTestId("onboarding-modal")).toBeVisible({
      timeout: 10_000,
    });
    await waitForStep(page, 0);

    // Advance to step 1
    await page.getByTestId("onboarding-agent-next").click();
    await waitForStep(page, 1);

    // Wait for the backend connection banner to settle.
    // In MSW mode /server_info returns 200, so the health probe should
    // quickly resolve to "connected".
    await expect(page.getByTestId("onboarding-backend-connected")).toBeVisible({
      timeout: 10_000,
    });

    const modal = page.getByTestId("onboarding-modal");
    await expect(modal).toHaveScreenshot(
      "onboarding-step-1-check-backend.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("onboarding step 2 shows LLM settings form", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/conversations");
    await dismissConsentModal(page);

    await expect(page.getByTestId("onboarding-modal")).toBeVisible({
      timeout: 10_000,
    });
    await waitForStep(page, 0);

    // Step 0 → 1
    await page.getByTestId("onboarding-agent-next").click();
    await waitForStep(page, 1);

    // Wait for backend connected banner then advance
    await expect(page.getByTestId("onboarding-backend-connected")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("onboarding-backend-next").click();
    await waitForStep(page, 2);

    // Wait for LLM settings to load (MSW settings + schema endpoints)
    await page.waitForLoadState("networkidle");

    const modal = page.getByTestId("onboarding-modal");
    await expect(modal).toHaveScreenshot("onboarding-step-2-setup-llm.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("onboarding step 3 shows pre-filled message input", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/conversations");
    await dismissConsentModal(page);

    await expect(page.getByTestId("onboarding-modal")).toBeVisible({
      timeout: 10_000,
    });
    await waitForStep(page, 0);

    // Step 0 → 1
    await page.getByTestId("onboarding-agent-next").click();
    await waitForStep(page, 1);

    // Step 1 → 2 (requires backend connected)
    await expect(page.getByTestId("onboarding-backend-connected")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("onboarding-backend-next").click();
    await waitForStep(page, 2);

    // Allow LLM settings to finish loading so the save control is registered
    await page.waitForLoadState("networkidle");

    // Step 2 → 3:
    // If the LLM form is dirty (it is, because ONBOARDING_LLM_OVERRIDES differs
    // from the mock default model), clicking Next will trigger a PATCH settings
    // mutation. MSW handles the PATCH and resolves onSaveSuccess → onNext.
    await page.getByTestId("onboarding-llm-next").click();
    await waitForStep(page, 3);

    // Wait for the say-hello input to be ready
    await expect(page.getByTestId("onboarding-hello-input")).toBeVisible({
      timeout: 10_000,
    });

    const modal = page.getByTestId("onboarding-modal");
    await expect(modal).toHaveScreenshot("onboarding-step-3-say-hello.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });
});
