import { test, expect, Page } from "@playwright/test";
import { seedLocalStorage } from "./support/seed-local-storage";

/**
 * Visual snapshot tests for archived / sandbox-error conversation states.
 *
 * Mock conversations pre-seeded in src/mocks/conversation-handlers.ts:
 *   4. "Archived Project"  — sandbox_status: "MISSING"
 *   5. "Errored Project"   — sandbox_status: "ERROR"
 *
 * Snapshots:
 *   1. conversation-panel-with-archived-badges — sidebar badges for MISSING/ERROR
 *   2. conversation-view-archived — chat interface for conv 4 with one injected
 *      event + the read-only "Sandbox no longer available" banner
 *   3. conversation-view-sandbox-error — same for conv 5, "Sandbox error" variant
 *
 * NOTE: The GET /api/conversations handler correctly returns sandbox_status
 * because the MSW handler parses Axios bracket-style array params (ids[]).
 * Injecting one event gives the chat stable visible content that survives
 * re-renders caused by the 3s polling on conversations with no conversation_url.
 */

const ARCHIVED_CONVERSATION_ID = "4"; // sandbox_status: "MISSING"
const ERROR_CONVERSATION_ID = "5"; // sandbox_status: "ERROR"

/** Dismisses the analytics consent modal if it appears. */
async function dismissConsentModal(page: Page) {
  try {
    await page
      .getByRole("button", { name: "Confirm preferences" })
      .click({ timeout: 5_000 });
    await page
      .getByRole("dialog", { name: "Help improve OpenHands" })
      .waitFor({ state: "hidden", timeout: 5_000 });
  } catch {
    // Modal didn't appear — fine.
  }
}

/** One minimal bash event — gives the chat a stable content anchor. */
const ONE_BASH_EVENT = {
  id: "e1",
  timestamp: "2026-01-01T00:00:01.000Z",
  source: "agent",
  thought: null,
  reasoning_content: null,
  thinking_blocks: [],
  action: {
    kind: "ExecuteBashAction",
    command: "echo hello",
    is_input: false,
    timeout: null,
    reset: false,
  },
  tool_name: "execute_bash",
  tool_call_id: "call_1",
  tool_call: {
    id: "call_1",
    type: "function",
    function: { name: "execute_bash", arguments: '{"command":"echo hello"}' },
  },
  llm_response_id: null,
  security_risk: "unknown",
};

test.describe("Archived Conversation Visual Snapshots", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(60_000);

  // ── 1. Sidebar panel ───────────────────────────────────────────────────

  test("conversation panel shows archived and error badges for MISSING/ERROR sandboxes", async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await page.goto("/conversations");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    const conversationPanel = page.getByTestId("conversation-panel");
    await expect(conversationPanel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("conversation-card")).toHaveCount(5, {
      timeout: 10_000,
    });
    await expect(page.getByTestId("archived-badge")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("error-badge")).toBeVisible({
      timeout: 5_000,
    });

    await expect(conversationPanel).toHaveScreenshot(
      "conversation-panel-with-archived-badges.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  // ── 2. Conversation view — MISSING sandbox (archived) ──────────────────

  test("archived conversation view shows read-only banner and hides chat input", async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await page.goto(`/conversations/${ARCHIVED_CONVERSATION_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissConsentModal(page);

    // Inject one event so the chat has stable visible content that persists
    // across the 3 s polling re-renders. The banner renders once
    // useActiveConversation resolves with sandbox_status: "MISSING".
    await page.waitForFunction(
      () =>
        !!(window as unknown as Record<string, unknown>).__OH_EVENT_STORE__,
      { timeout: 20_000 },
    );
    await page.evaluate((event) => {
      (
        window as unknown as {
          __OH_EVENT_STORE__: { getState: () => { addEvents: (e: unknown[]) => void } };
        }
      ).__OH_EVENT_STORE__
        .getState()
        .addEvents([event]);
    }, ONE_BASH_EVENT);

    // Wait for the injected event to appear, then wait for the banner.
    await expect(page.getByText("echo hello")).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByTestId("archived-conversation-banner"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("interactive-chat-box")).toHaveCount(0);

    await expect(page.getByTestId("chat-interface")).toHaveScreenshot(
      "conversation-view-archived.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  // ── 3. Conversation view — ERROR sandbox ──────────────────────────────

  test("error sandbox conversation view shows error banner and hides chat input", async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await page.goto(`/conversations/${ERROR_CONVERSATION_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissConsentModal(page);

    await page.waitForFunction(
      () =>
        !!(window as unknown as Record<string, unknown>).__OH_EVENT_STORE__,
      { timeout: 20_000 },
    );
    await page.evaluate((event) => {
      (
        window as unknown as {
          __OH_EVENT_STORE__: { getState: () => { addEvents: (e: unknown[]) => void } };
        }
      ).__OH_EVENT_STORE__
        .getState()
        .addEvents([event]);
    }, ONE_BASH_EVENT);

    await expect(page.getByText("echo hello")).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByTestId("archived-conversation-banner"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("interactive-chat-box")).toHaveCount(0);

    await expect(page.getByTestId("chat-interface")).toHaveScreenshot(
      "conversation-view-sandbox-error.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });
});
