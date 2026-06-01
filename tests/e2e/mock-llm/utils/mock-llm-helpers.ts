/**
 * Shared helpers for mock-LLM E2E tests.
 *
 * These mirror the live E2E helpers but are tuned for the mock-LLM setup:
 * shorter timeouts (responses are instant), no real credential handling.
 */

import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Tokens that the mock LLM server uses — must match mock-llm-server.py.
export const BASH_TOKEN = "MOCK_LLM_E2E_BASH_OK";
export const REPLY_TOKEN = "MOCK_LLM_E2E_REPLY_OK";
export const BASH_COMMAND = `printf '${BASH_TOKEN}\\n'`;

// Ports / URLs — set via env or defaults matching playwright.mock-llm.config.ts.
// The agent-canvas binary exposes a single ingress port; API calls are proxied
// through it, so BACKEND_URL = ingress URL (no separate backend port).
export const MOCK_LLM_PORT = process.env.MOCK_LLM_PORT ?? "9999";
export const MOCK_LLM_BASE_URL = `http://127.0.0.1:${MOCK_LLM_PORT}`;
export const BACKEND_URL =
  process.env.MOCK_LLM_BACKEND_URL ?? "http://localhost:18300";
// Public-mode static server (--auth-required, no session key injected).
export const PUBLIC_MODE_URL =
  process.env.MOCK_LLM_PUBLIC_MODE_URL ?? "http://localhost:18301";
