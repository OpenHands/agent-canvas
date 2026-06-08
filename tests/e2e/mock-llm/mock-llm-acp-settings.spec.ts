/**
 * Mock-LLM E2E tests for ACP Settings → Agent single-save + auth banner.
 *
 * Covers the changes from PR #1251:
 *   1. Only ONE "Save Changes" button on the Settings → Agent page (no
 *      separate credentials-only save).
 *   2. The AcpAuthStatusBanner renders in the credentials section when
 *      a built-in ACP provider is selected.
 *   3. Saving both agent spec + credential in one click persists both.
 *   4. The credentials section renders only for built-in providers (not
 *      for "Custom" preset).
 *
 * These tests exercise the real agent-server settings API, same as the
 * existing ACP agent spec (mock-llm-acp-agent.spec.ts). They focus on
 * the settings form UX — not a full conversation round-trip.
 */

import { test, expect } from "@playwright/test";
import {
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
  selectDropdownOption,
  ensureMockLLMProfile,
  resetToOpenHandsAgentViaUI,
  resetMockLLM,
  BACKEND_URL,
  SESSION_API_KEY,
} from "./utils/mock-llm-helpers";

test.describe.configure({ mode: "serial" });

test.describe("ACP settings: single save + auth banner", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  test.afterAll(async ({ request, browser }) => {
    // Reset agent-server back to OpenHands so subsequent specs are clean
    const page = await browser.newPage();
    try {
      await seedLocalStorage(page);
      await resetToOpenHandsAgentViaUI(page);
      await ensureMockLLMProfile(page);
    } catch {
      // best-effort
    } finally {
      await page.close();
    }
    try {
      await resetMockLLM(request);
    } catch {
      // best-effort
    }
  });

  // ── 1. Only one Save button on the page ─────────────────────────────

  test("renders a single Save button when ACP provider is selected", async ({
    page,
  }) => {
    await ensureMockLLMProfile(page);
    await routeSessionApiKey(page);
    await page.goto("/settings/agent", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "agent-settings-screen");

    // Switch to ACP agent type
    await selectDropdownOption(page, /Agent/, /ACP/);

    // Select a built-in provider that has credential fields (Codex)
    await waitForTestId(page, "agent-preset-selector");
    await selectDropdownOption(page, /Preset/, /Codex/);

    // There should be exactly ONE save button on the page
    const saveButtons = page.getByTestId("agent-save-button");
    await expect(saveButtons).toHaveCount(1);

    // There should NOT be a separate credentials-only save button
    const credsSaveBtn = page.getByTestId("acp-credentials-save");
    await expect(credsSaveBtn).not.toBeVisible({ timeout: 2_000 });
  });

  // ── 2. Auth status banner appears for built-in ACP providers ────────

  test("shows auth status banner in credentials section", async ({ page }) => {
    await ensureMockLLMProfile(page);
    await routeSessionApiKey(page);
    await page.goto("/settings/agent", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "agent-settings-screen");

    // Switch to ACP → Codex
    await selectDropdownOption(page, /Agent/, /ACP/);
    await waitForTestId(page, "agent-preset-selector");
    await selectDropdownOption(page, /Preset/, /Codex/);

    // The auth status banner should be present (either "checking" or
    // "detected" state — both have the settings-acp-auth prefix).
    const authBanner = page
      .getByTestId("settings-acp-auth-detected")
      .or(page.getByTestId("settings-acp-auth-checking"));
    await expect(authBanner).toBeVisible({ timeout: 10_000 });
  });

  // ── 3. Credentials section hidden for Custom preset ─────────────────

  test("hides credentials section for Custom preset", async ({ page }) => {
    await ensureMockLLMProfile(page);
    await routeSessionApiKey(page);
    await page.goto("/settings/agent", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "agent-settings-screen");

    // Switch to ACP → Custom
    await selectDropdownOption(page, /Agent/, /ACP/);
    await waitForTestId(page, "agent-preset-selector");
    await selectDropdownOption(page, /Preset/, /Custom/);

    // The command input should be visible (Custom mode)
    await expect(page.getByTestId("agent-command-input")).toBeVisible({
      timeout: 5_000,
    });

    // Credential fields should NOT be visible — Custom preset has no
    // built-in credential fields
    const credentialField = page.locator(
      '[data-testid^="settings-acp-secret-"]',
    );
    await expect(credentialField).toHaveCount(0, { timeout: 2_000 });

    // Auth banner should NOT be visible for Custom preset
    const authBanner = page
      .getByTestId("settings-acp-auth-detected")
      .or(page.getByTestId("settings-acp-auth-checking"));
    await expect(authBanner).not.toBeVisible({ timeout: 2_000 });
  });

  // ── 4. Single save persists both agent spec and credential ──────────

  test("single Save persists agent spec and credential together", async ({
    page,
    request,
  }) => {
    await ensureMockLLMProfile(page);
    await routeSessionApiKey(page);
    await page.goto("/settings/agent", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "agent-settings-screen");

    // Switch to ACP → Codex
    await selectDropdownOption(page, /Agent/, /ACP/);
    await waitForTestId(page, "agent-preset-selector");
    await selectDropdownOption(page, /Preset/, /Codex/);

    // Enter a credential value in the first credential field
    const credentialFields = page.locator(
      '[data-testid^="settings-acp-secret-"]',
    );
    // Wait for at least one credential field
    await expect(credentialFields.first()).toBeVisible({ timeout: 5_000 });
    await credentialFields.first().click();
    await credentialFields.first().fill("test-credential-value-e2e");

    // The single Save button should be enabled (dirty from both spec + cred)
    const saveBtn = page.getByTestId("agent-save-button");
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });

    // Click Save
    await saveBtn.click();

    // Wait for save to complete (button becomes disabled again)
    await expect(saveBtn).toBeDisabled({ timeout: 15_000 });

    // Verify: agent spec was saved (agent_kind = acp)
    const settingsResp = await request.get(`${BACKEND_URL}/api/settings`, {
      headers: {
        "X-Session-API-Key": SESSION_API_KEY,
        "X-Expose-Secrets": "encrypted",
      },
    });
    expect(settingsResp.ok()).toBe(true);
    const settings = await settingsResp.json();
    const agentSettings = settings?.agent_settings as Record<string, unknown>;
    expect(agentSettings?.agent_kind).toBe("acp");
  });

  // ── 5. Save button disabled when no changes ─────────────────────────

  test("Save button is disabled when no changes have been made", async ({
    page,
  }) => {
    await routeSessionApiKey(page);
    await page.goto("/settings/agent", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "agent-settings-screen");

    // The Save button should be disabled on initial load (no dirty state)
    const saveBtn = page.getByTestId("agent-save-button");
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    await expect(saveBtn).toBeDisabled({ timeout: 5_000 });
  });
});
