import { expect, type Page, test } from "@playwright/test";

const BACKEND_URL =
  process.env.LIVE_E2E_BACKEND_URL ?? "http://127.0.0.1:18000";
const LIVE_LLM_API_KEY = process.env.LIVE_E2E_LLM_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PROXY_LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_API_KEY =
  LIVE_LLM_API_KEY ??
  OPENAI_API_KEY ??
  ANTHROPIC_API_KEY ??
  PROXY_LLM_API_KEY ??
  "";
const USES_PROXY_KEY = Boolean(
  LIVE_LLM_API_KEY ||
  (!OPENAI_API_KEY && !ANTHROPIC_API_KEY && PROXY_LLM_API_KEY),
);
const LLM_BASE_URL =
  process.env.LIVE_E2E_LLM_BASE_URL ??
  (USES_PROXY_KEY ? "https://llm-proxy.app.all-hands.dev" : "");
const LLM_MODEL =
  process.env.LIVE_E2E_LLM_MODEL ??
  (LLM_BASE_URL
    ? "litellm_proxy/claude-haiku-4-5-20251001"
    : OPENAI_API_KEY
      ? "openai/gpt-4o-mini"
      : "anthropic/claude-haiku-4-5-20251001");
const EXPECTED_REPLY_TOKEN = "LIVE_AGENT_CANVAS_E2E_OK";

async function dismissAnalyticsModal(page: Page) {
  await page.waitForLoadState("domcontentloaded");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const clicked = await page.evaluate(() => {
      const confirmButton = Array.from(
        document.querySelectorAll("button"),
      ).find((button) => button.textContent?.trim() === "Confirm preferences");
      if (!(confirmButton instanceof HTMLButtonElement)) {
        return false;
      }
      confirmButton.click();
      return true;
    });

    if (clicked) {
      await expect
        .poll(
          async () =>
            page.evaluate(
              () =>
                !Array.from(document.querySelectorAll('[role="dialog"]')).some(
                  (dialog) =>
                    dialog.textContent?.includes("Help improve OpenHands"),
                ),
            ),
          { timeout: 5_000 },
        )
        .toBe(true);
      return;
    }

    await page.waitForTimeout(500);
  }
}

async function clickButtonByTestIdOrText(
  page: Page,
  testId: string,
  text: string,
) {
  // The dev server can keep navigation pending after the UI has rendered in CI,
  // so check/click the real DOM button without locator navigation auto-waiting.
  await expect
    .poll(
      async () =>
        page.evaluate(
          ({ testId, text }) => {
            const byTestId = document.querySelector(
              `[data-testid="${testId}"]`,
            );
            if (byTestId instanceof HTMLButtonElement) {
              return true;
            }

            return Array.from(document.querySelectorAll("button")).some(
              (button) => button.textContent?.trim() === text,
            );
          },
          { testId, text },
        ),
      { timeout: 60_000 },
    )
    .toBe(true);

  await page.evaluate(
    ({ testId, text }) => {
      const byTestId = document.querySelector(`[data-testid="${testId}"]`);
      const button =
        byTestId instanceof HTMLButtonElement
          ? byTestId
          : Array.from(document.querySelectorAll("button")).find(
              (button) => button.textContent?.trim() === text,
            );
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error(`Button not found: ${text}`);
      }
      button.click();
    },
    { testId, text },
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("analytics-consent", "true");
    window.localStorage.setItem("FEATURE_AUTOMATIONS", "true");
  });
});

test("runs a real Agent Server conversation through the UI", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    !LLM_API_KEY,
    "Set LIVE_E2E_LLM_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or LLM_API_KEY to run live E2E.",
  );

  const llmSettings: Record<string, string | number> = {
    model: LLM_MODEL,
    api_key: LLM_API_KEY,
    max_output_tokens: 1024,
    temperature: 0,
  };
  if (LLM_BASE_URL) {
    llmSettings.base_url = LLM_BASE_URL;
  }

  const settingsResponse = await request.patch(`${BACKEND_URL}/api/settings`, {
    data: {
      agent_settings_diff: {
        llm: llmSettings,
        condenser: {
          enabled: false,
        },
      },
      conversation_settings_diff: {
        confirmation_mode: false,
        max_iterations: 4,
      },
    },
  });
  expect(settingsResponse.ok()).toBeTruthy();

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await dismissAnalyticsModal(page);
  await clickButtonByTestIdOrText(
    page,
    "launch-new-conversation-button",
    "New Conversation",
  );
  await expect(page).toHaveURL(/\/conversations\/.+/);
  await expect(page.getByTestId("app-route")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("interactive-chat-box")).toBeVisible({
    timeout: 60_000,
  });

  await page
    .getByTestId("chat-input")
    .fill(
      [
        `Reply with exactly this token and then finish: ${EXPECTED_REPLY_TOKEN}`,
        "Do not run tools. Do not add any other text.",
      ].join("\n"),
    );
  await page.getByTestId("submit-button").click();

  await expect(page.getByTestId("user-message")).toContainText(
    EXPECTED_REPLY_TOKEN,
    { timeout: 15_000 },
  );
  const reply = page.getByTestId("agent-message").filter({
    hasText: EXPECTED_REPLY_TOKEN,
  });
  const agentError = page.getByText("Error occurred");
  const outcome = await Promise.race([
    reply.waitFor({ state: "visible", timeout: 120_000 }).then(() => "reply"),
    agentError
      .waitFor({ state: "visible", timeout: 120_000 })
      .then(() => "error"),
  ]);

  expect(outcome).toBe("reply");

  const screenshotPath = testInfo.outputPath("live-agent-response.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("live-agent-response", {
    path: screenshotPath,
    contentType: "image/png",
  });
});
