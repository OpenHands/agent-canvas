/**
 * Mock-LLM E2E test: diff view / Changes tab rendering after file edits.
 *
 * Exercises the full pipeline from agent file edits through git change
 * detection to the diff viewer UI:
 *
 *   1. Setup: configure mock LLM profile and register a trajectory whose
 *      terminal tool calls create and modify files in the conversation
 *      workspace.
 *   2. Conversation: type a prompt → mock LLM returns terminal commands
 *      that create two files and edit one of them. Wait for the agent to
 *      finish (reply token appears in chat).
 *   3. UI verification: open the right panel, switch to the Files tab's
 *      Diff view, and verify that the changed files appear. Expand a
 *      diff entry and verify the diff editor renders. Then run a second
 *      batch of edits (via a new conversation) and verify the diff view
 *      updates with the new changes.
 */

import { test, expect } from "@playwright/test";
import {
  BACKEND_URL,
  SESSION_API_KEY,
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
  waitForPath,
  waitForNonUserMessageText,
  deleteConversation,
  registerTrajectory,
  activateTrajectory,
  resetMockLLM,
  ensureMockLLMProfile,
  setChatInput,
  getConversationIdFromURL,
} from "./utils/mock-llm-helpers";

// ── Tokens & constants ─────────────────────────────────────────────────

const DIFF_REPLY_TOKEN = "MOCK_DIFF_VIEW_REPLY_OK";
const DIFF_REPLY_TOKEN_2 = "MOCK_DIFF_VIEW_BATCH2_OK";
const TRAJECTORY_NAME = "diff-view-test";
const TRAJECTORY_NAME_2 = "diff-view-batch2";

// ── Trajectory: create and edit files via terminal ─────────────────────
//
// We use `terminal` tool calls rather than `file_editor` because terminal
// commands run in the conversation workspace directory — no need to know
// the absolute worktree path ahead of time. The git changes endpoint
// detects any uncommitted modifications regardless of how they were made.

const DIFF_TRAJECTORY_TURNS = [
  // Turn 1: Create hello.py
  {
    tool_call: {
      name: "terminal",
      arguments: {
        command:
          "cat > hello.py << 'FILEEOF'\nprint(\"Hello, World!\")\nFILEEOF",
      },
    },
  },
  // Turn 2: Modify hello.py (add a second line, change the greeting)
  {
    tool_call: {
      name: "terminal",
      arguments: {
        command:
          "cat > hello.py << 'FILEEOF'\nprint(\"Hello, Mock LLM!\")\nprint(\"Diff view works!\")\nFILEEOF",
      },
    },
  },
  // Turn 3: Create utils.py
  {
    tool_call: {
      name: "terminal",
      arguments: {
        command:
          "cat > utils.py << 'FILEEOF'\ndef helper():\n    return 42\nFILEEOF",
      },
    },
  },
  // Turn 4: Final text reply
  { text: DIFF_REPLY_TOKEN },
];

// Second batch: add a third file and modify utils.py, exercising the
// diff view's ability to reflect ongoing workspace changes.
const DIFF_TRAJECTORY_BATCH2_TURNS = [
  // Turn 1: Modify utils.py
  {
    tool_call: {
      name: "terminal",
      arguments: {
        command:
          "cat > utils.py << 'FILEEOF'\ndef helper():\n    return 99\n\ndef greet(name):\n    return f\"Hi, {name}!\"\nFILEEOF",
      },
    },
  },
  // Turn 2: Create config.json
  {
    tool_call: {
      name: "terminal",
      arguments: {
        command:
          'cat > config.json << \'FILEEOF\'\n{"version": "1.0", "debug": true}\nFILEEOF',
      },
    },
  },
  // Turn 3: Final text reply
  { text: DIFF_REPLY_TOKEN_2 },
];

test.describe.configure({ mode: "serial" });

