import { test, expect, Page } from "@playwright/test";

/**
 * Visual snapshot tests for the Changes (diff viewer) UI.
 *
 * The Changes view is rendered by src/routes/changes-tab.tsx inside the Files
 * tab (src/routes/files-tab.tsx) when the "Diff view" toggle is ON.  We force
 * that toggle by pre-seeding the conversation's localStorage state with
 * `filesTabDiffView: true` before navigation.
 *
 * MSW pre-seeds three git changes in src/mocks/git-repository-handlers.ts:
 *   - src/components/hello.tsx  (M — modified)
 *   - src/utils/new-helper.ts   (A — added)
 *   - src/old-module.py         (D — deleted)
 *
 * Three snapshots are captured:
 *   1. Empty state — no files changed (window.__setMockGitChanges__([]) used
 *      to clear MSW's in-memory list after boot, then a query invalidation
 *      triggers a re-fetch that returns []).
 *   2. Diff viewer — modified file (hello.tsx) expanded to show Monaco.
 *   3. Deleted file placeholder — deleted file (old-module.py) shows the
 *      "file deleted" message instead of a Monaco editor (the diff query is
 *      disabled for type "D" per useUnifiedGitDiff).
 *
 * NOTE on MSW vs page.route():
 *   MSW 2.x browser-mode handlers run in the page's main thread, not the
 *   service worker.  Playwright's page.route() is blocked by the service worker
 *   for same-origin requests.  We therefore manipulate MSW state via
 *   page.evaluate() rather than page.route() (same pattern as the automations
 *   empty-state test).
 */

// Mock conversation IDs "1", "2", "3" are pre-defined in MSW handlers.
const CONVERSATION_ID = "1";

// Pre-enable diff view for conversation 1.
// NOTE: rightPanelShown is intentionally omitted — it is session-only state
// stripped by sanitizeStoredState on read.  The right panel is opened
// programmatically via a right-panel-toggle click in navigateAndWaitForFilesTab.
const CONVERSATION_STATE_KEY = `conversation-state-${CONVERSATION_ID}`;
const CONVERSATION_STATE_VALUE = JSON.stringify({
  selectedTab: "files",
  filesTabDiffView: true,
  filesTabContentViewMode: "rich",
  unpinnedTabs: [],
  conversationMode: "code",
  subConversationTaskId: null,
  draftMessage: null,
});

/**
 * Skip onboarding and pre-enable the diff view for conversation 1.
 */
async function setupMocks(page: Page) {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem("openhands-onboarded", "true");
      window.localStorage.setItem(key, value);
    },
    [CONVERSATION_STATE_KEY, CONVERSATION_STATE_VALUE] as [string, string],
  );

  // Stub WebSocket so the conversation page doesn't hang waiting for a real
  // socket connection.  Copied from collapsible-thinking.snapshot.spec.ts.
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

async function dismissConsentModal(page: Page) {
  await page
    .getByRole("button", { name: "Confirm preferences" })
    .click({ timeout: 3_000 })
    .catch(() => undefined);
}

/**
 * Navigate to the conversation and wait for the Files tab (diff view) to
 * be rendered.  Returns the `data-testid="files-tab"` locator.
 *
 * `isRightPanelShown` is session-only Zustand state (always false on load;
 * `sanitizeStoredState` strips any persisted `rightPanelShown` key).
 * We open the right panel by clicking the `right-panel-toggle` button,
 * which calls `setHasRightPanelToggled(true)` → synced to
 * `setIsRightPanelShown(true)` by `use-chat-input-logic`.
 */
