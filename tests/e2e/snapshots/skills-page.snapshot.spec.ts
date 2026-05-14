import { test, expect, Page } from "@playwright/test";

/**
 * Visual snapshot tests for the Skills page (/skills).
 *
 * SkillsService.getSkills() issues POST /api/skills.  In mock-API mode
 * MSW returns { skills: [] }, so the empty state is free.  For the loaded
 * and search/filter states we seed the React Query cache directly via
 * window.__OH_QUERY_CLIENT__ (exposed in dev/mock mode) to bypass MSW's
 * same-origin intercept.
 *
 * Four states are covered:
 *   1. Empty  – server returns no skills (MSW default)
 *   2. Loaded – four skill cards visible
 *   3. Search – filtered to one card after typing "docker"
 *   4. No match – empty message after typing an unrecognised term
 *   5. Type filter – only agentskills cards visible after clicking filter
 */

const MOCK_SKILLS = [
  {
    name: "code-review",
    type: "agentskills" as const,
    source: "github:OpenHands/extensions/skills/codereview",
    description:
      "Rigorous code review focusing on data structures, simplicity, " +
      "security, pragmatism, and risk/safety evaluation.",
    triggers: ["/review"],
    version: "1.2.0",
    license: "MIT",
    allowed_tools: ["terminal", "file_editor"],
  },
  {
    name: "docker",
    type: "agentskills" as const,
    source: "github:OpenHands/extensions/skills/docker",
    description:
      "Run Docker commands within a container environment, including " +
      "starting the Docker daemon and managing containers.",
    triggers: ["/docker"],
    version: "0.9.1",
    license: "Apache-2.0",
    allowed_tools: ["terminal"],
  },
  {
    name: "prd",
    type: "knowledge" as const,
    source: "github:OpenHands/extensions/skills/prd",
    description: "Generate a Product Requirements Document for a new feature.",
    triggers: ["/prd"],
    version: "1.0.0",
    license: null,
    allowed_tools: null,
  },
  {
    name: "repo-rules",
    type: "repo" as const,
    source: null,
    description: "Project-specific rules for this repository.",
    triggers: [],
    version: undefined,
    license: null,
    allowed_tools: ["file_editor", "terminal"],
  },
];

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
 */
async function setupMocks(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("openhands-onboarded", "true");
  });
}

/**
 * Inject skills data directly into the React Query cache via the
 * window.__OH_QUERY_CLIENT__ handle exposed in dev/mock mode.
 */
async function seedSkills(page: Page, skills = MOCK_SKILLS) {
  await page.waitForFunction(
    () =>
      !!(window as unknown as { __OH_QUERY_CLIENT__?: unknown }).__OH_QUERY_CLIENT__,
    { timeout: 10_000 },
  );
  await page.evaluate((skillsData) => {
    (
      window as unknown as {
        __OH_QUERY_CLIENT__: {
          setQueryData: (key: unknown[], data: unknown) => void;
        };
      }
    ).__OH_QUERY_CLIENT__.setQueryData(["skills"], skillsData);
  }, skills);
  await page.waitForTimeout(200);
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

  test("skills page with loaded cards renders correctly", async ({ page }) => {
    await setupMocks(page);

    await page.goto("/skills");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    const skillsScreen = page.getByTestId("skills-settings-screen");
    await expect(skillsScreen).toBeVisible({ timeout: 15_000 });

    await seedSkills(page);
    await expect(page.getByTestId("skill-card-code-review")).toBeVisible({
      timeout: 5_000,
    });

    await expect(skillsScreen).toHaveScreenshot("skills-loaded.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("search narrows cards to matching skill", async ({ page }) => {
    await setupMocks(page);

    await page.goto("/skills");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    const skillsScreen = page.getByTestId("skills-settings-screen");
    await expect(skillsScreen).toBeVisible({ timeout: 15_000 });

    await seedSkills(page);
    await expect(page.getByTestId("skill-card-code-review")).toBeVisible({
      timeout: 5_000,
    });

    await page.getByTestId("skills-search-input").fill("docker");
    await page.waitForTimeout(300);

    await expect(page.getByTestId("skill-card-docker")).toBeVisible();
    await expect(page.getByTestId("skill-card-code-review")).toHaveCount(0);

    await expect(skillsScreen).toHaveScreenshot("skills-search-filtered.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("search with no results shows empty message", async ({ page }) => {
    await setupMocks(page);

    await page.goto("/skills");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    const skillsScreen = page.getByTestId("skills-settings-screen");
    await expect(skillsScreen).toBeVisible({ timeout: 15_000 });

    await seedSkills(page);
    await expect(page.getByTestId("skill-card-code-review")).toBeVisible({
      timeout: 5_000,
    });

    await page.getByTestId("skills-search-input").fill("xyznonexistent");
    await page.waitForTimeout(300);

    await expect(page.getByText(/No skills match/i)).toBeVisible();

    await expect(skillsScreen).toHaveScreenshot("skills-no-match.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("type filter shows only matching skill type", async ({ page }) => {
    await setupMocks(page);

    await page.goto("/skills");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    const skillsScreen = page.getByTestId("skills-settings-screen");
    await expect(skillsScreen).toBeVisible({ timeout: 15_000 });

    await seedSkills(page);
    await expect(page.getByTestId("skill-card-code-review")).toBeVisible({
      timeout: 5_000,
    });

    await page.getByTestId("skills-type-filter-agentskills").click();
    await page.waitForTimeout(300);

    await expect(page.getByTestId("skill-card-code-review")).toBeVisible();
    await expect(page.getByTestId("skill-card-docker")).toBeVisible();
    await expect(page.getByTestId("skill-card-prd")).toHaveCount(0);

    await expect(skillsScreen).toHaveScreenshot("skills-type-filter.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });
});
