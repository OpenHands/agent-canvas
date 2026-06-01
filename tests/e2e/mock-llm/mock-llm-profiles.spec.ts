/**
 * Mock-LLM E2E test: LLM profile lifecycle management.
 *
 * Exercises profile CRUD, activation, rename, and delete behaviors against
 * the real agent-server. No LLM responses are needed — profiles are a
 * settings-layer feature managed entirely by the agent-server API.
 *
 * Flow (serial):
 *   1. Navigate to /settings/llm, verify empty state, create two profiles
 *   2. Activate the second profile, verify badge moves
 *   3. Rename the active profile, verify badge follows the new name
 *   4. Delete the active profile, verify no badge remains
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  BACKEND_URL,
  SESSION_API_KEY,
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
} from "./utils/mock-llm-helpers";

const PROFILE_A = "profile-alpha";
const PROFILE_B = "profile-beta";
const PROFILE_B_RENAMED = "profile-beta-renamed";
const MODEL_A = "openai/gpt-4o";
const MODEL_B = "anthropic/claude-sonnet-4-20250514";

/**
 * Delete all profiles AND reset settings-level LLM config so tests start
 * truly clean.
 *
 * The automation test's `ensureMockLLMProfile()` PATCHes `/api/settings`
 * with `agent_settings_diff.llm.*`, which stores LLM config at the
 * settings layer. Deleting named profiles alone is not enough — the
 * server may still surface a "default" profile derived from those
 * settings. We therefore also PATCH settings to clear the LLM model so
 * the server reports an empty profile list.
 */
async function cleanupProfiles(request: APIRequestContext) {
  const headers = { "X-Session-API-Key": SESSION_API_KEY };

  // 1. Delete all named profiles
  const listResp = await request.get(`${BACKEND_URL}/api/profiles`, {
    headers,
  });
  if (listResp.ok()) {
    const body = (await listResp.json()) as {
      profiles?: { name: string }[];
    };
    for (const p of body.profiles ?? []) {
      const delResp = await request.delete(
        `${BACKEND_URL}/api/profiles/${encodeURIComponent(p.name)}`,
        { headers },
      );
      if (!delResp.ok()) {
        console.warn(
          `DELETE /api/profiles/${p.name} returned ${delResp.status()}`,
        );
      }
    }
  } else {
    console.warn(
      `GET /api/profiles returned ${listResp.status()} — skipping profile cleanup`,
    );
  }

  // 2. Clear settings-level LLM config so no implicit profile lingers.
  //    The automation test's ensureMockLLMProfile() PATCHes agent_settings
  //    directly; without this reset, the server may derive a "default"
  //    profile from the lingering settings even after all named profiles
  //    are deleted.
  const patchResp = await request.patch(`${BACKEND_URL}/api/settings`, {
    headers: { ...headers, "Content-Type": "application/json" },
    data: {
      agent_settings_diff: {
        llm: { model: "", api_key: "", base_url: "" },
      },
    },
  });
  if (!patchResp.ok()) {
    console.warn(
      `PATCH /api/settings (clear LLM) returned ${patchResp.status()}`,
    );
  }

  // 3. Verify the cleanup actually worked
  const verifyResp = await request.get(`${BACKEND_URL}/api/profiles`, {
    headers,
  });
  if (verifyResp.ok()) {
    const verifyBody = (await verifyResp.json()) as {
      profiles?: { name: string }[];
    };
    const remaining = verifyBody.profiles ?? [];
    if (remaining.length > 0) {
      console.warn(
        `After cleanup, ${remaining.length} profile(s) still exist: ${remaining.map((p) => p.name).join(", ")}`,
      );
    }
  }
}

test.describe.configure({ mode: "serial" });

