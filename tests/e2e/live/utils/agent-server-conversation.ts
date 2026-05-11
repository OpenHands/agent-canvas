import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const BACKEND_URL =
  process.env.LIVE_E2E_BACKEND_URL ?? "http://127.0.0.1:18000";
export const EXPECTED_REPLY_TOKEN = "LIVE_AGENT_CANVAS_E2E_OK";

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value?.trim()) ?? "";
}

const liveLLMApiKey = process.env.LIVE_E2E_LLM_API_KEY;
const openAIKey = process.env.OPENAI_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const proxyLLMKey = process.env.LLM_API_KEY;
const llmApiKey = firstNonEmpty(
  liveLLMApiKey,
  openAIKey,
  anthropicKey,
  proxyLLMKey,
);
const usesProxyKey = Boolean(
  liveLLMApiKey?.trim() ||
  (!openAIKey?.trim() && !anthropicKey?.trim() && proxyLLMKey?.trim()),
);
const llmBaseUrl =
  process.env.LIVE_E2E_LLM_BASE_URL ??
  (usesProxyKey ? "https://llm-proxy.app.all-hands.dev" : "");
const llmModel =
  process.env.LIVE_E2E_LLM_MODEL ??
  (llmBaseUrl
    ? "openhands/claude-haiku-4-5-20251001"
    : openAIKey?.trim()
      ? "openai/gpt-4o-mini"
      : "anthropic/claude-haiku-4-5-20251001");
const sessionApiKey =
  firstNonEmpty(
    process.env.LIVE_E2E_SESSION_API_KEY,
    process.env.SESSION_API_KEY,
    process.env.OH_SESSION_API_KEYS_0,
    process.env.VITE_SESSION_API_KEY,
  ) || "live-e2e-session-key";

export const hasLiveLLMConfig = Boolean(llmApiKey);
export const missingLiveLLMConfigMessage =
  "Set LIVE_E2E_LLM_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or LLM_API_KEY to run live E2E.";

export async function configureLiveAgentServer(request: APIRequestContext) {
  const llmSettings: Record<string, string | number> = {
    model: llmModel,
    api_key: llmApiKey,
    extended_thinking_budget: 1024,
    max_output_tokens: 2048,
    temperature: 0,
  };
  if (llmBaseUrl) {
    llmSettings.base_url = llmBaseUrl;
  }

  const settingsResponse = await request.patch(`${BACKEND_URL}/api/settings`, {
    headers: {
      "X-Session-API-Key": sessionApiKey,
    },
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
}

export async function enableLiveE2EFlags(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("analytics-consent", "true");
    window.localStorage.setItem("FEATURE_AUTOMATIONS", "true");
  });
}

export async function waitForPath(page: Page, pattern: RegExp) {
  await expect
    .poll(
      async () => page.evaluate(() => window.location.pathname).catch(() => ""),
      { timeout: 60_000 },
    )
    .toMatch(pattern);
}

export async function waitForTestId(
  page: Page,
  testId: string,
  timeout = 60_000,
) {
  await expect
    .poll(
      async () =>
        page
          .evaluate(
            (testId) =>
              document.querySelector(`[data-testid="${testId}"]`) != null,
            testId,
          )
          .catch(() => false),
      { timeout },
    )
    .toBe(true);
}

export async function dismissAnalyticsModal(page: Page) {
  await page.waitForLoadState("domcontentloaded");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const clicked = await page
      .evaluate(() => {
        const confirmButton = Array.from(
          document.querySelectorAll("button"),
        ).find(
          (button) => button.textContent?.trim() === "Confirm preferences",
        );
        if (!(confirmButton instanceof HTMLButtonElement)) {
          return false;
        }
        confirmButton.click();
        return true;
      })
      .catch(() => false);

    if (clicked) {
      await expect
        .poll(
          async () =>
            page
              .evaluate(
                () =>
                  !Array.from(
                    document.querySelectorAll('[role="dialog"]'),
                  ).some((dialog) =>
                    dialog.textContent?.includes("Help improve OpenHands"),
                  ),
              )
              .catch(() => false),
          { timeout: 5_000 },
        )
        .toBe(true);
      return;
    }

    await page.waitForTimeout(500);
  }
}

export async function clickButtonByTestId(page: Page, testId: string) {
  await waitForTestId(page, testId);

  await page.evaluate((testId) => {
    const button = document.querySelector(`[data-testid="${testId}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Button not found: ${testId}`);
    }
    button.click();
  }, testId);
}

export async function clickButtonByTestIdOrText(
  page: Page,
  testId: string,
  text: string,
) {
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

export async function fillChatInput(page: Page, text: string) {
  await waitForTestId(page, "chat-input");

  await page.evaluate((text) => {
    const input = document.querySelector('[data-testid="chat-input"]');
    if (!(input instanceof HTMLElement)) {
      throw new Error("Chat input not found");
    }
    input.focus();
    input.textContent = text;
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: text,
        inputType: "insertText",
      }),
    );
  }, text);
}

export async function waitForTestIdText(
  page: Page,
  testId: string,
  text: string,
  timeout = 60_000,
) {
  await expect
    .poll(
      async () =>
        page
          .evaluate(
            ({ testId, text }) =>
              Array.from(
                document.querySelectorAll(`[data-testid="${testId}"]`),
              ).some((element) => element.textContent?.includes(text)),
            { testId, text },
          )
          .catch(() => false),
      { timeout },
    )
    .toBe(true);
}

export async function waitForAgentReply(page: Page) {
  await expect
    .poll(
      async () =>
        page
          .evaluate((expectedReplyToken) => {
            const hasReply = Array.from(
              document.querySelectorAll('[data-testid="agent-message"]'),
            ).some((element) =>
              element.textContent?.includes(expectedReplyToken),
            );
            if (hasReply) {
              return "reply";
            }
            if (document.body.textContent?.includes("Error occurred")) {
              return "error";
            }
            return "pending";
          }, EXPECTED_REPLY_TOKEN)
          .catch(() => "pending"),
      { timeout: 120_000 },
    )
    .toBe("reply");
}
