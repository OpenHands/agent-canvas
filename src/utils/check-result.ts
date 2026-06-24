/**
 * Verification checks (Bet D) — the read side of "Loops You Can Trust". An
 * agent that verifies its own work emits `.checks/result.json` into the
 * conversation worktree: a pass/fail verdict plus pointers to the durable
 * artifacts (the committed Playwright spec, the recorded video, the trace) a
 * reviewer inspects to approve *without running anything locally*. The Checks
 * tab reads this file; the emit step (rca `on_stop` hook, Bet D A2) writes it.
 *
 * `.checks/result.json` is an untrusted boundary — hand-written, only
 * partially written, or produced by an older emitter — so {@link CheckResult.parse}
 * is pure and total: it never throws, drops anything it can't make sense of,
 * and returns `null` when there's no reviewable verdict at all. Unit tests pin
 * the shape (mirrors the {@link Project} module).
 *
 * Advisory: a result is informational. It surfaces proof; it does not gate.
 */

/** Where the agent writes its verdict, relative to the conversation worktree. */
export const CHECK_RESULT_PATH = ".checks/result.json";

export type CheckStatus = "passed" | "failed";

/** One verified behavior within a run — a single Playwright `test(...)` case. */
export interface VerifiedCheck {
  /**
   * Human-readable behavior under test (the spec's test title), or null when
   * the emitter recorded a verdict without one — the consumer supplies a
   * localized fallback. A missing title must never cause a check to be
   * dropped (see {@link parseCheck}): that would let a titleless failure
   * silently vanish and mask a red run as green.
   */
  title: string | null;
  status: CheckStatus;
  /** Wall-clock duration in ms, or null when the emitter didn't record it. */
  durationMs: number | null;
  /** Failure detail (assertion / error message), or null when passed/absent. */
  error: string | null;
}

export interface CheckResult {
  /**
   * Overall verdict. A failed check always forces `failed` regardless of the
   * emitter's stated verdict — a verification surface must never show green
   * while a check is red.
   */
  status: CheckStatus;
  /** Per-behavior results. May be empty when the emitter only wrote a verdict. */
  checks: VerifiedCheck[];
  /**
   * The committed spec — a worktree-relative path
   * (`tests/e2e/verified/<slug>.spec.ts`), or null when not recorded.
   */
  spec: string | null;
  /**
   * The recorded video — a worktree-relative path (resolved against the
   * workspace fileserver) or an absolute URL (e.g. a media-branch raw URL once
   * Bet D A3 lands). Null when no recording was produced.
   */
  video: string | null;
  /** The Playwright trace (worktree-relative path or URL), or null. */
  trace: string | null;
  /** The commit the verification ran against, or null. */
  commit: string | null;
  /** ISO-8601 timestamp the run finished, or null. */
  createdAt: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStatus(value: unknown): CheckStatus | null {
  return value === "passed" || value === "failed" ? value : null;
}

/** Non-empty trimmed string, or null (also collapses whitespace-only input). */
function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** Finite number, or null (rejects NaN/Infinity and non-numbers). */
function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseCheck(value: unknown): VerifiedCheck | null {
  const record = asRecord(value);
  if (!record) return null;

  // A recognizable status is the only thing that makes an entry a check we can
  // reason about — drop entries without one (no verdict to honor). The title
  // is cosmetic and deliberately NOT required: dropping a titleless `failed`
  // entry would erase a red result before the red-forces-failed rule runs.
  const status = asStatus(record.status);
  if (!status) return null;

  return {
    title: asTrimmedString(record.title),
    status,
    durationMs: asFiniteNumber(record.durationMs),
    error: asTrimmedString(record.error),
  };
}

export const CheckResult = {
  /**
   * Parse the raw text of `.checks/result.json` into a {@link CheckResult}, or
   * `null` when there's nothing to show — empty input, invalid JSON, not an
   * object, or no verdict derivable. The caller distinguishes "no file yet"
   * (the query errored / no text) from "unreadable file" (text present but
   * `parse` returned null) to pick the right empty vs. error UI.
   */
  parse(rawText: string): CheckResult | null {
    let value: unknown;
    try {
      value = JSON.parse(rawText);
    } catch {
      return null;
    }

    const record = asRecord(value);
    if (!record) return null;

    const checks = Array.isArray(record.checks)
      ? record.checks
          .map(parseCheck)
          .filter((check): check is VerifiedCheck => check !== null)
      : [];

    // Resolve the overall verdict. A red check always wins (never mask a
    // failure as passed); otherwise honor an explicit verdict; otherwise
    // derive passed from a non-empty all-green list. With neither an explicit
    // status nor any checks there's no verdict to show — treat as unreadable.
    const explicit = asStatus(record.status);
    let status: CheckStatus | null;
    if (checks.some((check) => check.status === "failed")) {
      status = "failed";
    } else if (explicit) {
      status = explicit;
    } else if (checks.length > 0) {
      status = "passed";
    } else {
      status = null;
    }
    if (!status) return null;

    return {
      status,
      checks,
      spec: asTrimmedString(record.spec),
      video: asTrimmedString(record.video),
      trace: asTrimmedString(record.trace),
      commit: asTrimmedString(record.commit),
      createdAt: asTrimmedString(record.createdAt),
    };
  },
} as const;