test.describe("mock-LLM profile lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  // Clean up all profiles after the suite so subsequent test files start fresh.
  test.afterAll(async ({ request }) => {
    await cleanupProfiles(request);
  });

  // ── Step 1: Create two profiles ─────────────────────────────────────

  test("step 1: create two LLM profiles and verify they appear in the list", async ({
    page,
    request,
  }) => {
    // Start clean
    await cleanupProfiles(request);

    await routeSessionApiKey(page);
    await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "add-llm-profile");

    // ── Verify empty state ──
    await test.step("verify empty state shows no profiles", async () => {
      const profileRows = page.getByTestId("profile-row");
      await expect(profileRows).toHaveCount(0, { timeout: 10_000 });
    });

    // ── Create profile A ──
    await test.step("create profile-alpha", async () => {
      await page.getByTestId("add-llm-profile").click();
      await waitForTestId(page, "profile-editor-title");

      const nameInput = page.getByTestId("profile-name-input");
      await nameInput.click();
      await nameInput.fill(PROFILE_A);

      // Switch to advanced view for the model text input
      await page.getByTestId("sdk-section-all-toggle").click();
      await waitForTestId(page, "llm-settings-form-advanced");

      await page.getByTestId("llm-custom-model-input").click();
      await page.getByTestId("llm-custom-model-input").fill(MODEL_A);
      await page.getByTestId("llm-api-key-input").click();
      await page.getByTestId("llm-api-key-input").fill("sk-test-a");

      await page.getByTestId("save-profile-btn").click();
      await waitForTestId(page, "add-llm-profile");
    });

    // ── Create profile B ──
    await test.step("create profile-beta", async () => {
      await page.getByTestId("add-llm-profile").click();
      await waitForTestId(page, "profile-editor-title");

      const nameInput = page.getByTestId("profile-name-input");
      await nameInput.click();
      await nameInput.fill(PROFILE_B);

      await page.getByTestId("sdk-section-all-toggle").click();
      await waitForTestId(page, "llm-settings-form-advanced");

      await page.getByTestId("llm-custom-model-input").click();
      await page.getByTestId("llm-custom-model-input").fill(MODEL_B);
      await page.getByTestId("llm-api-key-input").click();
      await page.getByTestId("llm-api-key-input").fill("sk-test-b");

      await page.getByTestId("save-profile-btn").click();
      await waitForTestId(page, "add-llm-profile");
    });

    // ── Verify both profiles appear ──
    await test.step("verify both profiles appear in the list", async () => {
      const profileRows = page.getByTestId("profile-row");
      await expect(profileRows).toHaveCount(2, { timeout: 10_000 });

      const allText = await profileRows.allTextContents();
      expect(
        allText.some((t) => t.includes(PROFILE_A)),
        `Expected "${PROFILE_A}" in profile list`,
      ).toBe(true);
      expect(
        allText.some((t) => t.includes(PROFILE_B)),
        `Expected "${PROFILE_B}" in profile list`,
      ).toBe(true);
    });

    // ── Verify via API ──
    await test.step("verify profiles exist via API", async () => {
      const resp = await request.get(`${BACKEND_URL}/api/profiles`, {
        headers: { "X-Session-API-Key": SESSION_API_KEY },
      });
      expect(resp.ok()).toBe(true);

      const body = (await resp.json()) as {
        profiles: { name: string; model: string }[];
        active_profile: string | null;
      };
      const names = body.profiles.map((p) => p.name);
      expect(names).toContain(PROFILE_A);
      expect(names).toContain(PROFILE_B);
    });
  });

  // ── Step 2: Activate profile B, verify badge moves ──────────────────

  test("step 2: activate profile-beta and verify the active badge", async ({
    page,
  }) => {
    await routeSessionApiKey(page);
    await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "add-llm-profile");

    const profileRows = page.getByTestId("profile-row");
    await expect(profileRows).toHaveCount(2, { timeout: 10_000 });

    // Find profile-beta's row and open the actions menu
    const betaRow = profileRows.filter({ hasText: PROFILE_B });
    await expect(betaRow).toBeVisible({ timeout: 5_000 });
    await betaRow.getByTestId("profile-menu-trigger").click();
    await expect(page.getByTestId("profile-actions-menu")).toBeVisible({
      timeout: 5_000,
    });

    // Click "Set Active"
    await page.getByTestId("profile-set-active").click();

    await test.step("verify active badge is on profile-beta", async () => {
      // Wait for the badge to appear on profile-beta
      await expect(
        betaRow.getByTestId("profile-active-badge"),
      ).toBeVisible({ timeout: 10_000 });

      // profile-alpha should NOT have the badge
      const alphaRow = profileRows.filter({ hasText: PROFILE_A });
      await expect(
        alphaRow.getByTestId("profile-active-badge"),
      ).toBeHidden();
    });

    await test.step("verify active_profile via API", async () => {
      // Use page.evaluate to call the API (session key routed by page.route)
      const apiResult = await page.evaluate(async () => {
        const resp = await fetch("/api/profiles");
        return resp.json();
      });
      expect(apiResult.active_profile).toBe(PROFILE_B);
    });
  });

  // ── Step 3: Rename the active profile, verify badge follows ─────────

  test("step 3: rename the active profile and verify badge follows the new name", async ({
    page,
  }) => {
    await routeSessionApiKey(page);
    await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "add-llm-profile");

    const profileRows = page.getByTestId("profile-row");
    await expect(profileRows).toHaveCount(2, { timeout: 10_000 });

    // profile-beta should be active from step 2
    const betaRow = profileRows.filter({ hasText: PROFILE_B });
    await expect(
      betaRow.getByTestId("profile-active-badge"),
    ).toBeVisible({ timeout: 5_000 });

    // Open actions menu and click Rename
    await betaRow.getByTestId("profile-menu-trigger").click();
    await expect(page.getByTestId("profile-actions-menu")).toBeVisible({
      timeout: 5_000,
    });
    await page.getByTestId("profile-rename").click();

    // Wait for the rename modal
    await expect(page.getByTestId("rename-profile-modal")).toBeVisible({
      timeout: 5_000,
    });

    // Clear and type the new name
    const renameInput = page.getByTestId("rename-profile-input");
    await renameInput.clear();
    await renameInput.fill(PROFILE_B_RENAMED);
    await page.getByTestId("rename-profile-submit").click();

    // Wait for the modal to close
    await expect(page.getByTestId("rename-profile-modal")).toBeHidden({
      timeout: 10_000,
    });

    await test.step("verify renamed profile has the active badge", async () => {
      const updatedRows = page.getByTestId("profile-row");
      await expect(updatedRows).toHaveCount(2, { timeout: 10_000 });

      const renamedRow = updatedRows.filter({ hasText: PROFILE_B_RENAMED });
      await expect(renamedRow).toBeVisible({ timeout: 10_000 });
      await expect(
        renamedRow.getByTestId("profile-active-badge"),
      ).toBeVisible();
    });

    await test.step("verify old name is gone from the list", async () => {
      // The old name should no longer appear as a standalone profile name.
      // Use a strict check: no profile row should contain the old name
      // without also containing the renamed suffix.
      const updatedRows = page.getByTestId("profile-row");
      const allText = await updatedRows.allTextContents();
      const hasOldNameOnly = allText.some(
        (t) => t.includes(PROFILE_B) && !t.includes(PROFILE_B_RENAMED),
      );
      expect(
        hasOldNameOnly,
        `Old profile name "${PROFILE_B}" should not appear without the renamed suffix`,
      ).toBe(false);
    });

    await test.step("verify other profile does NOT have the badge", async () => {
      const alphaRow = page
        .getByTestId("profile-row")
        .filter({ hasText: PROFILE_A });
      await expect(
        alphaRow.getByTestId("profile-active-badge"),
      ).toBeHidden();
    });

    await test.step("verify active_profile via API reflects the new name", async () => {
      const apiResult = await page.evaluate(async () => {
        const resp = await fetch("/api/profiles");
        return resp.json();
      });
      expect(apiResult.active_profile).toBe(PROFILE_B_RENAMED);
    });
  });

  // ── Step 4: Delete the active profile, verify no badge remains ──────

  test("step 4: delete the active profile and verify no active badge remains", async ({
    page,
  }) => {
    await routeSessionApiKey(page);
    await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "add-llm-profile");

    const profileRows = page.getByTestId("profile-row");
    await expect(profileRows).toHaveCount(2, { timeout: 10_000 });

    // profile-beta-renamed should be active from step 3
    const activeRow = profileRows.filter({ hasText: PROFILE_B_RENAMED });
    await expect(
      activeRow.getByTestId("profile-active-badge"),
    ).toBeVisible({ timeout: 5_000 });

    // Open actions menu and click Delete
    await activeRow.getByTestId("profile-menu-trigger").click();
    await expect(page.getByTestId("profile-actions-menu")).toBeVisible({
      timeout: 5_000,
    });
    await page.getByTestId("profile-delete").click();

    // Confirm deletion
    await expect(page.getByTestId("delete-profile-confirm")).toBeVisible({
      timeout: 5_000,
    });
    await page.getByTestId("delete-profile-confirm").click();

    // Wait for the modal to close and list to update
    await expect(page.getByTestId("delete-profile-confirm")).toBeHidden({
      timeout: 10_000,
    });

    await test.step("verify only profile-alpha remains", async () => {
      const remainingRows = page.getByTestId("profile-row");
      await expect(remainingRows).toHaveCount(1, { timeout: 10_000 });
      await expect(
        remainingRows.filter({ hasText: PROFILE_A }),
      ).toBeVisible();
    });

    await test.step("verify no active badge is visible", async () => {
      await expect(page.getByTestId("profile-active-badge")).toBeHidden();
    });

    await test.step("verify active_profile is null via API", async () => {
      const apiResult = await page.evaluate(async () => {
        const resp = await fetch("/api/profiles");
        return resp.json();
      });
      expect(apiResult.active_profile).toBeNull();
    });
  });
});
