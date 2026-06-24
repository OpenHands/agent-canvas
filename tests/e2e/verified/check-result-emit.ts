/**
 * Pure transform from a `verified-*` Playwright run into the `.checks/result.json`
 * shape the cockpit Checks tab reads (Bet D, "build the lever"). Kept free of
 * Playwright and `fs` so it is unit-tested directly and its output can be pinned
 * against the consumer's parser (`src/utils/check-result.ts`) — the emitter and
 * the reader must agree on the contract.
 *
 * The reporter (`checks-reporter.ts`) collects per-test facts + copies artifacts,
 * then calls {@link buildCheckResult} to assemble the verdict.
 */
import type {
  CheckResult,
  CheckStatus,
  VerifiedCheck,
} from "../../../src/utils/check-result";

/** Playwright's terminal test statuses. */
export type PlaywrightStatus =
  | "passed"
  | "failed"
  | "timedOut"
  | "interrupted"
  | "skipped";

/** One test's reviewable facts, with artifacts already resolved to worktree
 * paths by the reporter. */
export interface ReportedTest {
  title: string;
  status: PlaywrightStatus;
  durationMs: number;
  error: string | null;
  /** Worktree-relative path to this test's spec file. */
  spec: string | null;
  /** Worktree-relative path to the recorded video, or null. */
  video: string | null;
  /** Worktree-relative path to the trace, or null. */
  trace: string | null;
}

export interface EmitMeta {
  /** Commit the verification ran against (short sha), or null. */
  commit: string | null;
  /** ISO-8601 run timestamp. */
  createdAt: string;
}

/** Map a Playwright status to a verdict, or null for "not a verdict" (skipped). */
export function toCheckStatus(status: PlaywrightStatus): CheckStatus | null {
  if (status === "passed") return "passed";
  if (status === "skipped") return null;
  // failed | timedOut | interrupted all read as a red verdict.
  return "failed";
}

/**
 * Assemble the run's {@link CheckResult}. Skipped tests are excluded (no
 * verdict); any red test makes the overall verdict `failed`. The run-level
 * spec/video/trace point at the most review-worthy test — the first failure if
 * any (that's what a reviewer opens), else the first test.
 */
export function buildCheckResult(
  tests: readonly ReportedTest[],
  meta: EmitMeta,
): CheckResult {
  const checks: VerifiedCheck[] = [];
  for (const test of tests) {
    const status = toCheckStatus(test.status);
    if (!status) continue;
    checks.push({
      title: test.title.trim() || null,
      status,
      durationMs: Number.isFinite(test.durationMs)
        ? Math.round(test.durationMs)
        : null,
      error: test.error?.trim() || null,
    });
  }

  const overall: CheckStatus = checks.some((check) => check.status === "failed")
    ? "failed"
    : "passed";

  const primary =
    tests.find((test) => toCheckStatus(test.status) === "failed") ?? tests[0];

  return {
    status: overall,
    checks,
    spec: primary?.spec ?? null,
    video: primary?.video ?? null,
    trace: primary?.trace ?? null,
    commit: meta.commit,
    createdAt: meta.createdAt,
  };
}
