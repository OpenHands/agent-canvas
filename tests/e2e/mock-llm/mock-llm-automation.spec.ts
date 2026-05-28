/**
 * Mock-LLM E2E test: Create a cron automation and dispatch a run.
 *
 * Exercises the full automation lifecycle through the UI + mock LLM:
 *
 *   1. Navigate to the Automations page
 *   2. Click "Add Automation" → "Create Automation" (launches a conversation)
 *   3. The mock LLM creates a cron automation via terminal tool calls (curl
 *      to the mock automation API) and dispatches a run
 *   4. Verify the automation was created and the run completed
 *
 * The automation API is served by a lightweight mock server (mock-automation-
 * server.py). Browser requests to /api/automation/* are intercepted by
 * Playwright and forwarded to the mock server, while terminal curl commands
 * hit it directly.
 *
 * The test is self-contained: it configures the mock LLM profile via the
 * settings API (no dependency on conversation test ordering).
 */

import { test, expect } from "@playwright/test";
import {
  MOCK_AUTOMATION_URL,
  seedLocalStorage,
  routeSessionApiKey,
  routeAutomationApiToMock,
  dismissAnalyticsModal,
  waitForTestId,
  waitForPath,
  getConversationIdFromURL,
  waitForNonUserMessageText,
  deleteConversation,
  resetMockAutomation,
  registerTrajectory,
  activateTrajectory,
  resetMockLLM,
  listMockAutomations,
  waitForRunStatus,
  ensureMockLLMProfile,
} from "./utils/mock-llm-helpers";

// ── Tokens that the test verifies in agent output ──────────────────────

const AUTOMATION_CREATE_TOKEN = "MOCK_AUTOMATION_CREATED_OK";
const AUTOMATION_DISPATCH_TOKEN = "MOCK_AUTOMATION_DISPATCHED_OK";
const AUTOMATION_REPLY_TOKEN = "MOCK_AUTOMATION_REPLY_OK";

const AUTOMATION_NAME = "Hello World Cron";
const CRON_SCHEDULE = "0 9 * * *";

test.describe.configure({ mode: "serial" });

