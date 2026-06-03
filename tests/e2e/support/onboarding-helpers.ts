import { expect, type Page } from "@playwright/test";

export const ONBOARDING_BACKEND_STEP = 0;
export const ONBOARDING_AGENT_STEP = 1;
export const ONBOARDING_LLM_STEP = 2;
export const ONBOARDING_HELLO_STEP = 3;

export async function routeOnboardingLlmCatalog(page: Page) {
  await page.route("**/api/llm/models/verified", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        models: {
          anthropic: ["claude-opus-4-8"],
          openhands: ["claude-opus-4-5-20251101"],
        },
      }),
    });
  });

  await page.route("**/api/llm/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        models: [
          "anthropic/claude-opus-4-8",
          "openhands/claude-opus-4-5-20251101",
        ],
      }),
    });
  });

  await page.route("**/api/llm/providers", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ providers: ["anthropic", "openhands"] }),
    });
  });
}

export async function waitForOnboardingStep(page: Page, step: number) {
  await expect(
    page.getByTestId("onboarding-slide-rail"),
    `onboarding slide rail should show step ${step}`,
  ).toHaveAttribute("data-current-step", String(step), { timeout: 15_000 });
}

export async function waitForOnboardingBackendConnected(page: Page) {
  // The mock suites route the backend health probe to deterministic local/MSW
  // responses. Wait for the connected banner before advancing so the Next
  // button is enabled without relying on a fixed sleep.
  await expect(
    page.getByTestId("onboarding-backend-connected"),
    "onboarding backend health probe should report connected",
  ).toBeVisible({ timeout: 10_000 });
}

export async function clickOnboardingStepButton(page: Page, testId: string) {
  // Snapshot slides are translated and clipped during transitions. In CI,
  // Playwright can resolve the button as visible but outside the viewport.
  await page.getByTestId(testId).dispatchEvent("click");
}

export async function advanceOnboardingToLlmStep(page: Page) {
  await waitForOnboardingStep(page, ONBOARDING_BACKEND_STEP);
  await waitForOnboardingBackendConnected(page);
  await clickOnboardingStepButton(page, "onboarding-backend-next");

  await waitForOnboardingStep(page, ONBOARDING_AGENT_STEP);
  await clickOnboardingStepButton(page, "onboarding-agent-next");

  await waitForOnboardingStep(page, ONBOARDING_LLM_STEP);
  await expect(
    page.getByTestId("onboarding-step-setup-llm"),
    "onboarding LLM setup step should be visible after advancing",
  ).toBeVisible({ timeout: 10_000 });
}
