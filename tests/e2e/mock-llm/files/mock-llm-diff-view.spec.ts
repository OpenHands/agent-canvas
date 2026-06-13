/**
 * Mock-LLM E2E tests: diff view rendering and commit lifecycle.
 *
 * Creates multiple files of varying sizes via a scripted conversation, verifies
 * the Changes diff view can render and toggle representative diffs, then
 * verifies committing clears the diff list and subsequent edits create a fresh
 * diff.
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import {
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
} from "../utils/mock-llm-helpers";

function generatePythonContent(lineCount: number, fileName: string): string {
  const lines: string[] = [
    `# ${fileName}`,
    `# Auto-generated test file (${lineCount} lines)`,
    "",
  ];

  let index = 0;
  while (lines.length < lineCount) {
    lines.push(`def func_${index}(x):`);
    if (lines.length >= lineCount) break;
    lines.push(`    """Compute step ${index}."""`);
    if (lines.length >= lineCount) break;
    lines.push(`    result = x * ${index + 1} + ${index * 7}`);
    if (lines.length >= lineCount) break;
    lines.push("    return result");
    if (lines.length >= lineCount) break;
    lines.push("");
    index += 1;
  }

  return lines.slice(0, lineCount).join("\n");
}

function makeFileCreationTurn(filePath: string, content: string) {
  return {
    tool_call: {
      name: "terminal",
      arguments: {
        command: `cat > ${filePath} << 'FILEEOF'\n${content}\nFILEEOF`,
      },
    },
  };
}

interface FileSpec {
  name: string;
  lines: number;
}

const FILE_SPECS: FileSpec[] = [
  { name: "config.json", lines: 3 },
  { name: "README.md", lines: 4 },
  { name: "version.txt", lines: 1 },
  { name: "helpers.py", lines: 15 },
  { name: "constants.py", lines: 20 },
  { name: "types.py", lines: 25 },
  { name: "service.py", lines: 50 },
  { name: "models.py", lines: 75 },
  { name: "validators.py", lines: 100 },
  { name: "engine.py", lines: 200 },
  { name: "pipeline.py", lines: 350 },
  { name: "framework.py", lines: 500 },
];

const FILE_COUNT = FILE_SPECS.length;
const INITIAL_REPLY_TOKEN = "MOCK_DIFF_VIEW_FILES_READY";
const COMMIT_REPLY_TOKEN = "MOCK_DIFF_COMMIT_DONE";
const POST_COMMIT_REPLY_TOKEN = "MOCK_DIFF_POST_COMMIT_OK";
const INITIAL_TRAJECTORY_NAME = "diff-view-files";
const COMMIT_TRAJECTORY_NAME = "diff-view-commit";
const POST_COMMIT_TRAJECTORY_NAME = "diff-view-post-commit";

function buildInitialTrajectory() {
  const turns: Array<
    | { tool_call: { name: string; arguments: { command: string } } }
    | { text: string }
  > = [];

  for (const spec of FILE_SPECS) {
    let content: string;
    if (spec.name.endsWith(".json")) {
      content = `{"generated": true, "lines": ${spec.lines}}`;
    } else if (spec.name.endsWith(".md")) {
      content = [`# ${spec.name}`, "", "Generated test file.", ""]
        .slice(0, spec.lines)
        .join("\n");
    } else if (spec.name.endsWith(".txt")) {
      content = "v1.0.0";
    } else {
      content = generatePythonContent(spec.lines, spec.name);
    }
    turns.push(makeFileCreationTurn(spec.name, content));
  }

  turns.push({ text: INITIAL_REPLY_TOKEN });
  return turns;
}

const COMMIT_TRAJECTORY = [
  {
    tool_call: {
      name: "terminal",
      arguments: {
        command:
          "git add -A && git -c user.name='Test' -c user.email='test@test.com' commit -m 'Commit all test files'",
      },
    },
  },
  { text: COMMIT_REPLY_TOKEN },
];

const POST_COMMIT_TRAJECTORY = [
  {
    tool_call: {
      name: "terminal",
      arguments: {
        command:
          "cat > post_commit.py << 'FILEEOF'\n# Created after commit\nprint(\"post-commit change\")\nFILEEOF",
      },
    },
  },
  { text: POST_COMMIT_REPLY_TOKEN },
];

function diffViewers(page: Page) {
  return page.getByTestId("file-diff-viewer-outer");
}

function diffViewer(page: Page, fileName: string) {
  return diffViewers(page).filter({ hasText: fileName });
}

async function openRightPanelDiffView(page: Page) {
  const toggle = page.getByTestId("right-panel-toggle");
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  await toggle.click();
  await expect(page.getByTestId("files-tab")).toBeVisible({ timeout: 10_000 });

  const diffToggle = page.getByTestId("files-tab-diff-toggle-option-on");
  await expect(diffToggle).toBeVisible({ timeout: 5_000 });
  await diffToggle.click();
}

async function refreshDiffView(page: Page) {
  const refreshButton = page.getByTestId("files-tab-refresh");
  await expect(refreshButton).toBeVisible();
  await refreshButton.click();
}

async function expandDiff(viewer: Locator) {
  await viewer.getByTestId("collapse").click();
  await expect(viewer.getByTestId("view-mode-diff")).toBeVisible({
    timeout: 15_000,
  });
}

async function collapseDiff(viewer: Locator) {
  await viewer.getByTestId("collapse").click();
  await expect(viewer.getByTestId("view-mode-diff")).toBeHidden();
}

test.describe.configure({ mode: "serial" });

test.describe("diff view rendering and commit lifecycle", () => {
  const conversationIds = new Set<string>();
  let conversationId = "";
  let conversationPath = "";

  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
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

  test("step 1: configure mock LLM profile", async ({ page }) => {
    await ensureMockLLMProfile(page, { profileName: "mock-llm-diff-view" });
  });

  test("step 2: create many files and verify diff view toggles", async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);

    await resetMockLLM(request);
    await registerTrajectory(
      request,
      INITIAL_TRAJECTORY_NAME,
      buildInitialTrajectory(),
    );
    await activateTrajectory(request, INITIAL_TRAJECTORY_NAME);

    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "home-chat-launcher");

    await setChatInput(
      page,
      "Create a project with many files of varying sizes.",
    );
    await page.getByTestId("submit-button").click();
    await waitForPath(page, /\/conversations\/.+/, 30_000);

    conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);
    conversationPath = new URL(page.url()).pathname;

    await waitForNonUserMessageText(page, INITIAL_REPLY_TOKEN, 120_000);

    await openRightPanelDiffView(page);
    await refreshDiffView(page);

    await test.step("verify every generated file appears in the diff list", async () => {
      await expect(diffViewers(page)).toHaveCount(FILE_COUNT, {
        timeout: 30_000,
      });

      for (const spec of FILE_SPECS) {
        await expect(diffViewer(page, spec.name)).toHaveCount(1);
      }
    });

    await test.step("expand representative diffs and assert real content", async () => {
      const representativeFiles = [
        "helpers.py",
        "validators.py",
        "framework.py",
      ];

      for (const fileName of representativeFiles) {
        const viewer = diffViewer(page, fileName);
        await expect(viewer).toHaveCount(1);
        await expect(viewer.getByTestId("view-mode-diff")).toBeHidden();

        await expandDiff(viewer);
        await expect(viewer).toContainText("def func_", { timeout: 15_000 });
        await expect(viewer).toContainText("return result", {
          timeout: 10_000,
        });
        await collapseDiff(viewer);
      }
    });

    await test.step("rapidly expand and collapse multiple diff entries", async () => {
      for (const spec of FILE_SPECS.slice(0, 5)) {
        const viewer = diffViewer(page, spec.name);
        await expect(viewer).toHaveCount(1);
        await expandDiff(viewer);
        await collapseDiff(viewer);
      }
    });
  });

  test("step 3: commit all changes and verify diff view shows empty state", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    expect(conversationId, "step 2 must set the conversation ID").toBeTruthy();

    await resetMockLLM(request);
    await registerTrajectory(
      request,
      COMMIT_TRAJECTORY_NAME,
      COMMIT_TRAJECTORY,
    );
    await activateTrajectory(request, COMMIT_TRAJECTORY_NAME);

    await routeSessionApiKey(page);
    await page.goto(conversationPath, { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForNonUserMessageText(page, INITIAL_REPLY_TOKEN, 30_000);

    await setChatInput(page, "Now commit all the files.");
    await page.getByTestId("submit-button").click();
    await waitForNonUserMessageText(page, COMMIT_REPLY_TOKEN, 60_000);

    await openRightPanelDiffView(page);
    await refreshDiffView(page);

    const refreshButton = page.getByTestId("files-tab-refresh");
    await expect
      .poll(
        async () => {
          const count = await diffViewers(page).count();
          if (count > 0) await refreshButton.click();
          return count;
        },
        {
          message: "All diffs should disappear after commit",
          timeout: 30_000,
          intervals: [1_000, 2_000, 3_000],
        },
      )
      .toBe(0);

    await expect(page.getByText("hasn't made any changes yet")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("step 4: new edits after commit produce fresh diffs", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    expect(conversationId, "step 2 must set the conversation ID").toBeTruthy();

    await resetMockLLM(request);
    await registerTrajectory(
      request,
      POST_COMMIT_TRAJECTORY_NAME,
      POST_COMMIT_TRAJECTORY,
    );
    await activateTrajectory(request, POST_COMMIT_TRAJECTORY_NAME);

    await routeSessionApiKey(page);
    await page.goto(conversationPath, { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForNonUserMessageText(page, COMMIT_REPLY_TOKEN, 30_000);

    await setChatInput(page, "Create one more file.");
    await page.getByTestId("submit-button").click();
    await waitForNonUserMessageText(page, POST_COMMIT_REPLY_TOKEN, 60_000);

    await openRightPanelDiffView(page);
    await refreshDiffView(page);

    await expect(diffViewers(page)).toHaveCount(1, { timeout: 30_000 });

    const newDiff = diffViewer(page, "post_commit.py");
    await expect(newDiff).toHaveCount(1);
    await expandDiff(newDiff);
    await expect(newDiff).toContainText("post-commit change", {
      timeout: 15_000,
    });
  });
});
