#!/usr/bin/env node
/**
 * Post a snapshot test report as a PR comment with embedded images.
 *
 * Reads environment variables set by the snapshot-tests.yml workflow:
 *   GH_TOKEN          — GitHub token for API calls and git push
 *   PR_NUMBER         — Pull request number
 *   REPO              — "owner/repo"
 *   RUN_ID            — GitHub Actions run ID
 *   HEAD_REF          — PR branch name (used only for the log message)
 *   MAIN_BASELINES_DIR — Path to the copied main-branch baselines (e.g. /tmp/main-baselines)
 *   SNAPSHOTS_APPROVED — "true" when the update-snapshots label is set
 *
 * The script:
 *   1. Scans tests/e2e/__snapshots__/ (PR's current snapshots) and MAIN_BASELINES_DIR
 *   2. Classifies each snapshot as NEW, CHANGED, or UNCHANGED
 *   3. For CHANGED: locates diff/actual/expected images in test-results/
 *   4. Creates an orphan commit on snapshot-artifacts/pr-<N> with the images and
 *      pushes it there (NOT to the PR branch — avoids invalidating required checks)
 *   5. Posts or updates a PR comment with inline image tables using raw.githubusercontent.com URLs
 */

import { execSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";

// ── Environment ────────────────────────────────────────────────────────────

const GH_TOKEN = requireEnv("GH_TOKEN");
const PR_NUMBER = requireEnv("PR_NUMBER");
const REPO = requireEnv("REPO");
const RUN_ID = requireEnv("RUN_ID");
const HEAD_REF = requireEnv("HEAD_REF");
const MAIN_BASELINES_DIR =
  process.env.MAIN_BASELINES_DIR ?? "/tmp/main-baselines";
const SNAPSHOTS_APPROVED = process.env.SNAPSHOTS_APPROVED === "true";
const GENERATE_OUTCOME = process.env.GENERATE_OUTCOME ?? "success";
const COMPARE_OUTCOME = process.env.COMPARE_OUTCOME ?? "success";

const SNAPSHOTS_DIR = "tests/e2e/__snapshots__";
// The workflow saves comparison test-results to this path before the
// --update-snapshots pass wipes test-results/.  Fall back to the default
// Playwright output directory when running outside CI.
const TEST_RESULTS_DIR =
  process.env.COMPARISON_RESULTS_DIR ?? "test-results";
// Images are pushed to this dedicated branch, NOT to the PR branch.
// Pushing to the PR branch with [skip ci] was blocking required checks on the HEAD commit.
const ARTIFACTS_BRANCH = `snapshot-artifacts/pr-${PR_NUMBER}`;
const COMMENT_MARKER = "<!-- snapshot-test-report -->";
const GITHUB_API = process.env.GITHUB_API_URL ?? "https://api.github.com";
const RAW_BASE = "https://raw.githubusercontent.com";
const [OWNER, REPO_NAME] = REPO.split("/");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// ── File utilities ─────────────────────────────────────────────────────────

/** Recursively find all files with a given extension under a directory. */
function findFiles(dir, ext) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, ext));
    } else if (!ext || entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

/** Copy a file, creating parent directories as needed. */
function copyFile(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

// ── Snapshot classification ────────────────────────────────────────────────

/**
 * Classify snapshots as changed, new, or unchanged.
 *
 * "Changed" is determined by whether Playwright produced a diff file in
 * test-results/ — this respects the configured threshold/maxDiffPixels so
 * minor rendering noise below the tolerance is not flagged as a change.
 *
 * "New" means the snapshot exists in the PR but has no baseline on main.
 * "Unchanged" means all other snapshots that Playwright accepted.
 */
function classifySnapshots() {
  const currentFiles = findFiles(SNAPSHOTS_DIR, ".png");
  const baselineFiles = findFiles(MAIN_BASELINES_DIR, ".png");

  // Build a set of relative paths from the baselines directory
  const baselineRelPaths = new Set(
    baselineFiles.map((f) => relative(MAIN_BASELINES_DIR, f)),
  );

  // Index diff files from test-results by their canonical snapshot name.
  // Playwright names diff files "<snapshot-name>-<N>-diff.png" — strip the
  // Playwright-appended "-<N>" so "sidebar-filter-menu-1" → "sidebar-filter-menu".
  const allDiffFiles = findFiles(TEST_RESULTS_DIR, "-diff.png");
  const diffBySnapshotName = new Map();
  for (const diffFile of allDiffFiles) {
    const key = basename(diffFile, "-diff.png").replace(/-\d+$/, "");
    if (!diffBySnapshotName.has(key)) {
      diffBySnapshotName.set(key, diffFile);
    }
  }

  const changed = [];
  const newSnapshots = [];
  const unchanged = [];

  for (const currentFile of currentFiles) {
    const relPath = relative(SNAPSHOTS_DIR, currentFile);
    const snapshotName = basename(relPath, ".png");

    if (!baselineRelPaths.has(relPath)) {
      newSnapshots.push({ relPath, currentFile });
    } else if (diffBySnapshotName.has(snapshotName)) {
      const diffFile = diffBySnapshotName.get(snapshotName);
      changed.push({
        relPath,
        currentFile,
        baselineFile: join(MAIN_BASELINES_DIR, relPath),
        diffFile: existsSync(diffFile) ? diffFile : null,
      });
    } else {
      unchanged.push({ relPath });
    }
  }

  return { changed, newSnapshots, unchanged };
}

// ── Image publishing ───────────────────────────────────────────────────────

/**
 * Push snapshot images to a dedicated orphan branch (snapshot-artifacts/pr-<N>)
 * so they can be embedded in the PR comment via raw.githubusercontent.com URLs.
 *
 * Images are intentionally NOT pushed to the PR branch. Pushing to the PR branch
 * (even with [skip ci]) invalidates required checks on the HEAD commit and hangs
 * the PR. The orphan artifacts branch is invisible to all CI workflows.
 *
 * Returns the commit SHA on the artifacts branch, or null on failure.
 */
function publishImages(changed, newSnapshots) {
  const hasImages = changed.length > 0 || newSnapshots.length > 0;
  if (!hasImages) return null;

  // Build a temp directory containing only the images, mirroring the layout
  // that buildComment expects: changed/<relPath>-{actual,expected,diff}.png
  //                            new/<relPath>.png
  const tmpDir = execSync("mktemp -d").toString().trim();
  try {
    for (const { relPath, currentFile, baselineFile, diffFile } of changed) {
      const dest = join(tmpDir, "changed", relPath);
      copyFile(currentFile, dest.replace(".png", "-actual.png"));
      if (baselineFile && existsSync(baselineFile)) {
        copyFile(baselineFile, dest.replace(".png", "-expected.png"));
      }
      if (diffFile) {
        copyFile(diffFile, dest.replace(".png", "-diff.png"));
      }
    }
    for (const { relPath, currentFile } of newSnapshots) {
      copyFile(currentFile, join(tmpDir, "new", relPath));
    }

    // Create an orphan commit in tmpDir and force-push to the artifacts branch.
    // Using a fresh git repo avoids touching any tracked files in the PR checkout.
    const git = (cmd) => execSync(`git -C "${tmpDir}" ${cmd}`);
    git("init");
    git(`config user.name "github-actions[bot]"`);
    git(`config user.email "41898282+github-actions[bot]@users.noreply.github.com"`);
    git("add .");
    git(`commit -m "snapshot images for PR #${PR_NUMBER} run ${RUN_ID}"`);
    git(
      `push --force "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git" ` +
        `HEAD:refs/heads/${ARTIFACTS_BRANCH}`,
    );
    return git("rev-parse HEAD").toString().trim();
  } catch (err) {
    console.error("Warning: failed to push snapshot images:", err.message);
    return null;
  } finally {
    execSync(`rm -rf "${tmpDir}"`);
  }
}

// ── Markdown generation ────────────────────────────────────────────────────

function rawUrl(commitSha, filePath) {
  return `${RAW_BASE}/${OWNER}/${REPO_NAME}/${commitSha}/${filePath}`;
}

/** Extract the human-readable spec name from a relative snapshot path.
 *  "snapshots/mcp-page.snapshot.spec.ts/chromium/foo.png" → "mcp-page"
 */
function specFromRelPath(relPath) {
  const segment = relPath.replace(/^snapshots\//, "").split("/")[0] ?? "";
  return segment.replace(".snapshot.spec.ts", "");
}

/** Group an array of snapshot objects by their spec name. */
function groupBySpec(items) {
  const groups = /** @type {Map<string, typeof items>} */ (new Map());
  for (const item of items) {
    const spec = specFromRelPath(item.relPath);
    if (!groups.has(spec)) groups.set(spec, []);
    groups.get(spec).push(item);
  }
  return groups;
}

function buildComment(changed, newSnapshots, unchanged, commitSha) {
  const total = changed.length + newSnapshots.length + unchanged.length;
  const hasDifferences = changed.length > 0;

  let statusIcon;
  let statusText;
  if (hasDifferences && SNAPSHOTS_APPROVED) {
    statusIcon = "✅";
    statusText =
      `${changed.length} snapshot${changed.length !== 1 ? "s" : ""} changed — ` +
      `acknowledged via the \`update-snapshots\` label. New baselines will be uploaded when this PR merges.`;
  } else if (hasDifferences) {
    statusIcon = "❌";
    statusText =
      `${changed.length} snapshot${changed.length !== 1 ? "s" : ""} differ from the main branch baseline${changed.length !== 1 ? "s" : ""}. ` +
      `Add the \`update-snapshots\` label to acknowledge intentional changes.`;
  } else if (unchanged.length === 0) {
    statusIcon = "✅";
    statusText =
      `No baseline found on main — all ${newSnapshots.length} snapshot${newSnapshots.length !== 1 ? "s" : ""} are new ` +
      `and will become the baseline once this PR merges.`;
  } else {
    statusIcon = "✅";
    statusText = "All snapshots match the main branch baselines.";
  }

  const lines = [
    COMMENT_MARKER,
    `## 📸 Snapshot Test Report`,
    "",
  ];

  if (COMPARE_OUTCOME === "failure") {
    lines.push(
      `> [!WARNING]`,
      `> **Snapshot comparison step crashed** (timeout, OOM, or runner error) — diff results below may be incomplete or absent.`,
      `> Check the [CI logs](https://github.com/${REPO}/actions/runs/${RUN_ID}) for the full error output (look for the "Run snapshot comparison" step).`,
      "",
    );
  }

  if (GENERATE_OUTCOME === "failure") {
    lines.push(
      `> [!WARNING]`,
      `> **One or more snapshot tests crashed during generation** — some snapshots below may be incomplete.`,
      `> Check the [CI logs](https://github.com/${REPO}/actions/runs/${RUN_ID}) for the full error output (look for the "Generate current PR snapshots" step).`,
      "",
    );
  }

  lines.push(
    `${statusIcon} ${statusText}`,
    "",
    `| Category | Count |`,
    `|---|---|`,
    `| 🔴 Changed | ${changed.length} |`,
    `| 🆕 New | ${newSnapshots.length} |`,
    `| ✅ Unchanged | ${unchanged.length} |`,
    `| **Total** | **${total}** |`,
    "",
  );

  if (hasDifferences && !SNAPSHOTS_APPROVED) {
    lines.push(
      `> **How to resolve:**`,
      `> - **Unintentional diffs** — the baselines on \`main\` may have moved since this branch was created. Merge the latest \`main\` into this branch and re-run CI.`,
      `> - **Intentional changes** — add the \`update-snapshots\` label. CI will pass and the new screenshots become the baseline when this PR merges.`,
      "",
    );
  }

  // Changed snapshots — grouped by spec file
  if (changed.length > 0) {
    lines.push(
      `<details>`,
      `<summary>🔴 Changed snapshots (${changed.length})</summary>`,
      "",
    );
    for (const [spec, items] of groupBySpec(changed)) {
      lines.push(
        `### \`${spec}\`${items.length > 1 ? ` — ${items.length} snapshots` : ""}`,
        "",
      );
      for (const { relPath, diffFile } of items) {
        const name = basename(relPath, ".png");
        lines.push(`**${name}**`, "");

        if (commitSha) {
          const base = join("changed", relPath);
          const expectedUrl = rawUrl(commitSha, base.replace(".png", "-expected.png"));
          const actualUrl   = rawUrl(commitSha, base.replace(".png", "-actual.png"));
          const diffUrl     = diffFile
            ? rawUrl(commitSha, base.replace(".png", "-diff.png"))
            : null;

          lines.push(
            `| Expected (main) | Actual (PR) |${diffUrl ? " Diff |" : ""}`,
            `|---|---|${diffUrl ? "---|" : ""}`,
            `| ![expected](${expectedUrl}) | ![actual](${actualUrl}) |${diffUrl ? ` ![diff](${diffUrl}) |` : ""}`,
            "",
          );
        } else {
          lines.push(
            `_Images could not be embedded (fork PR or push failed). ` +
              `Download the [\`snapshot-test-results\` artifact](https://github.com/${REPO}/actions/runs/${RUN_ID}) for visual diffs._`,
            "",
          );
        }
      }
    }
    lines.push(`</details>`, "");
  }

  // New snapshots — grouped by spec file
  if (newSnapshots.length > 0) {
    lines.push(
      `<details>`,
      `<summary>🆕 New snapshots (${newSnapshots.length})</summary>`,
      "",
      `These snapshots have no baseline on main and will become the new baseline once this PR merges.`,
      "",
    );
    if (commitSha) {
      for (const [spec, items] of groupBySpec(newSnapshots)) {
        lines.push(
          `### \`${spec}\`${items.length > 1 ? ` — ${items.length} snapshots` : ""}`,
          "",
        );
        for (const { relPath } of items) {
          const name = basename(relPath, ".png");
          const actualUrl = rawUrl(commitSha, join("new", relPath));
          lines.push(`**${name}**`, "", `![new snapshot](${actualUrl})`, "");
        }
      }
    } else {
      lines.push(
        `_Images could not be embedded (fork PR or push failed). ` +
          `Download the [\`snapshot-test-results\` artifact](https://github.com/${REPO}/actions/runs/${RUN_ID}) for screenshots._`,
        "",
      );
    }
    lines.push(`</details>`, "");
  }

  // Unchanged — compact grouped list by spec file
  if (unchanged.length > 0) {
    lines.push(
      `<details>`,
      `<summary>✅ Unchanged snapshots (${unchanged.length})</summary>`,
      "",
    );
    for (const [spec, items] of groupBySpec(unchanged)) {
      lines.push(`**\`${spec}\`**`);
      for (const { relPath } of items) {
        lines.push(`- ${basename(relPath, ".png")}`);
      }
      lines.push("");
    }
    lines.push(`</details>`, "");
  }

  lines.push(
    `---`,
    `_Generated by the [Snapshot Tests](https://github.com/${REPO}/actions/runs/${RUN_ID}) workflow. ` +
      `This comment was created by an AI agent (OpenHands) on behalf of the repo maintainers._`,
  );

  return lines.join("\n");
}

// ── GitHub API ─────────────────────────────────────────────────────────────

async function githubFetch(path, options = {}) {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "agent-canvas-snapshot-bot",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status} for ${url}: ${text}`);
  }
  // DELETE returns 204 No Content
  if (res.status === 204) return null;
  return res.headers.get("content-type")?.includes("json") ? res.json() : res.text();
}

/**
 * Delete any existing snapshot report comment and post a fresh one.
 *
 * We always delete-then-create (rather than edit in-place) so that the new
 * comment always references the current run's image URLs. Editing would
 * leave stale raw.githubusercontent.com URLs pointing at the previous run's
 * .pr/snapshots/<old_run_id>/ images.
 */
async function postFreshComment(body) {
  const comments = await githubFetch(
    `/repos/${OWNER}/${REPO_NAME}/issues/${PR_NUMBER}/comments`,
  );
  const existing = comments.find((c) => c.body.includes(COMMENT_MARKER));

  if (existing) {
    await githubFetch(
      `/repos/${OWNER}/${REPO_NAME}/issues/comments/${existing.id}`,
      { method: "DELETE" },
    );
    console.log(`Deleted stale PR comment ${existing.id}`);
  }

  await githubFetch(
    `/repos/${OWNER}/${REPO_NAME}/issues/${PR_NUMBER}/comments`,
    { method: "POST", body: JSON.stringify({ body }) },
  );
  console.log("Posted fresh PR comment");
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Classifying snapshots...`);
  console.log(`  Current snapshots: ${SNAPSHOTS_DIR}`);
  console.log(`  Main baselines:    ${MAIN_BASELINES_DIR}`);

  const { changed, newSnapshots, unchanged } = classifySnapshots();

  console.log(
    `  Changed: ${changed.length}, New: ${newSnapshots.length}, Unchanged: ${unchanged.length}`,
  );

  let commitSha = null;
  if (changed.length > 0 || newSnapshots.length > 0) {
    console.log(`Publishing images to branch ${ARTIFACTS_BRANCH}...`);
    commitSha = publishImages(changed, newSnapshots);
    if (commitSha) {
      console.log(`  Images published at ${commitSha}`);
    } else {
      console.log(`  Image publishing failed — comment will link to artifact download`);
    }
  }

  const body = buildComment(changed, newSnapshots, unchanged, commitSha);
  await postFreshComment(body);

  // Tell the workflow whether there are actual pixel-diff failures so the
  // "Fail if differences" step can distinguish changed snapshots (should
  // fail CI) from missing baselines (new tests from this PR, should pass).
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `has_changes=${changed.length > 0}\n`,
    );
    console.log(`  has_changes=${changed.length > 0} written to GITHUB_OUTPUT`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("post-snapshot-comment failed:", err);
  process.exit(1);
});
