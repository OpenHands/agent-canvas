/**
 * Bet D emit lever — a Playwright reporter that turns a `verified-*` run into
 * `.checks/result.json` (+ copied video/trace) in the worktree, matching the
 * contract the cockpit Checks tab reads (`src/utils/check-result.ts`).
 *
 * Activated only when `EMIT_CHECKS` is set (see `playwright.config.ts`), so
 * normal `npm test` / CI html runs are untouched. The agent's verification step
 * runs e.g. `EMIT_CHECKS=1 npx playwright test --project=verified-dev`; the rca
 * `on_stop` hook then commits the spec + result.json. Only `verified-*` project
 * tests are captured, so a stray full run can't pollute `.checks/`.
 *
 * Writes are best-effort and wrapped — a reporter must never crash the run.
 */
import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { buildCheckResult, type ReportedTest } from "./check-result-emit";

// Playwright runs from the project root (where the config file lives).
const CHECKS_DIR = join(process.cwd(), ".checks");
const RESULT_PATH = join(CHECKS_DIR, "result.json");

// Strip terminal colour codes from assertion errors so they read cleanly in
// the Checks tab's <pre>. Built via fromCharCode to avoid a control char in
// the regex source.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function toWorktreePath(absolute: string): string {
  return relative(process.cwd(), absolute).split(sep).join("/");
}

function slug(title: string): string {
  return (
    title
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "check"
  );
}

class ChecksReporter implements Reporter {
  private tests: ReportedTest[] = [];
  private index = 0;

  onBegin() {
    // Fresh dir each run so a stale verdict/video never lingers.
    try {
      rmSync(CHECKS_DIR, { recursive: true, force: true });
      mkdirSync(CHECKS_DIR, { recursive: true });
    } catch {
      // Non-fatal — the per-test copies / final write will retry mkdir.
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    // Only capture the verification projects; ignore a stray full run.
    const project = test.parent.project()?.name ?? "";
    if (project && !project.startsWith("verified")) return;

    const base = `${this.index}-${slug(test.title)}`;
    const video = this.copyAttachment(result, "video", `${base}.webm`);
    const trace = this.copyAttachment(result, "trace", `${base}.zip`);

    this.tests.push({
      title: test.title,
      status: result.status,
      durationMs: result.duration,
      error:
        result.errors
          .map((err) => (err.message ?? "").replace(ANSI, ""))
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 4000) || null,
      spec: toWorktreePath(test.location.file),
      video,
      trace,
    });
    this.index += 1;
  }

  onEnd(_result: FullResult) {
    // Nothing ran (empty spec dir, or the dev server never booted so no test
    // started) — leave `.checks/` empty rather than emit a meaningless "passed".
    // onBegin already cleared any stale verdict, so the tab shows "no checks".
    if (this.tests.length === 0) return;

    const checkResult = buildCheckResult(this.tests, {
      commit: readCommit(),
      createdAt: new Date().toISOString(),
    });
    try {
      mkdirSync(CHECKS_DIR, { recursive: true });
      writeFileSync(RESULT_PATH, `${JSON.stringify(checkResult, null, 2)}\n`);
    } catch {
      // Non-fatal: the run still succeeds; the tab just shows its empty state.
    }
  }

  /** Copy a named attachment into `.checks/`, returning its worktree path. */
  private copyAttachment(
    result: TestResult,
    name: "video" | "trace",
    destName: string,
  ): string | null {
    const source = result.attachments.find(
      (attachment) => attachment.name === name,
    )?.path;
    if (!source || !existsSync(source)) return null;
    try {
      const dest = join(CHECKS_DIR, destName);
      mkdirSync(CHECKS_DIR, { recursive: true });
      copyFileSync(source, dest);
      return toWorktreePath(resolve(dest));
    } catch {
      return null;
    }
  }
}

/** Best-effort short commit for provenance; null when unavailable. */
function readCommit(): string | null {
  try {
    return (
      execSync("git rev-parse --short HEAD", {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim() || null
    );
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 7) ?? null;
  }
}

export default ChecksReporter;
