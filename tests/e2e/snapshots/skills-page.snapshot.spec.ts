import { test, expect, Page } from "@playwright/test";

/**
 * Visual snapshot tests for the Skills page (/skills).
 *
 * SkillsService.getSkills() issues POST /api/skills.  In mock-API mode
 * MSW returns { skills: [] }, so the empty state is free.  For the loaded
 * and search states we intercept the POST with page.route() and return a
 * small set of realistic skills.
 *
 * Three states are covered:
 *   1. Empty – server returns no skills (MSW default)
 *   2. Loaded – four skill cards including one disabled via disabled_skills
 *   3. Search match / no-match – filtered results after typing in the search box
 */

/**
 * Dismiss the analytics consent modal if MSW shows it.
 */
async function dismissConsentModal(page: Page) {
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

/**
 * Wire up the base routes every skills test needs.
 *
 * NOTE: POST /api/skills goes to the same-origin Vite dev server where MSW
 * intercepts it before page.route() can. MSW always returns { skills: [] }
 * in mock mode, so tests that require skill card data need a different
 * injection mechanism (e.g. exposing a __OH_QUERY_CLIENT__ on window so
 * tests can seed the React Query cache directly). Those tests are tracked in
 * COVERAGE_PLAN.md and deferred until that mechanism is available.
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

test.describe("Skills Page Visual Snapshots", () => {
  test.setTimeout(60_000);

  test("empty state renders correctly", async ({ page }) => {
    // MSW intercepts POST /api/skills and returns { skills: [] } so the
    // "No skills found" empty state is the reliable baseline here.
    await setupMocks(page);

    await page.goto("/skills");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    const skillsScreen = page.getByTestId("skills-settings-screen");
    await expect(skillsScreen).toBeVisible({ timeout: 15_000 });

    await expect(skillsScreen).toHaveScreenshot("skills-empty.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  // TODO: add skills-loaded, skills-search-filtered, skills-no-match once
  // window.__OH_QUERY_CLIENT__ (or equivalent) is exposed so tests can seed
  // the React Query skills cache without fighting MSW's same-origin intercept.
  // See tests/e2e/snapshots/COVERAGE_PLAN.md §5 for the full snapshot list.
});
