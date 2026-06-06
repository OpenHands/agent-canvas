import { test, expect, Page } from "@playwright/test";
import { seedLocalStorage } from "./support/seed-local-storage";
import { stubWebSocket } from "./support/stub-websocket";

/**
 * Visual snapshot tests for the CollapsibleThinking component.
 *
 * These tests navigate to a conversation in the mock dev server, inject
 * synthetic events into the event store, and capture screenshots of the
 * collapsible thinking sections in both collapsed and expanded states.
 *
 * The mock dev server (VITE_MOCK_API=true) uses MSW service workers to
 * handle API requests. We rely on MSW for conversations, settings, etc.
 * and only inject events directly into the Zustand store.
 *
 * To update baselines after intentional UI changes:
 *   npm run test:e2e:snapshots:update
 */

// Use mock conversation ID "1" which is pre-defined in MSW handlers
const CONVERSATION_ID = "1";

/** ThinkAction event with thinking content */
const THINK_ACTION_EVENT = {
  id: "think-event-1",
  timestamp: "2026-01-01T00:00:01.000Z",
  source: "agent",
  thought: [
    {
      type: "text",
      text: 'think: {"thought": "I need to analyze the codebase structure first. Let me look at the directory layout and understand the project architecture before making any changes."}',
    },
  ],
  reasoning_content: null,
  thinking_blocks: [],
  action: {
    kind: "ThinkAction",
    thought:
      "I need to analyze the codebase structure first. Let me look at the directory layout and understand the project architecture before making any changes.",
  },
  tool_name: "think",
  tool_call_id: "call_think_1",
  tool_call: {
    id: "call_think_1",
    type: "function",
    function: {
      name: "think",
      arguments: JSON.stringify({
        thought:
          "I need to analyze the codebase structure first. Let me look at the directory layout and understand the project architecture before making any changes.",
      }),
    },
  },
  llm_response_id: "response_1",
  security_risk: "unknown",
};

/** Bash action event with reasoning_content (extended thinking) */
const BASH_WITH_REASONING_EVENT = {
  id: "bash-event-1",
  timestamp: "2026-01-01T00:00:02.000Z",
  source: "agent",
  thought: [
    {
      type: "text",
      text: "Let me list the project files to understand the structure.",
    },
  ],
  reasoning_content:
    "The user wants to understand the project. I should start by listing the files in the root directory. This will give us a high-level overview of the codebase. Then I can dive deeper into specific areas based on what we find.",
  thinking_blocks: [],
  action: {
    kind: "ExecuteBashAction",
    command: "ls -la",
    is_input: false,
    timeout: null,
    reset: false,
  },
  tool_name: "execute_bash",
  tool_call_id: "call_bash_1",
  tool_call: {
    id: "call_bash_1",
    type: "function",
    function: {
      name: "execute_bash",
      arguments: JSON.stringify({ command: "ls -la" }),
    },
  },
  llm_response_id: "response_2",
  security_risk: "unknown",
};

/** User message event */
const USER_MESSAGE_EVENT = {
  id: "user-msg-1",
  timestamp: "2026-01-01T00:00:00.000Z",
  source: "user",
  llm_message: {
    role: "user",
    content: [{ type: "text", text: "Help me understand this project" }],
  },
  activated_microagents: [],
  extended_content: [],
};

/**
 * Dismisses the analytics consent modal if it appears.
 * The MSW mock settings don't include user_consents_to_analytics, so
 * the consent modal may appear on first load.
 */
async function dismissConsentModal(page: Page) {
  const confirmButton = page.getByRole("button", {
    name: "Confirm preferences",
  });
  try {
    await confirmButton.waitFor({ state: "visible", timeout: 5000 });
    await confirmButton.click();
    await page
      .getByRole("dialog", { name: "Help improve OpenHands" })
      .waitFor({ state: "hidden", timeout: 5000 });
  } catch {
    // Modal didn't appear — that's fine
  }
}

