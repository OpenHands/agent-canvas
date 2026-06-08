/**
 * Mock-LLM E2E tests for the Manage Backends recovery flow.
 *
 * Covers the changes from PR #1205: when the active backend is unreachable,
 * the app shows a full-screen recovery modal (ManageBackendsModal with
 * recoveryMode=true). The modal suppresses dismiss controls and the user
 * must add or select a reachable backend to proceed.
 *
 * Scenarios:
 *   1. Recovery modal renders with correct recovery-mode semantics
 *      (no close button, no Done button, no backdrop/escape dismiss).
 *   2. Adding a reachable backend through the recovery modal boots the app.
 *   3. Editing the broken backend to point at the real backend boots the app.
 */

import { test, expect } from "@playwright/test";
import {
  BACKEND_URL,
  SESSION_API_KEY,
  routeSessionApiKey,
  waitForTestId,
  dismissAnalyticsModal,
} from "./utils/mock-llm-helpers";

test.describe.configure({ mode: "serial" });

/**
 * Seed localStorage with a backend pointing at a non-existent host so the
 * /server_info probe fails and the app enters the recovery gate.
 *
 * The analytics consent is suppressed and onboarding is marked done so the
 * only screen the app can show is the recovery modal (not the analytics
 * overlay or onboarding wizard).
 */
async function seedBrokenBackend(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("analytics-consent", "false");
    window.localStorage.setItem("openhands-telemetry-consent", "denied");
    window.localStorage.setItem("openhands-telemetry-first-use", "true");
    window.localStorage.setItem("openhands-onboarded", "1");
    window.localStorage.setItem(
      "openhands-backends",
      JSON.stringify([
        {
          id: "broken-backend",
          name: "Broken",
          host: "http://localhost:19999",
          apiKey: "does-not-matter",
          kind: "local",
        },
      ]),
    );
    // Point the active selection at the broken backend
    window.sessionStorage.setItem(
      "openhands-active-backend",
      JSON.stringify({ backendId: "broken-backend" }),
    );
  });
}

test.describe("backend recovery flow", () => {
  // ── 1. Recovery modal renders with recovery-mode semantics ──────────

  test("shows recovery modal without dismiss controls when backend is unreachable", async ({
    page,
  }) => {
    await seedBrokenBackend(page);
    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // The recovery screen wrapper should be visible
    await waitForTestId(page, "agent-server-onboarding-screen");

    // The Manage Backends modal should be visible inside it
    await waitForTestId(page, "manage-backends-modal");

    // Recovery mode: no close (X) button
    await expect(
      page.getByTestId("close-manage-backends-modal"),
    ).not.toBeVisible({ timeout: 2_000 });

    // Recovery mode: no "Done" button
    await expect(page.getByTestId("manage-backends-done")).not.toBeVisible({
      timeout: 2_000,
    });

    // The "Add Backend" button should still be present (primary variant
    // in recovery mode)
    await expect(page.getByTestId("manage-backends-add")).toBeVisible();

    // The broken backend should be listed
    await expect(
      page.getByTestId("manage-backends-row-Broken"),
    ).toBeVisible();

    // The broken backend should show a disconnected/error status
    const statusEl = page.getByTestId("manage-backends-status-Broken");
    await expect(statusEl).toBeVisible({ timeout: 15_000 });
    // Wait for the health probe to settle — it should show disconnected
    // or an error state (not "Connected")
    await expect
      .poll(
        async () => {
          const text = await statusEl.textContent();
          return text?.toLowerCase() ?? "";
        },
        { timeout: 15_000 },
      )
      .not.toContain("connected");
  });

  // ── 2. Adding a reachable backend through the recovery modal ────────

  test("recovers by adding a reachable backend", async ({ page }) => {
    await seedBrokenBackend(page);
    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Wait for the recovery modal
    await waitForTestId(page, "manage-backends-modal");

    // Click "Add Backend"
    await page.getByTestId("manage-backends-add").click();

    // The add-backend form should appear
    await waitForTestId(page, "add-backend-modal");

    // Fill in the real backend details
    const nameInput = page.getByTestId("add-backend-name");
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.click();
    await nameInput.fill("Working Backend");

    const hostInput = page.getByTestId("add-backend-host");
    await hostInput.click();
    await hostInput.fill(BACKEND_URL);

    const apiKeyInput = page.getByTestId("add-backend-api-key");
    await apiKeyInput.click();
    await apiKeyInput.fill(SESSION_API_KEY);

    // Submit the form
    await page.getByTestId("add-backend-submit").click();

    // After adding a reachable backend the app should recover:
    // the recovery modal disappears and the home page loads.
    await dismissAnalyticsModal(page);
    await expect(
      page.getByTestId("agent-server-onboarding-screen"),
    ).not.toBeVisible({ timeout: 20_000 });

    // The app should show either the home launcher or the onboarding
    // modal (depending on whether the new backend has settings).
    // Either is acceptable — the key is we're NOT stuck in recovery.
    const homeOrOnboarding = page
      .getByTestId("home-chat-launcher")
      .or(page.getByTestId("onboarding-step-choose-agent"));
    await expect(homeOrOnboarding).toBeVisible({ timeout: 20_000 });
  });

  // ── 3. Editing the broken backend to fix it ─────────────────────────

  test("recovers by editing the broken backend to a reachable host", async ({
    page,
  }) => {
    await seedBrokenBackend(page);
    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Wait for the recovery modal
    await waitForTestId(page, "manage-backends-modal");

    // Click the edit button on the broken backend row
    await page.getByTestId("manage-backends-edit-Broken").click();

    // The edit form should appear
    await waitForTestId(page, "edit-backend-modal");

    // Update the host to the real backend
    const hostInput = page.getByTestId("edit-backend-host");
    await expect(hostInput).toBeVisible({ timeout: 5_000 });
    await hostInput.click();
    await hostInput.fill(BACKEND_URL);

    const apiKeyInput = page.getByTestId("edit-backend-api-key");
    await apiKeyInput.click();
    await apiKeyInput.fill(SESSION_API_KEY);

    // Save the edit
    await page.getByTestId("edit-backend-submit").click();

    // After editing to a reachable backend the app should recover.
    await dismissAnalyticsModal(page);
    await expect(
      page.getByTestId("agent-server-onboarding-screen"),
    ).not.toBeVisible({ timeout: 20_000 });

    const homeOrOnboarding = page
      .getByTestId("home-chat-launcher")
      .or(page.getByTestId("onboarding-step-choose-agent"));
    await expect(homeOrOnboarding).toBeVisible({ timeout: 20_000 });
  });
});
