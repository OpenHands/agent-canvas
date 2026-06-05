/**
 * Mock-LLM E2E tests: LLM profile management regressions.
 *
 * Covers three scenarios that previously had no end-to-end guard:
 *
 *   1. Active profile deletion guard (PR #1127):
 *      The "Delete" option must not be available for the active LLM
 *      profile. Deleting the active profile leaves the app in an
 *      inconsistent state — conversations fail with missing settings.
 *      The fix adds a disabled-with-tooltip guard in the UI, which
 *      this test verifies.
 *
 *   2. Same-model profile identity (PR #1123):
 *      When two profiles share the same underlying model, the chat
 *      header must display the correct profile name — the one the
 *      user selected, not the first alphabetical match. The fix
 *      stamps the active profile name on client-side conversation
 *      metadata at creation and on per-conversation switches.
 *
 *   3. Proxy base_url preservation for litellm_proxy profiles (PR #1148):
 *      When the SDK rewrites an `openhands/*` model to `litellm_proxy/*`
 *      with the All-Hands proxy base_url, re-saving the profile from the
 *      Basic tab must not strip the base_url. Without it the profile is
 *      stranded and LiteLLM reroutes requests to the wrong endpoint.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  BACKEND_URL,
  SESSION_API_KEY,
  MOCK_LLM_AGENT_URL,
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
  getConversationIdFromURL,
  waitForNonUserMessageText,
  deleteConversation,
  registerTrajectory,
  activateTrajectory,
  resetMockLLM,
  setChatInput,
  waitForPath,
} from "./utils/mock-llm-helpers";

// ═══════════════════════════════════════════════════════════════════════
// Profile API helpers
// ═══════════════════════════════════════════════════════════════════════

const MOCK_MODEL = "openai/mock-test-model";

async function saveProfile(
  request: APIRequestContext,
  name: string,
  model: string,
  baseUrl: string = MOCK_LLM_AGENT_URL,
) {
  await request.delete(
    `${BACKEND_URL}/api/profiles/${encodeURIComponent(name)}`,
    { headers: { "X-Session-API-Key": SESSION_API_KEY } },
  );
  const resp = await request.post(
    `${BACKEND_URL}/api/profiles/${encodeURIComponent(name)}`,
    {
      headers: {
        "X-Session-API-Key": SESSION_API_KEY,
        "Content-Type": "application/json",
      },
      data: {
        llm: {
          model,
          api_key: "mock-api-key-for-testing",
          base_url: baseUrl,
        },
      },
    },
  );
  expect(resp.ok(), `POST /api/profiles/${name}: ${resp.status()}`).toBe(true);
}

async function getProfileConfig(
  request: APIRequestContext,
  name: string,
): Promise<Record<string, unknown>> {
  const resp = await request.get(
    `${BACKEND_URL}/api/profiles/${encodeURIComponent(name)}`,
    {
      headers: {
        "X-Session-API-Key": SESSION_API_KEY,
        "X-Expose-Secrets": "encrypted",
      },
    },
  );
  expect(resp.ok(), `GET /api/profiles/${name}: ${resp.status()}`).toBe(true);
  const data = await resp.json();
  return (data.config ?? {}) as Record<string, unknown>;
}

async function activateProfile(request: APIRequestContext, name: string) {
  const resp = await request.post(
    `${BACKEND_URL}/api/profiles/${encodeURIComponent(name)}/activate`,
    { headers: { "X-Session-API-Key": SESSION_API_KEY } },
  );
  expect(
    resp.ok(),
    `POST /api/profiles/${name}/activate: ${resp.status()}`,
  ).toBe(true);
}

async function deleteProfile(request: APIRequestContext, name: string) {
  await request.delete(
    `${BACKEND_URL}/api/profiles/${encodeURIComponent(name)}`,
    { headers: { "X-Session-API-Key": SESSION_API_KEY } },
  );
}

test.describe.configure({ mode: "serial" });

// ═══════════════════════════════════════════════════════════════════════
// Test 1 — Active profile deletion guard (PR #1127)
// ═══════════════════════════════════════════════════════════════════════

test.describe("active profile deletion guard", () => {
  const ACTIVE_PROFILE = "deletion-guard-active";
  const INACTIVE_PROFILE = "deletion-guard-inactive";

  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  test.afterAll(async ({ request }) => {
    for (const name of [ACTIVE_PROFILE, INACTIVE_PROFILE]) {
      try {
        await deleteProfile(request, name);
      } catch {
        // best-effort
      }
    }
  });

  test("delete is disabled on the active profile and enabled on inactive profiles", async ({
    page,
    request,
  }) => {
    // ── Setup: create two profiles, activate one ──
    await saveProfile(request, ACTIVE_PROFILE, MOCK_MODEL);
    await saveProfile(request, INACTIVE_PROFILE, MOCK_MODEL);
    await activateProfile(request, ACTIVE_PROFILE);

    await routeSessionApiKey(page);
    await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "add-llm-profile");

    // ── Find the active profile row and open its actions menu ──
    await test.step("active profile: delete button should be disabled", async () => {
      const profileRows = page.getByTestId("profile-row");
      const rowCount = await profileRows.count();
      let activeRow: ReturnType<typeof profileRows.nth> | null = null;

      for (let i = 0; i < rowCount; i++) {
        const row = profileRows.nth(i);
        const text = await row.textContent();
        if (text?.includes(ACTIVE_PROFILE)) {
          activeRow = row;
          break;
        }
      }
      expect(
        activeRow,
        `Could not find profile row for "${ACTIVE_PROFILE}"`,
      ).not.toBeNull();

      await activeRow!.getByTestId("profile-menu-trigger").click();
      await waitForTestId(page, "profile-actions-menu");

      // The Delete button should be rendered but disabled for the active profile.
      const deleteButton = page.getByTestId("profile-delete");
      await expect(
        deleteButton,
        "Delete button should be present in the menu",
      ).toBeVisible();
      await expect(
        deleteButton,
        "Delete button should be disabled for the active profile",
      ).toBeDisabled();

      // Edit and Set-as-active should still be present
      await expect(page.getByTestId("profile-edit")).toBeVisible();
      await expect(page.getByTestId("profile-set-active")).toBeVisible();

      // Close the menu
      await page.keyboard.press("Escape");
    });

    // ── Find an inactive profile and verify delete is enabled ──
    await test.step("inactive profile: delete button should be enabled", async () => {
      // Reload to reset any stale menu state
      await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
      await waitForTestId(page, "add-llm-profile");

      const profileRows = page.getByTestId("profile-row");
      const rowCount = await profileRows.count();
      let inactiveRow: ReturnType<typeof profileRows.nth> | null = null;

      for (let i = 0; i < rowCount; i++) {
        const row = profileRows.nth(i);
        const text = await row.textContent();
        if (text?.includes(INACTIVE_PROFILE)) {
          inactiveRow = row;
          break;
        }
      }
      expect(
        inactiveRow,
        `Could not find profile row for "${INACTIVE_PROFILE}"`,
      ).not.toBeNull();

      await inactiveRow!.getByTestId("profile-menu-trigger").click();
      await waitForTestId(page, "profile-actions-menu");

      const deleteButton = page.getByTestId("profile-delete");
      await expect(
        deleteButton,
        "Delete button should be present for inactive profile",
      ).toBeVisible();
      await expect(
        deleteButton,
        "Delete button should be enabled for inactive profiles",
      ).toBeEnabled();

      await page.keyboard.press("Escape");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Test 2 — Same-model profile identity (PR #1123)
// ═══════════════════════════════════════════════════════════════════════

test.describe("same-model profile identity", () => {
  // Two profiles with DIFFERENT names but the SAME underlying model.
  // Alphabetically, PROFILE_ALPHA < PROFILE_BETA — before the fix,
  // the UI would always show PROFILE_ALPHA regardless of which was active.
  const PROFILE_ALPHA = "aaa-profile-alpha";
  const PROFILE_BETA = "zzz-profile-beta";
  const SHARED_MODEL = "openai/mock-test-model";
  const REPLY_TOKEN = "PROFILE_IDENTITY_REPLY_OK";

  const conversationIds = new Set<string>();

  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  test.afterEach(async ({ request }) => {
    for (const id of Array.from(conversationIds)) {
      try {
        await deleteConversation(request, id);
        conversationIds.delete(id);
      } catch {
        // best-effort
      }
    }
  });

  test.afterAll(async ({ request }) => {
    for (const name of [PROFILE_ALPHA, PROFILE_BETA]) {
      try {
        await deleteProfile(request, name);
      } catch {
        // best-effort
      }
    }
    try {
      await resetMockLLM(request);
    } catch {
      // best-effort
    }
  });

  test("chat header shows the correct profile when two profiles share the same model", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);

    // ── Setup: create both profiles with the same model, activate BETA ──
    await saveProfile(request, PROFILE_ALPHA, SHARED_MODEL);
    await saveProfile(request, PROFILE_BETA, SHARED_MODEL);
    await activateProfile(request, PROFILE_BETA);

    // Register a trajectory for the conversation.
    // Turn 0 is padding: the agent-server makes an internal LLM call
    // (condenser/skill-analysis) before the agent's main loop starts.
    await registerTrajectory(request, "profile-identity", [
      { text: "" }, // padding for internal condenser call
      { text: REPLY_TOKEN },
    ]);
    await activateTrajectory(request, "profile-identity");

    // ── Verify: active_profile is BETA via the API ──
    await test.step("verify active profile is BETA via API", async () => {
      const resp = await request.get(`${BACKEND_URL}/api/profiles`, {
        headers: { "X-Session-API-Key": SESSION_API_KEY },
      });
      expect(resp.ok()).toBe(true);
      const data = await resp.json();
      expect(
        data.active_profile,
        `Expected active_profile="${PROFILE_BETA}" but got "${data.active_profile}"`,
      ).toBe(PROFILE_BETA);
    });

    // ── Start a conversation ──
    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "home-chat-launcher");

    await setChatInput(page, "Test profile identity.");
    await page.getByTestId("submit-button").click();
    await waitForPath(page, /\/conversations\/.+/, 30_000);

    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);

    // Wait for the agent to reply so the conversation is fully established
    await waitForNonUserMessageText(page, REPLY_TOKEN, 30_000);

    // ── Verify: profile switcher shows BETA, not ALPHA ──
    await test.step("profile switcher shows the correct profile name", async () => {
      const switchButton = page.getByTestId("switch-profile-button");
      await expect(switchButton).toBeVisible({ timeout: 10_000 });
      // The button's visible text should contain PROFILE_BETA.
      // Before the fix (PR #1123), it would show PROFILE_ALPHA because
      // profiles were matched by model name and .find() returned the
      // first alphabetical match.
      await expect(switchButton).toContainText(PROFILE_BETA, {
        timeout: 10_000,
      });
    });

    // ── Verify: profile identity survives a page reload ──
    await test.step("profile identity persists after page reload", async () => {
      await page.reload({ waitUntil: "domcontentloaded" });

      // Re-wait for the conversation to load
      await waitForNonUserMessageText(page, REPLY_TOKEN, 30_000);

      const switchButton = page.getByTestId("switch-profile-button");
      await expect(switchButton).toBeVisible({ timeout: 10_000 });
      await expect(
        switchButton,
        "Profile identity should persist across page reloads",
      ).toContainText(PROFILE_BETA, { timeout: 10_000 });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Test 3 — Proxy base_url preservation for litellm_proxy profiles
//          (PR #1148, issue #1146)
// ═══════════════════════════════════════════════════════════════════════

test.describe("litellm_proxy proxy base_url preservation", () => {
  // Simulates the state the SDK persists after onboarding through the
  // OpenHands provider: openhands/* is rewritten to litellm_proxy/* and
  // paired with the All-Hands proxy base URL.
  const PROXY_PROFILE = "proxy-base-url-test";
  const LITELLM_PROXY_MODEL = "litellm_proxy/claude-opus-4-8";
  const OPENHANDS_PROXY_BASE_URL = "https://llm-proxy.app.all-hands.dev/";

  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  test.afterAll(async ({ request }) => {
    try {
      await deleteProfile(request, PROXY_PROFILE);
    } catch {
      // best-effort
    }
  });

  test("re-saving a litellm_proxy profile from Basic view preserves the proxy base_url", async ({
    page,
    request,
  }) => {
    // ── Setup: create a profile with the SDK-rewritten litellm_proxy
    // model + proxy base_url, exactly as the agent-server persists it
    // after an openhands/* model selection during onboarding. ──
    await saveProfile(
      request,
      PROXY_PROFILE,
      LITELLM_PROXY_MODEL,
      OPENHANDS_PROXY_BASE_URL,
    );

    // ── Pre-check: verify the profile's base_url via API before the
    // UI round-trip so we know the starting state is correct. ──
    await test.step("verify initial profile has proxy base_url", async () => {
      const config = await getProfileConfig(request, PROXY_PROFILE);
      expect(config.model).toBe(LITELLM_PROXY_MODEL);
      expect(config.base_url).toBe(OPENHANDS_PROXY_BASE_URL);
    });

    // ── Navigate to the LLM settings page ──
    await routeSessionApiKey(page);
    await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "add-llm-profile");

    // ── Find the profile row and open edit mode ──
    await test.step("open profile in edit mode", async () => {
      const profileRows = page.getByTestId("profile-row");
      const rowCount = await profileRows.count();
      let targetRow: ReturnType<typeof profileRows.nth> | null = null;

      for (let i = 0; i < rowCount; i++) {
        const row = profileRows.nth(i);
        const text = await row.textContent();
        if (text?.includes(PROXY_PROFILE)) {
          targetRow = row;
          break;
        }
      }
      expect(
        targetRow,
        `Could not find profile row for "${PROXY_PROFILE}"`,
      ).not.toBeNull();

      await targetRow!.getByTestId("profile-menu-trigger").click();
      await waitForTestId(page, "profile-actions-menu");
      await page.getByTestId("profile-edit").click();

      // Wait for the editor to load with the profile data
      await expect(page.getByTestId("profile-name-input")).toHaveValue(
        PROXY_PROFILE,
        { timeout: 10_000 },
      );
    });

    // ── Ensure we are on the Basic tab, then save ──
    await test.step("switch to Basic view and save", async () => {
      // The litellm_proxy provider + proxy base_url is recognized as a
      // known default, so the form may already be on Basic. Click the
      // toggle to be explicit — this is the same user action the unit
      // test for PR #1148 exercises.
      const basicToggle = page.getByTestId("sdk-section-basic-toggle");
      if (await basicToggle.isVisible().catch(() => false)) {
        await basicToggle.click();
      }

      const saveButton = page.getByTestId("save-profile-btn");
      await expect(saveButton).toBeEnabled({ timeout: 10_000 });
      await saveButton.click();

      // Wait for save to complete — the UI navigates back to the
      // profile list after a successful save.
      await waitForTestId(page, "add-llm-profile");
    });

    // ── Verify: the proxy base_url survived the Basic-tab save ──
    await test.step("verify base_url is preserved after save", async () => {
      const config = await getProfileConfig(request, PROXY_PROFILE);
      expect(
        config.base_url,
        "base_url must be the All-Hands proxy URL after a Basic-tab re-save; " +
          "dropping it strands the profile (issue #1146)",
      ).toBe(OPENHANDS_PROXY_BASE_URL);
      expect(config.model).toBe(LITELLM_PROXY_MODEL);
    });

    // ── Verify: the profile also looks correct after a page reload ──
    await test.step("profile survives page reload", async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForTestId(page, "add-llm-profile");

      // Re-read via API to confirm persistence is durable
      const config = await getProfileConfig(request, PROXY_PROFILE);
      expect(config.base_url).toBe(OPENHANDS_PROXY_BASE_URL);
      expect(config.model).toBe(LITELLM_PROXY_MODEL);
    });
  });
});
