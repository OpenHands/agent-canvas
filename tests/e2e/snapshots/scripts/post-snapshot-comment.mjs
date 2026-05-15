#!/usr/bin/env node
/**
 * Post a snapshot test report as a PR comment with embedded images.
 *
 * Reads environment variables set by the snapshot-tests.yml workflow:
 *   GH_TOKEN          — GitHub token for API calls and git push
 *   PR_NUMBER         — Pull request number
 *   REPO              — "owner/repo"
 *   RUN_ID            — GitHub Actions run ID (used to namespace .pr/ artifacts)
 *   HEAD_REF          — PR branch name (e.g. "my-feature-branch")
 *   TEST_OUTCOME      — "success" or "failure" (from the Playwright comparison step)
 *   MAIN_BASELINES_DIR — Path to the copied main-branch baselines (e.g. /tmp/main-baselines)
 *
 * The script:
 *   1. Scans tests/e2e/__snapshots__/ (PR's current snapshots) and MAIN_BASELINES_DIR
 *   2. Classifies each snapshot as NEW, CHANGED, or UNCHANGED
 *   3. For CHANGED: locates diff/actual/expected images in test-results/
 *   4. Copies relevant images to .pr/snapshots/<run_id>/ and pushes to the PR branch
 *   5. Posts or updates a PR comment with inline image tables using raw.githubusercontent.com URLs
 */

