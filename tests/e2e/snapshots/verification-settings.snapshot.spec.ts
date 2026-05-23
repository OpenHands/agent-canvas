import { test, expect, Page } from "@playwright/test";
import { seedLocalStorage } from "./support/seed-local-storage";

const VERIFICATION_SCHEMA = {
  model_name: "ConversationSettings",
  sections: [
    {
      key: "verification",
      label: "Verification",
      fields: [
        {
          key: "confirmation_mode",
          label: "Confirmation mode",
          description:
            "Pause for confirmation before the agent performs high-risk actions.",
          section: "verification",
          section_label: "Verification",
          value_type: "boolean",
          default: false,
          choices: [],
          depends_on: [],
          prominence: "major",
          secret: false,
          required: true,
        },
        {
          key: "security_analyzer",
          label: "Security analyzer",
          description:
            "Choose how OpenHands should analyze actions before asking for confirmation.",
          section: "verification",
          section_label: "Verification",
          value_type: "string",
          default: "llm",
          choices: [
            { label: "llm", value: "llm" },
            { label: "none", value: "none" },
          ],
          depends_on: ["confirmation_mode"],
          prominence: "major",
          secret: false,
          required: false,
        },
      ],
    },
  ],
};

const SETTINGS_WITH_CONSENT = {
  llm_model: "anthropic/claude-sonnet-4-20250514",
  llm_base_url: "",
  agent: "CodeActAgent",
  language: "en",
  llm_api_key: null,
  llm_api_key_set: true,
  search_api_key_set: false,
  confirmation_mode: true,
  security_analyzer: "llm",
  remote_runtime_resource_factor: 1,
  provider_tokens_set: { github: "" },
  enable_default_condenser: true,
  condenser_max_size: 240,
  enable_sound_notifications: false,
  user_consents_to_analytics: false,
  enable_proactive_conversation_starters: false,
  enable_solvability_analysis: false,
  max_budget_per_task: null,
  conversation_settings_schema: VERIFICATION_SCHEMA,
  conversation_settings: {
    confirmation_mode: true,
    security_analyzer: "llm",
  },
};

async function setupMocks(page: Page) {
  await seedLocalStorage(page);

  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SETTINGS_WITH_CONSENT),
      });
    } else {
      await route.continue();
    }
  });

  await page.route("**/api/settings/agent-schema", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("**/api/settings/conversation-schema", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(VERIFICATION_SCHEMA),
    });
  });

  await page.route("**/api/conversations*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    });
  });

  await page.route("**/api/file/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ path: "/home", subdirs: [] }),
    });
  });
}

test.describe("Verification Settings Visual Snapshot", () => {
  test.setTimeout(60000);

  test("Verification settings page renders correctly", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/settings/verification");

    const rootLayout = page.getByTestId("root-layout");
    await expect(rootLayout).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");

    const screen = page.getByTestId("verification-settings-screen");
    await expect(screen).toBeVisible({ timeout: 15000 });

    // Click Advanced tab to surface the schema-rendered fields.
    await page.getByRole("tab", { name: "Advanced" }).click();
    await page.waitForLoadState("networkidle");

    await expect(rootLayout).toHaveScreenshot(
      "verification-settings-page.png",
      {
        maxDiffPixelRatio: 0.01,
        animations: "disabled",
      },
    );
  });
});
