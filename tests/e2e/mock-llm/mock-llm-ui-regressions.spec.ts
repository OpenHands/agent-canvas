/**
 * Mock-LLM E2E: UI regression tests.
 *
 * Ported from the former `tests/e2e/regressions/` directory so they run
 * against the real agent-server stack (via `bin/agent-canvas.mjs`) instead
 * of the MSW-only dev-mock server that was never wired into CI.
 *
 * Tests use `page.route()` where specific API responses need to be
 * controlled, following the same pattern as
 * `mock-llm-onboarding-regressions.spec.ts`.
 */

import test, { expect, type Page, type Request } from "@playwright/test";
import {
  seedLocalStorage,
  routeSessionApiKey,
} from "./utils/mock-llm-helpers";

test.describe.configure({ mode: "serial" });

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

// ─── pagination helpers ──────────────────────────────────────────────

const PAGINATION_CONVERSATION_ID = "pagination-e2e";
const PAGE_SIZE = 50;
const PAGINATION_EVENT_COUNT = 100;
const PAGINATION_BASE_TIME = Date.UTC(2026, 4, 13, 0, 0, 0);

function timestampForEvent(index: number): string {
  return new Date(PAGINATION_BASE_TIME + index * 60_000).toISOString();
}

interface PaginationEvent {
  id: string;
  timestamp: string;
  source: string;
  kind: string;
  llm_message: {
    role: string;
    content: Array<{ type: string; text: string }>;
  };
}

function createPaginationEvent(
  index: number,
  prefix: string,
): PaginationEvent {
  return {
    id: `${prefix.toLowerCase().replaceAll(" ", "-")}-${index}`,
    timestamp: timestampForEvent(index),
    source: "agent",
    kind: "MessageEvent",
    llm_message: {
      role: "assistant",
      content: [{ type: "text", text: `${prefix} ${index}` }],
    },
  };
}

function createAllPaginationEvents(prefix: string): PaginationEvent[] {
  return Array.from({ length: PAGINATION_EVENT_COUNT }, (_, i) =>
    createPaginationEvent(i + 1, prefix),
  );
}

function searchPaginationEvents(
  events: PaginationEvent[],
  searchParams: URLSearchParams,
) {
  const limit = Number(searchParams.get("limit") ?? "100");
  const timestampLt = searchParams.get("timestamp__lt");
  const sortOrder = searchParams.get("sort_order");
  const filtered = timestampLt
    ? events.filter((e) => e.timestamp < timestampLt)
    : events;
  const sorted = [...filtered].sort((a, b) =>
    sortOrder === "TIMESTAMP_DESC"
      ? b.timestamp.localeCompare(a.timestamp)
      : a.timestamp.localeCompare(b.timestamp),
  );
  return {
    items: sorted.slice(0, limit),
    next_page_id: sorted.length > limit ? "next-page" : null,
  };
}

/** Intercept conversation lookup + event search for pagination tests. */
async function routePaginationConversation(page: Page) {
  const allEvents = createAllPaginationEvents("Pagination message");

  // Stub the conversation object so the app renders a chat view.
  await page.route(
    `**/api/conversations/${PAGINATION_CONVERSATION_ID}`,
    async (route, req) => {
      if (req.method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          conversation_id: PAGINATION_CONVERSATION_ID,
          status: "STOPPED",
          created_at: timestampForEvent(1),
          updated_at: timestampForEvent(PAGINATION_EVENT_COUNT),
          title: "Pagination test",
        }),
      });
    },
  );

  // Stub the event search endpoint with the synthetic paginated events.
  await page.route(
    `**/api/conversations/${PAGINATION_CONVERSATION_ID}/events/search**`,
    async (route, req) => {
      if (req.method() !== "GET") {
        await route.fallback();
        return;
      }
      const url = new URL(req.url());
      const result = searchPaginationEvents(allEvents, url.searchParams);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    },
  );
}

async function getChatScroller(page: Page) {
  const chatInterface = page.getByTestId("chat-interface");
  await expect(chatInterface).toBeVisible({ timeout: 15_000 });
  const scroller = chatInterface.locator(".custom-scrollbar-always").first();
  await expect(scroller).toBeVisible();
  return scroller;
}

async function waitForScrollableConversation(page: Page) {
  const scroller = await getChatScroller(page);
  await expect
    .poll(
      () =>
        scroller.evaluate((el) => el.scrollHeight > el.clientHeight),
      { timeout: 15_000 },
    )
    .toBe(true);
  return scroller;
}

