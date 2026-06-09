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
  // The analytics consent modal is lazy-loaded via React.Suspense and may
  // appear several seconds after DOM-content-loaded.  Wait for the form's
  // test ID (more specific than the generic ModalBackdrop) or give up after
  // a generous window so tests that have already dismissed the modal don't
  // stall.  Also dismiss any other ModalBackdrop dialog that may block
  // pointer events (e.g. the delete-profile confirmation left by a prior
  // test).
  try {
    const form = page.getByTestId("user-capture-consent-form");
    await form.waitFor({ state: "visible", timeout: 5_000 });
    await form.getByRole("button", { name: "Confirm preferences" }).click();
    // Wait for the modal to fully close so the backdrop no longer
    // intercepts pointer events.
    await form.waitFor({ state: "hidden", timeout: 5_000 });
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
// LLM profile setup via the Settings UI
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create (or overwrite) an LLM profile and activate it through the Settings
 * UI — the same flow a real user follows.
 *
 * Exercises the full frontend save path (including `include_secrets`) so the
 * api_key is persisted correctly.
 */
export async function ensureMockLLMProfile(
  page: Page,
  {
    profileName = "mock-llm",
    model = "openai/mock-test-model",
    apiKey = "mock-api-key-for-testing",
    baseUrl = MOCK_LLM_AGENT_URL,
  }: {
    profileName?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  } = {},
) {
  await routeSessionApiKey(page);
  await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
  await dismissAnalyticsModal(page);
  await waitForTestId(page, "add-llm-profile");

  // If a profile with this name already exists, delete it first so we
  // always start clean (other tests may have left stale config).
  await deleteProfileIfExists(page, profileName);

  // ── Create the profile ──────────────────────────────────────────────
  await createProfileViaUI(page, { profileName, model, apiKey, baseUrl });

  // ── Activate the profile ────────────────────────────────────────────
  await activateProfileViaUI(page, profileName);
}

/**
 * Create a new LLM profile through the Settings UI.
 *
 * Assumes the page is already on /settings/llm with profiles loaded
 * (the "add-llm-profile" button is visible).  Does NOT activate the
 * profile — call `activateProfileViaUI` separately if needed.
 */
export async function createProfileViaUI(
  page: Page,
  {
    profileName,
    model,
    apiKey = "mock-api-key-for-testing",
    baseUrl = MOCK_LLM_AGENT_URL,
  }: {
    profileName: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
  },
) {
  await page.getByTestId("add-llm-profile").click();
  await waitForTestId(page, "profile-editor-title");

  const nameInput = page.getByTestId("profile-name-input");
  await nameInput.click();
  await nameInput.fill(profileName);

  // Switch to "All" view so base_url is visible
  await page.getByTestId("sdk-section-all-toggle").click();
  await waitForTestId(page, "llm-settings-form-advanced");

  const modelInput = page.getByTestId("llm-custom-model-input");
  await modelInput.click();
  await modelInput.fill(model);

  const baseUrlInput = page.getByTestId("base-url-input");
  await baseUrlInput.click();
  await baseUrlInput.fill(baseUrl);

  const apiKeyInput = page.getByTestId("llm-api-key-input");
  await apiKeyInput.click();
  await apiKeyInput.fill(apiKey);

  await page.getByTestId("save-profile-btn").click();
  await waitForTestId(page, "add-llm-profile");
}

/**
 * Delete a profile by name through the Settings UI if it exists.
 * Assumes the page is already on /settings/llm with profiles loaded.
 */
export async function deleteProfileIfExists(page: Page, profileName: string) {
  // Use the profile name span's `title` attribute for exact matching
  // to avoid substring collisions (e.g. "mock-llm" vs "mock-llm-e2e").
  const row = page
    .getByTestId("profile-row")
    .filter({ has: page.locator(`span[title="${profileName}"]`) })
    .first();
  if ((await row.count()) === 0) return;

  await row.getByTestId("profile-menu-trigger").click();
  await waitForTestId(page, "profile-actions-menu");
  const deleteBtn = page.getByTestId("profile-delete");
  if (await deleteBtn.isVisible()) {
    await deleteBtn.click();
    // Confirm the deletion dialog (test ID: delete-profile-confirm)
    const confirmBtn = page.getByTestId("delete-profile-confirm");
    await confirmBtn.waitFor({ state: "visible", timeout: 5_000 });
    await confirmBtn.click();
    await waitForTestId(page, "add-llm-profile");
  } else {
    await page.keyboard.press("Escape");
  }
}

/**
 * Activate a profile by name through the Settings UI.
 * Assumes the page is already on /settings/llm with profiles loaded.
 * Polls until the "Active" badge is visible on the target profile row.
 */
export async function activateProfileViaUI(page: Page, profileName: string) {
  const exactRow = (p: Page) =>
    p
      .getByTestId("profile-row")
      .filter({ has: p.locator(`span[title="${profileName}"]`) })
      .first();

  const row = exactRow(page);
  if ((await row.count()) > 0) {
    await row.getByTestId("profile-menu-trigger").click();
    await waitForTestId(page, "profile-actions-menu");
    const setActive = page.getByTestId("profile-set-active");
    if (await setActive.isEnabled()) {
      await setActive.click();
    } else {
      // Already active
      await page.keyboard.press("Escape");
    }
  }

  // Poll until the active badge appears on our profile
  await expect
    .poll(
      async () => {
        await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
        await waitForTestId(page, "add-llm-profile");
        const target = exactRow(page);
        if ((await target.count()) === 0) return false;
        return (await target.getByTestId("profile-active-badge").count()) > 0;
      },
      {
        message: `Profile "${profileName}" should have an "Active" badge`,
        timeout: 15_000,
        intervals: [1_000, 2_000, 3_000],
      },
    )
    .toBe(true);
}

/**
 * Select an option from a HeroUI Autocomplete dropdown (SettingsDropdownInput).
 *
 * HeroUI Autocomplete does NOT forward `data-testid` to the underlying
 * `<input>`, so we locate the combobox by its `aria-label` (which the
 * component sets to the label prop or the name prop). We then click to
 * open the listbox and click the matching option.
 */
export async function selectDropdownOption(
  page: Page,
  comboboxLabel: string | RegExp,
  optionText: string | RegExp,
) {
  const combobox = page.getByRole("combobox", { name: comboboxLabel });
  await expect(combobox).toBeVisible({ timeout: 10_000 });
  await combobox.click();
  await combobox.fill("");
  const option = page.getByRole("option", { name: optionText });
  await expect(option).toBeVisible({ timeout: 5_000 });
  await option.click();
}

/**
 * Reset agent type back to OpenHands through the Settings → Agent UI.
 * Used in afterAll cleanup to restore the default agent for subsequent tests.
 */
export async function resetToOpenHandsAgentViaUI(page: Page) {
  await routeSessionApiKey(page);
  await page.goto("/settings/agent", { waitUntil: "domcontentloaded" });
  await dismissAnalyticsModal(page);
  await waitForTestId(page, "agent-settings-screen");

  await selectDropdownOption(page, /Agent/, /OpenHands/);

  const saveBtn = page.getByTestId("agent-save-button");
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
  await saveBtn.click();
  await expect(saveBtn).toBeDisabled({ timeout: 10_000 });
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
 * @deprecated Use `resetToOpenHandsAgentViaUI(page)` to exercise the UI path.
 * Kept only for callers that cannot open a page (should not exist in new tests).
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
  if (!resp.ok()) {
    console.warn(`[cleanup] Reset to OpenHands failed: ${resp.status()}`);
  }
}
