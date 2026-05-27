/**
 * Mock-LLM E2E test: full UI-driven conversation with a scripted LLM backend.
 *
 * This test exercises the complete stack — from clicking around in the browser
 * through the real agent-server to a mock LLM server — without any real LLM
 * credentials. The mock LLM server uses openhands-sdk's TestLLM to return
 * scripted responses (tool calls and text).
 *
 * Flow:
 *   1. Navigate to Settings > LLM Profiles
 *   2. Create a new profile pointing at the mock LLM server
 *   3. Set the profile as active
 *   4. Start a new conversation from the home page
 *   5. Send a user message and verify the agent responds correctly
 *   6. Verify via the events API that a terminal tool call was executed
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  BASH_TOKEN,
  REPLY_TOKEN,
  waitForAgentMessageContaining,
  MOCK_LLM_BASE_URL,
  BACKEND_URL,
  SESSION_API_KEY,
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
  waitForPath,
  getConversationIdFromURL,
  waitForNonUserMessageText,
  waitForSuccessfulBashObservation,
  deleteConversation,
} from "./utils/mock-llm-helpers";

const PROFILE_NAME = "mock-llm-e2e";
const MOCK_MODEL = "openai/mock-test-model";

test.describe.configure({ mode: "serial" });

test.describe("mock-LLM agent-server conversation", () => {
  const conversationIds = new Set<string>();

  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  test.afterEach(async ({ page, request }) => {
    // Track any conversation we landed on
    const match = page.url().match(/\/conversations\/([^/?#]+)/);
    if (match?.[1]) conversationIds.add(decodeURIComponent(match[1]));

    // Clean up all conversations
    for (const id of Array.from(conversationIds)) {
      try {
        await deleteConversation(request, id);
        conversationIds.delete(id);
      } catch {
        // best-effort cleanup
      }
    }
  });

  // ── Step 1: Create LLM profile via the Settings UI ──────────────────

  test("step 1: create an LLM profile pointing at the mock LLM server", async ({
    page,
  }) => {
    await routeSessionApiKey(page);
    await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    // Wait for the profiles list to load
    await waitForTestId(page, "add-llm-profile");

    // Click "Add LLM Profile"
    await page.getByTestId("add-llm-profile").click();

    // Wait for the profile editor form to appear
    await waitForTestId(page, "profile-editor-title");

    // Fill in the profile name
    const nameInput = page.getByTestId("profile-name-input");
    await nameInput.click();
    await nameInput.fill(PROFILE_NAME);

    // Switch to "All" view to access base_url field
    await page.getByTestId("sdk-section-all-toggle").click();

    // Wait for the advanced form to render
    await waitForTestId(page, "llm-settings-form-advanced");

    // Fill in model name
    const modelInput = page.getByTestId("llm-custom-model-input");
    await modelInput.click();
    await modelInput.fill(MOCK_MODEL);

    // Fill in base URL pointing to our mock server
    const baseUrlInput = page.getByTestId("base-url-input");
    await baseUrlInput.click();
    await baseUrlInput.fill(MOCK_LLM_BASE_URL);

    // Fill in a fake API key (mock server doesn't validate it)
    const apiKeyInput = page.getByTestId("llm-api-key-input");
    await apiKeyInput.click();
    await apiKeyInput.fill("mock-api-key-for-testing");

    // Save the profile
    await page.getByTestId("save-profile-btn").click();

    // Wait to return to the profiles list
    await waitForTestId(page, "add-llm-profile");

    // Verify the profile appears in the list
    const profileRows = page.getByTestId("profile-row");
    const profileTexts = await profileRows.allTextContents();
    const hasProfile = profileTexts.some((text) =>
      text.includes(PROFILE_NAME),
    );
    expect(hasProfile, `Profile "${PROFILE_NAME}" should appear in the list`).toBe(true);
  });

  // ── Step 2: Set the profile as active ───────────────────────────────

  test("step 2: activate the mock-llm profile", async ({ page }) => {
    await routeSessionApiKey(page);
    await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "add-llm-profile");

    // Find the profile row containing our profile name
    const profileRows = page.getByTestId("profile-row");
    const rowCount = await profileRows.count();
    let targetRow: ReturnType<typeof profileRows.nth> | null = null;

    for (let i = 0; i < rowCount; i++) {
      const row = profileRows.nth(i);
      const text = await row.textContent();
      if (text?.includes(PROFILE_NAME)) {
        targetRow = row;
        break;
      }
    }
    expect(targetRow, `Could not find profile row for "${PROFILE_NAME}"`).not.toBeNull();

    // Open the actions menu for this profile
    await targetRow!.getByTestId("profile-menu-trigger").click();

    // Click "Set as active"
    await page.getByTestId("profile-set-active").click();

    // Verify the "Active" badge appears on our profile
    // Re-find the row after the state change
    await page.waitForTimeout(1_000); // wait for the mutation to settle

    // Reload to see the persisted state
    await page.goto("/settings/llm", { waitUntil: "domcontentloaded" });
    await waitForTestId(page, "add-llm-profile");

    const updatedRows = page.getByTestId("profile-row");
    const updatedCount = await updatedRows.count();
    let foundActiveBadge = false;

    for (let i = 0; i < updatedCount; i++) {
      const row = updatedRows.nth(i);
      const text = await row.textContent();
      if (text?.includes(PROFILE_NAME)) {
        const badge = row.getByTestId("profile-active-badge");
        foundActiveBadge = (await badge.count()) > 0;
        break;
      }
    }
    expect(
      foundActiveBadge,
      `Profile "${PROFILE_NAME}" should have an "Active" badge`,
    ).toBe(true);
  });

  // ── Step 3: Start a conversation and verify the mock agent responds ─

  test("step 3: run a conversation with the mock LLM", async ({
    page,
    request,
  }) => {
    // Verify the mock LLM profile is active before creating a conversation.
    // Steps 1+2 configure it via the UI; this API check ensures persistence.
    await test.step("verify mock-llm profile is active via API", async () => {
      const profilesResp = await request.get(`${BACKEND_URL}/api/profiles`, {
        headers: { "X-Session-API-Key": SESSION_API_KEY },
      });
      expect(profilesResp.ok(), `GET /api/profiles returned ${profilesResp.status()}`).toBe(true);
      const profiles = await profilesResp.json();
      const activeProfile = profiles?.active_profile;
      const profileNames = profiles?.profiles ? Object.keys(profiles.profiles) : [];
      expect(
        activeProfile,
        `Expected active_profile="${PROFILE_NAME}" but got "${activeProfile}". ` +
        `Available profiles: [${profileNames.join(", ")}]. ` +
        `Full response: ${JSON.stringify(profiles).slice(0, 500)}`,
      ).toBe(PROFILE_NAME);
    });

    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    // Wait for the home page chat launcher to appear
    await waitForTestId(page, "home-chat-launcher");

    // Type a message into the home-page chat input, then submit.
    // This creates the conversation AND sends the first user message in
    // one step — matching how real users interact with the home page.
    // IMPORTANT: Do NOT include BASH_TOKEN or REPLY_TOKEN in the user
    // message. The mock LLM ignores the prompt entirely (TestLLM pops
    // scripted responses from a deque), so the prompt text is irrelevant.
    // Keeping the tokens out of the user bubble lets us assert they appear
    // *only* in agent output.
    const userMessage = "Please run a quick terminal command and then reply.";

    // Set contenteditable text via evaluate (contentEditable divs don't
    // respond reliably to Playwright's .fill() or .type()).
    await page.evaluate(
      ({ testId, text }) => {
        const el = document.querySelector(`[data-testid="${testId}"]`);
        if (!(el instanceof HTMLElement)) throw new Error("Chat input not found");
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

    // Click the submit button — this triggers conversation creation
    await page.getByTestId("submit-button").click();

    // Wait for navigation to the new conversation page
    await waitForPath(page, /\/conversations\/.+/, 30_000);
    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);

    // ── Verify: bash tool was executed (via bash events API) ──

    await test.step("verify bash tool execution via bash events API", async () => {
      await waitForSuccessfulBashObservation(request, conversationId);
    });

    // ── Verify: agent reply contains REPLY_TOKEN (via conversation events API) ──

    await test.step("verify agent reply via conversation events API", async () => {
      await waitForAgentMessageContaining(
        request, conversationId, REPLY_TOKEN, 30_000,
      );
    });

    // ── Verify: the agent's final reply token appears in the chat UI ──

    await test.step("verify agent reply token appears in chat UI", async () => {
      await waitForNonUserMessageText(page, REPLY_TOKEN, 30_000);
    });

    // ── Verify: no error banners are visible ──

    await test.step("verify no error banners", async () => {
      const errorBanner = page.getByTestId("error-message-banner");
      // No .catch() — if the banner IS visible, this step must fail the test.
      await expect(errorBanner).not.toBeVisible({ timeout: 2_000 });
    });

    // Write a success marker so the CI wrapper can detect passed tests
    // even if Playwright's webServer teardown hangs and the process is
    // killed before results.json gets flushed.
    mkdirSync("test-results-mock-llm", { recursive: true });
    writeFileSync("test-results-mock-llm/.all-passed", "1");
  });
});
