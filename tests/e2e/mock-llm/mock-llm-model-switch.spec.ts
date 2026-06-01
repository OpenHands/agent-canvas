/**
 * Mock-LLM E2E test: /model slash command — mid-conversation LLM profile switching.
 *
 * Exercises the full /model flow end-to-end against the real agent-server:
 *
 *   1. Setup: configure the active LLM settings via ensureMockLLMProfile
 *      (the proven pattern), create a named profile B as the switch target
 *      via the profiles API, and register a trajectory with text replies.
 *
 *   2. Conversation + switch: start a conversation from the home page,
 *      wait for the agent to reply, then type `/model <profile-B>` in the
 *      chat input. Verify the "Switched to profile" confirmation renders in
 *      the chat UI. Verify the switch_profile POST was made to the agent-server.
 *
 *   3. Post-switch verification: send another message after the switch
 *      and verify the agent responds, proving the conversation continues
 *      working under the new profile.
 */

import { test, expect } from "@playwright/test";
import {
  BACKEND_URL,
  SESSION_API_KEY,
  MOCK_LLM_AGENT_URL,
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

/** Profile B is the switch target — created via the profiles API. */
const PROFILE_B_NAME = "model-switch-profile-b";
const MODEL_B = "openai/mock-model-beta";

const INITIAL_REPLY_TOKEN = "MODEL_SWITCH_INITIAL_REPLY_OK";
const POST_SWITCH_REPLY_TOKEN = "MODEL_SWITCH_POST_SWITCH_REPLY_OK";

/** Create a named LLM profile via the agent-server profiles API. */
async function saveProfile(
  request: import("@playwright/test").APIRequestContext,
  name: string,
  model: string,
) {
  // ProfilesClient.saveProfile() uses POST /api/profiles/{name}
  const resp = await request.post(
    `${BACKEND_URL}/api/profiles/${encodeURIComponent(name)}`,
    {
      headers: {
        "X-Session-API-Key": SESSION_API_KEY,
        "Content-Type": "application/json",
      },
      data: {
        llm: {
          model,
          api_key: "mock-api-key-for-testing",
          base_url: MOCK_LLM_AGENT_URL,
        },
      },
    },
  );
  expect(
    resp.ok(),
    `POST /api/profiles/${name} returned ${resp.status()}`,
  ).toBe(true);
}

/** Delete a profile (best-effort cleanup). */
async function deleteProfile(
  request: import("@playwright/test").APIRequestContext,
  name: string,
) {
  await request.delete(
    `${BACKEND_URL}/api/profiles/${encodeURIComponent(name)}`,
    { headers: { "X-Session-API-Key": SESSION_API_KEY } },
  );
}

/**
 * Set contentEditable chat input text and dispatch an input event.
 *
 * contentEditable divs don't respond reliably to Playwright's .fill() or
 * .type(), so we set the text programmatically via evaluate.
 */
async function setChatInput(
  page: import("@playwright/test").Page,
  text: string,
) {
  await page.evaluate(
    ({ testId, inputText }) => {
      const el = document.querySelector(`[data-testid="${testId}"]`);
      if (!(el instanceof HTMLElement))
        throw new Error("Chat input not found");
      el.focus();
      el.textContent = inputText;
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: inputText,
          inputType: "insertText",
        }),
      );
    },
    { testId: "chat-input", inputText: text },
  );
}

test.describe.configure({ mode: "serial" });

