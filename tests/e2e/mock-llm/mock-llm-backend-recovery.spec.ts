/** E2E tests for backend recovery flow (PR #1205). */

import { test, expect, type Page } from "@playwright/test";
import {
  BACKEND_URL,
  SESSION_API_KEY,
  routeSessionApiKey,
  waitForTestId,
  dismissAnalyticsModal,
} from "./utils/mock-llm-helpers";

test.describe.configure({ mode: "serial" });

// ── Helpers ───────────────────────────────────────────────────────────

/** Seed a broken backend so the app enters the recovery gate without spawning processes. */
async function seedBrokenBackend(page: Page) {
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
    window.sessionStorage.setItem(
      "openhands-active-backend",
      JSON.stringify({ backendId: "broken-backend" }),
    );
  });
}

/**
 * Fill and submit the BackendForm (add or edit variant).
 *
 * @param prefix - testId prefix: `"add-backend"` or `"edit-backend"`.
 */
async function fillAndSubmitBackendForm(
  page: Page,
  prefix: "add-backend" | "edit-backend",
  fields: { name?: string; host: string; apiKey: string },
) {
  await waitForTestId(page, `${prefix}-modal`);

  if (fields.name) {
    const nameInput = page.getByTestId(`${prefix}-name`);
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.click();
    await nameInput.fill(fields.name);
  }

  const hostInput = page.getByTestId(`${prefix}-host`);
  await expect(hostInput).toBeVisible({ timeout: 5_000 });
  await hostInput.click();
  await hostInput.fill(fields.host);

  const apiKeyInput = page.getByTestId(`${prefix}-api-key`);
  await apiKeyInput.click();
  await apiKeyInput.fill(fields.apiKey);

  await page.getByTestId(`${prefix}-submit`).click();
}

/** Assert that the app has left the recovery screen and reached the home/onboarding page. */
async function expectAppRecovered(page: Page) {
  await dismissAnalyticsModal(page);
  await expect(
    page.getByTestId("agent-server-onboarding-screen"),
  ).not.toBeVisible({ timeout: 20_000 });

  const homeOrOnboarding = page
    .getByTestId("home-chat-launcher")
    .or(page.getByTestId("onboarding-step-choose-agent"));
  await expect(homeOrOnboarding).toBeVisible({ timeout: 20_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────

test.describe("backend recovery flow", () => {
  test.beforeEach(async ({ page }) => {
    await seedBrokenBackend(page);
    await routeSessionApiKey(page);
  });

  // ── 1. Recovery modal renders with recovery-mode semantics ──────────

  test("shows recovery modal without dismiss controls when backend is unreachable", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await waitForTestId(page, "agent-server-onboarding-screen");
    await waitForTestId(page, "manage-backends-modal");

    // Recovery mode: no close (X) button, no "Done" button
    await expect(
      page.getByTestId("close-manage-backends-modal"),
    ).not.toBeVisible({ timeout: 2_000 });
    await expect(page.getByTestId("manage-backends-done")).not.toBeVisible({
      timeout: 2_000,
    });

    // "Add Backend" button should still be present
    await expect(page.getByTestId("manage-backends-add")).toBeVisible();

    // The broken backend should be listed
    await expect(
      page.getByTestId("manage-backends-row-Broken"),
    ).toBeVisible();

    // The probe targets localhost:19999 (non-existent) so it fails fast.
    const statusEl = page.getByTestId("manage-backends-status-Broken");
    await expect(statusEl).toBeVisible({ timeout: 5_000 });
    await expect
      .poll(
        async () => (await statusEl.textContent())?.trim() ?? "",
        { timeout: 5_000, message: "backend status should settle to a non-connected state" },
      )
      .not.toBe("Connected");
  });

  // ── 2. Adding a reachable backend through the recovery modal ────────

  test("recovers by adding a reachable backend", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForTestId(page, "manage-backends-modal");

    await page.getByTestId("manage-backends-add").click();
    await fillAndSubmitBackendForm(page, "add-backend", {
      name: "Working Backend",
      host: BACKEND_URL,
      apiKey: SESSION_API_KEY,
    });

    await expectAppRecovered(page);
  });

  // ── 3. Editing the broken backend to fix it ─────────────────────────

  test("recovers by editing the broken backend to a reachable host", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForTestId(page, "manage-backends-modal");

    await page.getByTestId("manage-backends-edit-Broken").click();
    await fillAndSubmitBackendForm(page, "edit-backend", {
      host: BACKEND_URL,
      apiKey: SESSION_API_KEY,
    });

    await expectAppRecovered(page);
  });
});
