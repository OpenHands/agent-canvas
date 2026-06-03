import test, { expect, Page } from "@playwright/test";
import { routeSessionApiKey, SESSION_API_KEY } from "./utils/mock-llm-helpers";

test.describe.configure({ mode: "serial" });
async function routeOnboardingLlmCatalog(page: Page) {
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

async function waitForStep(page: Page, step: number) {
  await expect(page.getByTestId("onboarding-slide-rail")).toHaveAttribute(
    "data-current-step",
    String(step),
    { timeout: 15_000 },
  );
}

async function advanceToLlmStep(page: Page) {
  // Current onboarding order is backend check (0) → agent choice (1) →
  // LLM/provider setup (2). Keep the indexes explicit because this flow was
  // recently reordered and the E2E test should fail clearly if it drifts.

  await waitForStep(page, 0);
  await expect(page.getByTestId("onboarding-backend-connected")).toBeVisible({
    timeout: 10_000,
  });
  await page.getByTestId("onboarding-backend-next").click();

  await waitForStep(page, 1);
  await page.getByTestId("onboarding-agent-next").click();

  await waitForStep(page, 2);
  await expect(page.getByTestId("onboarding-step-setup-llm")).toBeVisible({
    timeout: 10_000,
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

    await expect(page.getByTestId("onboarding-modal")).toBeVisible();
    await expect(page.getByTestId("onboarding-slide-rail")).toHaveAttribute(
      "data-current-step",
      "0",
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem("openhands-onboarded")),
      )
      .toBeNull();

    await page.getByTestId("onboarding-skip").click();
    await expect(page.getByTestId("onboarding-modal")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem("openhands-onboarded")),
      )
      .toBe("1");
  });

  // Regression coverage for #1077 / PR #1089: first-run LLM setup
  // should not default users to the OpenHands provider.

  test("defaults the LLM setup step to Anthropic Claude Opus", async ({
    page,
  }) => {
    await showOnboarding(page);
    await advanceToLlmStep(page);

    const providerInput = page.locator('input[name="llm-provider-input"]');
    const modelInput = page.locator('input[name="llm-model-input"]');

    await expect(providerInput).toHaveValue("Anthropic", { timeout: 10_000 });
    await expect(modelInput).toHaveValue("claude-opus-4-8", {
      timeout: 10_000,
    });
    await expect(page.getByTestId("openhands-account-help")).toHaveCount(0);
  });
});