test.describe("mock-LLM /model slash command", () => {
  const conversationIds = new Set<string>();

  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  test.afterEach(async ({ request }) => {
    for (const id of Array.from(conversationIds)) {
      try {
        await deleteConversation(request, id);
        conversationIds.delete(id);
      } catch {
        // best-effort cleanup
      }
    }
  });

  test.afterAll(async ({ request }) => {
    // Clean up the profile we created and reset mock LLM
    try {
      await deleteProfile(request, PROFILE_B_NAME);
    } catch {
      // best-effort
    }
    try {
      await resetMockLLM(request);
    } catch {
      // best-effort
    }
  });

  // ── Step 1: Configure LLM + create switch-target profile + register trajectory

  test("step 1: configure LLM, create switch-target profile, register trajectory", async ({
    request,
  }) => {
    // Use the proven ensureMockLLMProfile helper to set agent_settings.llm
    // so the agent-server can reach the mock LLM. This is the same approach
    // used by mock-llm-conversation.spec.ts.
    await ensureMockLLMProfile(request);

    // Create profile B as the switch target — it has a different model name
    // but the same mock LLM base_url so post-switch inference still works.
    await saveProfile(request, PROFILE_B_NAME, MODEL_B);

    // Verify profile B was created
    const profilesResp = await request.get(`${BACKEND_URL}/api/profiles`, {
      headers: { "X-Session-API-Key": SESSION_API_KEY },
    });
    expect(profilesResp.ok()).toBe(true);
    const profiles = await profilesResp.json();
    const profileNames: string[] = profiles.profiles.map(
      (p: { name: string }) => p.name,
    );
    expect(profileNames).toContain(PROFILE_B_NAME);

    // Register a trajectory with THREE entries:
    //   Turn 0: padding for the agent-server's internal LLM call
    //           (condenser/skill-analysis) that runs before the main loop
    //   Turn 1: actual reply to the initial user message
    //   Turn 2: reply to the post-switch follow-up message
    await registerTrajectory(request, "model-switch", [
      { text: "" },
      { text: INITIAL_REPLY_TOKEN },
      { text: POST_SWITCH_REPLY_TOKEN },
    ]);
    await activateTrajectory(request, "model-switch");
  });

  // ── Step 2: Conversation + /model switch + post-switch verification ─

  test("step 2: start conversation, switch profile via /model, verify switch", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);

    // Track whether the switch_profile POST was intercepted.
    let switchProfileCalled = false;
    let switchProfileBody: Record<string, unknown> | null = null;
    page.on("request", (req) => {
      const url = new URL(req.url());
      // The switch_profile endpoint is POST /api/conversations/{id}/switch_profile
      if (
        req.method() === "POST" &&
        url.pathname.match(/\/api\/conversations\/[^/]+\/switch_profile/)
      ) {
        switchProfileCalled = true;
        try {
          switchProfileBody = req.postDataJSON();
        } catch {
          // non-JSON body
        }
      }
    });

    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "home-chat-launcher");

    // ── Send initial message and wait for agent reply ──

    await test.step("send initial message", async () => {
      await setChatInput(page, "Hello, please respond briefly.");
      await page.getByTestId("submit-button").click();
      await waitForPath(page, /\/conversations\/.+/, 30_000);
    });

    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);

    await test.step("wait for initial agent reply", async () => {
      await waitForNonUserMessageText(page, INITIAL_REPLY_TOKEN, 30_000);
    });

    // ── Type /model <profile-B> to switch ──

    await test.step("type /model command to switch to profile B", async () => {
      // Wait for the chat input to be available (it should be focused
      // after the agent reply completes).
      await waitForTestId(page, "chat-input");

      await setChatInput(page, `/model ${PROFILE_B_NAME}`);
      await page.getByTestId("submit-button").click();
    });

    // ── Verify: "Switched to profile" message appears in chat UI ──

    await test.step("verify 'Switched to profile' message in chat", async () => {
      // The ModelMessages component renders with data-testid="model-messages"
      // and contains "Switched to profile <name>"
      await waitForNonUserMessageText(page, PROFILE_B_NAME, 15_000);

      // Also verify the specific model-messages container is rendered
      const modelMessages = page.getByTestId("model-messages");
      await expect(modelMessages.first()).toBeVisible({ timeout: 5_000 });
    });

    // ── Verify: the switch_profile POST was made ──

    await test.step("verify switch_profile API was called", async () => {
      expect(
        switchProfileCalled,
        "POST /switch_profile should have been called",
      ).toBe(true);
      // The body should contain the profile name
      expect(switchProfileBody).toBeTruthy();
      const bodyStr = JSON.stringify(switchProfileBody);
      expect(
        bodyStr.includes(PROFILE_B_NAME),
        `switch_profile body should contain "${PROFILE_B_NAME}", got: ${bodyStr}`,
      ).toBe(true);
    });

    // ── Send a follow-up message to verify conversation still works ──

    await test.step("send follow-up message after switch", async () => {
      await setChatInput(page, "Confirm the model switch worked.");
      await page.getByTestId("submit-button").click();
    });

    await test.step("verify post-switch agent reply", async () => {
      await waitForNonUserMessageText(page, POST_SWITCH_REPLY_TOKEN, 30_000);
    });

    // ── Verify: no error banners ──

    await test.step("verify no error banners", async () => {
      const errorBanner = page.getByTestId("error-message-banner");
      await expect(errorBanner).not.toBeVisible({ timeout: 2_000 });
    });
  });
});
