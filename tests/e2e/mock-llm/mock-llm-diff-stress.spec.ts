/**
 * Mock-LLM E2E stress test: diff view responsiveness under load.
 *
 * Creates 12 files of varying sizes (3-line configs up to 500-line modules)
 * via a single conversation, then opens the diff view and measures:
 *
 *   1. Time for all 12 diff entries to render after refresh
 *   2. Time to expand a small diff (~5 lines) and see content
 *   3. Time to expand a medium diff (~100 lines) and see content
 *   4. Time to expand a large diff (~500 lines) and see content
 *   5. Rapid sequential expand/collapse across multiple entries
 *
 * Asserts all render times stay below generous but meaningful thresholds
 * to catch regressions in the diff viewer pipeline.
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

// ── Content generation ─────────────────────────────────────────────────

/** Generate N lines of Python-like code for a given file name. */
function generatePythonContent(lineCount: number, fileName: string): string {
  const lines: string[] = [
    `# ${fileName}`,
    `# Auto-generated test file (${lineCount} lines)`,
    "",
  ];

  let i = 0;
  while (lines.length < lineCount) {
    lines.push(`def func_${i}(x):`);
    if (lines.length >= lineCount) break;
    lines.push(`    """Compute step ${i}."""`);
    if (lines.length >= lineCount) break;
    lines.push(`    result = x * ${i + 1} + ${i * 7}`);
    if (lines.length >= lineCount) break;
    lines.push("    return result");
    if (lines.length >= lineCount) break;
    lines.push("");
    i++;
  }

  return lines.slice(0, lineCount).join("\n");
}

/** Build a terminal tool-call turn that writes `content` to `filePath`. */
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

// ── File manifest ──────────────────────────────────────────────────────

interface FileSpec {
  name: string;
  lines: number;
  /** Human label for test reporting. */
  sizeCategory: "tiny" | "small" | "medium" | "large";
}

const FILE_SPECS: FileSpec[] = [
  // Tiny (1-5 lines)
  { name: "config.json", lines: 3, sizeCategory: "tiny" },
  { name: "README.md", lines: 4, sizeCategory: "tiny" },
  { name: "version.txt", lines: 1, sizeCategory: "tiny" },
  // Small (10-25 lines)
  { name: "helpers.py", lines: 15, sizeCategory: "small" },
  { name: "constants.py", lines: 20, sizeCategory: "small" },
  { name: "types.py", lines: 25, sizeCategory: "small" },
  // Medium (50-100 lines)
  { name: "service.py", lines: 50, sizeCategory: "medium" },
  { name: "models.py", lines: 75, sizeCategory: "medium" },
  { name: "validators.py", lines: 100, sizeCategory: "medium" },
  // Large (200-500 lines)
  { name: "engine.py", lines: 200, sizeCategory: "large" },
  { name: "pipeline.py", lines: 350, sizeCategory: "large" },
  { name: "framework.py", lines: 500, sizeCategory: "large" },
];

const TOTAL_FILES = FILE_SPECS.length;

// ── Build trajectory ───────────────────────────────────────────────────

const STRESS_REPLY_TOKEN = "MOCK_DIFF_STRESS_COMPLETE";
const COMMIT_REPLY_TOKEN = "MOCK_DIFF_COMMIT_DONE";
const POST_COMMIT_REPLY_TOKEN = "MOCK_DIFF_POST_COMMIT_OK";
const TRAJECTORY_NAME = "diff-stress-test";
const COMMIT_TRAJECTORY_NAME = "diff-stress-commit";
const POST_COMMIT_TRAJECTORY_NAME = "diff-stress-post-commit";

function buildStressTrajectory() {
  const turns: Array<
    | { tool_call: { name: string; arguments: { command: string } } }
    | { text: string }
  > = [];

  for (const spec of FILE_SPECS) {
    let content: string;
    if (spec.name.endsWith(".json")) {
      content = `{\n  "generated": true,\n  "lines": ${spec.lines}\n}`.slice(
        0,
        spec.lines * 30,
      );
    } else if (spec.name.endsWith(".md")) {
      const mdLines = [`# ${spec.name}`, "", "Generated test file.", ""];
      content = mdLines.slice(0, spec.lines).join("\n");
    } else if (spec.name.endsWith(".txt")) {
      content = `v1.0.0`;
    } else {
      content = generatePythonContent(spec.lines, spec.name);
    }
    turns.push(makeFileCreationTurn(spec.name, content));
  }

  turns.push({ text: STRESS_REPLY_TOKEN });
  return turns;
}

