import { test, expect, Page } from "@playwright/test";
import { seedLocalStorage } from "./support/seed-local-storage";
import { stubWebSocket } from "./support/stub-websocket";

/**
 * Visual snapshot tests for archived / sandbox-error conversation states.
 *
 * Mock conversations pre-seeded in src/mocks/conversation-handlers.ts:
 *   4. "Archived Project"  — sandbox_status: "MISSING"
 *   5. "Errored Project"   — sandbox_status: "ERROR"
 *
 * Snapshots:
 *   1. conversation-panel-with-archived-badges — archive icon + ERROR pill for MISSING/ERROR
 *   2. conversation-view-archived — chat interface for conv 4 with the
 *      read-only "Sandbox no longer available" banner (no chat input)
 *   3. conversation-view-sandbox-error — same for conv 5, "Sandbox error" variant
 *
 * NOTE: We do NOT inject events into the chat for these tests. In dev mode
 * React 18 strict mode double-fires effects in child-before-parent order, so
 * ConversationWebSocketProvider's addEvents runs before conversation.tsx's
 * clearEvents — any REST-loaded or store-injected events get wiped. The
 * tests verify the banner + hidden chat input (the actual feature), not
 * event rendering.
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

test.describe("Archived Conversation Visual Snapshots", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(60_000);

  // ── 1. Sidebar panel ───────────────────────────────────────────────────

  test("conversation panel shows archive icon and error badge for MISSING/ERROR sandboxes", async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await page.goto("/conversations");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    const conversationPanel = page.getByTestId("conversation-panel");
    await expect(conversationPanel).toBeVisible({ timeout: 15_000 });
    // 6 mock conversations: 1–3 normal + 4 MISSING + 5 ERROR + pagination-local
    await expect(page.getByTestId("conversation-card")).toHaveCount(6, {
      timeout: 10_000,
    });
    await expect(page.getByTestId("conversation-status-archived")).toBeVisible({
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
    await stubWebSocket(page);
    await page.goto(`/conversations/${ARCHIVED_CONVERSATION_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissConsentModal(page);

    // Wait for the archived banner — proves useActiveConversation resolved
    // with sandbox_status: "MISSING" and the component fully initialized.
    await expect(
      page.getByTestId("archived-conversation-banner"),
    ).toBeVisible({ timeout: 20_000 });
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
    await stubWebSocket(page);
    await page.goto(`/conversations/${ERROR_CONVERSATION_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissConsentModal(page);

    await expect(
      page.getByTestId("archived-conversation-banner"),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("interactive-chat-box")).toHaveCount(0);

    await expect(page.getByTestId("chat-interface")).toHaveScreenshot(
      "conversation-view-sandbox-error.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });
});
