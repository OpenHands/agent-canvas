import { test, expect, Page, Route } from "@playwright/test";

const SNAPSHOT_OPTIONS = {
  animations: "disabled" as const,
  maxDiffPixelRatio: 0.01,
  maxDiffPixels: 500,
};

/**
 * Visual snapshot tests for the LLM settings page API key auth section.
 *
 * When an `openhands/*` model is selected, the page shows:
 * - Optional existing Cloud login reuse controls
 * - "Login with OpenHands" device flow button
 * - "or enter manually" divider
 * - Standard API key input
 *
 * When a non-openhands model is selected, only the standard API key
 * input + help link is shown.
 */

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

interface StoredCloudBackendSnapshot {
  id: string;
  name: string;
  host: string;
  api_key: string;
}

type CloudProxyMode =
  | "default"
  | "device-starting"
  | "device-awaiting"
  | "device-error";

function makeSettingsResponse(overrides: Record<string, unknown> = {}) {
  return {
    llm_model: "openhands/claude-opus-4-5-20251101",
    llm_base_url: "",
    agent: "CodeActAgent",
    language: "en",
    llm_api_key: null,
    llm_api_key_set: true,
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
    ...overrides,
  };
}

async function setupMocks({
  page,
  settingsOverrides,
  storedCloudBackends = [],
  cloudProxyMode = "default",
  handleCloudProxy,
}: {
  page: Page;
  settingsOverrides?: Record<string, unknown>;
  storedCloudBackends?: StoredCloudBackendSnapshot[];
  cloudProxyMode?: CloudProxyMode;
  handleCloudProxy?: (route: Route) => Promise<boolean>;
}) {
  // Skip onboarding
  await page.addInitScript(
    ({
      storedCloudBackends,
      cloudProxyMode,
    }: {
      storedCloudBackends: StoredCloudBackendSnapshot[];
      cloudProxyMode: CloudProxyMode;
    }) => {
      const originalFetch = window.fetch.bind(window);

      window.fetch = async (input, init) => {
        const requestUrl =
          typeof input === "string" || input instanceof URL
            ? input.toString()
            : input.url;
        const url = new URL(requestUrl, window.location.href);

        if (url.pathname === "/setup/backends") {
          if (!init?.method || init.method === "GET") {
            return Response.json({
              backends: storedCloudBackends.map((backend) => ({
                ...backend,
                kind: "cloud",
              })),
            });
          }
          if (init.method === "POST") {
            const body =
              typeof init.body === "string" ? JSON.parse(init.body) : {};
            return Response.json({ backend: body });
          }
          return Response.json({ ok: true });
        }

        if (url.pathname.endsWith("/api/cloud-proxy")) {
          const body =
            typeof init?.body === "string" ? JSON.parse(init.body) : {};

          if (body.path === "/oauth/device/authorize") {
            if (cloudProxyMode === "device-starting") {
              return new Promise<Response>(() => undefined);
            }
            if (cloudProxyMode === "device-error") {
              return Response.json({ error: "forbidden" }, { status: 403 });
            }
            if (cloudProxyMode === "device-awaiting") {
              return Response.json({
                device_code: "device-code",
                user_code: "ABCD-EFGH",
                verification_uri: "https://app.all-hands.dev/device",
                verification_uri_complete:
                  "https://app.all-hands.dev/device?user_code=ABCD-EFGH",
                expires_in: 600,
                interval: 30,
              });
            }
          }

          if (
            body.path === "/oauth/device/token" &&
            cloudProxyMode === "device-awaiting"
          ) {
            return Response.json(
              { error: "authorization_pending" },
              { status: 400 },
            );
          }
        }

        return originalFetch(input, init);
      };

      window.open = () =>
        ({
          closed: false,
          close() {},
          opener: null,
          location: { href: "" },
        }) as Window;
      window.localStorage.setItem("openhands-onboarded", "true");
      const localBackend = {
        id: "snapshot-local",
        name: "Local Agent Server",
        host: window.location.origin,
        apiKey: "",
        kind: "local",
      };
      const cloudBackend = {
        id: "snapshot-cloud",
        name: "OpenHands Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "",
        kind: "cloud",
      };
      window.localStorage.setItem(
        "openhands-backends",
        JSON.stringify([localBackend, cloudBackend]),
      );
      window.localStorage.setItem(
        "openhands-active-backend",
        JSON.stringify({ backendId: cloudBackend.id, orgId: null }),
      );
    },
    { storedCloudBackends, cloudProxyMode },
  );

  const settingsResponse = makeSettingsResponse(settingsOverrides);

  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(settingsResponse),
      });
    } else {
      await route.continue();
    }
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

  await page.route("**/api/cloud-proxy", async (route) => {
    if (handleCloudProxy && (await handleCloudProxy(route))) return;
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "not mocked" }),
    });
  });

  await page.route("**/api/conversations/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    });
  });

  // Mock models/providers endpoint (used by ModelSelector)
  await page.route("**/api/llm/models**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        openhands: ["claude-opus-4-5-20251101", "claude-sonnet-4-20250514"],
        anthropic: ["claude-sonnet-4-20250514", "claude-haiku-3-5-20241022"],
        openai: ["gpt-4o", "gpt-4o-mini"],
      }),
    });
  });

  await page.route("**/api/llm/providers**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(["openhands", "anthropic", "openai"]),
    });
  });
}

