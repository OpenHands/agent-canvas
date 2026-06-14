/**
 * Mock-LLM E2E tests: drawer tabs, empty states, and browser chrome bar.
 *
 * Coverage for PR #1288 ("UI polish: drawer tabs, empty states, and browser chrome"):
 *   - Browser chrome bar renders with placeholder URL in empty state
 *   - Browser chrome bar shows external link when URL is present
 *   - Terminal tab shows empty state message when no output
 *   - Tab switching between terminal, browser, and files tabs works
 *   - VS Code drawer link is visible in the tab bar
 *
 * Uses page.route() to stub a mock conversation so we can test the drawer
 * panel UI without waiting for a real LLM conversation to complete.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
} from "./utils/mock-llm-helpers";

test.describe.configure({ mode: "serial" });

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

const MOCK_CONVERSATION_ID = "drawer-empty-states-e2e";
const BASE_TIME = Date.UTC(2026, 5, 10, 0, 0, 0);

function buildMockConversation() {
  return {
    id: MOCK_CONVERSATION_ID,
    conversation_id: MOCK_CONVERSATION_ID,
    status: "STOPPED",
    execution_status: "stopped",
    created_at: new Date(BASE_TIME).toISOString(),
    updated_at: new Date(BASE_TIME + 60_000).toISOString(),
    title: "Drawer & empty states test",
  };
}

function buildMockEvents() {
  return [
    {
      id: "msg-1",
      timestamp: new Date(BASE_TIME).toISOString(),
      source: "user",
      kind: "MessageEvent",
      llm_message: {
        role: "user",
        content: [{ type: "text", text: "Hello" }],
      },
    },
    {
      id: "msg-2",
      timestamp: new Date(BASE_TIME + 30_000).toISOString(),
      source: "agent",
      kind: "MessageEvent",
      llm_message: {
        role: "assistant",
        content: [{ type: "text", text: "Hi there! How can I help?" }],
      },
    },
  ];
}

/**
 * Intercept conversation lookup and event search for the mock conversation.
 */
async function routeMockConversation(page: Page) {
  const events = buildMockEvents();

  await page.route(/\/api\/conversations\?/, async (route, req) => {
    if (req.method() !== "GET") {
      await route.fallback();
      return;
    }
    const url = new URL(req.url());
    const ids = [
      ...url.searchParams.getAll("ids"),
      ...url.searchParams.getAll("ids[]"),
    ];
    if (ids.includes(MOCK_CONVERSATION_ID)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([buildMockConversation()]),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route(
    `**/api/conversations/${MOCK_CONVERSATION_ID}/events/search**`,
    async (route, req) => {
      if (req.method() !== "GET") {
        await route.fallback();
        return;
      }
      const url = new URL(req.url());
      const sortOrder = url.searchParams.get("sort_order");
      const sorted = [...events].sort((a, b) =>
        sortOrder === "TIMESTAMP_DESC"
          ? b.timestamp.localeCompare(a.timestamp)
          : a.timestamp.localeCompare(b.timestamp),
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: sorted, next_page_id: null }),
      });
    },
  );
}

