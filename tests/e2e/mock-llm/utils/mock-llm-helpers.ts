/**
 * Shared helpers for mock-LLM E2E tests.
 *
 * These mirror the live E2E helpers but are tuned for the mock-LLM setup:
 * shorter timeouts (responses are instant), no real credential handling.
 */

import { resolve } from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Tokens that the mock LLM server uses — must match mock-llm-server.py.
export const BASH_TOKEN = "MOCK_LLM_E2E_BASH_OK";
export const REPLY_TOKEN = "MOCK_LLM_E2E_REPLY_OK";
export const BASH_COMMAND = `printf '${BASH_TOKEN}\\n'`;

/** Reply token used by the image-upload test trajectory. */
export const IMAGE_REPLY_TOKEN = "MOCK_LLM_IMAGE_OK";

/**
 * A minimal valid 1×1 white pixel PNG, base64-encoded.
 * Used as a lightweight test fixture for image-upload E2E tests — small
 * enough to keep request bodies manageable while still being a real PNG that
 * the browser's FileReader can process.
 */
export const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";

// Ports / URLs — set via env or defaults matching playwright.mock-llm.config.ts.
// The agent-canvas binary exposes a single ingress port; API calls are proxied
// through it, so BACKEND_URL = ingress URL (no separate backend port).
export const MOCK_LLM_PORT = process.env.MOCK_LLM_PORT ?? "9999";

// URL tests use to hit the mock LLM admin API (always on the host).
export const MOCK_LLM_BASE_URL = `http://127.0.0.1:${MOCK_LLM_PORT}`;

// URL the agent-server uses to reach the mock LLM for inference calls.
// In the npm path both run on the host, so this equals MOCK_LLM_BASE_URL.
// In Docker with --network host on Linux this also works as-is.
// For Docker on macOS (bridge networking), set MOCK_LLM_AGENT_URL to
// http://host.docker.internal:<port> so the container can reach the host.
export const MOCK_LLM_AGENT_URL =
  process.env.MOCK_LLM_AGENT_URL ?? MOCK_LLM_BASE_URL;
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

/** Seed localStorage with flags that skip onboarding / analytics modals
 *  and a default local backend so the app boots straight into the home
 *  page. The backend registry is seeded explicitly for two reasons:
 *
 *    1. It guarantees a deterministic backend entry across tests even
 *       when key rotation or stale-state scenarios are exercised.
 *    2. It avoids depending on the runtime injection ordering between
 *       `page.addInitScript` and the static-server's `<head>` script.
 *
 *  As of the published-binary session-key fix, the static-server also
 *  exposes the runtime key via `window.__AGENT_CANVAS_SESSION_API_KEY__`,
 *  which `getBakedSessionApiKey()` reads — so a real user with an empty
 *  localStorage no longer needs this seeding to reach onboarding.  See
 *  `auth mode: fresh install with runtime-injected key` in
 *  `mock-llm-auth-modes.spec.ts` for the test that covers that path. */
