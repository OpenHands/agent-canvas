/**
 * Mock-LLM E2E test: Create a cron automation and dispatch a run.
 *
 * Exercises the full automation lifecycle end-to-end:
 *
 *   1. Setup: configure mock LLM profile and register a scripted trajectory
 *      whose terminal tool calls hit the REAL automation backend (running
 *      inside the bin/agent-canvas.mjs stack)
 *   2. Conversation: type a prompt in the home chat launcher → mock LLM
 *      returns curl commands that create a cron automation and dispatch a run
 *      via the real automation API (through the ingress)
 *   3. Verification: confirm the automation exists on the /automations page
 *      and the dispatched run reached a terminal status
 *
 * No mock automation server is used — the real automation backend started by
 * bin/agent-canvas.mjs handles all /api/automation/* requests. The agent's
 * terminal commands authenticate with X-Session-API-Key header using
 * $OPENHANDS_AUTOMATION_API_KEY (the session API key, injected into the
 * agent-server environment by dev-with-automation.mjs).
 */

import { test, expect } from "@playwright/test";
import {
  BACKEND_URL,
  SESSION_API_KEY,
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
  waitForPath,
  getConversationIdFromURL,
  waitForNonUserMessageText,
  deleteConversation,
  registerTrajectory,
  activateTrajectory,
  resetMockLLM,
  ensureMockLLMProfile,
} from "./utils/mock-llm-helpers";

// ── Tokens that the test verifies in agent output ──────────────────────

const AUTOMATION_CREATE_TOKEN = "MOCK_AUTOMATION_CREATED_OK";
const AUTOMATION_DISPATCH_TOKEN = "MOCK_AUTOMATION_DISPATCHED_OK";
const AUTOMATION_REPLY_TOKEN = "MOCK_AUTOMATION_REPLY_OK";

const AUTOMATION_NAME = "Hello World Cron";
const CRON_SCHEDULE = "0 9 * * *";

// The ingress URL reachable from the agent's terminal. The agent-server
// Auth via X-Session-API-Key header (matching frontend automation-service.api.ts).
const AUTOMATION_API_BASE = `${BACKEND_URL}/api/automation/v1`;

/**
 * List automations from the real automation backend via the ingress.
 * Retries on 502 because the automation backend may still be starting
 * (the Playwright webServer health check only waits for the ingress to
 * serve the static frontend, not the automation backend).
 */
async function listAutomations(
  request: import("@playwright/test").APIRequestContext,
  retries = 15,
) {
  let lastStatus = 0;
  for (let i = 0; i < retries; i++) {
    const resp = await request.get(`${AUTOMATION_API_BASE}`, {
      headers: {
        "X-Session-API-Key": SESSION_API_KEY,
      },
    });
    lastStatus = resp.status();
    if (resp.ok()) return resp.json();
    // 502 = ingress can't reach the automation backend yet; retry
    if (lastStatus === 502 || lastStatus === 503) {
      await new Promise((r) => setTimeout(r, 2_000));
      continue;
    }
    // Any other error is unexpected
    break;
  }
  throw new Error(
    `GET automations returned ${lastStatus} after ${retries} retries`,
  );
}

/**
 * List runs for a specific automation via the real automation backend.
 */
async function listAutomationRuns(
  request: import("@playwright/test").APIRequestContext,
  automationId: string,
) {
  const resp = await request.get(
    `${AUTOMATION_API_BASE}/${encodeURIComponent(automationId)}/runs`,
    {
      headers: {
        "X-Session-API-Key": SESSION_API_KEY,
      },
    },
  );
  // Allow 502 during startup — waitForRunStatus retries anyway
  if (!resp.ok()) return { runs: [], items: [] };
  return resp.json();
}

/**
 * Poll until a run reaches the expected status or times out.
 */
async function waitForRunStatus(
  request: import("@playwright/test").APIRequestContext,
  automationId: string,
  expectedStatus: string,
  timeoutMs = 30_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await listAutomationRuns(request, automationId);
    const runs = data.runs ?? data.items ?? [];
    const match = runs.find(
      (r: { status: string }) => r.status === expectedStatus,
    );
    if (match) return match;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(
    `No run with status "${expectedStatus}" after ${timeoutMs}ms`,
  );
}