async function dismissConsentModal(page: Page) {
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3000 })
    .catch(() => undefined);
}

async function navigateToSettings(page: Page) {
  await page.goto("/settings", { waitUntil: "networkidle" });
  await dismissConsentModal(page);

  const rootLayout = page.getByTestId("root-layout");
  await expect(rootLayout).toBeVisible({ timeout: 15000 });
  return rootLayout;
}

test.describe("LLM Settings Auth Section", () => {
  test.setTimeout(60000);

  test("shows Login with OpenHands for openhands model", async ({ page }) => {
    await setupMocks({ page });
    const rootLayout = await navigateToSettings(page);

    // The auth section should be visible with the device flow login button
    const authSection = page.getByTestId("llm-api-key-input-auth");
    await expect(authSection).toBeVisible({ timeout: 10000 });

    // The login button should be present
    const loginButton = page.getByTestId("llm-api-key-input-login-button");
    await expect(loginButton).toBeVisible();

    // Snapshot the settings page with openhands model auth section
    await expect(rootLayout).toHaveScreenshot(
      "llm-settings-openhands-auth.png",
      SNAPSHOT_OPTIONS,
    );
  });

  test("shows standard API key input for non-openhands model", async ({
    page,
  }) => {
    await setupMocks({
      page,
    });
    const rootLayout = await navigateToSettings(page);

    await page.getByRole("combobox", { name: "LLM Provider" }).click();
    await page.getByRole("option", { name: "OpenAI" }).click();
    await page.getByRole("combobox", { name: "LLM Model" }).click();
    await page.getByRole("option", { name: "gpt-4o", exact: true }).click();

    await expect(page.getByTestId("llm-api-key-input")).toBeVisible();
    await expect(page.getByTestId("llm-api-key-input-auth")).not.toBeVisible();
    await expect(page.getByTestId("llm-api-key-help-anchor")).toBeVisible();

    await expect(rootLayout).toHaveScreenshot(
      "llm-settings-standard-api-key.png",
      SNAPSHOT_OPTIONS,
    );
  });

  test("shows existing Cloud login reuse controls", async ({ page }) => {
    await setupMocks({
      page,
      storedCloudBackends: [
        {
          id: "cloud-prod",
          name: "OpenHands Cloud",
          host: "https://app.all-hands.dev",
          api_key: "cloud-api-key",
        },
      ],
    });
    const rootLayout = await navigateToSettings(page);

    await expect(
      page.getByTestId("llm-api-key-input-cloud-login-detected"),
    ).toBeVisible();
    await expect(
      page.getByTestId("llm-api-key-input-get-openhands-lm-key"),
    ).toBeVisible();

    await expect(rootLayout).toHaveScreenshot(
      "llm-settings-existing-cloud-login.png",
      SNAPSHOT_OPTIONS,
    );
  });

  test("shows LM key fetch error for existing Cloud login", async ({
    page,
  }) => {
    await setupMocks({
      page,
      storedCloudBackends: [
        {
          id: "cloud-prod",
          name: "OpenHands Cloud",
          host: "https://app.all-hands.dev",
          api_key: "cloud-error-key",
        },
      ],
    });
    const rootLayout = await navigateToSettings(page);

    await page.getByTestId("llm-api-key-input-get-openhands-lm-key").click();
    await expect(page.getByRole("alert")).toBeVisible();

    await expect(rootLayout).toHaveScreenshot(
      "llm-settings-existing-cloud-login-error.png",
      SNAPSHOT_OPTIONS,
    );
  });

  test("shows device flow starting state", async ({ page }) => {
    await setupMocks({
      page,
      cloudProxyMode: "device-starting",
    });
    const rootLayout = await navigateToSettings(page);

    await page.getByTestId("llm-api-key-input-login-button").click();
    await expect(
      page.getByTestId("llm-api-key-input-auth-starting"),
    ).toBeVisible();

    await expect(rootLayout).toHaveScreenshot(
      "llm-settings-device-flow-starting.png",
      SNAPSHOT_OPTIONS,
    );
  });

  test("shows device flow awaiting authorization state", async ({ page }) => {
    await setupMocks({
      page,
      cloudProxyMode: "device-awaiting",
    });
    const rootLayout = await navigateToSettings(page);

    await page.getByTestId("llm-api-key-input-login-button").click();
    await expect(
      page.getByTestId("llm-api-key-input-auth-awaiting"),
    ).toBeVisible();

    await expect(rootLayout).toHaveScreenshot(
      "llm-settings-device-flow-awaiting.png",
      SNAPSHOT_OPTIONS,
    );
  });

  test("shows device flow error state", async ({ page }) => {
    await setupMocks({
      page,
      cloudProxyMode: "device-error",
    });
    const rootLayout = await navigateToSettings(page);

    await page.getByTestId("llm-api-key-input-login-button").click();
    await expect(
      page.getByTestId("llm-api-key-input-auth-error"),
    ).toBeVisible();

    await expect(rootLayout).toHaveScreenshot(
      "llm-settings-device-flow-error.png",
      SNAPSHOT_OPTIONS,
    );
  });
});