test.describe("mock-LLM diff view", () => {
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

  // ── Step 1: Setup LLM profile ────────────────────────────────────────

  test("step 1: configure mock LLM profile for diff view tests", async ({
    page,
  }) => {
    await ensureMockLLMProfile(page, { profileName: "mock-llm-diff" });
  });

  // ── Step 2: Run conversation with file edits, verify diff view ───────

  test("step 2: create files and verify diff view shows changes", async ({
    page,
    request,
  }) => {
    // Register and activate the trajectory
    await resetMockLLM(request);
    await registerTrajectory(request, TRAJECTORY_NAME, DIFF_TRAJECTORY_TURNS);
    await activateTrajectory(request, TRAJECTORY_NAME);

    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "home-chat-launcher");

    // Start conversation
    await setChatInput(page, "Create some test files for me please.");
    await page.getByTestId("submit-button").click();
    await waitForPath(page, /\/conversations\/.+/, 30_000);

    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);

    // Wait for the agent to finish
    await waitForNonUserMessageText(page, DIFF_REPLY_TOKEN, 60_000);

    // ── Open the right panel ──
    await test.step("open right panel", async () => {
      const toggle = page.getByTestId("right-panel-toggle");
      await expect(toggle).toBeVisible({ timeout: 10_000 });
      await toggle.click();

      // Wait for the files tab to appear (default tab when panel opens)
      await expect(page.getByTestId("files-tab")).toBeVisible({
        timeout: 10_000,
      });
    });

    // ── Switch to Diff view ──
    await test.step("switch to diff view", async () => {
      // The diff/files toggle is a segmented control. Click the "Diff view"
      // option (data-testid="files-tab-diff-toggle-option-on").
      const diffToggle = page.getByTestId("files-tab-diff-toggle-option-on");
      await expect(diffToggle).toBeVisible({ timeout: 5_000 });
      await diffToggle.click();
    });

    // ── Refresh to ensure latest git state ──
    await test.step("refresh git changes", async () => {
      const refreshBtn = page.getByTestId("files-tab-refresh");
      await expect(refreshBtn).toBeVisible({ timeout: 5_000 });
      await refreshBtn.click();
    });

    // ── Verify changed files appear ──
    await test.step("verify changed files are listed", async () => {
      // FileDiffViewer renders with data-testid="file-diff-viewer-outer"
      // and contains the file path in a <strong> element.
      // Poll until the diff viewers appear — the git changes fetch may
      // take a moment after the refresh.
      await expect
        .poll(
          async () => {
            const viewers = page.getByTestId("file-diff-viewer-outer");
            return viewers.count();
          },
          {
            message: "Expected at least 2 file diff viewers to appear",
            timeout: 30_000,
            intervals: [1_000, 2_000, 3_000],
          },
        )
        .toBeGreaterThanOrEqual(2);

      // Verify specific file names are present
      const allText = await page
        .getByTestId("file-diff-viewer-outer")
        .allTextContents();
      const joined = allText.join(" ");
      expect(
        joined,
        "hello.py should appear in the diff viewer list",
      ).toContain("hello.py");
      expect(
        joined,
        "utils.py should appear in the diff viewer list",
      ).toContain("utils.py");
    });

    // ── Expand a diff and verify editor renders ──
    await test.step("expand diff and verify editor content", async () => {
      // Click on the hello.py diff entry to expand it (default is collapsed).
      // Click the header row specifically (not the whole wrapper) to toggle.
      const helloDiff = page
        .getByTestId("file-diff-viewer-outer")
        .filter({ hasText: "hello.py" });
      await helloDiff.click();

      // The Monaco diff editor renders file content as text nodes inside
      // the expanded entry. Assert on actual content text rather than
      // Monaco-internal CSS classes — `.view-lines` elements can return
      // empty textContent because Monaco uses layered rendering.
      await expect(helloDiff).toContainText('print("Hello, Mock LLM!")', {
        timeout: 15_000,
      });
    });
  });

  // ── Step 3: Second batch of edits, verify diff view updates ──────────

  test("step 3: additional edits update the diff view", async ({
    page,
    request,
  }) => {
    // Register and activate the second batch trajectory
    await resetMockLLM(request);
    await registerTrajectory(
      request,
      TRAJECTORY_NAME_2,
      DIFF_TRAJECTORY_BATCH2_TURNS,
    );
    await activateTrajectory(request, TRAJECTORY_NAME_2);

    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "home-chat-launcher");

    // Start a new conversation
    await setChatInput(page, "Now modify the existing files and add config.");
    await page.getByTestId("submit-button").click();
    await waitForPath(page, /\/conversations\/.+/, 30_000);

    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);

    // Wait for the agent to finish
    await waitForNonUserMessageText(page, DIFF_REPLY_TOKEN_2, 60_000);

    // ── Open right panel and switch to diff view ──
    await test.step("open panel and switch to diff view", async () => {
      const toggle = page.getByTestId("right-panel-toggle");
      await expect(toggle).toBeVisible({ timeout: 10_000 });
      await toggle.click();
      await expect(page.getByTestId("files-tab")).toBeVisible({
        timeout: 10_000,
      });

      const diffToggle = page.getByTestId("files-tab-diff-toggle-option-on");
      await expect(diffToggle).toBeVisible({ timeout: 5_000 });
      await diffToggle.click();
    });

    // ── Refresh and verify ──
    await test.step("refresh and verify updated changes", async () => {
      const refreshBtn = page.getByTestId("files-tab-refresh");
      await refreshBtn.click();

      // This is a new conversation, so it has its own worktree. The
      // second batch creates utils.py and config.json.
      await expect
        .poll(
          async () => {
            const viewers = page.getByTestId("file-diff-viewer-outer");
            return viewers.count();
          },
          {
            message: "Expected at least 2 file diff viewers for batch 2",
            timeout: 30_000,
            intervals: [1_000, 2_000, 3_000],
          },
        )
        .toBeGreaterThanOrEqual(2);

      const allText = await page
        .getByTestId("file-diff-viewer-outer")
        .allTextContents();
      const joined = allText.join(" ");
      expect(
        joined,
        "utils.py should appear in the diff viewer list",
      ).toContain("utils.py");
      expect(
        joined,
        "config.json should appear in the diff viewer list",
      ).toContain("config.json");
    });

    // ── Expand config.json and verify it renders ──
    await test.step("expand config.json diff and verify content", async () => {
      const configDiff = page
        .getByTestId("file-diff-viewer-outer")
        .filter({ hasText: "config.json" });
      await configDiff.click();

      // Assert on actual file content text inside the expanded diff viewer.
      await expect(configDiff).toContainText("version", {
        timeout: 15_000,
      });
    });
  });

  // ── Step 4: Verify no error banners across the flow ──────────────────

  test("step 4: no error banners visible", async ({ page }) => {
    // Navigate to home to verify app is healthy after diff view tests
    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    const errorBanner = page.getByTestId("error-message-banner");
    await expect(errorBanner).not.toBeVisible({ timeout: 5_000 });
  });
});
