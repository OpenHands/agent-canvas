import test, { expect, Page } from "@playwright/test";
import {
  advanceOnboardingToLlmStep,
  ONBOARDING_BACKEND_STEP,
  routeOnboardingLlmCatalog,
  waitForOnboardingStep,
} from "../support/onboarding-helpers";
import { routeSessionApiKey, SESSION_API_KEY } from "./utils/mock-llm-helpers";

test.describe.configure({ mode: "serial" });

async function showOnboarding(page: Page) {
  await page.addInitScript(
    ({ apiKey }) => {
      window.localStorage.removeItem("openhands-onboarded");
      window.localStorage.setItem("analytics-consent", "false");
      window.localStorage.setItem("openhands-telemetry-consent", "denied");
      window.localStorage.setItem("openhands-telemetry-first-use", "true");
      window.localStorage.setItem(
        "openhands-backends",
        JSON.stringify([
          {
            id: "default-local",
            name: "Local",
            host: window.location.origin,
            apiKey,
            kind: "local",
          },
        ]),
      );
      window.localStorage.setItem(
        "openhands-active-backend",
        JSON.stringify({ backendId: "default-local", orgId: null }),
      );
    },
    { apiKey: SESSION_API_KEY },
  );

  await routeSessionApiKey(page);
  await routeOnboardingLlmCatalog(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("onboarding-modal")).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("onboarding recent regressions", () => {
  // Regression coverage for #1085 / PR #1100: errant outside
  // interactions must not permanently mark onboarding complete.

  test("keeps the modal open on backdrop click and Escape", async ({
    page,
  }) => {
    await showOnboarding(page);

    await page.mouse.click(8, 8);
    await page.keyboard.press("Escape");

    await expect(
      page.getByTestId("onboarding-modal"),
      "onboarding modal should ignore backdrop clicks and Escape",
    ).toBeVisible();
    await waitForOnboardingStep(page, ONBOARDING_BACKEND_STEP);
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.localStorage.getItem("openhands-onboarded"),
          ),
        {
          message:
            "onboarding should not be marked complete by outside interactions",
        },
      )
      .toBeNull();

    await page.getByTestId("onboarding-skip").click();
    await expect(
      page.getByTestId("onboarding-modal"),
      "skip should close the onboarding modal",
    ).toHaveCount(0);
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.localStorage.getItem("openhands-onboarded"),
          ),
        { message: "skip should persist onboarding completion" },
      )
      .toBe("1");
  });

  // Regression coverage for #1077 / PR #1089: first-run LLM setup
  // should not default users to the OpenHands provider.

  test("defaults the LLM setup step to Anthropic Claude Opus", async ({
    page,
  }) => {
    await showOnboarding(page);
    await advanceOnboardingToLlmStep(page);

    const providerInput = page.locator('input[name="llm-provider-input"]');
    const modelInput = page.locator('input[name="llm-model-input"]');

    await expect(
      providerInput,
      "first-run onboarding should default to the Anthropic provider",
    ).toHaveValue("Anthropic", { timeout: 10_000 });
    await expect(
      modelInput,
      "first-run onboarding should default to Claude Opus",
    ).toHaveValue("claude-opus-4-8", {
      timeout: 10_000,
    });
    await expect(
      page.getByTestId("openhands-account-help"),
      "OpenHands account helper should stay hidden for Anthropic defaults",
    ).toHaveCount(0);
  });
});