const STRESS_TRAJECTORY = buildStressTrajectory();

// Trajectory that commits all changes
const COMMIT_TRAJECTORY = [
  {
    tool_call: {
      name: "terminal",
      arguments: {
        command: "git add -A && git commit -m 'Commit all test files'",
      },
    },
  },
  { text: COMMIT_REPLY_TOKEN },
];

// Trajectory that creates a new file after a commit (fresh diff)
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

// ── Timing thresholds (ms) ─────────────────────────────────────────────
// Generous to avoid flakiness in CI; the goal is catching regressions,
// not micro-benchmarking. These are wall-clock times including network
// round-trips to the real agent-server git endpoints.

const THRESHOLDS = {
  /** Max time for all diff entries to appear after refresh click. */
  diffListRender: 30_000,
  /** Max time for a tiny/small diff to expand and show content. */
  expandSmall: 10_000,
  /** Max time for a medium diff (~100 lines) to expand and show content. */
  expandMedium: 15_000,
  /** Max time for a large diff (~500 lines) to expand and show content. */
  expandLarge: 20_000,
  /** Max time for a rapid expand/collapse cycle per entry. */
  expandCollapseRapid: 5_000,
};

// ── Test ────────────────────────────────────────────────────────────────

test.describe.configure({ mode: "serial" });