test.describe("mock-LLM automation lifecycle", () => {
  const conversationIds = new Set<string>();

  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  test.afterEach(async ({ page, request }) => {
    const match = page.url().match(/\/conversations\/([^/?#]+)/);
    if (match?.[1]) conversationIds.add(decodeURIComponent(match[1]));

    for (const id of Array.from(conversationIds)) {
      try {
        await deleteConversation(request, id);
        conversationIds.delete(id);
      } catch {
        // best-effort cleanup
      }
    }
  });

  // ── Step 1: Ensure LLM profile + register the automation trajectory ─

  test("step 1: setup LLM profile, register trajectory, reset mock state", async ({
    request,
  }) => {
    // Ensure the mock LLM profile is configured (creates it via API if
    // the conversation test hasn't run yet or the state was cleared)
    await ensureMockLLMProfile(request);

    // Reset the mock automation server (clear any leftover state)
    await resetMockAutomation(request);

    // Build the terminal commands the mock LLM will return.
    //
    // Turn 1: Create the automation via curl, save result to a file so
    //         turn 2 can extract the automation ID.
    // Turn 2: Read the ID from the file and dispatch a run.
    // Turn 3: Text reply with a verification token.

    const createCmd = [
      `curl -sf -X POST '${MOCK_AUTOMATION_URL}/api/automation/v1/preset/prompt'`,
      `-H 'Content-Type: application/json'`,
      `-d '${JSON.stringify({
        name: AUTOMATION_NAME,
        prompt: "echo hello world",
        trigger: { type: "cron", schedule: CRON_SCHEDULE, timezone: "UTC" },
      })}'`,
      `-o /tmp/mock_auto_result.json`,
      `&& cat /tmp/mock_auto_result.json`,
      `&& printf '${AUTOMATION_CREATE_TOKEN}\\n'`,
    ].join(" ");

    const dispatchCmd = [
      `AID=$(python3 -c "import json; print(json.load(open('/tmp/mock_auto_result.json'))['id'])")`,
      `&& curl -sf -X POST "${MOCK_AUTOMATION_URL}/api/automation/v1/$AID/dispatch"`,
      `-H 'Content-Type: application/json'`,
      `&& printf '${AUTOMATION_DISPATCH_TOKEN}\\n'`,
    ].join(" ");

    await registerTrajectory(request, "automation-lifecycle", [
      {
        tool_call: {
          name: "terminal",
          arguments: { command: createCmd },
        },
      },
      {
        tool_call: {
          name: "terminal",
          arguments: { command: dispatchCmd },
        },
      },
      { text: AUTOMATION_REPLY_TOKEN },
    ]);

    // Activate it so the mock LLM uses this trajectory for the next conversation
    await activateTrajectory(request, "automation-lifecycle");
  });

  // ── Step 2: Navigate to Automations → Create Automation → conversation ─

  test("step 2: create automation and dispatch run via the UI", async ({
    page,
    request,
  }) => {
    // Ensure the automation trajectory is active (in case the server was
    // restarted between test retries)
    await activateTrajectory(request, "automation-lifecycle");

    await routeSessionApiKey(page);
    await routeAutomationApiToMock(page);

    // Navigate to the automations page
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    // The automations page should show the Add Automation button
    // (mock automation server returns healthy status)
    await test.step("click Add Automation", async () => {
      await waitForTestId(page, "automations-add-automation", 15_000);
      await page.getByTestId("automations-add-automation").click();
    });

    // The modal with "Create Automation" button should appear.
    // Scope the click to the modal because the empty-state page also
    // renders a button with the same testId.
    await test.step("click Create Automation in modal", async () => {
      const modal = page.getByTestId("add-automation-modal");
      await expect(modal).toBeVisible({ timeout: 10_000 });
      const createBtn = modal.getByTestId("automations-create-automation");
      await expect(createBtn).toBeVisible({ timeout: 10_000 });
      await createBtn.click();
    });

    // This navigates to /conversations and auto-sends "Create an automation"
    await test.step("wait for conversation to start", async () => {
      // The app navigates to the home page first, then creates a conversation
      // Wait for the URL to contain /conversations (could be home or specific ID)
      await waitForPath(page, /\/conversations/, 15_000);

      // The message auto-submit happens after navigation; wait for either
      // a conversation ID in the URL or the chat interface to appear
      // Give time for the conversation creation flow
      await page.waitForTimeout(2_000);

      // If we're on the home page, the message should auto-submit.
      // Wait for navigation to a specific conversation.
      await waitForPath(page, /\/conversations\/.+/, 30_000);
    });

    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);

    // ── Verify: the LLM reply token appears in the chat UI ──

    await test.step("verify LLM reply token in chat UI", async () => {
      await waitForNonUserMessageText(page, AUTOMATION_REPLY_TOKEN, 45_000);
    });

    // ── Verify: automation was created in the mock server ──

    await test.step("verify automation was created", async () => {
      const data = await listMockAutomations(request);
      expect(data.total, "Expected at least 1 automation").toBeGreaterThanOrEqual(1);

      const created = data.automations.find(
        (a) => a.name === AUTOMATION_NAME,
      );
      expect(created, `Automation "${AUTOMATION_NAME}" not found`).toBeTruthy();
      expect((created as any).trigger?.schedule).toBe(CRON_SCHEDULE);
      expect((created as any).enabled).toBe(true);
    });

    // ── Verify: run was dispatched and completed ──

    await test.step("verify run dispatched and completed", async () => {
      const data = await listMockAutomations(request);
      const automation = data.automations.find(
        (a) => a.name === AUTOMATION_NAME,
      );
      expect(automation, "Automation should exist for run check").toBeTruthy();

      // The mock automation server auto-completes runs after ~0.5s
      await waitForRunStatus(request, automation!.id, "COMPLETED", 10_000);
    });

    // ── Verify: no error banners ──

    await test.step("verify no error banners", async () => {
      const errorBanner = page.getByTestId("error-message-banner");
      await expect(errorBanner).not.toBeVisible({ timeout: 2_000 });
    });
  });

  // ── Step 3: Navigate back to automations and verify UI shows it ──────

  test("step 3: verify automation appears on the automations page", async ({
    page,
    request,
  }) => {
    await routeSessionApiKey(page);
    await routeAutomationApiToMock(page);
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    await test.step("automation card visible", async () => {
      // Wait for the page to load and show automation cards
      // The mock automation server still has the automation from step 2
      await waitForTestId(page, "automations-add-automation", 15_000);

      // Check that the automation name appears on the page
      const pageText = await page.textContent("body");
      expect(
        pageText?.includes(AUTOMATION_NAME),
        `Expected "${AUTOMATION_NAME}" to appear on the automations page`,
      ).toBe(true);
    });

    await test.step("verify run completed via API", async () => {
      const data = await listMockAutomations(request);
      const automation = data.automations.find(
        (a) => a.name === AUTOMATION_NAME,
      );
      expect(automation).toBeTruthy();

      await waitForRunStatus(request, automation!.id, "COMPLETED", 5_000);
    });
  });

  // ── Cleanup: reset mock servers for other test suites ──────────────

  test("cleanup: reset mock servers", async ({ request }) => {
    await resetMockAutomation(request);
    await resetMockLLM(request);
  });
});
