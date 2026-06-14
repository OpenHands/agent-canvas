/**
 * Mock-LLM E2E tests: per-tool visualizers for tool calls in the conversation UI.
 *
 * Coverage for PR #1246 ("feat(chat): per-tool visualizers for tool calls"):
 *   - Bash/terminal tool visualizer renders command text and output
 *   - File editor tool visualizer renders file path chip and diff/code content
 *   - Observation events show corresponding action data (command, path, etc.)
 *
 * Uses page.route() to inject mock conversation events with tool call
 * actions and observations so we can verify the visualizer components
 * render correctly without running a real LLM conversation.
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

const MOCK_CONVERSATION_ID = "tool-visualizers-e2e";
const BASE_TIME = Date.UTC(2026, 5, 10, 1, 0, 0);

const BASH_COMMAND = "echo 'hello world'";
const BASH_OUTPUT = "hello world\n";
const FILE_PATH = "/workspace/project/example.py";
const OLD_CONTENT = 'print("hello")';
const NEW_CONTENT = 'print("hello world")';

function buildMockConversation() {
  return {
    id: MOCK_CONVERSATION_ID,
    conversation_id: MOCK_CONVERSATION_ID,
    status: "STOPPED",
    execution_status: "stopped",
    created_at: new Date(BASE_TIME).toISOString(),
    updated_at: new Date(BASE_TIME + 5 * 60_000).toISOString(),
    title: "Tool visualizer test",
  };
}

function buildToolCallEvents() {
  return [
    // 1. User message
    {
      id: "user-msg-1",
      timestamp: new Date(BASE_TIME).toISOString(),
      source: "user",
      kind: "MessageEvent",
      llm_message: {
        role: "user",
        content: [{ type: "text", text: "Run a command and edit a file." }],
      },
    },
    // 2. Bash action (terminal tool call)
    {
      id: "bash-action-1",
      timestamp: new Date(BASE_TIME + 60_000).toISOString(),
      source: "agent",
      thought: [],
      thinking_blocks: [],
      action: {
        kind: "TerminalAction",
        command: BASH_COMMAND,
        is_input: false,
        timeout: null,
        reset: false,
      },
      tool_name: "terminal",
      tool_call_id: "call_bash_1",
      tool_call: {
        id: "call_bash_1",
        type: "function",
        function: {
          name: "terminal",
          arguments: JSON.stringify({ command: BASH_COMMAND }),
        },
      },
      llm_response_id: "resp_1",
      security_risk: "LOW",
    },
    // 3. Bash observation (terminal output)
    {
      id: "bash-obs-1",
      timestamp: new Date(BASE_TIME + 2 * 60_000).toISOString(),
      source: "environment",
      observation: {
        kind: "TerminalObservation",
        content: [{ type: "text", text: BASH_OUTPUT }],
        command: BASH_COMMAND,
        exit_code: 0,
        is_error: false,
        timeout: false,
        metadata: {},
      },
      tool_name: "terminal",
      tool_call_id: "call_bash_1",
      action_id: "bash-action-1",
    },
    // 4. File editor action (str_replace)
    {
      id: "file-action-1",
      timestamp: new Date(BASE_TIME + 3 * 60_000).toISOString(),
      source: "agent",
      thought: [],
      thinking_blocks: [],
      action: {
        kind: "FileEditorAction",
        command: "str_replace",
        path: FILE_PATH,
        file_text: null,
        old_str: OLD_CONTENT,
        new_str: NEW_CONTENT,
        insert_line: null,
        view_range: null,
      },
      tool_name: "file_editor",
      tool_call_id: "call_file_1",
      tool_call: {
        id: "call_file_1",
        type: "function",
        function: {
          name: "file_editor",
          arguments: JSON.stringify({
            command: "str_replace",
            path: FILE_PATH,
            old_str: OLD_CONTENT,
            new_str: NEW_CONTENT,
          }),
        },
      },
      llm_response_id: "resp_2",
      security_risk: "LOW",
    },
    // 5. File editor observation (str_replace result)
    {
      id: "file-obs-1",
      timestamp: new Date(BASE_TIME + 4 * 60_000).toISOString(),
      source: "environment",
      observation: {
        kind: "FileEditorObservation",
        content: [
          {
            type: "text",
            text: "The file has been edited successfully.",
          },
        ],
        command: "str_replace",
        output: "The file has been edited successfully.",
        path: FILE_PATH,
        prev_exist: true,
        old_content: OLD_CONTENT,
        new_content: NEW_CONTENT,
        error: null,
      },
      tool_name: "file_editor",
      tool_call_id: "call_file_1",
      action_id: "file-action-1",
    },
    // 6. Agent reply
    {
      id: "agent-msg-1",
      timestamp: new Date(BASE_TIME + 5 * 60_000).toISOString(),
      source: "agent",
      kind: "MessageEvent",
      llm_message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Done! I ran the command and edited the file.",
          },
        ],
      },
    },
  ];
}

/**
 * Intercept conversation lookup and event search for the tool visualizer test.
 */