test.describe("diff view stress test", () => {
  const conversationIds = new Set<string>();
  /** Stored from step 2 so steps 3–4 can resume the same conversation. */
  let stressConversationId = "";
  let stressConversationPath = "";

  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  // Use afterAll (not afterEach) — steps 3–4 resume the conversation
  // created in step 2, so we can't delete it between steps.
  test.afterAll(async ({ request }) => {
    for (const id of Array.from(conversationIds)) {
      try {
        await deleteConversation(request, id);
      } catch {
        /* best-effort */
      }
    }
  });

  // ── Setup ────────────────────────────────────────────────────────────

  test("step 1: configure mock LLM profile", async ({ page }) => {
    await ensureMockLLMProfile(page, { profileName: "mock-llm-stress" });
  });

  // ── Main stress test ─────────────────────────────────────────────────

  test("step 2: create many files and measure diff view responsiveness", async ({
    page,
    request,
  }) => {
    // Generous timeout for the full stress test (conversation + measurements)
    test.setTimeout(180_000);

    // Register the stress trajectory
    await resetMockLLM(request);
    await registerTrajectory(request, TRAJECTORY_NAME, STRESS_TRAJECTORY);
    await activateTrajectory(request, TRAJECTORY_NAME);

    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await waitForTestId(page, "home-chat-launcher");

    // Start conversation
    await setChatInput(
      page,
      "Create a project with many files of varying sizes.",
    );
    await page.getByTestId("submit-button").click();
    await waitForPath(page, /\/conversations\/.+/, 30_000);

    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);
    stressConversationId = conversationId;
    stressConversationPath = new URL(page.url()).pathname;

    // Wait for the agent to finish — 12 tool calls can take a while
    await waitForNonUserMessageText(page, STRESS_REPLY_TOKEN, 120_000);

    // ── Open the right panel and switch to diff view ──

    await test.step("open right panel and enable diff view", async () => {
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

    // ── Measure: diff list render time ──

    await test.step("measure diff list render time", async () => {
      const refreshBtn = page.getByTestId("files-tab-refresh");
      await expect(refreshBtn).toBeVisible();

      const startTime = Date.now();
      await refreshBtn.click();

      // Wait for diff entries to appear — we expect at least TOTAL_FILES
      // but the agent-server may consume 1 trajectory turn internally,
      // so accept TOTAL_FILES - 1 as the minimum.
      const minExpected = TOTAL_FILES - 1;
      await expect
        .poll(
          async () => {
            return page.getByTestId("file-diff-viewer-outer").count();
          },
          {
            message: `Expected at least ${minExpected} file diff viewers`,
            timeout: THRESHOLDS.diffListRender,
            intervals: [500, 1_000, 2_000],
          },
        )
        .toBeGreaterThanOrEqual(minExpected);

      const elapsed = Date.now() - startTime;
      const viewerCount = await page
        .getByTestId("file-diff-viewer-outer")
        .count();

      // eslint-disable-next-line no-console
      console.log(
        `📊 Diff list: ${viewerCount} entries rendered in ${elapsed}ms`,
      );

      expect(
        elapsed,
        `Diff list should render within ${THRESHOLDS.diffListRender}ms (took ${elapsed}ms)`,
      ).toBeLessThan(THRESHOLDS.diffListRender);
    });

    // ── Measure: expand small diff ──

    await test.step("measure small diff expand time", async () => {
      // Find helpers.py (15 lines — small category)
      const smallDiff = page
        .getByTestId("file-diff-viewer-outer")
        .filter({ hasText: "helpers.py" });

      // If helpers.py was consumed by padding, fall back to any small file
      const smallExists = (await smallDiff.count()) > 0;
      const target = smallExists
        ? smallDiff
        : page.getByTestId("file-diff-viewer-outer").first();

      const startTime = Date.now();
      await target.click();

      // Wait for expanded content to render
      await expect
        .poll(
          async () => (await target.textContent())?.length ?? 0,
          {
            message: "Small diff should render content after expand",
            timeout: THRESHOLDS.expandSmall,
            intervals: [500, 1_000],
          },
        )
        .toBeGreaterThan(30);

      const elapsed = Date.now() - startTime;

      // eslint-disable-next-line no-console
      console.log(`📊 Small diff expand: ${elapsed}ms`);

      expect(
        elapsed,
        `Small diff should expand within ${THRESHOLDS.expandSmall}ms (took ${elapsed}ms)`,
      ).toBeLessThan(THRESHOLDS.expandSmall);

      // Collapse it back
      await target.click();
    });

    // ── Measure: expand medium diff ──

    await test.step("measure medium diff expand time", async () => {
      const mediumDiff = page
        .getByTestId("file-diff-viewer-outer")
        .filter({ hasText: "validators.py" });

      const medExists = (await mediumDiff.count()) > 0;
      const target = medExists
        ? mediumDiff
        : page.getByTestId("file-diff-viewer-outer").nth(1);

      const startTime = Date.now();
      await target.click();

      await expect
        .poll(
          async () => (await target.textContent())?.length ?? 0,
          {
            message: "Medium diff should render content after expand",
            timeout: THRESHOLDS.expandMedium,
            intervals: [500, 1_000],
          },
        )
        .toBeGreaterThan(50);

      const elapsed = Date.now() - startTime;

      // eslint-disable-next-line no-console
      console.log(`📊 Medium diff expand: ${elapsed}ms`);

      expect(
        elapsed,
        `Medium diff should expand within ${THRESHOLDS.expandMedium}ms (took ${elapsed}ms)`,
      ).toBeLessThan(THRESHOLDS.expandMedium);

      // Collapse it back
      await target.click();
    });

    // ── Measure: expand large diff ──

    await test.step("measure large diff expand time", async () => {
      const largeDiff = page
        .getByTestId("file-diff-viewer-outer")
        .filter({ hasText: "framework.py" });

      const largeExists = (await largeDiff.count()) > 0;
      const target = largeExists
        ? largeDiff
        : page.getByTestId("file-diff-viewer-outer").last();

      const startTime = Date.now();
      await target.click();

      await expect
        .poll(
          async () => (await target.textContent())?.length ?? 0,
          {
            message: "Large diff should render content after expand",
            timeout: THRESHOLDS.expandLarge,
            intervals: [500, 1_000],
          },
        )
        .toBeGreaterThan(100);

      const elapsed = Date.now() - startTime;

      // eslint-disable-next-line no-console
      console.log(`📊 Large diff expand: ${elapsed}ms`);

      expect(
        elapsed,
        `Large diff should expand within ${THRESHOLDS.expandLarge}ms (took ${elapsed}ms)`,
      ).toBeLessThan(THRESHOLDS.expandLarge);

      // Collapse it back
      await target.click();
    });

    // ── Measure: rapid expand/collapse across multiple entries ──

    await test.step("rapid sequential expand/collapse", async () => {
      const allViewers = page.getByTestId("file-diff-viewer-outer");
      const totalCount = await allViewers.count();
      // Cycle through up to 5 entries rapidly
      const cycleCount = Math.min(totalCount, 5);

      const startTime = Date.now();

      for (let i = 0; i < cycleCount; i++) {
        const viewer = allViewers.nth(i);
        // Expand
        await viewer.click();
        // Brief wait for rendering
        await page.waitForTimeout(300);
        // Collapse
        await viewer.click();
      }

      const elapsed = Date.now() - startTime;

      // eslint-disable-next-line no-console
      console.log(
        `📊 Rapid expand/collapse (${cycleCount} entries): ${elapsed}ms ` +
          `(${Math.round(elapsed / cycleCount)}ms avg)`,
      );

      expect(
        elapsed,
        `Rapid expand/collapse of ${cycleCount} entries should complete within ${THRESHOLDS.expandCollapseRapid * cycleCount}ms`,
      ).toBeLessThan(THRESHOLDS.expandCollapseRapid * cycleCount);
    });

    // ── Verify: all file names present in diff list ──

    await test.step("verify file names in diff list", async () => {
      const allText = await page
        .getByTestId("file-diff-viewer-outer")
        .allTextContents();
      const joined = allText.join(" ");

      // Count how many of our expected files appear
      let foundCount = 0;
      const missingFiles: string[] = [];
      for (const spec of FILE_SPECS) {
        if (joined.includes(spec.name)) {
          foundCount++;
        } else {
          missingFiles.push(spec.name);
        }
      }

      // eslint-disable-next-line no-console
      console.log(
        `📊 Files found: ${foundCount}/${TOTAL_FILES}` +
          (missingFiles.length > 0
            ? ` (missing: ${missingFiles.join(", ")})`
            : ""),
      );

      // Allow 1 missing file due to potential agent-server padding
      expect(
        foundCount,
        `Expected at least ${TOTAL_FILES - 1} files in diff list, ` +
          `found ${foundCount}. Missing: ${missingFiles.join(", ")}`,
      ).toBeGreaterThanOrEqual(TOTAL_FILES - 1);
    });

    // ── Verify: expanding large file shows actual code content ──

    await test.step("verify large file content renders correctly", async () => {
      // Find the largest available file and expand it
      const largeDiff = page
        .getByTestId("file-diff-viewer-outer")
        .filter({ hasText: "framework.py" });

      if ((await largeDiff.count()) > 0) {
        await largeDiff.click();

        // The generated Python content should contain function definitions
        await expect(largeDiff).toContainText("def func_", {
          timeout: THRESHOLDS.expandLarge,
        });
        await expect(largeDiff).toContainText("return result", {
          timeout: 5_000,
        });

        // Collapse
        await largeDiff.click();
      } else {
        // Fallback: expand any diff and check for content
        const anyDiff = page.getByTestId("file-diff-viewer-outer").first();
        await anyDiff.click();
        await expect
          .poll(
            async () => (await anyDiff.textContent())?.length ?? 0,
            { timeout: 10_000 },
          )
          .toBeGreaterThan(20);
        await anyDiff.click();
      }
    });

    // ── Print summary ──

    // eslint-disable-next-line no-console
    console.log(
      "\n📊 Stress test summary:\n" +
        `   Files created: ${TOTAL_FILES} (${FILE_SPECS.map((s) => `${s.name}:${s.lines}L`).join(", ")})\n` +
        `   Total lines: ${FILE_SPECS.reduce((sum, s) => sum + s.lines, 0)}\n`,
    );
  });

  // ── Post-commit lifecycle: commit clears diffs ───────────────────────

  test("step 3: commit all changes and verify diff view shows empty state", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    expect(
      stressConversationId,
      "step 2 must run first to set the conversation ID",
    ).toBeTruthy();

    // Register and activate the commit trajectory
    await resetMockLLM(request);
    await registerTrajectory(
      request,
      COMMIT_TRAJECTORY_NAME,
      COMMIT_TRAJECTORY,
    );
    await activateTrajectory(request, COMMIT_TRAJECTORY_NAME);

    // Navigate to the existing conversation
    await routeSessionApiKey(page);
    await page.goto(stressConversationPath, { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    // Wait for the conversation to load (existing messages should appear)
    await waitForNonUserMessageText(page, STRESS_REPLY_TOKEN, 30_000);

    // Send a second message in the same conversation to trigger the commit
    await setChatInput(page, "Now commit all the files.");
    await page.getByTestId("submit-button").click();

    // Wait for the commit to complete
    await waitForNonUserMessageText(page, COMMIT_REPLY_TOKEN, 60_000);

    // ── Open right panel, switch to diff view, refresh ──

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

    // ── Refresh and verify empty state ──

    await test.step("refresh and verify diffs are empty after commit", async () => {
      const refreshBtn = page.getByTestId("files-tab-refresh");
      await expect(refreshBtn).toBeVisible();
      await refreshBtn.click();

      // Poll until all file-diff-viewer-outer entries disappear
      await expect
        .poll(
          async () => page.getByTestId("file-diff-viewer-outer").count(),
          {
            message:
              "All diffs should disappear after commit (expected 0 diff viewers)",
            timeout: 30_000,
            intervals: [1_000, 2_000, 3_000],
          },
        )
        .toBe(0);

      // Verify the empty state message renders
      await expect(
        page.getByText("hasn't made any changes yet"),
      ).toBeVisible({ timeout: 10_000 });

      // eslint-disable-next-line no-console
      console.log("📊 Post-commit: diff view correctly shows empty state");
    });
  });

  // ── Post-commit lifecycle: new edits produce fresh diffs ─────────────

  test("step 4: new edits after commit produce fresh diffs", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    expect(
      stressConversationId,
      "step 2 must run first to set the conversation ID",
    ).toBeTruthy();

    // Register and activate the post-commit trajectory
    await resetMockLLM(request);
    await registerTrajectory(
      request,
      POST_COMMIT_TRAJECTORY_NAME,
      POST_COMMIT_TRAJECTORY,
    );
    await activateTrajectory(request, POST_COMMIT_TRAJECTORY_NAME);

    // Navigate to the existing conversation
    await routeSessionApiKey(page);
    await page.goto(stressConversationPath, { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    // Wait for the conversation to load (should see prior messages)
    await waitForNonUserMessageText(page, COMMIT_REPLY_TOKEN, 30_000);

    // Send a third message to create a new file after the commit
    await setChatInput(page, "Create one more file.");
    await page.getByTestId("submit-button").click();

    // Wait for the new file creation to complete
    await waitForNonUserMessageText(page, POST_COMMIT_REPLY_TOKEN, 60_000);

    // ── Open right panel, switch to diff view, refresh ──

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

    // ── Refresh and verify new diff appears ──

    await test.step("refresh and verify fresh diff appears after new edit", async () => {
      const refreshBtn = page.getByTestId("files-tab-refresh");
      await expect(refreshBtn).toBeVisible();
      await refreshBtn.click();

      // Poll until at least 1 diff viewer appears
      await expect
        .poll(
          async () => page.getByTestId("file-diff-viewer-outer").count(),
          {
            message:
              "New diff should appear after post-commit file creation",
            timeout: 30_000,
            intervals: [1_000, 2_000, 3_000],
          },
        )
        .toBeGreaterThanOrEqual(1);

      // Verify the new file name is present
      const allText = await page
        .getByTestId("file-diff-viewer-outer")
        .allTextContents();
      const joined = allText.join(" ");
      expect(
        joined,
        "post_commit.py should appear in the diff list after commit + new edit",
      ).toContain("post_commit.py");

      // Expand and verify content
      const newDiff = page
        .getByTestId("file-diff-viewer-outer")
        .filter({ hasText: "post_commit.py" });
      await newDiff.click();
      await expect(newDiff).toContainText("post-commit change", {
        timeout: 15_000,
      });

      // eslint-disable-next-line no-console
      console.log(
        "📊 Post-commit new edit: diff view correctly shows fresh changes",
      );
    });
  });
});