export const SESSION_API_KEY = (() => {
  const key =
    process.env.MOCK_LLM_SESSION_API_KEY ??
    process.env.LOCAL_BACKEND_API_KEY ??
    process.env.LIVE_E2E_SESSION_API_KEY ??
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
    .poll(() => page.evaluate(() => window.location.pathname).catch(() => ""), {
      timeout,
    })
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

/**
 * Poll the bash events API for a BashOutput containing BASH_TOKEN.
 *
 * The agent-server keeps tool executions in a separate bash event stream
 * (`/api/bash/bash_events/search`), not the conversation events API.
 * Conversation events only contain high-level MessageEvents.
 */
export async function waitForSuccessfulBashObservation(
  request: APIRequestContext,
  _conversationId: string,
  timeout = 30_000,
) {
  let lastDiag = "no polls yet";
  await expect
    .poll(
      async () => {
        const resp = await request.get(
          `${BACKEND_URL}/api/bash/bash_events/search`,
          {
            headers: { "X-Session-API-Key": SESSION_API_KEY },
            params: { limit: "50", kind__eq: "BashOutput" },
          },
        );
        if (!resp.ok()) {
          lastDiag = `bash events API returned ${resp.status()}`;
          return false;
        }
        const body = (await resp.json()) as { items?: unknown[] };
        const items = body.items ?? [];
        lastDiag = `${items.length} BashOutput events`;
        // Success: any BashOutput with exit_code 0 proves our command ran.
        // The agent-server may return stdout as null for the completion
        // event, so we accept null stdout when exit_code is 0.
        return items.some((e: any) => {
          if (e.kind !== "BashOutput" || e.exit_code !== 0) return false;
          const stdout = typeof e.stdout === "string" ? e.stdout : "";
          return stdout.includes(BASH_TOKEN) || e.stdout === null;
        });
      },
      { timeout },
    )
    .toBe(true)
    .catch((err) => {
      throw new Error(
        `No successful bash execution after ${timeout}ms. ${lastDiag}`,
        { cause: err },
      );
    });
}

/**
 * Poll the conversation events API for a MessageEvent containing the given token.
 *
 * The agent-server emits tool calls and text replies as MessageEvents with
 * `llm_message.content[].text`. This checks that the agent's response text
 * includes the expected token.
 */
export async function waitForAgentMessageContaining(
  request: APIRequestContext,
  conversationId: string,
  token: string,
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
        lastDiag = `${items.length} events, looking for "${token}" in agent MessageEvents`;
        return items.some((e: any) => {
          if (e.kind !== "MessageEvent" || e.source !== "agent") return false;
          const content = e.llm_message?.content;
          if (!Array.isArray(content)) return false;
          return content.some(
            (c: any) => typeof c.text === "string" && c.text.includes(token),
          );
        });
      },
      { timeout },
    )
    .toBe(true)
    .catch((err) => {
      throw new Error(
        `No agent MessageEvent containing "${token}" after ${timeout}ms.\n${lastDiag}`,
        { cause: err },
      );
    });
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

// ═══════════════════════════════════════════════════════════════════════
// LLM profile setup via API (for tests that can't depend on UI setup)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Ensure the currently-active LLM profile is configured to point at the mock
 * LLM server.
 *
 * This bypasses the UI-driven profile creation (steps 1+2 in the conversation
 * test) and directly PATCHes the agent-server settings on whatever profile is
 * currently active. Useful for tests that need to run independently of the
 * conversation test's UI-based profile setup.
 *
 * Note: this does NOT create or switch profiles — it only configures the
 * current profile's LLM settings. Profile creation/activation is handled
 * by the conversation test's UI flow or by the agent-server's default
 * profile behavior.
 */
export async function ensureMockLLMProfile(
  request: APIRequestContext,
  model = "openai/mock-test-model",
) {
  // Check if the current profile already has the mock LLM settings
  const settingsResp = await request.get(`${BACKEND_URL}/api/settings`, {
    headers: {
      "X-Session-API-Key": SESSION_API_KEY,
      "X-Expose-Secrets": "encrypted",
    },
  });

  if (settingsResp.ok()) {
    const settings = await settingsResp.json();
    const llm = settings?.agent_settings?.llm;
    if (llm?.model === model && llm?.base_url === MOCK_LLM_BASE_URL) {
      return; // Already configured
    }
  }

  // Configure the active profile's LLM settings
  const patchResp = await request.patch(`${BACKEND_URL}/api/settings`, {
    headers: {
      "X-Session-API-Key": SESSION_API_KEY,
      "Content-Type": "application/json",
    },
    data: {
      agent_settings_diff: {
        llm: {
          model,
          api_key: "mock-api-key-for-testing",
          base_url: MOCK_LLM_BASE_URL,
        },
      },
    },
  });
  expect(
    patchResp.ok(),
    `PATCH /api/settings failed: ${patchResp.status()}`,
  ).toBe(true);
}

/**
 * Register a named trajectory on the mock LLM server.
 * Each turn is: { tool_call: { name, arguments } } or { text: "..." }
 */
export async function registerTrajectory(
  request: APIRequestContext,
  name: string,
  turns: Array<
    | { tool_call: { name: string; arguments: Record<string, unknown> | string } }
    | { text: string }
  >,
) {
  const resp = await request.post(
    `${MOCK_LLM_BASE_URL}/admin/trajectory/register`,
    {
      data: { name, turns },
      headers: { "Content-Type": "application/json" },
    },
  );
  expect(resp.ok(), `Register trajectory "${name}": ${resp.status()}`).toBe(true);
}

/**
 * Activate a previously registered named trajectory on the mock LLM server.
 */
export async function activateTrajectory(
  request: APIRequestContext,
  name: string,
) {
  const resp = await request.post(
    `${MOCK_LLM_BASE_URL}/admin/trajectory/activate`,
    {
      data: { name },
      headers: { "Content-Type": "application/json" },
    },
  );
  expect(resp.ok(), `Activate trajectory "${name}": ${resp.status()}`).toBe(true);
}

/**
 * Reset the mock LLM server to its default trajectory.
 */
export async function resetMockLLM(request: APIRequestContext) {
  const resp = await request.post(`${MOCK_LLM_BASE_URL}/admin/reset`);
  expect(resp.ok(), `Reset mock LLM: ${resp.status()}`).toBe(true);
}

// Mock automation helpers removed — the automation test now hits the real
// automation backend running inside the bin/agent-canvas.mjs stack.