async function routeToolVisualizerConversation(page: Page) {
  const events = buildToolCallEvents();

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

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

test.describe("tool visualizers", () => {
  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  // ── Bash/terminal tool visualizer ──────────────────────────────────

  test("bash tool visualizer renders command and output", async ({ page }) => {
    test.setTimeout(60_000);
    await routeSessionApiKey(page);
    await routeToolVisualizerConversation(page);

    await page.goto(`/conversations/${MOCK_CONVERSATION_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "chat-interface", 30_000);

    // Wait for the conversation events to render
    await expect(
      page.getByText("Run a command and edit a file."),
    ).toBeVisible({ timeout: 15_000 });

    await test.step("verify bash command is visible in the chat", async () => {
      // The bash visualizer renders the command in a CodeBlock.
      // The command text should appear in the chat area.
      await expect(
        page.getByText(BASH_COMMAND, { exact: false }).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    await test.step("verify bash output is visible", async () => {
      // The observation card shows the output in an OutputPane.
      // Look for the output text in the chat area.
      await expect(
        page.getByText("hello world", { exact: false }).first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // ── File editor tool visualizer ────────────────────────────────────

  test("file editor visualizer renders file path and diff content", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await routeSessionApiKey(page);
    await routeToolVisualizerConversation(page);

    await page.goto(`/conversations/${MOCK_CONVERSATION_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "chat-interface", 30_000);

    // Wait for the conversation events to render
    await expect(
      page.getByText("Run a command and edit a file."),
    ).toBeVisible({ timeout: 15_000 });

    await test.step("verify file path is visible", async () => {
      // The FilePathChip renders the file path. Look for the path text.
      // The file editor visualizer renders a path chip for both action and
      // observation cards, so at least one should be visible.
      await expect(
        page.getByText(FILE_PATH, { exact: false }).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    await test.step("verify diff content is rendered", async () => {
      // The observation for a str_replace command renders a DiffView.
      // The diff view shows old and new content side by side or unified.
      // Check that both the old and new content appear somewhere in the
      // chat area (they may be in separate diff lines).
      await expect(
        page.getByText(OLD_CONTENT, { exact: false }).first(),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText(NEW_CONTENT, { exact: false }).first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  // ── Agent final reply renders after tool calls ─────────────────────

  test("agent reply renders after tool call events", async ({ page }) => {
    test.setTimeout(60_000);
    await routeSessionApiKey(page);
    await routeToolVisualizerConversation(page);

    await page.goto(`/conversations/${MOCK_CONVERSATION_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "chat-interface", 30_000);

    await test.step("verify agent reply is visible after tool calls", async () => {
      await expect(
        page.getByText("Done! I ran the command and edited the file."),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step("verify user message is visible", async () => {
      await expect(
        page.getByText("Run a command and edit a file."),
      ).toBeVisible({ timeout: 5_000 });
    });
  });
});
