import { test, expect } from "@playwright/test";
import {
  BACKEND_URL,
  MOCK_LLM_AGENT_URL,
  SESSION_API_KEY,
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
  createProfileViaUI,
  deleteProfileIfExists,
  selectDropdownOption,
} from "../utils/mock-llm-helpers";

const AUTOMATION_API_BASE = `${BACKEND_URL}/api/automation/v1`;
const INITIAL_PROFILE = "e2e-automation-profile-initial";
const UPDATED_PROFILE = "e2e-automation-profile-updated";
const AUTOMATION_NAME = "E2E Profile Edit Automation";
const AUTOMATION_SCHEDULE = "0 12 * * *";
const MOCK_MODEL = "openai/mock-test-model";

async function createAutomation(
  request: import("@playwright/test").APIRequestContext,
) {
  const response = await request.post(`${AUTOMATION_API_BASE}/preset/prompt`, {
    headers: {
      "X-Session-API-Key": SESSION_API_KEY,
      "Content-Type": "application/json",
    },
    data: {
      name: AUTOMATION_NAME,
      prompt: "Echo the automation profile edit test token.",
      trigger: {
        type: "cron",
        schedule: AUTOMATION_SCHEDULE,
        timezone: "UTC",
      },
    },
  });
  expect(
    response.ok(),
    `POST automation preset returned ${response.status()}`,
  ).toBe(true);
  return (await response.json()) as { id: string };
}

async function updateAutomation(
  request: import("@playwright/test").APIRequestContext,
  automationId: string,
  body: Record<string, unknown>,
) {
  const response = await request.patch(
    `${AUTOMATION_API_BASE}/${encodeURIComponent(automationId)}`,
    {
      headers: {
        "X-Session-API-Key": SESSION_API_KEY,
        "Content-Type": "application/json",
      },
      data: body,
    },
  );
  expect(
    response.ok(),
    `PATCH automation ${automationId} returned ${response.status()}`,
  ).toBe(true);
  return response.json();
}

async function getAutomationModel(
  request: import("@playwright/test").APIRequestContext,
  automationId: string,
) {
  const response = await request.get(
    `${AUTOMATION_API_BASE}/${encodeURIComponent(automationId)}`,
    {
      headers: { "X-Session-API-Key": SESSION_API_KEY },
    },
  );
  expect(
    response.ok(),
    `GET automation ${automationId} returned ${response.status()}`,
  ).toBe(true);
  const automation = (await response.json()) as { model?: string | null };
  return automation.model ?? null;
}

async function deleteAutomation(
  request: import("@playwright/test").APIRequestContext,
  automationId: string,
) {
  await request.delete(
    `${AUTOMATION_API_BASE}/${encodeURIComponent(automationId)}`,
    {
      headers: { "X-Session-API-Key": SESSION_API_KEY },
    },
  );
}

test.describe.configure({ mode: "serial" });

test.describe("mock-LLM edit automation profile", () => {
  const automationIds = new Set<string>();

  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  test.afterEach(async ({ request }) => {
    for (const automationId of Array.from(automationIds)) {
      try {
        await deleteAutomation(request, automationId);
        automationIds.delete(automationId);
      } catch {
        // best-effort cleanup
      }
    }
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await seedLocalStorage(page);
      await routeSessionApiKey(page);
      await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
      await dismissAnalyticsModal(page);
      await waitForTestId(page, "add-llm-profile");
      await deleteProfileIfExists(page, INITIAL_PROFILE);
      await deleteProfileIfExists(page, UPDATED_PROFILE);
    } catch {
      // best-effort cleanup
    } finally {
      await page.close();
    }
  });

  test("updates the LLM profile from the Edit Automation modal", async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    await routeSessionApiKey(page);

    await test.step("create selectable LLM profiles", async () => {
      await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
      await dismissAnalyticsModal(page);
      await waitForTestId(page, "add-llm-profile");
      await deleteProfileIfExists(page, INITIAL_PROFILE);
      await deleteProfileIfExists(page, UPDATED_PROFILE);
      await createProfileViaUI(page, {
        profileName: INITIAL_PROFILE,
        model: MOCK_MODEL,
        baseUrl: MOCK_LLM_AGENT_URL,
      });
      await createProfileViaUI(page, {
        profileName: UPDATED_PROFILE,
        model: MOCK_MODEL,
        baseUrl: MOCK_LLM_AGENT_URL,
      });
    });

    const automation =
      await test.step("create automation with an existing profile", async () => {
        const created = await createAutomation(request);
        automationIds.add(created.id);
        await updateAutomation(request, created.id, { model: INITIAL_PROFILE });
        await expect
          .poll(() => getAutomationModel(request, created.id), {
            timeout: 15_000,
            message: "automation should start with the initial profile",
          })
          .toBe(INITIAL_PROFILE);
        return created;
      });

    await test.step("select a different profile in the edit modal", async () => {
      await page.goto(`/automations/${automation.id}`, {
        waitUntil: "domcontentloaded",
      });
      await dismissAnalyticsModal(page);
      await expect(page.getByText(AUTOMATION_NAME)).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(INITIAL_PROFILE)).toBeVisible();

      await page.getByLabel("Automation actions").click();
      await page.getByText("Edit", { exact: true }).click();
      await waitForTestId(page, "edit-automation-model");

      await selectDropdownOption(page, "LLM profile", UPDATED_PROFILE);
      await page.getByTestId("edit-automation-save").click();
      await expect(page.getByTestId("edit-automation-save")).toBeHidden({
        timeout: 15_000,
      });
    });

    await test.step("persist and display the updated profile", async () => {
      await expect
        .poll(() => getAutomationModel(request, automation.id), {
          timeout: 15_000,
          message: "automation PATCH should persist the selected profile",
        })
        .toBe(UPDATED_PROFILE);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText(UPDATED_PROFILE)).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(INITIAL_PROFILE)).toHaveCount(0);
    });
  });
});