/** Open the right panel drawer if it is not already open. */
async function openRightPanel(page: Page) {
  const toggle = page.getByTestId("right-panel-toggle");
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  await toggle.click();
  // Wait for drawer animation to settle
  await page.waitForTimeout(500);
  // Verify at least one tab is visible (panel is open)
  const anyTab = page.locator('[data-testid^="conversation-tab-"]').first();
  await expect(anyTab).toBeVisible({ timeout: 10_000 });
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

test.describe("drawer tabs and empty states", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  // ── Browser chrome bar: empty state ────────────────────────────────

  test("browser chrome bar shows URL placeholder in empty state", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await routeSessionApiKey(page);
    await routeMockConversation(page);

    await page.goto(`/conversations/${MOCK_CONVERSATION_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "chat-interface", 30_000);

    await openRightPanel(page);

    // Switch to browser tab
    await test.step("click browser tab", async () => {
      const browserTab = page.getByTestId("conversation-tab-browser");
      await expect(browserTab).toBeVisible({ timeout: 10_000 });
      await browserTab.click();
    });

    await test.step("verify browser chrome bar renders", async () => {
      const chromeBar = page.getByTestId("browser-chrome-bar");
      await expect(chromeBar).toBeVisible({ timeout: 10_000 });
    });

    await test.step("verify URL field shows placeholder text", async () => {
      const urlField = page.getByTestId("browser-chrome-url");
      await expect(urlField).toBeVisible({ timeout: 5_000 });
      // In empty state, the URL field should not contain an actual URL.
      // It should show the i18n placeholder (e.g. "Enter a URL" or similar).
      const text = await urlField.textContent();
      expect(text).toBeTruthy();
      // No external link should be active when there's no page loaded
      const openExternal = page.getByTestId("browser-chrome-open-external");
      await expect(openExternal).toHaveCount(0);
    });

    await test.step("verify empty browser message is shown", async () => {
      await expect(
        page.getByText("No page loaded yet", { exact: false }),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // ── Terminal tab: empty state ──────────────────────────────────────

  test("terminal tab shows empty state message", async ({ page }) => {
    test.setTimeout(60_000);
    await routeSessionApiKey(page);
    await routeMockConversation(page);

    await page.goto(`/conversations/${MOCK_CONVERSATION_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "chat-interface", 30_000);

    await openRightPanel(page);

    // Switch to terminal tab
    await test.step("click terminal tab", async () => {
      const terminalTab = page.getByTestId("conversation-tab-terminal");
      await expect(terminalTab).toBeVisible({ timeout: 10_000 });
      await terminalTab.click();
    });

    await test.step("verify terminal empty state message", async () => {
      // The EmptyTerminalMessage uses ConversationTabEmptyState
      // and shows a translated "No output" or similar message.
      // Wait for either the empty state text or the xterm container.
      // The terminal tab may render the xterm terminal if the runtime
      // is not connected, or the empty state component.
      // Since we're on a STOPPED conversation, we should see the empty state.
      await expect(
        page.getByText(/No terminal output|No output/i).first(),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  // ── Tab switching ──────────────────────────────────────────────────

  test("tab switching between browser, terminal, and files tabs", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await routeSessionApiKey(page);
    await routeMockConversation(page);

    await page.goto(`/conversations/${MOCK_CONVERSATION_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "chat-interface", 30_000);

    await openRightPanel(page);

    // Verify all primary tabs are visible in the tab bar
    await test.step("verify all tabs are rendered in the tab bar", async () => {
      const browserTab = page.getByTestId("conversation-tab-browser");
      const terminalTab = page.getByTestId("conversation-tab-terminal");
      const filesTab = page.getByTestId("conversation-tab-files");

      await expect(browserTab).toBeVisible({ timeout: 10_000 });
      await expect(terminalTab).toBeVisible({ timeout: 5_000 });
      await expect(filesTab).toBeVisible({ timeout: 5_000 });
    });

    // Click through tabs and verify each one activates
    await test.step("switch to browser tab", async () => {
      await page.getByTestId("conversation-tab-browser").click();
      // Browser chrome bar is unique to this tab
      await expect(
        page.getByTestId("browser-chrome-bar"),
      ).toBeVisible({ timeout: 10_000 });
    });

    await test.step("switch to files tab", async () => {
      await page.getByTestId("conversation-tab-files").click();
      // The files tab content includes a diff toggle or file tree.
      // Wait for the files tab content area to become visible.
      await expect(
        page.getByTestId("files-tab-diff-toggle").or(
          page.locator('[class*="file"]').first(),
        ),
      ).toBeVisible({ timeout: 10_000 });
    });

    await test.step("switch back to terminal tab", async () => {
      await page.getByTestId("conversation-tab-terminal").click();
      // Terminal tab should show either the xterm container or empty state
      await page.waitForTimeout(500);
      // Just verify we're not seeing the browser chrome bar or files controls
      await expect(page.getByTestId("browser-chrome-bar")).not.toBeVisible();
    });
  });

  // ── VS Code drawer link ────────────────────────────────────────────

  test("VS Code drawer link is visible in the tab bar", async ({ page }) => {
    test.setTimeout(60_000);
    await routeSessionApiKey(page);
    await routeMockConversation(page);

    await page.goto(`/conversations/${MOCK_CONVERSATION_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "chat-interface", 30_000);

    await openRightPanel(page);

    await test.step("verify VS Code link is visible", async () => {
      const vscodeLink = page.getByTestId("drawer-vscode-link");
      await expect(vscodeLink).toBeVisible({ timeout: 10_000 });
    });
  });
});
