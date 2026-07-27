import test, { expect, type Page } from "@playwright/test";
import {
  advanceOnboardingToLlmStep,
  ONBOARDING_BACKEND_STEP,
  showOnboarding,
  waitForOnboardingStep,
} from "../../support/onboarding-helpers";
import { routeSessionApiKey, SESSION_API_KEY } from "../utils/mock-llm-helpers";

const READY_CLOUD_MODEL = "openhands/mock-ready-cloud-model";
const LOCK_TO_CLOUD_WINDOW_KEY = "__AGENT_CANVAS_LOCK_TO_CLOUD__";

async function seedLockedCloudCookieBackend(page: Page) {
  await page.addInitScript(
    ({ lockToCloudKey }) => {
      (window as unknown as Record<string, unknown>)[lockToCloudKey] =
        window.location.origin;
      window.localStorage.removeItem("openhands-onboarded");
      window.localStorage.removeItem("openhands-backends");
      window.localStorage.removeItem("openhands-active-backend");
      window.localStorage.removeItem("openhands-backend-health");
      window.sessionStorage.removeItem("openhands-active-backend");
      window.localStorage.setItem("analytics-consent", "false");
      window.localStorage.setItem("openhands-telemetry-consent", "denied");
      window.localStorage.setItem("openhands-telemetry-first-use", "true");
    },
    { lockToCloudKey: LOCK_TO_CLOUD_WINDOW_KEY },
  );
}

async function routeReadyCloudProxy(page: Page) {
  await page.route("**/api/cloud-proxy", async (route, request) => {
    if (request.method() !== "POST") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        next_page_id: null,
        current_org_id: "mock-org",
        llm_model: READY_CLOUD_MODEL,
        llm_base_url: "",
        llm_api_key: null,
        llm_api_key_set: true,
        search_api_key_set: false,
        agent: "CodeActAgent",
        language: "en",
        user_consents_to_analytics: false,
        provider_tokens_set: { github: "" },
      }),
    });
  });
}

test.describe.configure({ mode: "serial" });

test.describe("onboarding recent regressions", () => {
  // Regression coverage for PR #1942: a ready Cloud backend already has
  // everything onboarding would collect, so the home page should not show
  // the first-run modal or persist a synthetic completion marker.

  test("skips first-run onboarding for a ready Cloud backend", async ({
    page,
  }) => {
    await seedLockedCloudCookieBackend(page);
    await routeSessionApiKey(page);
    await routeReadyCloudProxy(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByTestId("home-screen"),
      "ready Cloud users should land on the home screen",
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByTestId("onboarding-modal"),
      "ready Cloud users should not see redundant onboarding",
    ).toHaveCount(0);
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.localStorage.getItem("openhands-onboarded"),
          ),
        {
          message:
            "ready Cloud suppression should not fake onboarding completion",
        },
      )
      .toBeNull();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const raw = window.localStorage.getItem("openhands-backends");
            const backends = raw ? JSON.parse(raw) : [];
            return backends.some(
              (backend: { id?: unknown; kind?: unknown }) =>
                backend.id === "locked-cloud" && backend.kind === "cloud",
            );
          }),
        { message: "test should exercise a locked Cloud backend" },
      )
      .toBe(true);
  });

  // Regression coverage for #1085 / PR #1100: errant outside
  // interactions must not permanently mark onboarding complete.

  test("keeps the modal open on backdrop click and Escape", async ({
    page,
  }) => {
    await showOnboarding(page, {
      apiKey: SESSION_API_KEY,
      beforeGoto: () => routeSessionApiKey(page),
    });

    // Exercise the original first-load path before any onboarding step
    // interaction.
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

  test("defaults the LLM setup step to OpenAI GPT-5.5", async ({
    page,
  }) => {
    await showOnboarding(page, {
      apiKey: SESSION_API_KEY,
      beforeGoto: async () => {
        await routeSessionApiKey(page);
        // Intercept GET /api/settings so the LLM form sees a clean
        // base_url, forcing basic view mode regardless of what earlier
        // specs configured. Registered AFTER routeSessionApiKey so
        // Playwright's LIFO matching picks this up first for settings.
        await page.route("**/api/settings", async (route, req) => {
          if (req.method() !== "GET") {
            await route.fallback();
            return;
          }
          const response = await route.fetch();
          const body = await response.json();
          if (body?.agent_settings?.llm) {
            body.agent_settings.llm.base_url = null;
          }
          await route.fulfill({ response, json: body });
        });
      },
    });
    await advanceOnboardingToLlmStep(page);

    const providerInput = page.locator('input[name="llm-provider-input"]');
    const modelInput = page.locator('input[name="llm-model-input"]');

    await expect(
      providerInput,
      "first-run onboarding should default to the OpenAI provider",
    ).toHaveValue("OpenAI", { timeout: 10_000 });
    // The model input displays the model ID without the provider prefix.
    await expect(
      modelInput,
      "first-run onboarding should default to GPT-5.5",
    ).toHaveValue("gpt-5.5", {
      timeout: 10_000,
    });
    await expect(
      page.getByTestId("openhands-account-help"),
      "OpenHands account helper should stay hidden for OpenAI defaults",
    ).toHaveCount(0);
  });
});