async function triggerOlderEventLoad(page: Page) {
  const scroller = await waitForScrollableConversation(page);
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

test.describe("UI regressions", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  // ── CSS isolation ────────────────────────────────────────────────

  test("scopes standalone styles to the agent-server-ui shell", async ({
    page,
  }) => {
    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(
      page.locator("[data-agent-server-ui]").first(),
    ).toBeVisible({ timeout: 15_000 });
    const layout = page.getByTestId("root-layout");
    await expect(layout).toBeVisible();

    const insideBackground = await layout.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    const outsideStyles = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.className = "bg-base text-content-2";
      probe.textContent = "host";
      document.documentElement.appendChild(probe);
      const styles = getComputedStyle(probe);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      };
    });

    expect(insideBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(outsideStyles.backgroundColor).not.toBe(insideBackground);
  });

  // ── event pagination on scroll-up ────────────────────────────────

  test("loads older events when scrolling up", async ({ page }) => {
    test.setTimeout(60_000);
    await routeSessionApiKey(page);
    await routePaginationConversation(page);

    const initialRequestPromise = page.waitForRequest((req: Request) => {
      if (req.method() !== "GET") return false;
      if (
        !req
          .url()
          .includes(
            `/api/conversations/${PAGINATION_CONVERSATION_ID}/events/search`,
          )
      )
        return false;
      return !new URL(req.url()).searchParams.has("timestamp__lt");
    });

    await page.goto(`/conversations/${PAGINATION_CONVERSATION_ID}`, {
      waitUntil: "domcontentloaded",
    });

    // Verify initial request sends correct params.
    const initialRequest = await initialRequestPromise;
    const initialUrl = new URL(initialRequest.url());
    expect(initialUrl.searchParams.get("limit")).toBe(String(PAGE_SIZE));
    expect(initialUrl.searchParams.get("sort_order")).toBe("TIMESTAMP_DESC");

    // Most recent message should be visible; older page should not.
    await expect(
      page.getByText("Pagination message 100", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Pagination message 50", { exact: true }),
    ).toHaveCount(0);

    // Scroll to top to trigger older-event loading.
    const olderRequestPromise = page.waitForRequest((req: Request) => {
      if (req.method() !== "GET") return false;
      if (
        !req
          .url()
          .includes(
            `/api/conversations/${PAGINATION_CONVERSATION_ID}/events/search`,
          )
      )
        return false;
      return new URL(req.url()).searchParams.has("timestamp__lt");
    });

    await triggerOlderEventLoad(page);

    await expect(page.getByTestId("loading-older-events")).toContainText(
      "Fetching older messages",
    );

    const olderRequest = await olderRequestPromise;
    const olderUrl = new URL(olderRequest.url());
    expect(olderUrl.searchParams.get("limit")).toBe(String(PAGE_SIZE));
    expect(olderUrl.searchParams.get("sort_order")).toBe("TIMESTAMP_DESC");
    expect(olderUrl.searchParams.get("timestamp__lt")).toBe(
      timestampForEvent(51),
    );

    await expect(
      page.getByText("Pagination message 50", { exact: true }),
    ).toBeAttached({ timeout: 15_000 });
    await expect(page.getByTestId("loading-older-events")).toHaveCount(0);
  });

  // ── #1076: workspace selection persistence ───────────────────────

  test("selected workspace persists after navigating away and returning", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await routeSessionApiKey(page);

    // Stub the workspace listing so we have deterministic entries
    // regardless of the real filesystem.
    await page.route("**/api/workspaces**", async (route, req) => {
      if (req.method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          "/workspace/project/demo-app",
          "/workspace/project/sample-tools",
          "/workspace/project/notes-service",
        ]),
      });
    });

    await page.goto("/conversations", { waitUntil: "domcontentloaded" });

    // Open workspace dialog and pick a workspace
    const openButton = page.getByTestId("open-workspace-button");
    await expect(openButton).toBeEnabled({ timeout: 15_000 });
    await openButton.click();
    await expect(
      page.getByTestId("open-workspace-dialog-body"),
    ).toBeVisible();

    const dropdown = page.getByTestId("workspace-dropdown");
    await expect(dropdown).toBeEnabled({ timeout: 15_000 });
    await dropdown.click();

    const menu = page.getByTestId("workspace-dropdown-menu");
    await expect(menu).toBeVisible();
    await menu.getByText("demo-app", { exact: true }).click();

    await expect(dropdown).toHaveValue("demo-app");

    // Close the dialog
    await page.getByTestId("close-open-workspace-dialog").click();
    await expect(
      page.getByTestId("open-workspace-dialog-body"),
    ).not.toBeVisible();

    // Navigate away and back
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("home-screen")).not.toBeVisible({
      timeout: 5_000,
    });

    await page.goto("/conversations", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("home-screen")).toBeVisible({
      timeout: 10_000,
    });

    // Reopen workspace dialog — selection should be restored.
    const reopenButton = page.getByTestId("open-workspace-button");
    await expect(reopenButton).toBeEnabled({ timeout: 15_000 });
    await reopenButton.click();
    await expect(
      page.getByTestId("open-workspace-dialog-body"),
    ).toBeVisible();

    const restored = page.getByTestId("workspace-dropdown");
    await expect(restored).toBeEnabled({ timeout: 15_000 });
    await expect(restored).toHaveValue("demo-app");
  });

  test("cleared sessionStorage yields empty workspace selection", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await routeSessionApiKey(page);

    await page.route("**/api/workspaces**", async (route, req) => {
      if (req.method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          "/workspace/project/demo-app",
          "/workspace/project/sample-tools",
        ]),
      });
    });

    // Explicitly clear persisted workspace path
    await page.addInitScript(() => {
      window.sessionStorage.removeItem("oh:home-selected-workspace-path");
    });

    await page.goto("/conversations", { waitUntil: "domcontentloaded" });

    const openButton = page.getByTestId("open-workspace-button");
    await expect(openButton).toBeEnabled({ timeout: 15_000 });
    await openButton.click();
    await expect(
      page.getByTestId("open-workspace-dialog-body"),
    ).toBeVisible();

    const dropdown = page.getByTestId("workspace-dropdown");
    await expect(dropdown).toBeEnabled({ timeout: 15_000 });
    await expect(dropdown).toHaveValue("");
  });
});
