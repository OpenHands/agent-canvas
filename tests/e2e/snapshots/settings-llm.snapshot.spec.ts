import { test, expect, Page } from "@playwright/test";

/**
 * Visual snapshot tests for the local LLM settings route (/settings).
 *
 * Local agent-server mode now opens on the LLM profiles manager. The route uses
 * the same embedded LLM form when creating or editing profiles, so these tests
 * cover both the profile list states and the advanced/API-key form states from
 * that local workflow.
 */

async function dismissConsentModal(page: Page) {
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

async function setupMocks(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("openhands-onboarded", "true");
  });
}

/** Navigate to /settings and wait for the local LLM profiles view. */
async function navigateToLlmSettings(page: Page) {
  await setupMocks(page);
  await page.goto("/settings");
  await dismissConsentModal(page);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("add-llm-profile")).toBeVisible({
    timeout: 15_000,
  });
}

async function invalidateQueries(page: Page) {
  await page.evaluate(() => {
    (
      window as Window & { __TEST_INVALIDATE_QUERIES__?: () => void }
    ).__TEST_INVALIDATE_QUERIES__?.();
  });
  await page.waitForLoadState("networkidle");
}

/** Seed the MSW profile store after app load, then refetch the visible list. */
async function seedLlmProfiles(page: Page, { firstHasApiKey = false } = {}) {
  await page.evaluate(
    async ({ firstHasApiKey }) => {
      const profiles = [
        {
          name: "gpt-4o-default",
          model: "openai/gpt-4o",
          apiKey: firstHasApiKey ? "sk-test-profile-key" : undefined,
        },
        {
          name: "claude-haiku-fast",
          model: "openhands/claude-haiku-4-5-20251001",
        },
      ];

      for (const profile of profiles) {
        const llm: Record<string, string> = { model: profile.model };
        if (profile.apiKey) {
          llm.api_key = profile.apiKey;
        }

        await fetch(`/api/profiles/${encodeURIComponent(profile.name)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ llm, include_secrets: true }),
        });
      }
    },
    { firstHasApiKey },
  );

  await invalidateQueries(page);
}

/** Scroll down until the profiles section is visible and both rows have loaded. */
async function waitForProfileRows(page: Page) {
  const firstRow = page.getByTestId("profile-row").first();
  await firstRow.scrollIntoViewIfNeeded();
  await expect(firstRow).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("profile-row")).toHaveCount(2, {
    timeout: 10_000,
  });
}

async function openProfileAction(
  page: Page,
  rowIndex: number,
  actionTestId: string,
) {
  await page.getByTestId("profile-menu-trigger").nth(rowIndex).click();
  await expect(page.getByTestId("profile-actions-menu")).toBeVisible({
    timeout: 3_000,
  });
  await page.getByTestId(actionTestId).click();
}

test.describe("LLM Settings Visual Snapshots", () => {
  test.setTimeout(60_000);
  test.describe.configure({ mode: "serial" });

  test("LLM profile create advanced tab shows extra fields", async ({
    page,
  }) => {
    await navigateToLlmSettings(page);

    await page.getByTestId("add-llm-profile").click();
    await expect(page.getByTestId("llm-settings-form-basic")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId("sdk-section-advanced-toggle").click();

    await expect(page.getByTestId("llm-settings-form-advanced")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("llm-custom-model-input")).toBeVisible();

    await expect(page.getByTestId("root-layout")).toHaveScreenshot(
      "settings-llm-advanced.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("LLM profile edit shows key-set indicator for active profile", async ({
    page,
  }) => {
    await navigateToLlmSettings(page);
    await seedLlmProfiles(page, { firstHasApiKey: true });
    await waitForProfileRows(page);

    await openProfileAction(page, 0, "profile-set-active");
    await expect(page.getByTestId("profile-active-badge")).toBeVisible({
      timeout: 10_000,
    });

    await openProfileAction(page, 0, "profile-edit");

    await expect(page.getByTestId("llm-settings-form-basic")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("set-indicator")).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByTestId("root-layout")).toHaveScreenshot(
      "settings-llm-api-key-set.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("LLM profiles manager shows two profile rows", async ({ page }) => {
    await navigateToLlmSettings(page);
    await seedLlmProfiles(page);
    await waitForProfileRows(page);

    await expect(page.getByTestId("root-layout")).toHaveScreenshot(
      "settings-llm-profiles.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("LLM profile rename modal opens with correct profile name", async ({
    page,
  }) => {
    await navigateToLlmSettings(page);
    await seedLlmProfiles(page);
    await waitForProfileRows(page);

    await openProfileAction(page, 0, "profile-rename");

    await expect(page.getByTestId("rename-profile-modal")).toBeVisible({
      timeout: 5_000,
    });

    await expect(page.getByTestId("rename-profile-input")).toHaveValue(
      "gpt-4o-default",
    );

    await expect(page.getByTestId("root-layout")).toHaveScreenshot(
      "settings-llm-rename-modal.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  test("LLM profile delete confirmation modal opens", async ({ page }) => {
    await navigateToLlmSettings(page);
    await seedLlmProfiles(page);
    await waitForProfileRows(page);

    await openProfileAction(page, 1, "profile-delete");

    await expect(page.getByTestId("delete-profile-confirm")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("p.break-all")).toContainText(
      "claude-haiku-fast",
    );

    await expect(page.getByTestId("root-layout")).toHaveScreenshot(
      "settings-llm-delete-modal.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });
});