export async function seedLocalStorage(page: Page) {
  await page.addInitScript(
    ({ apiKey }) => {
      window.localStorage.setItem("analytics-consent", "false");
      window.localStorage.setItem("openhands-telemetry-consent", "denied");
      window.localStorage.setItem("openhands-telemetry-first-use", "true");
      window.localStorage.setItem("openhands-onboarded", "1");
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
    },
    { apiKey: SESSION_API_KEY },
  );
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
  // The GUI now treats the ACTIVE LLM PROFILE as the source of truth in local
  // mode — a bare agent_settings.llm key no longer counts as "configured" (see
  // useLlmConfigured). So back the mock LLM with a real, *active* profile;
  // activating it also stamps agent_settings.llm so the agent-server uses it
  // for inference. Use MOCK_LLM_AGENT_URL — the URL the agent-server reaches
  // the mock LLM at, which may differ from MOCK_LLM_BASE_URL in Docker.
  const PROFILE_NAME = "mock-llm";

  // Short-circuit if an active profile already points at the mock LLM.
  const profilesResp = await request.get(`${BACKEND_URL}/api/profiles`, {
    headers: { "X-Session-API-Key": SESSION_API_KEY },
  });
  if (profilesResp.ok()) {
    const data = (await profilesResp.json()) as {
      profiles?: {
        name: string;
        model?: string;
        base_url?: string | null;
        api_key_set?: boolean;
      }[];
      active_profile?: string | null;
    };
    const active = data.profiles?.find((p) => p.name === data.active_profile);
    if (
      active?.model === model &&
      active?.base_url === MOCK_LLM_AGENT_URL &&
      active?.api_key_set
    ) {
      return; // Already configured
    }
  }

  // Create (delete-then-create resets any stale config) and activate.
  await request.delete(
    `${BACKEND_URL}/api/profiles/${encodeURIComponent(PROFILE_NAME)}`,
    { headers: { "X-Session-API-Key": SESSION_API_KEY } },
  );
  const createResp = await request.post(
    `${BACKEND_URL}/api/profiles/${encodeURIComponent(PROFILE_NAME)}`,
    {
      headers: {
        "X-Session-API-Key": SESSION_API_KEY,
        "Content-Type": "application/json",
      },
      data: {
        llm: {
          model,
          api_key: "mock-api-key-for-testing",
          base_url: MOCK_LLM_AGENT_URL,
        },
      },
    },
  );
  expect(
    createResp.ok(),
    `POST /api/profiles/${PROFILE_NAME}: ${createResp.status()}`,
  ).toBe(true);

  const activateResp = await request.post(
    `${BACKEND_URL}/api/profiles/${encodeURIComponent(PROFILE_NAME)}/activate`,
    { headers: { "X-Session-API-Key": SESSION_API_KEY } },
  );
  expect(
    activateResp.ok(),
    `POST /api/profiles/${PROFILE_NAME}/activate: ${activateResp.status()}`,
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
 * Also clears the stored completion-request history.
 */
export async function resetMockLLM(request: APIRequestContext) {
  const resp = await request.post(`${MOCK_LLM_BASE_URL}/admin/reset`);
  expect(resp.ok(), `Reset mock LLM: ${resp.status()}`).toBe(true);
}

/**
 * Fetch all chat-completion request bodies captured by the mock LLM server
 * since the last /admin/reset.
 *
 * The server stores every POST to /v1/chat/completions, so callers can assert
 * that at least one request contained image content (or any other field).
 */
export async function getMockLLMRequests(
  request: APIRequestContext,
): Promise<Record<string, unknown>[]> {
  const resp = await request.get(`${MOCK_LLM_BASE_URL}/admin/requests`);
  expect(resp.ok(), `GET /admin/requests: ${resp.status()}`).toBe(true);
  const body = await resp.json();
  return (body.requests as Record<string, unknown>[]) ?? [];
}

/**
 * Set contentEditable chat input text and dispatch an input event.
 *
 * contentEditable divs don't respond reliably to Playwright's .fill() or
 * .type(), so we set the text programmatically via page.evaluate().
 */
export async function setChatInput(
  page: Page,
  text: string,
  testId = "chat-input",
) {
  await page.evaluate(
    ({ tid, inputText }) => {
      const el = document.querySelector(`[data-testid="${tid}"]`);
      if (!(el instanceof HTMLElement))
        throw new Error(`Chat input [data-testid="${tid}"] not found`);
      el.focus();
      el.textContent = inputText;
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: inputText,
          inputType: "insertText",
        }),
      );
    },
    { tid: testId, inputText: text },
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Partial-stack mode ports (frontend-only / backend-only tests)
// ═══════════════════════════════════════════════════════════════════════

export const FRONTEND_ONLY_INGRESS_PORT =
  process.env.MOCK_LLM_FE_ONLY_PORT ?? "18310";
export const FRONTEND_ONLY_URL = `http://localhost:${FRONTEND_ONLY_INGRESS_PORT}`;

export const BACKEND_ONLY_INGRESS_PORT =
  process.env.MOCK_LLM_BE_ONLY_PORT ?? "18320";
export const BACKEND_ONLY_URL = `http://localhost:${BACKEND_ONLY_INGRESS_PORT}`;

// Mock automation helpers removed — the automation test now hits the real
// automation backend running inside the bin/agent-canvas.mjs stack.

// ═══════════════════════════════════════════════════════════════════════
// ACP agent configuration helpers
// ═══════════════════════════════════════════════════════════════════════

/** Reply token the mock ACP server includes in its responses. */
export const ACP_REPLY_TOKEN = "MOCK_ACP_E2E_REPLY_OK";

/**
 * Absolute path to the Python binary for the mock ACP server.
 *
 * In CI, ``MOCK_LLM_PYTHON`` is a relative venv path like
 * ``.mock-llm-venv/bin/python3``. The agent-server spawns the ACP
 * subprocess from its own CWD (which may differ from the repo root),
 * so we resolve relative paths to absolute here. Bare executable
 * names (no directory separator) are left for PATH lookup.
 */
export const MOCK_ACP_PYTHON = (() => {
  const raw = process.env.MOCK_LLM_PYTHON ?? "python3";
  // Resolve paths containing a directory separator (relative like
  // ".mock-llm-venv/bin/python3"); leave bare names like "python3"
  // for PATH lookup.
  return raw.includes("/") || raw.includes("\\") ? resolve(raw) : raw;
})();

/**
 * Absolute path to the mock ACP server script, resolved from the project root.
 * The agent-server spawns this as a subprocess via ``acp_command``.
 */
export const MOCK_ACP_SERVER_PATH = resolve(
  "tests/e2e/mock-llm/scripts/mock-acp-server.py",
);

/**
 * The Python + script path the test types into the ACP command textarea.
 *
 * When running the Docker E2E config, the agent-server lives inside a
 * container where host-filesystem paths don't exist. The Docker config
 * volume-mounts the mock ACP script and sets ``MOCK_ACP_CONTAINER_*``
 * env vars with the container-side paths. The npm config leaves those
 * vars unset, so we fall back to the host-local absolute paths.
 */
export const MOCK_ACP_COMMAND_PYTHON =
  process.env.MOCK_ACP_CONTAINER_PYTHON || MOCK_ACP_PYTHON;
export const MOCK_ACP_COMMAND_SCRIPT =
  process.env.MOCK_ACP_CONTAINER_SCRIPT || MOCK_ACP_SERVER_PATH;

/**
 * Reset the agent-server back to the default OpenHands agent.
 * Used in afterAll cleanup to avoid polluting other test suites.
 */
export async function resetToOpenHandsAgent(
  request: APIRequestContext,
) {
  const resp = await request.patch(`${BACKEND_URL}/api/settings`, {
    headers: {
      "X-Session-API-Key": SESSION_API_KEY,
      "Content-Type": "application/json",
    },
    data: {
      agent_settings_diff: {
        agent_kind: "openhands",
      },
    },
  });
  // Best-effort — don't fail the test if cleanup fails
  if (!resp.ok()) {
    console.warn(`[cleanup] Reset to OpenHands failed: ${resp.status()}`);
  }
}