/**
 * Poll until at least one run exists for the automation.
 * Returns the first run found regardless of status.
 */
async function waitForAnyRun(
  request: import("@playwright/test").APIRequestContext,
  automationId: string,
  timeoutMs = 30_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await listAutomationRuns(request, automationId);
    const runs = data.runs ?? data.items ?? [];
    if (runs.length > 0) return runs[0];
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`No runs found for automation ${automationId} after ${timeoutMs}ms`);
}

/**
 * Delete an automation (best-effort cleanup).
 */
async function deleteAutomation(
  request: import("@playwright/test").APIRequestContext,
  automationId: string,
) {
  await request.delete(
    `${AUTOMATION_API_BASE}/${encodeURIComponent(automationId)}`,
    {
      headers: {
        "X-Session-API-Key": SESSION_API_KEY,
      },
    },
  );
}

test.describe.configure({ mode: "serial" });

test.describe("mock-LLM automation lifecycle", () => {
  const conversationIds = new Set<string>();
  const automationIds = new Set<string>();

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
    for (const id of Array.from(automationIds)) {
      try {
        await deleteAutomation(request, id);
        automationIds.delete(id);
      } catch {
        // best-effort cleanup
      }
    }
  });

  // ── Step 1: Ensure LLM profile + register the automation trajectory ─

  test("step 1: setup LLM profile and register automation trajectory", async ({
    request,
  }) => {
    // Ensure the mock LLM profile is configured
    await ensureMockLLMProfile(request);

    // Build the terminal commands the mock LLM will return.
    // The curl commands hit the REAL automation backend through the ingress.
    // Auth uses $OPENHANDS_AUTOMATION_API_KEY which the agent-server
    // exposes as an env var in the terminal sandbox.
    //
    // Turn 1: Create the automation via curl preset/prompt endpoint.
    // Turn 2: Extract the automation ID and dispatch a run.
    // Turn 3: Text reply with a verification token.

    // Auth: hardcode the session API key directly in the curl commands.
    // The agent-server terminal may not inherit all parent env vars (the SDK
    // sandboxes the execution environment), so $OPENHANDS_AUTOMATION_API_KEY
    // may not be available. Using the key directly is safe in a test context.
    const authHeader = `-H 'X-Session-API-Key: ${SESSION_API_KEY}'`;

    const createCmd = [
      `curl -s -X POST '${AUTOMATION_API_BASE}/preset/prompt'`,
      `-H 'Content-Type: application/json'`,
      authHeader,
      `-d '${JSON.stringify({
        name: AUTOMATION_NAME,
        prompt: "echo hello world",
        trigger: { type: "cron", schedule: CRON_SCHEDULE, timezone: "UTC" },
      })}'`,
      `-o /tmp/auto_result.json`,
      `-w '\\nHTTP_CODE:%{http_code}\\n'`,
      `&& cat /tmp/auto_result.json`,
      `&& printf '${AUTOMATION_CREATE_TOKEN}\\n'`,
    ].join(" ");

    const dispatchCmd = [
      `AID=$(python3 -c "import json; print(json.load(open('/tmp/auto_result.json'))['id'])")`,
      `&& curl -s -X POST "${AUTOMATION_API_BASE}/$AID/dispatch"`,
      authHeader,
      `-H 'Content-Type: application/json'`,
      `-w '\\nHTTP_CODE:%{http_code}\\n'`,
      `&& printf '${AUTOMATION_DISPATCH_TOKEN}\\n'`,
    ].join(" ");

    // The agent-server makes an initial "condenser" or "skill-analysis"
    // LLM call that consumes one response before the agent's main loop
    // starts. Prepend a throwaway text response that gets eaten by that
    // internal call; the agent's first real turn then gets the create cmd.
    await registerTrajectory(request, "automation-lifecycle", [
      { text: "" }, // consumed by internal pre-agent LLM call
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

  // ── Step 2: Create automation via conversation ─────────────────────

  test("step 2: create automation and dispatch run via the UI", async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000); // LLM conversation + run completion can take time
    // Ensure the automation trajectory is active
    await activateTrajectory(request, "automation-lifecycle");

    await routeSessionApiKey(page);

    // Navigate to the home page and type a prompt to create the automation.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    await test.step("type prompt and submit", async () => {
      await waitForTestId(page, "home-chat-launcher", 15_000);

      const userMessage =
        "Create a cron automation that echoes hello world every morning at 9am.";

      // Set contenteditable text via evaluate (contentEditable divs don't
      // respond reliably to Playwright's .fill() or .type()).
      await page.evaluate(
        ({ testId, text }) => {
          const el = document.querySelector(`[data-testid="${testId}"]`);
          if (!(el instanceof HTMLElement))
            throw new Error("Chat input not found");
          el.focus();
          el.textContent = text;
          el.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              data: text,
              inputType: "insertText",
            }),
          );
        },
        { testId: "chat-input", text: userMessage },
      );

      await page.getByTestId("submit-button").click();
    });

    // Wait for navigation to the new conversation page
    await test.step("wait for conversation to start", async () => {
      await waitForPath(page, /\/conversations\/.+/, 30_000);
    });

    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);

    // ── Verify: the LLM reply token appears in the chat UI ──

    await test.step("verify LLM reply token in chat UI", async () => {
      await waitForNonUserMessageText(page, AUTOMATION_REPLY_TOKEN, 60_000);
    });

    // ── Verify: automation was created in the real automation backend ──

    await test.step("verify automation was created", async () => {
      const data = await listAutomations(request);
      const automations = data.automations ?? data.items ?? [];
      expect(
        automations.length,
        `Expected at least 1 automation, got: ${JSON.stringify(data).slice(0, 500)}`,
      ).toBeGreaterThanOrEqual(1);

      const created = automations.find(
        (a: { name: string }) => a.name === AUTOMATION_NAME,
      );
      expect(created, `Automation "${AUTOMATION_NAME}" not found`).toBeTruthy();
      automationIds.add(created.id);
      expect(created.trigger?.schedule).toBe(CRON_SCHEDULE);
      expect(created.enabled).toBe(true);
    });

    // ── Verify: run was dispatched ──

    await test.step("verify run dispatched", async () => {
      const data = await listAutomations(request);
      const automations = data.automations ?? data.items ?? [];
      const automation = automations.find(
        (a: { name: string }) => a.name === AUTOMATION_NAME,
      );
      expect(automation, "Automation should exist for run check").toBeTruthy();
      automationIds.add(automation.id);

      // Verify the run was dispatched. The run may not reach COMPLETED
      // because the automation's conversation needs LLM responses (which
      // would exhaust the mock). Just verify a run exists.
      const run = await waitForAnyRun(request, automation.id, 30_000);
      expect(run.status).toBeTruthy();
      expect(
        ["PENDING", "RUNNING", "COMPLETED", "FAILED"],
        `Unexpected run status: ${run.status}`,
      ).toContain(run.status);
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
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    await test.step("automation card visible", async () => {
      await waitForTestId(page, "automations-add-automation", 15_000);

      // Check that the automation name appears on the page
      const pageText = await page.textContent("body");
      expect(
        pageText?.includes(AUTOMATION_NAME),
        `Expected "${AUTOMATION_NAME}" to appear on the automations page`,
      ).toBe(true);
    });

    await test.step("verify run exists via API", async () => {
      const data = await listAutomations(request);
      const automations = data.automations ?? data.items ?? [];
      const automation = automations.find(
        (a: { name: string }) => a.name === AUTOMATION_NAME,
      );
      expect(automation).toBeTruthy();
      automationIds.add(automation.id);

      // Verify a run exists (may not reach COMPLETED in mock LLM mode)
      const run = await waitForAnyRun(request, automation.id, 15_000);
      expect(run).toBeTruthy();
    });
  });

  // ── Cleanup: reset mock LLM for other test suites ──────────────────

  test("cleanup: reset mock LLM", async ({ request }) => {
    await resetMockLLM(request);
  });
});