import { execSync } from "node:child_process";
import {
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

const SNAPSHOTS_DIR = "tests/e2e/__snapshots__";
const TEST_RESULTS_DIR = "test-results";
// Fixed path — old contents are replaced on each run so directories don't accumulate.
// raw.githubusercontent.com URLs use the commit SHA, so every push still gets stable image URLs.
const PR_ARTIFACT_DIR = ".pr/snapshots";
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
 * Copy snapshot images to .pr/snapshots/<run_id>/ and push them to the PR
 * branch so they can be referenced via raw.githubusercontent.com.
 *
 * Returns the commit SHA that contains the images, or null on failure.
 */
function publishImages(changed, newSnapshots) {
  const hasImages = changed.length > 0 || newSnapshots.length > 0;
  if (!hasImages) return null;

  // Stage images
  for (const { relPath, currentFile, baselineFile, diffFile } of changed) {
    const dest = join(PR_ARTIFACT_DIR, "changed", relPath);
    copyFile(currentFile, dest.replace(".png", "-actual.png"));
    if (baselineFile && existsSync(baselineFile)) {
      copyFile(baselineFile, dest.replace(".png", "-expected.png"));
    }
    if (diffFile) {
      copyFile(diffFile, dest.replace(".png", "-diff.png"));
    }
  }
  for (const { relPath, currentFile } of newSnapshots) {
    copyFile(currentFile, join(PR_ARTIFACT_DIR, "new", relPath));
  }

  // Commit and push
  try {
    execSync(
      `git config user.name "github-actions[bot]" && ` +
        `git config user.email "github-actions[bot]@users.noreply.github.com"`,
    );
    // Remove images from any previous run before staging the new ones, so old
    // directories don't accumulate across commits on the same PR branch.
    execSync(`git rm -rf --ignore-unmatch "${PR_ARTIFACT_DIR}"`);
    execSync(`git add "${PR_ARTIFACT_DIR}"`);
    const diffOutput = execSync("git diff --staged --name-only")
      .toString()
      .trim();
    if (!diffOutput) {
      // Nothing new to commit — get existing HEAD for URL building
      return execSync("git rev-parse HEAD").toString().trim();
    }
    execSync(
      `git commit -m "chore: snapshot images for run ${RUN_ID} [skip ci]"`,
    );
    execSync(
      `git push "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git" ` +
        `HEAD:refs/heads/${HEAD_REF}`,
    );
    return execSync("git rev-parse HEAD").toString().trim();
  } catch (err) {
    console.error("Warning: failed to push snapshot images:", err.message);
    return null;
  }
}

// ── Markdown generation ────────────────────────────────────────────────────

function rawUrl(commitSha, filePath) {
  return `${RAW_BASE}/${OWNER}/${REPO_NAME}/${commitSha}/${filePath}`;
}

function formatRelPath(relPath) {
  // "snapshots/settings-page.snapshot.spec.ts/chromium/sidebar-settings.png"
  // → "settings-page / sidebar-settings"
  const parts = relPath.replace(/^snapshots\//, "").split("/");
  const spec = parts[0]?.replace(".snapshot.spec.ts", "") ?? "";
  const name = basename(relPath, ".png");
  return `\`${spec}\` — ${name}`;
}

function buildComment(changed, newSnapshots, unchanged, commitSha) {
  const total = changed.length + newSnapshots.length + unchanged.length;
  // Derive pass/fail from the actual classification, not from TEST_OUTCOME.
  // TEST_OUTCOME is 'failure' in the bootstrap case (no baselines on main yet)
  // even though there are zero visual regressions.
  const hasDifferences = changed.length > 0;

  const statusIcon = hasDifferences ? "❌" : "✅";
  const statusText = hasDifferences
    ? `${changed.length} snapshot${changed.length !== 1 ? "s" : ""} differ from the main branch baseline${changed.length !== 1 ? "s" : ""}.`
    : unchanged.length === 0
      ? `No baseline found on main — all ${newSnapshots.length} snapshot${newSnapshots.length !== 1 ? "s" : ""} are new and will become the baseline once this PR merges.`
      : "All snapshots match the main branch baselines.";

  const lines = [
    COMMENT_MARKER,
    `## 📸 Snapshot Test Report`,
    "",
    `${statusIcon} ${statusText}`,
    "",
    `| Category | Count |`,
    `|---|---|`,
    `| 🔴 Changed | ${changed.length} |`,
    `| 🆕 New | ${newSnapshots.length} |`,
    `| ✅ Unchanged | ${unchanged.length} |`,
    `| **Total** | **${total}** |`,
    "",
  ];

  // Changed snapshots
  if (changed.length > 0) {
    lines.push(
      `<details>`,
      `<summary>🔴 Changed snapshots (${changed.length})</summary>`,
      "",
    );
    for (const { relPath, diffFile } of changed) {
      lines.push(`### ${formatRelPath(relPath)}`, "");

      if (commitSha) {
        const prArtifactRelPath = join(
          PR_ARTIFACT_DIR,
          "changed",
          relPath,
        );
        const expectedUrl = rawUrl(
          commitSha,
          prArtifactRelPath.replace(".png", "-expected.png"),
        );
        const actualUrl = rawUrl(
          commitSha,
          prArtifactRelPath.replace(".png", "-actual.png"),
        );
        const diffUrl = diffFile
          ? rawUrl(
              commitSha,
              prArtifactRelPath.replace(".png", "-diff.png"),
            )
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
    lines.push(`</details>`, "");
  }

  // New snapshots
  if (newSnapshots.length > 0) {
    lines.push(
      `<details>`,
      `<summary>🆕 New snapshots (${newSnapshots.length})</summary>`,
      "",
      `These snapshots have no baseline on main and will become the new baseline once this PR merges.`,
      "",
    );
    if (commitSha) {
      for (const { relPath } of newSnapshots) {
        const prArtifactRelPath = join(PR_ARTIFACT_DIR, "new", relPath);
        const actualUrl = rawUrl(commitSha, prArtifactRelPath);
        lines.push(
          `### ${formatRelPath(relPath)}`,
          "",
          `![new snapshot](${actualUrl})`,
          "",
        );
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

  // Unchanged
  if (unchanged.length > 0) {
    lines.push(
      `<details>`,
      `<summary>✅ Unchanged snapshots (${unchanged.length})</summary>`,
      "",
      `The following ${unchanged.length} snapshot${unchanged.length !== 1 ? "s" : ""} match${unchanged.length === 1 ? "es" : ""} the main branch baselines:`,
      "",
    );
    for (const { relPath } of unchanged) {
      lines.push(`- ${formatRelPath(relPath)}`);
    }
    lines.push("", `</details>`, "");
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
    console.log(`Publishing images to .pr/snapshots/${RUN_ID}/ on ${HEAD_REF}...`);
    commitSha = publishImages(changed, newSnapshots);
    if (commitSha) {
      console.log(`  Images published at ${commitSha}`);
    } else {
      console.log(`  Image publishing failed — comment will link to artifact download`);
    }
  }

  const body = buildComment(changed, newSnapshots, unchanged, commitSha);
  await postFreshComment(body);
  console.log("Done.");
}

main().catch((err) => {
  console.error("post-snapshot-comment failed:", err);
  process.exit(1);
});
