/**
 * Mock-LLM E2E tests for authentication modes.
 *
 * Tests two scenarios using the same backend (agent-server) started by the
 * main mock-LLM stack:
 *
 *   1. **Key rotation (non-public):** The stack runs with key A, but
 *      localStorage still holds a stale key B from a previous session.
 *      Verifies that the boot-time sync in `syncBakedSessionApiKey()`
 *      clears the stale key so the app loads and can talk to the backend.
 *
 *   2. **Public-mode auth gate:** A separate static-server instance
 *      serves the same build with `--auth-required` (no baked session
 *      key). Verifies:
 *        - The `ApiKeyEntryScreen` is shown when no key is configured.
 *        - Submitting the correct key lets the app through.
 *        - Submitting a wrong key shows an inline error.
 *
 * @spec BM-002 — Key rotation recovery via syncBakedSessionApiKey
 */

import { test, expect } from "@playwright/test";
import {
  BACKEND_URL,
  SESSION_API_KEY,
  PUBLIC_MODE_URL,
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
} from "./utils/mock-llm-helpers";

test.describe.configure({ mode: "serial" });

// ═══════════════════════════════════════════════════════════════════════
// 1. Key rotation (non-public mode)
// ═══════════════════════════════════════════════════════════════════════

test.describe("auth mode: non-public key rotation", () => {
  test("recovers when localStorage has a stale session API key", async ({
    page,
    request,
  }) => {
    // Seed localStorage with a STALE key (different from the real SESSION_API_KEY
    // that the agent-server was started with). This simulates a user who ran
    // `LOCAL_BACKEND_API_KEY=old-key npm run dev` previously and now restarts
    // with `LOCAL_BACKEND_API_KEY=<new-key> npm run dev`.
    const STALE_KEY = "this-is-a-stale-key-from-previous-session";

    await page.addInitScript(
      ({ staleKey }) => {
        // 1. Seed the legacy agent-server-config with the stale key
        window.localStorage.setItem(
          "openhands-agent-server-config",
          JSON.stringify({
            baseUrl: window.location.origin,
            sessionApiKey: staleKey,
          }),
        );

        // 2. Seed the backend registry with the stale key
        window.localStorage.setItem(
          "openhands-backends",
          JSON.stringify([
            {
              id: "default-local",
              name: "Local",
              host: window.location.origin,
              apiKey: staleKey,
              kind: "local",
            },
          ]),
        );

        // 3. Mark onboarding as done, opt out of analytics
        window.localStorage.setItem("openhands-onboarded", "1");
        window.localStorage.setItem("analytics-consent", "false");
        window.localStorage.setItem("openhands-telemetry-consent", "denied");
        window.localStorage.setItem("openhands-telemetry-first-use", "true");
      },
      { staleKey: STALE_KEY },
    );

    // The baked-in VITE_SESSION_API_KEY (from the stack) should be the
    // CORRECT key. The syncBakedSessionApiKey() function should overwrite
    // the stale localStorage key on boot.
    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    // Verify the app loads — the home chat launcher should be visible.
    // If the stale key wasn't synced, we'd see the "agent server
    // unavailable" screen instead.
    await waitForTestId(page, "home-chat-launcher");

    // Verify the backend is reachable with a direct API call.
    // This confirms the synced key is actually used for API requests.
    const settingsResp = await request.get(`${BACKEND_URL}/api/settings`, {
      headers: { "X-Session-API-Key": SESSION_API_KEY },
    });
    expect(
      settingsResp.ok(),
      `GET /api/settings should succeed but returned ${settingsResp.status()}`,
    ).toBe(true);

    // Verify localStorage was updated: the stale key should have been
    // replaced by the baked key.
    const storedConfig = await page.evaluate(() => {
      const raw = window.localStorage.getItem("openhands-agent-server-config");
      return raw ? JSON.parse(raw) : null;
    });
    expect(storedConfig?.sessionApiKey).not.toBe(STALE_KEY);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Public-mode auth gate
// ═══════════════════════════════════════════════════════════════════════

test.describe("auth mode: public gate", () => {
  // The analytics consent modal overlays the auth screen and intercepts
  // pointer events, so suppress it for every public-mode test.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("analytics-consent", "false");
      window.localStorage.setItem("openhands-telemetry-consent", "denied");
    });
  });

  test("shows the auth screen when no key is configured", async ({ page }) => {
    // Navigate to the public-mode static server (--auth-required, no
    // baked session key). The browser has a clean context (no localStorage)
    // so isAuthRequiredAndMissing() should return true.
    await page.goto(PUBLIC_MODE_URL, { waitUntil: "domcontentloaded" });

    // The ApiKeyEntryScreen should be visible.
    await waitForTestId(page, "api-key-entry-screen");

    // The main app UI should NOT be visible.
    const homeLauncher = page.getByTestId("home-chat-launcher");
    await expect(homeLauncher).not.toBeVisible({ timeout: 2_000 });
  });

  test("rejects an incorrect key with an inline error", async ({ page }) => {
    await page.goto(PUBLIC_MODE_URL, { waitUntil: "domcontentloaded" });
    await waitForTestId(page, "api-key-entry-screen");

    // Focus → fill pattern needed for React controlled inputs (see
    // mock-llm-conversation.spec.ts for the established pattern).
    const nameInput = page.getByTestId("api-key-entry-name");
    await nameInput.click();
    await nameInput.fill("Test Server");

    const keyInput = page.getByTestId("api-key-entry-api-key");
    await keyInput.click();
    await keyInput.fill("wrong-key-12345");

    // Submit
    await page.getByTestId("api-key-entry-submit").click();

    // Should show an error status (not navigate away).
    const statusEl = page.getByTestId("api-key-entry-status");
    await expect(statusEl).toBeVisible({ timeout: 10_000 });
    await expect(statusEl).toHaveClass(/text-red/);
  });

  test("allows access after pasting the correct key", async ({ page }) => {
    await page.goto(PUBLIC_MODE_URL, { waitUntil: "domcontentloaded" });
    await waitForTestId(page, "api-key-entry-screen");

    // Focus → fill pattern needed for React controlled inputs.
    const nameInput = page.getByTestId("api-key-entry-name");
    await nameInput.click();
    await nameInput.fill("Test Server");

    const keyInput = page.getByTestId("api-key-entry-api-key");
    await keyInput.click();
    await keyInput.fill(SESSION_API_KEY);

    // Submit — this validates against GET /api/settings, persists the key,
    // and triggers a page reload.
    await page.getByTestId("api-key-entry-submit").click();

    // After reload, the app should load normally. The onboarding modal
    // may appear (fresh localStorage), so we dismiss it. The key
    // indicator is that we do NOT see the auth screen anymore and the
    // page eventually shows app UI (home launcher or onboarding).
    //
    // Wait for the page to reload and settle.
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });

    // After the reload, the auth screen should NOT reappear.
    // We may see onboarding or the home page — either is acceptable.
    const authScreen = page.getByTestId("api-key-entry-screen");
    await expect(authScreen).not.toBeVisible({ timeout: 10_000 });
  });

  test("re-prompts when the server rotates its key (stale localStorage)", async ({
    page,
  }) => {
    // Simulate the state after a key rotation:
    //   - The user previously authenticated with key A (now stale)
    //   - The server restarted with key B (SESSION_API_KEY)
    //   - localStorage still holds key A
    //
    // On load the app detects auth is required, finds a stored key, so
    // it skips the instant gate (isAuthRequiredAndMissing → false) and
    // proceeds to probe /server_info with the stale key. The agent-server
    // returns 401, isAgentServerAuthError fires, and the auth screen
    // appears — giving the user a chance to paste the new key.
    const STALE_KEY = "rotated-out-old-key-from-previous-deploy";

    // The beforeEach already seeds analytics consent. Layer on the stale
    // backend credentials.
    await page.addInitScript(
      ({ staleKey, host }) => {
        window.localStorage.setItem(
          "openhands-agent-server-config",
          JSON.stringify({ baseUrl: host, sessionApiKey: staleKey }),
        );
        window.localStorage.setItem(
          "openhands-backends",
          JSON.stringify([
            {
              id: "default-local",
              name: "Public Server",
              host,
              apiKey: staleKey,
              kind: "local",
            },
          ]),
        );
      },
      { staleKey: STALE_KEY, host: PUBLIC_MODE_URL },
    );

    await page.goto(PUBLIC_MODE_URL, { waitUntil: "domcontentloaded" });

    // The app tries to probe with the stale key → 401 → auth screen.
    await waitForTestId(page, "api-key-entry-screen");

    // Enter the new (correct) key.
    const nameInput = page.getByTestId("api-key-entry-name");
    await nameInput.click();
    await nameInput.fill("Rotated Server");

    const keyInput = page.getByTestId("api-key-entry-api-key");
    await keyInput.click();
    await keyInput.fill(SESSION_API_KEY);

    await page.getByTestId("api-key-entry-submit").click();

    // After submitting the correct key, the page reloads and the auth
    // screen should not reappear.
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });
    const authScreen = page.getByTestId("api-key-entry-screen");
    await expect(authScreen).not.toBeVisible({ timeout: 10_000 });
  });
});
