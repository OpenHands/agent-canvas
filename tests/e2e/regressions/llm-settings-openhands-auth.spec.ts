import { expect, test, type Page } from "@playwright/test";

const AGENT_SETTINGS_SCHEMA = {
  model_name: "AgentSettings",
  sections: [
    {
      key: "llm",
      label: "LLM",
      fields: [
        {
          key: "llm.model",
          label: "Model",
          description: "Select the model to use.",
          section: "llm",
          section_label: "LLM",
          value_type: "string",
          default: "openhands/claude-opus-4-5-20251101",
          choices: [],
          depends_on: [],
          prominence: "critical",
          secret: false,
          required: true,
        },
        {
          key: "llm.api_key",
          label: "API Key",
          description: "API key for authentication.",
          section: "llm",
          section_label: "LLM",
          value_type: "string",
          default: null,
          choices: [],
          depends_on: [],
          prominence: "critical",
          secret: true,
          required: false,
        },
        {
          key: "llm.base_url",
          label: "Base URL",
          description: "Override the default API base URL.",
          section: "llm",
          section_label: "LLM",
          value_type: "string",
          default: null,
          choices: [],
          depends_on: [],
          prominence: "critical",
          secret: false,
          required: false,
        },
      ],
    },
  ],
};

function makeSettingsResponse() {
  return {
    llm_model: "openhands/claude-opus-4-5-20251101",
    llm_base_url: "",
    agent: "CodeActAgent",
    language: "en",
    llm_api_key: null,
    llm_api_key_set: false,
    search_api_key_set: false,
    confirmation_mode: false,
    security_analyzer: "llm",
    remote_runtime_resource_factor: 1,
    provider_tokens_set: {},
    enable_default_condenser: true,
    condenser_max_size: 240,
    enable_sound_notifications: false,
    user_consents_to_analytics: false,
    enable_proactive_conversation_starters: false,
    enable_solvability_analysis: false,
    max_budget_per_task: null,
    agent_settings_schema: AGENT_SETTINGS_SCHEMA,
    agent_settings: {
      llm: {
        model: "openhands/claude-opus-4-5-20251101",
        api_key: null,
        base_url: null,
      },
    },
  };
}

async function seedLocalBackend(page: Page) {
  await page.addInitScript(() => {
    const testWindow = window as Window & {
      __SETUP_BACKENDS_REQUESTS__?: number;
    };
    testWindow.__SETUP_BACKENDS_REQUESTS__ = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl =
        typeof input === "string" || input instanceof URL
          ? input.toString()
          : input.url;
      const url = new URL(requestUrl, window.location.href);
      if (url.pathname === "/setup/backends") {
        testWindow.__SETUP_BACKENDS_REQUESTS__ =
          (testWindow.__SETUP_BACKENDS_REQUESTS__ ?? 0) + 1;
        return Response.json({
          backends: [
            {
              id: "cloud-prod",
              name: "OpenHands Cloud",
              host: "https://app.all-hands.dev",
              api_key: "cloud-api-key-from-setup-backend",
              kind: "cloud",
            },
          ],
        });
      }
      return originalFetch(input, init);
    };

    window.localStorage.setItem("openhands-onboarded", "true");
    window.localStorage.setItem("analytics-consent", "true");
    window.localStorage.setItem(
      "openhands-backends",
      JSON.stringify([
        {
          id: "local-dev",
          name: "Local Agent Server",
          host: window.location.origin,
          apiKey: "",
          kind: "local",
        },
        {
          id: "cloud-prod",
          name: "OpenHands Cloud",
          host: "https://app.all-hands.dev",
          apiKey: "",
          kind: "cloud",
        },
      ]),
    );
    window.localStorage.setItem(
      "openhands-active-backend",
      JSON.stringify({ backendId: "cloud-prod", orgId: null }),
    );
  });
}

async function mockSettingsApis(page: Page) {
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeSettingsResponse()),
    });
  });

  await page.route("**/api/settings/agent-schema", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(AGENT_SETTINGS_SCHEMA),
    });
  });

  await page.route("**/api/settings/conversation-schema", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("**/api/llm/models**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        openhands: ["claude-opus-4-5-20251101"],
        openai: ["gpt-4o"],
      }),
    });
  });

  await page.route("**/api/llm/providers**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(["openhands", "openai"]),
    });
  });
}

test("OpenHands LLM settings reuse setup backend Cloud credentials", async ({
  page,
}) => {
  await seedLocalBackend(page);
  await mockSettingsApis(page);

  await page.goto("/settings", { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 5000 })
    .catch(() => undefined);

  await expect(
    page.getByTestId("llm-api-key-input-cloud-login-detected"),
  ).toBeVisible();
  await expect(
    page.getByTestId("llm-api-key-input-cloud-auth-select"),
  ).toHaveCount(0);

  await page.getByTestId("llm-api-key-input-get-openhands-lm-key").click();

  await expect(page.getByTestId("llm-api-key-input")).toHaveValue(
    "mock-openhands-lm-api-key",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __SETUP_BACKENDS_REQUESTS__?: number })
            .__SETUP_BACKENDS_REQUESTS__ ?? 0,
      ),
    )
    .toBeGreaterThan(0);
});
