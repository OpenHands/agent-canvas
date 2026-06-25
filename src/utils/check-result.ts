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

/**
 * Absolute http(s) URL — the one non-path value the contract allows for an
 * artifact pointer (e.g. a media-branch raw URL once Bet D A3 lands). The
 * parser is the contract authority; the Checks tab mirrors this test to decide
 * render-directly vs resolve-against-the-fileserver.
 */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Constrain an artifact pointer to a genuinely worktree-relative path, else
 * null. Generalizing verification (Bet D) moves the writer outside the
 * cockpit's trust boundary — any agent, in any target repo, writes
 * `.checks/result.json` — so the reader can no longer assume these came from a
 * trusted `path.relative()`. Reject anything that could escape the worktree
 * when resolved against the static fileserver: absolute POSIX (`/x`), Windows
 * drive (`C:\x`) or UNC (`\\host`) paths, and any `..` segment. A rejected
 * pointer drops to null (the field vanishes; the verdict + checks still
 * render). Defense-in-depth — the agent-server fileserver remains the primary
 * traversal guard; this enforces the contract's "worktree-relative" promise at
 * the trust boundary so an arbitrary emitter cannot smuggle in an escaping path.
 */
function asWorktreeRelativePath(value: string | null): string | null {
  if (value === null) return null;
  // Leading separator — absolute POSIX (`/x`) or UNC (`\\host`).
  if (/^[/\\]/.test(value)) return null;
  // A URL or Windows-drive scheme prefix (`https:`, `file:`, `C:`) is never a
  // worktree-relative path. video/trace get their http(s) escape hatch in
  // asArtifactRef, which runs before this; everything else with a scheme is out.
  if (/^[A-Za-z][\w+.-]*:/.test(value)) return null;
  // Any `..` path segment, with either separator (e.g. `a/../../etc`).
  if (value.split(/[/\\]/).some((segment) => segment === "..")) return null;
  return value;
}

/**
 * A video/trace pointer: a worktree-relative path (resolved against the
 * fileserver) OR an absolute http(s) URL (a media-branch URL, post A3, which
 * the tab renders directly as `<video src>`). An origin allowlist for external
 * URLs lands with A3 — the feature that first emits one.
 */
function asArtifactRef(value: string | null): string | null {
  if (value === null) return null;
  return isHttpUrl(value) ? value : asWorktreeRelativePath(value);
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
      // spec is path-only (the committed test, shown as text); video/trace may
      // also be an absolute http(s) URL. All are constrained to the worktree —
      // the writer is now untrusted (any target's agent).
      spec: asWorktreeRelativePath(asTrimmedString(record.spec)),
      video: asArtifactRef(asTrimmedString(record.video)),
      trace: asArtifactRef(asTrimmedString(record.trace)),
      commit: asTrimmedString(record.commit),
      createdAt: asTrimmedString(record.createdAt),
    };
  },
} as const;
