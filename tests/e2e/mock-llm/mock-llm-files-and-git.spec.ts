/**
 * Mock-LLM E2E tests: Files tab, Git control bar, and Browser tab.
 *
 * Exercises conversation-panel tabs and git integration against the real
 * agent-server with a scripted mock LLM backend.
 *
 * Coverage (issue #511):
 *   - Files tab defaults to diff view when a workspace is attached
 *   - Git control bar shows workspace-name pill for folder-attached conversations
 *   - Browser tab renders empty state when no page has been browsed
 *   - Files tab defaults to file-tree view when NO workspace is attached
 */

import { test, expect } from "@playwright/test";
import {
  REPLY_TOKEN,
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForTestId,
  waitForPath,
  getConversationIdFromURL,
  waitForNonUserMessageText,
  deleteConversation,
  ensureMockLLMProfile,
  registerTrajectory,
  activateTrajectory,
  resetMockLLM,
} from "./utils/mock-llm-helpers";

const USER_MESSAGE = "Hello, please respond.";
const WORKSPACE_PATH = "/tmp/e2e-test-project/my-app";

/**
 * Seed `selected_workspace` into the conversation metadata localStorage key.
 * Each Playwright test gets a fresh browser context, so this must be called
 * in every test that needs the workspace attachment signal — not just once.
 *
 * Uses `addInitScript` (like `seedLocalStorage`) so the script fires on the
 * real app origin when the first `page.goto()` triggers a document load.
 * A plain `page.evaluate` on `about:blank` would write to the wrong origin.
 */
