import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  BACKEND_URL,
  SESSION_API_KEY,
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
  ensureMockLLMProfileViaAPI,
} from "../utils/mock-llm-helpers";

const AGENT_SETTINGS_PATH = "/settings/agent";
const TOOL_CONCURRENCY_INPUT_TEST_ID = "sdk-settings-tool_concurrency_limit";
const DEFAULT_TOOL_CONCURRENCY_LIMIT = 1;
const UPDATED_TOOL_CONCURRENCY_LIMIT = 4;

async function patchAgentSettings(
  request: APIRequestContext,
  agentSettingsDiff: Record<string, unknown>,
) {
  const resp = await request.patch(`${BACKEND_URL}/api/settings`, {
    headers: {
      "X-Session-API-Key": SESSION_API_KEY,
      "Content-Type": "application/json",
    },
    data: { agent_settings_diff: agentSettingsDiff },
  });
  expect(resp.ok(), `PATCH /api/settings: ${resp.status()}`).toBe(true);
}

async function getAgentSettings(request: APIRequestContext) {
  const resp = await request.get(`${BACKEND_URL}/api/settings`, {
    headers: { "X-Session-API-Key": SESSION_API_KEY },
  });
  expect(resp.ok(), `GET /api/settings: ${resp.status()}`).toBe(true);
  const settings = await resp.json();
  return settings?.agent_settings as Record<string, unknown>;
}

async function resetOpenHandsAgentSettings(request: APIRequestContext) {
  await patchAgentSettings(request, {
    agent_kind: "openhands",
    enable_sub_agents: false,
    tool_concurrency_limit: DEFAULT_TOOL_CONCURRENCY_LIMIT,
  });
}

test.describe.configure({ mode: "serial" });

test.describe("Agent Settings", () => {
  test.beforeEach(async ({ page, request }) => {
    await seedLocalStorage(page);
    await ensureMockLLMProfileViaAPI(request);
    await resetOpenHandsAgentSettings(request);
  });

  test.afterEach(async ({ request }) => {
    await resetOpenHandsAgentSettings(request).catch(() => {});
  });

  test("saves the OpenHands parallel tool call limit", async ({
    page,
    request,
  }) => {
    await routeSessionApiKey(page);
    await page.goto(AGENT_SETTINGS_PATH, { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "agent-settings-screen");

    const input = page.getByTestId(TOOL_CONCURRENCY_INPUT_TEST_ID);
    await expect(input).toBeVisible({ timeout: 10_000 });
    await expect(input).toHaveValue(String(DEFAULT_TOOL_CONCURRENCY_LIMIT));

    await input.fill(String(UPDATED_TOOL_CONCURRENCY_LIMIT));

    const saveButton = page.getByTestId("agent-save-button");
    await expect(saveButton).toBeEnabled({ timeout: 5_000 });
    await saveButton.click();
    await expect(saveButton).toBeDisabled({ timeout: 10_000 });

    await expect
      .poll(async () => {
        const agentSettings = await getAgentSettings(request);
        return agentSettings.tool_concurrency_limit;
      })
      .toBe(UPDATED_TOOL_CONCURRENCY_LIMIT);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForTestId(page, "agent-settings-screen");
    await expect(page.getByTestId(TOOL_CONCURRENCY_INPUT_TEST_ID)).toHaveValue(
      String(UPDATED_TOOL_CONCURRENCY_LIMIT),
    );
  });
});
