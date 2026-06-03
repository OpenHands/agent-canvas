/**
 * Mock-LLM E2E test: preset automation card → conversation with slash command.
 *
 * Exercises the recommended-automations flow end-to-end:
 *
 *   1. Pre-configure Slack MCP via the settings API so the card is launchable
 *   2. Navigate to /automations and click the Slack standup digest card
 *   3. Verify the conversation page opens with the slash command pre-filled
 *   4. Submit the slash command and verify the skill activates
 *   5. The mock LLM returns a simple text reply and the conversation ends
 *
 * The Slack MCP is configured with dummy credentials — the test only verifies
 * the UI flow, not actual Slack connectivity.
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
  setChatInput,
} from "./utils/mock-llm-helpers";

const SLASH_COMMAND = "/standup-digest:setup";
const AUTOMATION_CARD_ID = "slack-standup-digest";
const REPLY_TOKEN = "PRESET_AUTOMATION_REPLY_OK";

test.describe.configure({ mode: "serial" });

test.describe("preset automation → slash command conversation", () => {
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

    // Reset mock LLM to default trajectory for other tests
    await resetMockLLM(request).catch(() => {});
  });

  // ── Step 1: Configure Slack MCP + LLM profile via API ───────────────

  test("step 1: configure Slack MCP and mock LLM profile via API", async ({
    request,
  }) => {
    // Configure the mock LLM profile
    await ensureMockLLMProfile(request);

    // Install a dummy Slack MCP server via PATCH /api/settings.
    // The server won't actually connect — we just need the settings to
    // list "slack" as installed so the automation card becomes launchable
    // without the install modal intercepting the click.
    const patchResp = await request.patch(`${BACKEND_URL}/api/settings`, {
      headers: {
        "X-Session-API-Key": SESSION_API_KEY,
        "Content-Type": "application/json",
      },
      data: {
        agent_settings_diff: {
          mcp_config: {
            slack: {
              command: "echo",
              args: ["dummy-slack-mcp"],
              env: {
                SLACK_BOT_TOKEN: "xoxb-test-token",
                SLACK_TEAM_ID: "T0000000000",
              },
            },
          },
        },
      },
    });
    expect(
      patchResp.ok(),
      `PATCH /api/settings (Slack MCP): ${patchResp.status()}`,
    ).toBe(true);

    // Verify the MCP config is saved
    const settingsResp = await request.get(`${BACKEND_URL}/api/settings`, {
      headers: { "X-Session-API-Key": SESSION_API_KEY },
    });
    expect(settingsResp.ok()).toBe(true);
    const settings = await settingsResp.json();
    const mcpConfig = settings?.agent_settings?.mcp_config;
    expect(
      mcpConfig,
      "mcp_config should be set in agent_settings",
    ).toBeTruthy();
    // The server should be present under the "slack" key
    expect(
      mcpConfig?.slack || mcpConfig?.stdio,
      "Slack MCP server should be configured",
    ).toBeTruthy();
  });

  // ── Step 2: Register a simple trajectory ────────────────────────────

  test("step 2: register mock LLM trajectory", async ({ request }) => {
    // Register a simple trajectory: the agent just replies with text.
    // The first response is a padding response consumed by the internal
    // skill-analysis/condenser call when skills are activated.
    await registerTrajectory(request, "preset-automation", [
      // Response 0: padding for skill analysis
      { text: "" },
      // Response 1: agent reply after skill loads
      { text: `I'll help you set up the standup digest automation. ${REPLY_TOKEN}` },
    ]);
    await activateTrajectory(request, "preset-automation");
  });

  // ── Step 3: Click the automation card and verify slash command ───────

  test("step 3: click Slack standup digest card and verify conversation", async ({
    page,
  }) => {
    await routeSessionApiKey(page);
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    // Wait for recommended automations section to load
    await waitForTestId(page, "recommended-automations-section", 15_000);

    // Find and click the Slack standup digest card
    const automationCard = page.getByTestId(
      `recommended-automation-card-${AUTOMATION_CARD_ID}`,
    );
    await expect(automationCard).toBeVisible({ timeout: 10_000 });
    await automationCard.click();

    // Should navigate to a new conversation
    await waitForPath(page, /\/conversations\/.+/, 30_000);
    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);

    // Verify the slash command is pre-filled in the chat input or was sent
    // as the first message. The launcher sets the draft message and auto-sends.
    // Check for the slash command in either:
    // 1. The chat input (if not yet sent)
    // 2. A user message bubble (if already sent)
    await test.step("verify slash command is present", async () => {
      await expect
        .poll(
          async () => {
            // Check user messages for the slash command
            const userMessages = page.locator('[data-testid="user-message"]');
            const count = await userMessages.count();
            for (let i = 0; i < count; i++) {
              const text = await userMessages.nth(i).textContent();
              if (text?.includes(SLASH_COMMAND)) return true;
            }

            // Check if it's still in the input
            const inputEl = page.getByTestId("chat-input");
            if (await inputEl.isVisible().catch(() => false)) {
              const inputText = await inputEl.textContent().catch(() => "");
              if (inputText?.includes(SLASH_COMMAND)) return true;
            }

            return false;
          },
          {
            message: `Slash command "${SLASH_COMMAND}" should appear in chat input or user message`,
            timeout: 15_000,
          },
        )
        .toBe(true);
    });
  });

  // ── Step 4: Submit and verify skill activation ──────────────────────

  test("step 4: submit slash command and verify skill loads", async ({
    page,
    request,
  }) => {
    // Re-activate our trajectory (afterEach resets it)
    await registerTrajectory(request, "preset-automation", [
      { text: "" },
      { text: `I'll help you set up the standup digest automation. ${REPLY_TOKEN}` },
    ]);
    await activateTrajectory(request, "preset-automation");

    await routeSessionApiKey(page);
    await page.goto("/automations", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    // Wait for recommended automations section
    await waitForTestId(page, "recommended-automations-section", 15_000);

    // Click the automation card
    const automationCard = page.getByTestId(
      `recommended-automation-card-${AUTOMATION_CARD_ID}`,
    );
    await expect(automationCard).toBeVisible({ timeout: 10_000 });
    await automationCard.click();

    // Wait for navigation to conversation
    await waitForPath(page, /\/conversations\/.+/, 30_000);
    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);

    // The slash command should be auto-submitted. Wait for the submit to
    // happen — either we see a user message with the command, or we need
    // to submit manually if the draft is sitting in the input.
    await test.step("ensure slash command is submitted", async () => {
      // Wait a moment for auto-submit
      await page.waitForTimeout(3_000);

      // Check if message was already sent (user bubble visible)
      const userMessages = page.locator('[data-testid="user-message"]');
      const hasSentMessage = await userMessages
        .filter({ hasText: SLASH_COMMAND })
        .count()
        .then((c) => c > 0)
        .catch(() => false);

      if (!hasSentMessage) {
        // Message is still in the input — submit it manually
        const inputEl = page.getByTestId("chat-input");
        const inputText = await inputEl.textContent().catch(() => "");
        if (inputText?.includes(SLASH_COMMAND)) {
          await page.getByTestId("submit-button").click();
        } else {
          // Neither in input nor sent — type it and submit
          await setChatInput(page, SLASH_COMMAND);
          await page.getByTestId("submit-button").click();
        }
      }
    });

    // Verify: the slash command appears as a user message
    await test.step("verify user message contains slash command", async () => {
      const userMessages = page.locator('[data-testid="user-message"]');
      await expect(
        userMessages.filter({ hasText: SLASH_COMMAND }),
      ).toBeVisible({ timeout: 15_000 });
    });

    // Verify: skill activation — look for the "Skill Ready" collapsible
    // or activated_skills in conversation events.
    // NOTE: This step may fail if the extensions PR hasn't merged yet
    // (the agent-server won't have the skill with the trigger).
    await test.step("verify skill activation via events API", async () => {
      // Poll conversation events for a MessageEvent with activated_skills
      let lastDiag = "no polls yet";
      await expect
        .poll(
          async () => {
            const resp = await request.get(
              `${BACKEND_URL}/api/conversations/${encodeURIComponent(conversationId)}/events/search`,
              {
                headers: { "X-Session-API-Key": SESSION_API_KEY },
                params: { limit: "50", sort_order: "TIMESTAMP_DESC" },
              },
            );
            if (!resp.ok()) {
              lastDiag = `events API returned ${resp.status()}`;
              return false;
            }
            const body = (await resp.json()) as { items?: unknown[] };
            const items = body.items ?? [];
            lastDiag = `${items.length} events`;

            // Look for any event with activated_skills (skill trigger matched)
            return items.some((e: any) => {
              const skills = e.activated_skills;
              return Array.isArray(skills) && skills.length > 0;
            });
          },
          {
            message: `Expected activated_skills in conversation events. ${lastDiag}`,
            timeout: 30_000,
          },
        )
        .toBe(true);
    });

    // Verify: agent reply with our token appears
    await test.step("verify agent reply", async () => {
      await waitForNonUserMessageText(page, REPLY_TOKEN, 30_000);
    });

    // Verify: no error banners
    await test.step("verify no error banners", async () => {
      const errorBanner = page.getByTestId("error-message-banner");
      await expect(errorBanner).not.toBeVisible({ timeout: 2_000 });
    });
  });
});
