/**
 * Shared helpers for mock-LLM E2E tests.
 *
 * These mirror the live E2E helpers but are tuned for the mock-LLM setup:
 * shorter timeouts (responses are instant), no real credential handling.
 */

import {
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

// Tokens that the mock LLM server uses — must match mock-llm-server.py.
export const BASH_TOKEN = "MOCK_LLM_E2E_BASH_OK";
export const REPLY_TOKEN = "MOCK_LLM_E2E_REPLY_OK";
export const BASH_COMMAND = `printf '${BASH_TOKEN}\\n'`;

// Ports / URLs — set via env or defaults matching playwright.mock-llm.config.ts.
export const MOCK_LLM_PORT =
  process.env.MOCK_LLM_PORT ?? "9999";
export const MOCK_LLM_BASE_URL = `http://127.0.0.1:${MOCK_LLM_PORT}`;
export const BACKEND_URL =
  process.env.MOCK_LLM_BACKEND_URL ?? "http://127.0.0.1:18200";
export const SESSION_API_KEY = (() => {
  const key =
    process.env.MOCK_LLM_SESSION_API_KEY ??
    process.env.LIVE_E2E_SESSION_API_KEY ??
    process.env.SESSION_API_KEY ??
    process.env.VITE_SESSION_API_KEY ??
    "";
  if (!key) throw new Error("Session API key is required for mock-LLM E2E.");
  return key;
})();

/** Seed localStorage with flags that skip onboarding / analytics modals. */
export async function seedLocalStorage(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("analytics-consent", "false");
    window.localStorage.setItem("openhands-telemetry-consent", "denied");
    window.localStorage.setItem("openhands-telemetry-first-use", "true");
    window.localStorage.setItem("openhands-onboarded", "1");
  });
}

/** Inject session API key header into requests targeting the backend. */
export async function routeSessionApiKey(page: Page) {
  const origin = new URL(BACKEND_URL).origin;
  const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page.route(new RegExp(`^${escaped}(?:/|$)`), async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        "X-Session-API-Key": SESSION_API_KEY,
      },
    });
  });
}

/** Wait until the URL matches a pattern. */
export async function waitForPath(
  page: Page,
  pattern: RegExp,
  timeout = 30_000,
) {
  await expect
    .poll(
      () => page.evaluate(() => window.location.pathname).catch(() => ""),
      { timeout },
    )
    .toMatch(pattern);
}

/** Wait for a data-testid element to exist in the DOM. */
export async function waitForTestId(
  page: Page,
  testId: string,
  timeout = 30_000,
) {
  await expect(page.getByTestId(testId)).toBeVisible({ timeout });
}

/** Dismiss the analytics consent modal if it appears. */
export async function dismissAnalyticsModal(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  // Quick check — if the modal is there, click "Confirm preferences"
  try {
    const confirmButton = page.getByRole("button", {
      name: "Confirm preferences",
    });
    await confirmButton.click({ timeout: 3_000 });
  } catch {
    // Modal didn't appear — that's fine
  }
}

/** Extract conversation ID from the current URL. Throws if not on a conversation page. */
export function getConversationIdFromURL(page: Page): string {
  const match = page.url().match(/\/conversations\/([^/?#]+)/);
  expect(match?.[1], `No conversation ID in ${page.url()}`).toBeTruthy();
  return decodeURIComponent(match![1]);
}

/**
 * Wait for text to appear in the chat, but only inside agent/environment output.
 *
 * ChatMessage renders `data-testid="${type}-message"` where type is one of
 * "user" | "agent" | "environment" | "hook". We strip user-message elements
 * and search the rest, so tokens that only exist in the user's own prompt
 * never cause a false positive.
 *
 * The check also scans `[data-testid="model-messages"]` (the wrapper for
 * agent model output) and `[data-testid="event-group"]` (collapsed action
 * groups) to catch output rendered through non-ChatMessage paths.
 */
export async function waitForNonUserMessageText(
  page: Page,
  text: string,
  timeout = 30_000,
) {
  await expect
    .poll(
      () =>
        page
          .evaluate((searchText) => {
            // Strategy: check specific agent-output containers rather than
            // cloning the whole body. This avoids false positives from user
            // input, sidebar text, nav elements, etc.
            const selectors = [
              '[data-testid="agent-message"]',
              '[data-testid="environment-message"]',
              '[data-testid="model-messages"]',
              '[data-testid="event-group"]',
            ];
            for (const sel of selectors) {
              const elements = document.querySelectorAll(sel);
              for (const el of elements) {
                if (el.textContent?.includes(searchText)) return true;
              }
            }
            return false;
          }, text)
          .catch(() => false),
      { timeout },
    )
    .toBe(true);
}

/** Poll the events API for a successful bash observation containing BASH_TOKEN. */
export async function waitForSuccessfulBashObservation(
  request: APIRequestContext,
  conversationId: string,
  timeout = 30_000,
) {
  let lastDiag = "no polls yet";
  await expect
    .poll(
      async () => {
        const resp = await request.get(
          `${BACKEND_URL}/api/conversations/${encodeURIComponent(conversationId)}/events/search`,
          {
            headers: { "X-Session-API-Key": SESSION_API_KEY },
            params: { limit: "100", sort_order: "TIMESTAMP_DESC" },
          },
        );
        if (!resp.ok()) {
          lastDiag = `events API returned ${resp.status()}`;
          return false;
        }
        const body = (await resp.json()) as { items?: unknown[] };
        const items = body.items ?? [];

        // Dump full structure of first 3 events so we can see the real format
        lastDiag = `${items.length} events`;
        for (let i = 0; i < Math.min(items.length, 3); i++) {
          lastDiag += `\nevent[${i}]: ${JSON.stringify(items[i], null, 2).slice(0, 800)}`;
        }

        return items.some(isSuccessfulBashObservation);
      },
      { timeout },
    )
    .toBe(true)
    // Playwright prints this on assertion failure:
    .catch((err) => {
      throw new Error(
        `No successful bash observation after ${timeout}ms.\n${lastDiag}`,
        { cause: err },
      );
    });
}

function isSuccessfulBashObservation(event: unknown): boolean {
  if (!event || typeof event !== "object") return false;
  const obs = (event as { observation?: Record<string, unknown> }).observation;
  if (!obs) return false;
  const kind = obs.kind;
  if (kind !== "ExecuteBashObservation" && kind !== "TerminalObservation")
    return false;
  const command = typeof obs.command === "string" ? obs.command : "";
  const content = (obs.content as Array<{ text?: string }>) ?? [];
  const output = content.map((c) => c.text ?? "").join("\n");
  return (
    command.includes(BASH_TOKEN) &&
    output.includes(BASH_TOKEN) &&
    obs.exit_code === 0 &&
    !obs.error &&
    !obs.is_error &&
    !obs.timeout
  );
}

/** Delete a conversation via the API. */
export async function deleteConversation(
  request: APIRequestContext,
  conversationId: string,
) {
  const resp = await request.delete(
    `${BACKEND_URL}/api/conversations/${encodeURIComponent(conversationId)}`,
    { headers: { "X-Session-API-Key": SESSION_API_KEY } },
  );
  if (!resp.ok() && resp.status() !== 404) {
    throw new Error(
      `Failed to delete conversation ${conversationId}: ${resp.status()}`,
    );
  }
}