/**
 * Inject events into the event store via the exposed Zustand API.
 */
async function injectEvents(page: Page, events: unknown[]) {
  await page.waitForFunction(() => {
    const store = (
      window as unknown as {
        __OH_EVENT_STORE__?: {
          getState: () => { addEvents?: (e: unknown[]) => void };
        };
      }
    ).__OH_EVENT_STORE__;
    return Boolean(store?.getState().addEvents);
  });

  await expect
    .poll(
      async () =>
        page.evaluate((evts) => {
          const store = (
            window as unknown as {
              __OH_EVENT_STORE__?: {
                getState: () => {
                  addEvents: (e: unknown[]) => void;
                  events: unknown[];
                };
              };
            }
          ).__OH_EVENT_STORE__;

          if (!store) {
            return 0;
          }

          const state = store.getState();
          state.addEvents(evts);
          return store.getState().events.length;
        }, events),
      { timeout: 10000 },
    )
    .toBeGreaterThanOrEqual(events.length);

  // Wait for React to re-render
  await page.waitForTimeout(500);
}

/**
 * Navigate to a conversation page and seed it with events so the chat
 * interface renders instead of the empty launch prompt.
 * Uses mock conversation "1" which exists in the MSW handlers.
 */
async function navigateToConversation(page: Page, events: unknown[]) {
  await seedLocalStorage(page);

  await page.route("**/api/bash/execute_bash_command", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        command: "ls -la",
        exit_code: 0,
        output: "",
      }),
    });
  });

  await page.route("**/api/file/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ path: "/home", subdirs: [] }),
    });
  });

  // The GUI hides ChatSuggestions (and shows the "LLM not configured" banner)
  // unless an active profile with a key exists — see useLlmConfigured. Seed
  // one so the empty conversation renders normally and the banner stays out
  // of the captured screenshots (matching the baselines).
  await page.route(
    (url) => url.pathname.endsWith("/api/profiles"),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          profiles: [
            {
              name: "mock",
              model: "anthropic/claude-sonnet-4-20250514",
              base_url: null,
              api_key_set: true,
            },
          ],
          active_profile: "mock",
        }),
      });
    },
  );

  await stubWebSocket(page);

  // Arm a wait for the mocked /api/profiles response BEFORE navigating, so
  // we don't miss it if the request races page.goto. The seeded profile is
  // what flips useLlmConfigured → true; without it the GUI renders the
  // "Your LLM isn't set up yet" banner, which then ends up in the snapshot
  // (see the diff that surfaced after the original #1200 flake fix).
  const profilesResponsePromise = page.waitForResponse(
    (response) => {
      const pathname = new URL(response.url()).pathname;
      return pathname.endsWith("/api/profiles") && response.status() === 200;
    },
    { timeout: 20000 },
  );

  await page.goto(`/conversations/${CONVERSATION_ID}`, {
    waitUntil: "domcontentloaded",
  });
  await dismissConsentModal(page);

  // Wait for the conversation route to mount before injecting events.
  // ConversationWebSocketContext runs a useLayoutEffect on mount that
  // calls clearEventsForConversation(<id>) — if we inject events first,
  // that effect wipes them and the UI renders the empty state. Use the
  // store's `loadedConversationId` as a route-stable readiness signal:
  // it flips from null → CONVERSATION_ID inside that layoutEffect, so
  // observing it means the clear-and-set has already happened and any
  // subsequent addEvents will survive.
  //
  // We deliberately don't wait on the home route's "Let's start
  // building!" text here — it only renders on the home route, so relying
  // on a brief home flash before the conversation hydrates is racy and
  // caused the 20s timeout flake tracked in #1200.
  await page.waitForFunction(
    (expectedId) => {
      const store = (
        window as unknown as {
          __OH_EVENT_STORE__?: {
            getState: () => { loadedConversationId: string | null };
          };
        }
      ).__OH_EVENT_STORE__;
      return store?.getState().loadedConversationId === expectedId;
    },
    CONVERSATION_ID,
    { timeout: 20000 },
  );

  // Make sure our mocked /api/profiles response landed before we screenshot,
  // so the LLM-not-configured banner doesn't flash. Without this the first
  // test in the serial spec could screenshot before React Query settled with
  // the mocked profile, leaving the warning banner in the captured image.
  await profilesResponsePromise;

  await injectEvents(page, events);

  const chatInterface = page.getByTestId("chat-interface");
  await expect(chatInterface).toBeVisible({ timeout: 20000 });

  // Belt-and-braces: even after the network response landed, React Query
  // needs a tick to propagate the new state. Assert the banner is gone
  // before returning so the screenshot always matches the seeded profile.
  await expect(page.getByTestId("home-llm-not-configured-banner")).toHaveCount(
    0,
    { timeout: 5000 },
  );

  return chatInterface;
}

