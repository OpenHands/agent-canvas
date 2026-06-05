/**
 * Mock-LLM E2E tests: LLM profile management regressions.
 *
 * Covers two scenarios that previously had no end-to-end guard:
 *
 *   1. Active profile deletion + reconciliation:
 *      The active LLM profile IS deletable (the PR #1127 disable-guard was
 *      removed). Deleting it must not strand the app: useEnsureActiveProfile
 *      promotes a remaining profile to active in local mode, so a usable LLM
 *      is always selected. This test verifies delete is enabled and that the
 *      remaining profile becomes active.
 *
 *   2. Same-model profile identity (PR #1123):
 *      When two profiles share the same underlying model, the chat
 *      header must display the correct profile name — the one the
 *      user selected, not the first alphabetical match. The fix
 *      stamps the active profile name on client-side conversation
 *      metadata at creation and on per-conversation switches.
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
          base_url: MOCK_LLM_AGENT_URL,
        },
        include_secrets: true,
      },
    },
  );
  expect(resp.ok(), `POST /api/profiles/${name}: ${resp.status()}`).toBe(true);
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

test.describe("active profile deletion + reconciliation", () => {
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

  test("active profile is deletable and reconciliation activates another profile", async ({
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

    const rowFor = async (name: string) => {
      const rows = page.getByTestId("profile-row");
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        if ((await row.textContent())?.includes(name)) return row;
      }
      return null;
    };

    // ── Delete is now enabled on the active profile (the #1127 guard was
    //    removed; useEnsureActiveProfile keeps a profile active instead) ──
    await test.step("active profile: delete button is enabled", async () => {
      const activeRow = await rowFor(ACTIVE_PROFILE);
      expect(
        activeRow,
        `Could not find profile row for "${ACTIVE_PROFILE}"`,
      ).not.toBeNull();

      await activeRow!.getByTestId("profile-menu-trigger").click();
      await waitForTestId(page, "profile-actions-menu");

      const deleteButton = page.getByTestId("profile-delete");
      await expect(
        deleteButton,
        "Delete button should be present in the menu",
      ).toBeVisible();
      await expect(
        deleteButton,
        "Delete should be enabled for the active profile",
      ).toBeEnabled();

      // Edit and Set-as-active should still be present
      await expect(page.getByTestId("profile-edit")).toBeVisible();
      await expect(page.getByTestId("profile-set-active")).toBeVisible();

      await page.keyboard.press("Escape");
    });

    // ── Delete is enabled on an inactive profile too ──
    await test.step("inactive profile: delete button is enabled", async () => {
      const inactiveRow = await rowFor(INACTIVE_PROFILE);
      expect(
        inactiveRow,
        `Could not find profile row for "${INACTIVE_PROFILE}"`,
      ).not.toBeNull();

      await inactiveRow!.getByTestId("profile-menu-trigger").click();
      await waitForTestId(page, "profile-actions-menu");
      await expect(page.getByTestId("profile-delete")).toBeEnabled();
      await page.keyboard.press("Escape");
    });

    // ── Deleting the active profile reconciles to the remaining one ──
    await test.step("deleting the active profile activates the remaining profile", async () => {
      const activeRow = await rowFor(ACTIVE_PROFILE);
      expect(activeRow).not.toBeNull();

      await activeRow!.getByTestId("profile-menu-trigger").click();
      await waitForTestId(page, "profile-actions-menu");
      await page.getByTestId("profile-delete").click();

      // Confirm in the delete modal.
      await page.getByTestId("delete-profile-confirm").click();

      // useEnsureActiveProfile re-activates the only remaining profile. Poll
      // with reload — the delete + activate mutations may take a moment on CI.
      await expect
        .poll(
          async () => {
            await page.goto("/settings/llm", {
              waitUntil: "domcontentloaded",
            });
            await waitForTestId(page, "add-llm-profile");
            const remaining = await rowFor(INACTIVE_PROFILE);
            if (!remaining) return false;
            // The deleted profile must be gone, and reconciliation must keep
            // *some* profile active (the "always have an active profile"
            // guarantee). We don't assert it's INACTIVE_PROFILE specifically —
            // other profiles may linger on the shared agent-server and
            // useEnsureActiveProfile activates the first keyed one.
            const goneRow = await rowFor(ACTIVE_PROFILE);
            const activeBadges = await page
              .getByTestId("profile-active-badge")
              .count();
            return goneRow === null && activeBadges > 0;
          },
          {
            message: `"${INACTIVE_PROFILE}" should become active after deleting "${ACTIVE_PROFILE}"`,
            timeout: 15_000,
            intervals: [1_000, 2_000, 3_000],
          },
        )
        .toBe(true);
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
