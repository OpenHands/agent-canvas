import { test, expect, Page } from "@playwright/test";
import {
  clickOnboardingStepButton,
  ONBOARDING_AGENT_STEP,
  ONBOARDING_BACKEND_STEP,
  ONBOARDING_HELLO_STEP,
  ONBOARDING_LLM_STEP,
  waitForOnboardingBackendConnected,
  waitForOnboardingStep,
} from "../support/onboarding-helpers";
import { seedLocalStorage } from "./support/seed-local-storage";

/**
 * Visual snapshot tests for the 4-step onboarding modal.
 *
 * The modal is shown automatically on first visit when the
 * `openhands-onboarded` key is absent from localStorage.
 * It lives on the home route (`routes/home.tsx` → `OnboardingHost`).
 *
 * Steps:
 *   0. Check backend — backend form + connection status banner
 *   1. Choose agent  — static agent cards; mock mode renders deterministic ACP options
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
 * probe in step 0 resolves to "connected", enabling the Next button.
 */

test.describe.configure({ mode: "serial" });

async function setupMocks(page: Page) {
  // removeOnboarded: true ensures the onboarding modal appears.
  // Analytics consent modal is suppressed (separate concern).
  await seedLocalStorage(page, { removeOnboarded: true });
}

async function dismissConsentModal(page: Page) {
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

test.describe("Onboarding Modal Visual Snapshots", () => {
  test.setTimeout(60_000);

  test("onboarding step 0 shows backend connection form", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/");
    await dismissConsentModal(page);

    // Modal appears because openhands-onboarded is absent
    await expect(page.getByTestId("onboarding-modal")).toBeVisible({
      timeout: 10_000,
    });
    await waitForOnboardingStep(page, ONBOARDING_BACKEND_STEP);

    // Wait for the backend connection banner to settle.
    // In MSW mode /server_info returns 200, so the health probe should
    // quickly resolve to "connected".
    await waitForOnboardingBackendConnected(page);

    const modal = page.getByTestId("onboarding-modal");
    await expect(modal).toHaveScreenshot(
      "onboarding-step-0-check-backend.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("onboarding step 1 shows agent selection cards", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/");
    await dismissConsentModal(page);

    await expect(page.getByTestId("onboarding-modal")).toBeVisible({
      timeout: 10_000,
    });
    await waitForOnboardingStep(page, ONBOARDING_BACKEND_STEP);

    await waitForOnboardingBackendConnected(page);
    await clickOnboardingStepButton(page, "onboarding-backend-next");
    await waitForOnboardingStep(page, ONBOARDING_AGENT_STEP);

    const modal = page.getByTestId("onboarding-modal");
    await expect(modal).toHaveScreenshot("onboarding-step-1-choose-agent.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("onboarding step 2 shows LLM settings form", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/");
    await dismissConsentModal(page);

    await expect(page.getByTestId("onboarding-modal")).toBeVisible({
      timeout: 10_000,
    });
    await waitForOnboardingStep(page, ONBOARDING_BACKEND_STEP);

    // Step 0 → 1
    await waitForOnboardingBackendConnected(page);
    await clickOnboardingStepButton(page, "onboarding-backend-next");
    await waitForOnboardingStep(page, ONBOARDING_AGENT_STEP);

    // Step 1 → 2
    await clickOnboardingStepButton(page, "onboarding-agent-next");
    await waitForOnboardingStep(page, ONBOARDING_LLM_STEP);

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
    await page.goto("/");
    await dismissConsentModal(page);

    await expect(page.getByTestId("onboarding-modal")).toBeVisible({
      timeout: 10_000,
    });
    await waitForOnboardingStep(page, ONBOARDING_BACKEND_STEP);

    // Step 0 → 1 (requires backend connected)
    await waitForOnboardingBackendConnected(page);
    await clickOnboardingStepButton(page, "onboarding-backend-next");
    await waitForOnboardingStep(page, ONBOARDING_AGENT_STEP);

    // Step 1 → 2
    await clickOnboardingStepButton(page, "onboarding-agent-next");
    await waitForOnboardingStep(page, ONBOARDING_LLM_STEP);

    // Allow LLM settings to finish loading so the save control is registered
    await page.waitForLoadState("networkidle");

    // Step 2 → 3:
    // If the LLM form is dirty (it is, because ONBOARDING_LLM_OVERRIDES differs
    // from the mock default model), clicking Next will trigger a PATCH settings
    // mutation. MSW handles the PATCH and resolves onSaveSuccess → onNext.
    await clickOnboardingStepButton(page, "onboarding-llm-next");
    await waitForOnboardingStep(page, ONBOARDING_HELLO_STEP);

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
