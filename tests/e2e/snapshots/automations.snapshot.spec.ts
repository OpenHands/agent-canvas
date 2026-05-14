import { test, expect, Page } from "@playwright/test";

/**
 * Visual snapshot tests for the Automations pages.
 *
 * Three states are covered:
 *   1. Backend not configured (health check returns an error)
 *   2. List view with active and inactive automation groups (MSW serves 5 automations)
 *   3. Empty list (health OK, list returns zero items)
 *
 * The test server runs with VITE_MOCK_API=true (npm run dev:mock).
 * MSW handles GET /api/automation/v1 with pre-built data from
 * src/mocks/automation-handlers.ts.  The health endpoint is NOT
 * covered by MSW so page.route() owns it in all tests.
 */

/**
 * Dismiss the analytics consent modal if it appears (MSW settings return
 * user_consents_to_analytics: null so the modal can show on any page).
 */
async function dismissConsentModal(page: Page) {
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

/**
 * Wire up the routes that every automations test needs:
 *   - Skip onboarding so the modal never blocks the page
 *   - Conversations search (empty – keeps the sidebar quiet)
 *
 * NOTE: Settings requests go to the same-origin Vite dev server where MSW
 * intercepts them before page.route(). We call dismissConsentModal() after
 * navigation to handle the MSW consent modal instead of suppressing it here.
 *
 * Automation health and list requests go cross-origin to :8000 where
 * page.route() takes precedence. Health is mocked per-test; list is mocked
 * here with INLINE_AUTOMATIONS so all tests have a consistent baseline.
 */
async function setupMocks(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("openhands-onboarded", "true");
  });

  await page.route("**/api/conversations/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    });
  });
}

test.describe("Automations Visual Snapshots", () => {
  test.setTimeout(60_000);

  // TODO: add automations-backend-not-configured snapshot once window.__MSW_WORKER__
  // is exposed in mock mode so tests can call worker.use() to override the health
  // handler per-test. See COVERAGE_PLAN.md §6 for the full snapshot list.

  test("list with active and inactive groups renders correctly", async ({ page }) => {
    // MSW (automation-handlers.ts) serves health OK and the full automations list
    // (3 active, 2 inactive) so no page.route() overrides are needed here.
    await setupMocks(page);

    await page.goto("/automations");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    // Wait for at least one automation card to confirm the list loaded
    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Automation actions" }).first()).toBeVisible({
      timeout: 10_000,
    });

    await expect(rootLayout).toHaveScreenshot(
      "automations-list-active-inactive.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("search with no results renders correctly", async ({ page }) => {
    // Load the full list then type a query that matches nothing.
    await setupMocks(page);

    await page.goto("/automations");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: "Automation actions" }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Type a query that matches no automation name, repository, or prompt
    const searchInput = page.getByRole("textbox");
    await searchInput.fill("zzznomatchquery");

    // Wait for the filtered state to settle
    await page.waitForTimeout(300);

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot("automations-search-no-results.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("no automations shows empty state", async ({ page }) => {
    // Each Playwright test gets a fresh browser context, so MSW starts with
    // the full MOCK_AUTOMATIONS_RESPONSE.  We delete every automation via the
    // REST API (MSW handles DELETE) then reload so React Query fetches the
    // now-empty list and renders the EmptyState component.
    await setupMocks(page);

    await page.goto("/automations");
    await dismissConsentModal(page);

    // Wait for initial list to confirm the service worker is active
    await expect(
      page.getByRole("button", { name: "Automation actions" }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Delete every automation from the MSW mutable state.
    // Important: the `automations` Map lives in PAGE-level JS (the MSW handlers
    // are compiled into the client bundle). A page.reload() would re-run the
    // module initialiser and reset the Map to 5 items, so instead we:
    //   1. Make the DELETE fetches (MSW handles them in the page context)
    //   2. Call window.__TEST_INVALIDATE_QUERIES__() to ask React Query to
    //      refetch without a reload
    await page.evaluate(async () => {
      const res = await fetch("/api/automation/v1?limit=100");
      const data = (await res.json()) as { automations: { id: string }[] };
      await Promise.all(
        data.automations.map((a) =>
          fetch(`/api/automation/v1/${a.id}`, { method: "DELETE" }),
        ),
      );
    });

    // Trigger React Query to refetch the now-empty list
    await page.evaluate(() => {
      (
        window as Window & { __TEST_INVALIDATE_QUERIES__?: () => void }
      ).__TEST_INVALIDATE_QUERIES__?.();
    });

    await page.waitForLoadState("networkidle");

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toBeVisible({ timeout: 15_000 });

    // No kebab buttons means the list is truly empty
    await expect(
      page.getByRole("button", { name: "Automation actions" }),
    ).toHaveCount(0, { timeout: 10_000 });

    await expect(rootLayout).toHaveScreenshot("automations-no-automations.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("delete confirmation modal renders correctly", async ({ page }) => {
    await setupMocks(page);

    await page.goto("/automations");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    // Wait for the first kebab button to be visible before interacting
    const kebab = page.getByRole("button", { name: "Automation actions" }).first();
    await expect(kebab).toBeVisible({ timeout: 10_000 });
    await kebab.click();

    await page.getByRole("button", { name: "Delete" }).click();

    // DeleteConfirmationModal is a plain div (no dialog role).
    // Wait for its title to confirm it appeared.
    await expect(page.getByText("Delete automation")).toBeVisible({ timeout: 5_000 });

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toHaveScreenshot(
      "automations-delete-modal.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });
});
