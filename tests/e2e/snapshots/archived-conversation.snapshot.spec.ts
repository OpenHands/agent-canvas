import { test, expect, Page } from "@playwright/test";

/**
 * Visual snapshot tests for archived / sandbox-error conversation states.
 *
 * Two new mock conversations are pre-seeded in src/mocks/conversation-handlers.ts:
 *   4. "Archived Project"  — sandbox_status: "MISSING"
 *   5. "Errored Project"   — sandbox_status: "ERROR"
 *
 * Snapshots captured:
 *   1. conversation-panel-with-archived-badges — sidebar panel showing five
 *      conversations; the bottom two have an archived/error badge pill, a
 *      gray/red status dot, and a dimmed title.
 *   2. conversation-view-archived — full chat interface for conv 4 (MISSING).
 *      The read-only "Sandbox no longer available" banner replaces the input.
 *   3. conversation-view-sandbox-error — full chat interface for conv 5 (ERROR).
 *      Shows the "Sandbox error" banner variant.
 */

// MSW mock conversations with sandbox states
const ARCHIVED_CONVERSATION_ID = "4"; // sandbox_status: "MISSING"
const ERROR_CONVERSATION_ID = "5"; // sandbox_status: "ERROR"

// ── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Dismiss the analytics consent modal if it appears. The MSW settings mock
 * doesn't pre-accept analytics, so it may appear on first load.
 */
async function dismissConsentModal(page: Page) {
  try {
    await page
      .getByRole("button", { name: "Confirm preferences" })
      .click({ timeout: 5_000 });
    await page
      .getByRole("dialog", { name: "Help improve OpenHands" })
      .waitFor({ state: "hidden", timeout: 5_000 });
  } catch {
    // Modal didn't appear — fine
  }
}

/**
 * Common localStorage seed: skip onboarding, silence file-API 404s that the
 * home route fires for workspace scanning.
 */
async function setupCommonMocks(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("openhands-onboarded", "true");
  });
  await page.route("**/api/file/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ path: "/home", subdirs: [] }),
    });
  });
}

/**
 * Stub the native WebSocket constructor with a no-op implementation that
 * immediately fires `onopen`.  This prevents the conversation route from
 * failing while waiting for a real agent-server WebSocket connection.
 *
 * Must be added with addInitScript (runs before any page JS) so that React
 * Router's lazy-loaded conversation route picks it up on navigation.
 */
async function stubWebSocket(page: Page) {
  await page.addInitScript(() => {
    const noop = () => {};
    class StubWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = StubWebSocket.OPEN;
      url: string;
      protocol = "";
      extensions = "";
      bufferedAmount = 0;
      binaryType: BinaryType = "blob";
      onopen: ((ev: Event) => void) | null = null;
      onclose: ((ev: CloseEvent) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      constructor(url: string | URL) {
        super();
        this.url = typeof url === "string" ? url : url.toString();
        setTimeout(() => {
          const evt = new Event("open");
          this.onopen?.(evt);
          this.dispatchEvent(evt);
        }, 10);
      }
      send = noop;
      close = noop;
      CONNECTING = StubWebSocket.CONNECTING;
      OPEN = StubWebSocket.OPEN;
      CLOSING = StubWebSocket.CLOSING;
      CLOSED = StubWebSocket.CLOSED;
    }
    (window as unknown as { WebSocket: unknown }).WebSocket =
      StubWebSocket as unknown as typeof WebSocket;
  });
}

/**
 * Navigate to a specific conversation page and wait until the chat interface
 * is visible. Call `stubWebSocket` first so the WS never throws.
 */
async function navigateToConversation(page: Page, id: string) {
  await page.goto(`/conversations/${id}`, { waitUntil: "domcontentloaded" });
  await dismissConsentModal(page);
  const chatInterface = page.getByTestId("chat-interface");
  await expect(chatInterface).toBeVisible({ timeout: 20_000 });
  return chatInterface;
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe("Archived Conversation Visual Snapshots", () => {
  // Conversation-page tests are heavier: serial mode prevents parallel workers
  // from racing on the shared MSW dev server.
  test.describe.configure({ mode: "serial" });
  test.setTimeout(60_000);

  // ── 1. Sidebar panel ───────────────────────────────────────────────────

  test("conversation panel shows archived and error badges for MISSING/ERROR sandboxes", async ({
    page,
  }) => {
    await setupCommonMocks(page);
    await page.goto("/conversations");
    await dismissConsentModal(page);
    await page.waitForLoadState("networkidle");

    const conversationPanel = page.getByTestId("conversation-panel");
    await expect(conversationPanel).toBeVisible({ timeout: 15_000 });

    // All five mock conversations must be present (including the two new
    // archived/error ones).
    await expect(page.getByTestId("conversation-card")).toHaveCount(5, {
      timeout: 10_000,
    });

    // The archived badge and error badge must both be visible in the panel.
    await expect(page.getByTestId("archived-badge")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("error-badge")).toBeVisible({
      timeout: 5_000,
    });

    // Scoped screenshot of the conversation panel (sidebar section only).
    await expect(conversationPanel).toHaveScreenshot(
      "conversation-panel-with-archived-badges.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  // ── 2. Conversation view — MISSING sandbox (archived) ──────────────────

  test("archived conversation view shows read-only banner and hides chat input", async ({
    page,
  }) => {
    await setupCommonMocks(page);
    await stubWebSocket(page);

    const chatInterface = await navigateToConversation(
      page,
      ARCHIVED_CONVERSATION_ID,
    );

    // The archived read-only banner must appear where the input normally lives.
    const banner = page.getByTestId("archived-conversation-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // The interactive chat box must NOT be present.
    await expect(page.getByTestId("interactive-chat-box")).toHaveCount(0);

    // Snapshot: full chat interface with archived banner at the bottom.
    await expect(chatInterface).toHaveScreenshot(
      "conversation-view-archived.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });

  // ── 3. Conversation view — ERROR sandbox ──────────────────────────────

  test("error sandbox conversation view shows error banner and hides chat input", async ({
    page,
  }) => {
    await setupCommonMocks(page);
    await stubWebSocket(page);

    const chatInterface = await navigateToConversation(
      page,
      ERROR_CONVERSATION_ID,
    );

    // The error variant of the read-only banner must appear.
    const banner = page.getByTestId("archived-conversation-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // The interactive chat box must NOT be present.
    await expect(page.getByTestId("interactive-chat-box")).toHaveCount(0);

    // Snapshot: full chat interface with sandbox-error banner at the bottom.
    await expect(chatInterface).toHaveScreenshot(
      "conversation-view-sandbox-error.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });
});