test.describe("Collapsible Thinking Visual Snapshots", () => {
  // Run serially: the conversation page + WebSocket stub is heavier than
  // static pages, and parallel workers hitting the shared dev server can
  // cause intermittent load failures.
  test.describe.configure({ mode: "serial" });
  test.setTimeout(60000);

  test("ThinkAction renders as collapsed section", async ({ page }) => {
    const chatInterface = await navigateToConversation(page, [
      USER_MESSAGE_EVENT,
      THINK_ACTION_EVENT,
    ]);

    // Verify the collapsible thinking section is rendered
    const collapsibleThinking = page.getByTestId("collapsible-thinking");
    await expect(collapsibleThinking).toBeVisible({ timeout: 5000 });

    // The content should be collapsed (not visible)
    const content = page.getByTestId("collapsible-thinking-content");
    await expect(content).toHaveCount(0);

    // Snapshot: collapsed state
    await expect(chatInterface).toHaveScreenshot("think-action-collapsed.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("ThinkAction expands on click", async ({ page }) => {
    const chatInterface = await navigateToConversation(page, [
      USER_MESSAGE_EVENT,
      THINK_ACTION_EVENT,
    ]);

    const toggle = page.getByTestId("collapsible-thinking-toggle");
    await expect(toggle).toBeVisible({ timeout: 5000 });

    // Click to expand
    await toggle.click();

    // Content should now be visible
    const content = page.getByTestId("collapsible-thinking-content");
    await expect(content).toBeVisible({ timeout: 5000 });

    // Snapshot: expanded state
    await expect(chatInterface).toHaveScreenshot("think-action-expanded.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("Reasoning content renders as collapsed section with action", async ({
    page,
  }) => {
    const chatInterface = await navigateToConversation(page, [
      USER_MESSAGE_EVENT,
      BASH_WITH_REASONING_EVENT,
    ]);

    // Verify both the collapsible section and the action event are present
    const collapsibleThinking = page.getByTestId("collapsible-thinking");
    await expect(collapsibleThinking).toBeVisible({ timeout: 5000 });

    // Snapshot: reasoning content collapsed alongside the bash action
    await expect(chatInterface).toHaveScreenshot(
      "reasoning-content-collapsed.png",
      {
        maxDiffPixelRatio: 0.01,
        animations: "disabled",
      },
    );
  });

  test("Reasoning content expands on click", async ({ page }) => {
    const chatInterface = await navigateToConversation(page, [
      USER_MESSAGE_EVENT,
      BASH_WITH_REASONING_EVENT,
    ]);

    const toggle = page.getByTestId("collapsible-thinking-toggle");
    await expect(toggle).toBeVisible({ timeout: 5000 });

    // Click to expand
    await toggle.click();

    const content = page.getByTestId("collapsible-thinking-content");
    await expect(content).toBeVisible({ timeout: 5000 });

    // Snapshot: reasoning content expanded
    await expect(chatInterface).toHaveScreenshot(
      "reasoning-content-expanded.png",
      {
        maxDiffPixelRatio: 0.01,
        animations: "disabled",
      },
    );
  });
});
