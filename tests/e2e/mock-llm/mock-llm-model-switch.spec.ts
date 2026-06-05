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
 *      the chat UI. Verify the switch_llm POST was made to the agent-server
 *      (the frontend fetches the full encrypted profile config and sends it
 *      via /switch_llm rather than calling /switch_profile by name).
 *
 *   3. Post-switch verification: send another message after the switch
 *      and verify the agent responds, proving the conversation continues
 *      working under the new profile.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
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
  setChatInput,
} from "./utils/mock-llm-helpers";

/** Profile B is the switch target — created via the profiles API. */
const PROFILE_B_NAME = "model-switch-profile-b";
const MODEL_B = "openai/mock-model-beta";

const INITIAL_REPLY_TOKEN = "MODEL_SWITCH_INITIAL_REPLY_OK";
const POST_SWITCH_REPLY_TOKEN = "MODEL_SWITCH_POST_SWITCH_REPLY_OK";

/**
 * Create (or overwrite) a named LLM profile via the agent-server profiles API.
 * Deletes first so setup is idempotent across re-runs — if a previous test
 * crashed before afterAll cleanup, the stale profile won't cause a 409.
 */
async function saveProfile(
  request: APIRequestContext,
  name: string,
  model: string,
) {
  // Best-effort delete so a leftover profile doesn't block creation.
  await request.delete(
    `${BACKEND_URL}/api/profiles/${encodeURIComponent(name)}`,
    { headers: { "X-Session-API-Key": SESSION_API_KEY } },
  );
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
        include_secrets: true,
      },
    },
  );
  expect(
    resp.ok(),
    `POST /api/profiles/${name} returned ${resp.status()}`,
  ).toBe(true);
}

/** Delete a profile (best-effort cleanup). */
async function deleteProfile(request: APIRequestContext, name: string) {
  await request.delete(
    `${BACKEND_URL}/api/profiles/${encodeURIComponent(name)}`,
    { headers: { "X-Session-API-Key": SESSION_API_KEY } },
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
    page,
    request,
  }) => {
    // Use the Settings UI to create + activate a mock LLM profile — the same
    // flow used by mock-llm-conversation.spec.ts.
    await ensureMockLLMProfile(page);

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
    //   Turn 0: padding — the agent-server makes an internal LLM call
    //           (condenser/skill-analysis) before the agent's main loop.
    //           This consumes one trajectory response.  If the SDK removes
    //           that internal call, this padding entry will cause an
    //           off-by-one; delete it at that point.
    //           Ref: same pattern in mock-llm-automation.spec.ts;
    //           upstream SDK code: openhands-sdk CondensationMixin.
    //   Turn 1: actual reply to the initial user message
    //   Turn 2: reply to the post-switch follow-up message
    await registerTrajectory(request, "model-switch", [
      { text: "" }, // padding for internal LLM call (see comment above)
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

    // Track whether the switch_llm POST was intercepted.
    // The frontend calls POST /api/conversations/{id}/switch_llm with the full
    // encrypted profile config (model + api_key + base_url) rather than calling
    // /switch_profile by name — this avoids an extra agent-server secrets fetch.
    let switchLlmCalled = false;
    let switchLlmBody: Record<string, unknown> | null = null;
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (
        req.method() === "POST" &&
        url.pathname.match(/\/api\/conversations\/[^/]+\/switch_llm/)
      ) {
        switchLlmCalled = true;
        try {
          switchLlmBody = req.postDataJSON();
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
      // waitForNonUserMessageText already polls data-testid="model-messages"
      // elements, so a successful wait proves the container is visible.
      await waitForNonUserMessageText(page, PROFILE_B_NAME, 30_000);
    });

    // ── Verify: the switch_llm POST was made ──

    await test.step("verify switch_llm API was called with profile B model", async () => {
      expect(
        switchLlmCalled,
        "POST /switch_llm should have been called",
      ).toBe(true);
      expect(switchLlmBody).toBeTruthy();
      // ConversationClient.switchLLM posts { llm: <config> } to switch_llm,
      // so the model is nested under the "llm" key in the HTTP body.
      const llm = switchLlmBody!.llm as Record<string, unknown> | undefined;
      expect(llm, "switch_llm body should contain an llm object").toBeTruthy();
      expect(
        llm!.model,
        `switch_llm body.llm.model should be "${MODEL_B}"`,
      ).toBe(MODEL_B);
    });

    // ── Send a follow-up message to verify conversation still works ──

    await test.step("send follow-up message after switch", async () => {
      // Wait for the chat input to be ready — the UI may briefly disable
      // it while the profile switch settles.
      await waitForTestId(page, "chat-input");
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