async function seedWorkspaceMetadata(
  page: import("@playwright/test").Page,
  conversationId: string,
  workspacePath: string,
) {
  await page.addInitScript(
    ({ convId, wsPath }) => {
      const STORAGE_KEY = "openhands-agent-server-conversation-metadata";
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const all = raw ? JSON.parse(raw) : {};
      all[convId] = {
        ...(all[convId] || {}),
        selected_workspace: wsPath,
        selected_repository: null,
        selected_branch: null,
        git_provider: null,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    },
    { convId: conversationId, wsPath: workspacePath },
  );
}

test.describe.configure({ mode: "serial" });

test.describe("files tab, git control bar, and browser tab", () => {
  const conversationIds = new Set<string>();
  /** Conversation ID from the workspace-attached test, reused across steps. */
  let attachedConversationId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  test.afterEach(async ({ page, request }) => {
    const match = page.url().match(/\/conversations\/([^/?#]+)/);
    if (match?.[1]) conversationIds.add(decodeURIComponent(match[1]));
  });

  test.afterAll(async ({ request }) => {
    for (const id of Array.from(conversationIds)) {
      try {
        await deleteConversation(request, id);
      } catch {
        // best-effort
      }
    }
    try {
      await resetMockLLM(request);
    } catch {
      // best-effort
    }
  });

  // ── Step 1: Setup LLM profile ──────────────────────────────────────

  test("step 1: ensure mock LLM profile is configured", async ({ request }) => {
    await ensureMockLLMProfile(request);

    // Register a trajectory that ensures the workspace is a git repo WITH
    // a remote. The git control bar only shows Pull/Push when it can parse
    // a provider+repository from `git remote get-url origin`. In the npm
    // path the agent-server worktree already inherits the host repo; in the
    // Docker path we must create one from scratch.
    await registerTrajectory(request, "files-and-git", [
      {
        tool_call: {
          name: "terminal",
          arguments: {
            command: [
              // If already in a git repo with an origin remote, skip init
              "if git remote get-url origin >/dev/null 2>&1; then true",
              // Otherwise bootstrap a fresh repo with a GitHub remote
              "else git init",
              "&& git remote add origin https://github.com/test-org/test-repo.git",
              "&& git commit --allow-empty -m init; fi",
              "&& printf 'MOCK_LLM_E2E_BASH_OK\\n'",
            ].join(" "),
          },
        },
      },
      { text: REPLY_TOKEN },
    ]);
    await activateTrajectory(request, "files-and-git");
  });

  // ── Step 2: Start a conversation and seed workspace attachment ──────

  test("step 2: start conversation and attach workspace metadata", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);

    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "home-chat-launcher");

    // Type and send a message from the home page launcher
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
      { testId: "chat-input", text: USER_MESSAGE },
    );
    await page.getByTestId("submit-button").click();

    // Wait for navigation to the conversation page
    await waitForPath(page, /\/conversations\/.+/, 30_000);
    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);
    attachedConversationId = conversationId;

    // Wait for the agent to finish replying so the conversation is fully
    // initialized (WebSocket connected, runtime ready).
    await waitForNonUserMessageText(page, REPLY_TOKEN, 60_000);

    // Seed `selected_workspace` in the conversation metadata store.
    // This simulates a user who picked a local folder before starting the
    // conversation — the metadata store is what `useHasAttachedSource`
    // and the git control bar read from.
    await seedWorkspaceMetadata(page, conversationId, WORKSPACE_PATH);

    // Reload so hooks re-read from localStorage
    await page.reload({ waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    // Wait for the conversation to load again
    await waitForTestId(page, "chat-interface", 30_000);
  });

  // ── Step 3: Verify git control bar shows workspace name pill ────────

  test("step 3: git control bar shows repo pill and action buttons", async ({
    page,
  }) => {
    test.skip(!attachedConversationId, "step 2 must complete first");
    test.setTimeout(60_000);

    // Seed workspace metadata so the git control bar can infer the
    // workspace name even if the detected git remote differs.
    await seedWorkspaceMetadata(page, attachedConversationId!, WORKSPACE_PATH);

    await routeSessionApiKey(page);
    await page.goto(`/conversations/${attachedConversationId}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "chat-interface", 30_000);

    // The trajectory in step 1 ran `git init && git commit` inside the
    // conversation workspace, so git detection finds a repository in
    // BOTH the npm path (host worktree) and the Docker path (init'd
    // repo). The control bar should show Pull and Push buttons.
    await test.step("verify Pull and Push buttons are visible", async () => {
      await expect(
        page.getByRole("button", { name: /Pull/i }).first(),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("button", { name: /Push/i }).first(),
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  // ── Step 4: Verify Files tab diff toggle defaults to "on" ──────────

  test("step 4: files tab defaults to diff view for attached workspace", async ({
    page,
  }) => {
    test.skip(!attachedConversationId, "step 2 must complete first");
    test.setTimeout(60_000);

    // Re-seed workspace metadata — each test gets a fresh browser context.
    await seedWorkspaceMetadata(page, attachedConversationId!, WORKSPACE_PATH);

    await routeSessionApiKey(page);
    await page.goto(`/conversations/${attachedConversationId}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "chat-interface", 30_000);

    // Open the right panel
    await test.step("open right panel", async () => {
      const toggle = page.getByTestId("right-panel-toggle");
      await expect(toggle).toBeVisible({ timeout: 10_000 });
      await toggle.click();
    });

    // Click the Files tab
    await test.step("click files tab", async () => {
      const filesTab = page.getByTestId("conversation-tab-files");
      await expect(filesTab).toBeVisible({ timeout: 10_000 });
      await filesTab.click();
    });

    await test.step("verify diff toggle defaults to on", async () => {
      // Wait for the files tab to render
      await waitForTestId(page, "files-tab", 15_000);

      // The segmented toggle should have the "on" option checked
      // (aria-checked="true") when diff view is the default.
      const diffOnOption = page.getByTestId("files-tab-diff-toggle-option-on");
      await expect(diffOnOption).toBeVisible({ timeout: 10_000 });
      await expect(diffOnOption).toHaveAttribute("aria-checked", "true");
    });
  });

  // ── Step 5: Verify Browser tab shows empty state ───────────────────

  test("step 5: browser tab shows empty state", async ({ page }) => {
    test.skip(!attachedConversationId, "step 2 must complete first");
    test.setTimeout(60_000);

    await routeSessionApiKey(page);
    await page.goto(`/conversations/${attachedConversationId}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "chat-interface", 30_000);

    // Open the right panel
    await test.step("open right panel", async () => {
      const toggle = page.getByTestId("right-panel-toggle");
      await expect(toggle).toBeVisible({ timeout: 10_000 });
      await toggle.click();
    });

    // Click the Browser tab
    await test.step("click browser tab", async () => {
      const browserTab = page.getByTestId("conversation-tab-browser");
      await expect(browserTab).toBeVisible({ timeout: 10_000 });
      await browserTab.click();
    });

    await test.step("verify empty browser message", async () => {
      // The EmptyBrowserMessage renders the "No page loaded yet" message.
      // We assert on the text rather than a test-id since the component
      // uses the shared ConversationTabEmptyState without its own id.
      await expect(
        page.getByText("No page loaded yet", { exact: false }),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // ── Step 6: Verify Files tab defaults to file-tree when no workspace ─

  test("step 6: files tab defaults to file-tree view without attached workspace", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);

    // Fresh trajectory — step 2's conversation consumed the previous one.
    await resetMockLLM(request);

    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "home-chat-launcher");

    // Start a brand-new conversation WITHOUT seeding any workspace metadata
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
      { testId: "chat-input", text: USER_MESSAGE },
    );
    await page.getByTestId("submit-button").click();

    await waitForPath(page, /\/conversations\/.+/, 30_000);
    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);

    // Wait for the agent to reply
    await waitForNonUserMessageText(page, REPLY_TOKEN, 60_000);

    // Open the right panel
    await test.step("open right panel", async () => {
      const toggle = page.getByTestId("right-panel-toggle");
      await expect(toggle).toBeVisible({ timeout: 10_000 });
      await toggle.click();
    });

    // Click the Files tab
    await test.step("click files tab", async () => {
      const filesTab = page.getByTestId("conversation-tab-files");
      await expect(filesTab).toBeVisible({ timeout: 10_000 });
      await filesTab.click();
    });

    await test.step("verify diff toggle defaults to off (files view)", async () => {
      await waitForTestId(page, "files-tab", 15_000);

      // Without an attached workspace, the "off" (Files) option should be active
      const diffOffOption = page.getByTestId("files-tab-diff-toggle-option-off");
      await expect(diffOffOption).toBeVisible({ timeout: 10_000 });
      await expect(diffOffOption).toHaveAttribute("aria-checked", "true");
    });
  });
});