async function navigateAndWaitForFilesTab(page: Page) {
  await page.goto(`/conversations/${CONVERSATION_ID}`, {
    waitUntil: "domcontentloaded",
  });
  await dismissConsentModal(page);

  // Open the right panel — it always starts closed on page load.
  const toggle = page.getByTestId("right-panel-toggle");
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  await toggle.click();

  // The FilesTab is lazy-loaded inside the now-open right panel.
  const filesTab = page.getByTestId("files-tab");
  await expect(filesTab).toBeVisible({ timeout: 20_000 });
  return filesTab;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Changes Tab Visual Snapshots", () => {
  // Heavier conversation-page setup — run serially to avoid flakiness.
  test.describe.configure({ mode: "serial" });
  test.setTimeout(60_000);

  test("changes tab shows empty state when no files changed", async ({
    page,
  }) => {
    // MSW pre-seeds MOCK_GIT_CHANGES with M/A/D files.  We call the exposed
    // window setter (installed by git-repository-handlers.ts) AFTER the app
    // boots to replace the list with [], then ask React Query to refetch.
    // This avoids a page.reload() which would re-seed the module state.
    await setupMocks(page);

    await navigateAndWaitForFilesTab(page);

    // Pin the RandomTip section to a fixed height so the flex-1 container
    // above it is deterministic across runs.  RandomTip renders a randomly
    // selected tip whose text can vary in line count, causing different
    // layout heights between the baseline-generation run and verification run.
    // The class combination ".text-m.bg-tertiary.p-4" is unique to this element
    // in changes-tab.tsx (confirmed by grep).  Hiding the content removes the
    // visual variable; the fixed height keeps the surrounding flex layout stable.
    await page.addStyleTag({
      content: `.text-m.bg-tertiary.p-4 {
        height: 80px !important;
        overflow: hidden !important;
        visibility: hidden !important;
      }`,
    });

    // Wait for the initial (non-empty) render to settle before mutating state.
    await expect(
      page.locator('[data-testid="file-diff-viewer-outer"]').first(),
    ).toBeVisible({ timeout: 10_000 });

    // Clear the changes via the exposed window helper and refetch.
    await page.evaluate(() => {
      (
        window as unknown as {
          __setMockGitChanges__?: (changes: unknown[]) => void;
        }
      ).__setMockGitChanges__?.([]);
    });
    await page.evaluate(() => {
      (
        window as unknown as {
          __TEST_INVALIDATE_QUERIES__?: (queryKey?: unknown[]) => void;
        }
      ).__TEST_INVALIDATE_QUERIES__?.(["file_changes"]);
    });

    // Wait for the empty-state message from EmptyChangesMessage component.
    await expect(
      page.getByText("OpenHands hasn't made any changes yet"),
    ).toBeVisible({ timeout: 10_000 });

    // Screenshot the diff-content div (direct child of files-tab when diff view
    // is enabled) rather than the full files-tab.  This avoids capturing any
    // adjacent-panel artefacts that may bleed into the outer element's bounding
    // box during CI rendering, while still showing the full empty-state UI.
    //
    // DOM path: main[data-testid="files-tab"]  >  div.flex-1.min-h-0  >  main
    // The inner <main> rendered by GitChanges is the safest stable target.
    const changesContent = page
      .getByTestId("files-tab")
      .locator("> div")
      .last();
    await expect(changesContent).toHaveScreenshot("changes-empty.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("changes tab shows file list and diff viewer for modified file", async ({
    page,
  }) => {
    // MOCK_GIT_CHANGES is pre-seeded; the file list renders without any override.
    await setupMocks(page);

    const filesTab = await navigateAndWaitForFilesTab(page);

    // Wait for at least one file row to appear.
    await expect(
      page.locator('[data-testid="file-diff-viewer-outer"]').first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click the modified file (hello.tsx) header row to expand the diff editor.
    // The header row is the first child div of file-diff-viewer-outer and has
    // the cursor-pointer class; clicking the strong element (file path) is the
    // most reliable targeting.
    await page
      .locator('[data-testid="file-diff-viewer-outer"]')
      .filter({ hasText: "hello.tsx" })
      .locator("strong")
      .click();

    // Wait for the EditorContainer (wraps the Monaco DiffEditor) to appear.
    await expect(page.getByTestId("editor-container").first()).toBeVisible({
      timeout: 10_000,
    });

    // Mask the Monaco DiffEditor container.  Monaco renders text content
    // progressively and uses sub-pixel font hinting that varies between OS/CI
    // environments.  Masking editor-container captures the panel layout (toolbar,
    // file list, editor frame) without the volatile text-rendering pixels.
    await expect(filesTab).toHaveScreenshot("changes-diff-viewer.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
      mask: [page.getByTestId("editor-container")],
    });
  });

  test("changes tab shows deleted-file placeholder instead of diff editor", async ({
    page,
  }) => {
    // src/old-module.py has type "D" (deleted). useUnifiedGitDiff disables the
    // query for deleted files; clicking the row expands the file-deleted-message
    // placeholder instead of a Monaco editor.
    await setupMocks(page);

    const filesTab = await navigateAndWaitForFilesTab(page);

    // Wait for at least one file row to appear.
    await expect(
      page.locator('[data-testid="file-diff-viewer-outer"]').first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click the deleted file row to expand it.
    await page
      .locator('[data-testid="file-diff-viewer-outer"]')
      .filter({ hasText: "old-module.py" })
      .locator("strong")
      .click();

    // The deleted-file placeholder (data-testid="file-deleted-message") is
    // shown when !isCollapsed && type === "D".
    await expect(page.getByTestId("file-deleted-message")).toBeVisible({
      timeout: 10_000,
    });

    await expect(filesTab).toHaveScreenshot("changes-deleted-file.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    });
  });
});
