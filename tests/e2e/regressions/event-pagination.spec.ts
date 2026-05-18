import { expect, test, type Page, type Request } from "@playwright/test";

const LOCAL_CONVERSATION_ID = "pagination-local";
const CLOUD_CONVERSATION_ID = "pagination-cloud";
const PAGE_SIZE = 50;
const PAGINATION_BASE_TIME = Date.UTC(2026, 4, 13, 0, 0, 0);

function timestampForEvent(index: number): string {
  return new Date(PAGINATION_BASE_TIME + index * 60_000).toISOString();
}

async function seedBackendSelection(
  page: Page,
  mode: "local" | "cloud",
  conversationId: string,
) {
  await page.addInitScript(
    ({ selectedMode, selectedConversationId }) => {
      window.localStorage.setItem("analytics-consent", "true");
      window.localStorage.setItem("openhands-telemetry-consent", "denied");
      window.localStorage.setItem("openhands-telemetry-first-use", "true");
      window.localStorage.setItem("openhands-onboarded", "true");
      window.localStorage.setItem("conversation-right-panel-shown", "false");
      window.localStorage.setItem(
        `conversation-right-panel-shown-${selectedConversationId}`,
        "false",
      );

      const localBackend = {
        id: "pagination-local-backend",
        name: "Local pagination backend",
        host: window.location.origin,
        apiKey: "",
        kind: "local",
      };
      const cloudBackend = {
        id: "pagination-cloud-backend",
        name: "Cloud pagination backend",
        host: "https://app.all-hands.dev",
        apiKey: "mock-cloud-api-key",
        kind: "cloud",
      };

      window.localStorage.setItem(
        "openhands-backends",
        JSON.stringify(
          selectedMode === "cloud"
            ? [localBackend, cloudBackend]
            : [localBackend],
        ),
      );
      window.localStorage.setItem(
        "openhands-active-backend",
        JSON.stringify({
          backendId:
            selectedMode === "cloud" ? cloudBackend.id : localBackend.id,
          orgId: selectedMode === "cloud" ? "org-1" : null,
        }),
      );
    },
    { selectedMode: mode, selectedConversationId: conversationId },
  );
}

function eventSearchRequestFor(conversationId: string) {
  return (request: Request) => {
    if (request.method() !== "GET") return false;
    if (
      !request
        .url()
        .includes(`/api/conversations/${conversationId}/events/search`)
    ) {
      return false;
    }
    return new URL(request.url()).searchParams.has("timestamp__lt");
  };
}

function parseCloudProxyPath(request: Request): string {
  const body = JSON.parse(request.postData() ?? "{}") as { path?: string };
  return body.path ?? "";
}

function cloudEventSearchRequestFor(conversationId: string) {
  return (request: Request) => {
    if (request.method() !== "POST") return false;
    if (!request.url().includes("/api/cloud-proxy")) return false;
    const path = parseCloudProxyPath(request);
    return (
      path.includes(`/api/v1/conversation/${conversationId}/events/search`) &&
      path.includes("timestamp__lt")
    );
  };
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
        scroller.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  return scroller;
}

async function triggerOlderEventLoad(page: Page) {
  const scroller = await waitForScrollableConversation(page);
  await scroller.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

test.describe("conversation event pagination", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("loads older events when scrolling up on a local backend", async ({
    page,
  }) => {
    await seedBackendSelection(page, "local", LOCAL_CONVERSATION_ID);

    const initialRequestPromise = page.waitForRequest((request) => {
      if (request.method() !== "GET") return false;
      if (
        !request
          .url()
          .includes(`/api/conversations/${LOCAL_CONVERSATION_ID}/events/search`)
      ) {
        return false;
      }
      return !new URL(request.url()).searchParams.has("timestamp__lt");
    });

    await page.goto(`/conversations/${LOCAL_CONVERSATION_ID}`);

    const initialRequest = await initialRequestPromise;
    const initialUrl = new URL(initialRequest.url());
    expect(initialUrl.searchParams.get("limit")).toBe(String(PAGE_SIZE));
    expect(initialUrl.searchParams.get("sort_order")).toBe("TIMESTAMP_DESC");
    await expect(
      page.getByText("Local pagination message 100", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Local pagination message 50", { exact: true }),
    ).toHaveCount(0);

    const olderRequestPromise = page.waitForRequest(
      eventSearchRequestFor(LOCAL_CONVERSATION_ID),
    );
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
      page.getByText("Local pagination message 50", { exact: true }),
    ).toBeAttached({ timeout: 15_000 });
    await expect(page.getByTestId("loading-older-events")).toHaveCount(0);
  });

  test("loads older events when scrolling up on a cloud backend", async ({
    page,
  }) => {
    await seedBackendSelection(page, "cloud", CLOUD_CONVERSATION_ID);

    const initialRequestPromise = page.waitForRequest((request) => {
      if (request.method() !== "POST") return false;
      if (!request.url().includes("/api/cloud-proxy")) return false;
      const path = parseCloudProxyPath(request);
      return (
        path.includes(
          `/api/v1/conversation/${CLOUD_CONVERSATION_ID}/events/search`,
        ) && !path.includes("timestamp__lt")
      );
    });

    await page.goto(`/conversations/${CLOUD_CONVERSATION_ID}`);

    const initialPath = parseCloudProxyPath(await initialRequestPromise);
    const initialUrl = new URL(initialPath, "https://mock-cloud.test");
    expect(initialUrl.searchParams.get("limit")).toBe(String(PAGE_SIZE));
    expect(initialUrl.searchParams.get("sort_order")).toBe("TIMESTAMP_DESC");
    await expect(
      page.getByText("Cloud pagination message 100", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Cloud pagination message 50", { exact: true }),
    ).toHaveCount(0);

    const olderRequestPromise = page.waitForRequest(
      cloudEventSearchRequestFor(CLOUD_CONVERSATION_ID),
    );
    await triggerOlderEventLoad(page);

    await expect(page.getByTestId("loading-older-events")).toContainText(
      "Fetching older messages",
    );
    const olderPath = parseCloudProxyPath(await olderRequestPromise);
    const olderUrl = new URL(olderPath, "https://mock-cloud.test");
    expect(olderUrl.pathname).toBe(
      `/api/v1/conversation/${CLOUD_CONVERSATION_ID}/events/search`,
    );
    expect(olderUrl.searchParams.get("limit")).toBe(String(PAGE_SIZE));
    expect(olderUrl.searchParams.get("sort_order")).toBe("TIMESTAMP_DESC");
    expect(olderUrl.searchParams.get("timestamp__lt")).toBe(
      timestampForEvent(51),
    );

    await expect(
      page.getByText("Cloud pagination message 50", { exact: true }),
    ).toBeAttached({ timeout: 15_000 });
    await expect(page.getByTestId("loading-older-events")).toHaveCount(0);
  });
});
