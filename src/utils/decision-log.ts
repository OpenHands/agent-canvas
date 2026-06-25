/**
 * Decision log (Bet D, "show me your work") — the append-only record an agent
 * keeps as it works: each entry is one decision, why it made it, the evidence
 * behind it, and how it turned out. It surfaces in the cockpit Checks tab beside
 * the spec + video, so a reviewer can audit the agent's reasoning — not just its
 * verdict — without running anything locally.
 *
 * The agent appends to `.checks/decisions.jsonl` (one JSON object per line) as
 * the run progresses; the read side ({@link DecisionLog.parse}) turns that text
 * into entries. JSON Lines is deliberate: an append-only log must stay readable
 * even when the last line is half-written (the run is still going) or one line
 * is malformed — a single bad line must never sink the rest. So the parser is
 * pure and total: it skips anything it can't make sense of and never throws.
 * Mirrors the {@link CheckResult} contract (`check-result.ts`).
 *
 * Advisory: the log is informational. It surfaces reasoning; it does not gate.
 */

/** Where the agent appends decisions, relative to the conversation worktree. */
export const DECISIONS_PATH = ".checks/decisions.jsonl";

/** One logged decision. Only `decision` is load-bearing; the rest enrich it. */
export interface Decision {
  /** What was decided — the one required field (an entry without it is noise). */
  decision: string;
  /** Why — the rationale, or null when the emitter didn't record one. */
  why: string | null;
  /** Evidence backing the decision (a quote, path, or metric), or null. */
  evidence: string | null;
  /**
   * How it turned out — often absent when first logged and filled in later, so
   * an entry with no outcome is normal (in-flight), not malformed.
   */
  outcome: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Non-empty trimmed string, or null (also collapses whitespace-only input). */
function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** Parse one JSONL line into a {@link Decision}, or null when it's not one. */
function parseLine(line: string): Decision | null {
  if (!line.trim()) return null; // blank line / trailing newline

  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null; // a half-written final line or garbage — skip it, keep the rest
  }

  const record = asRecord(value);
  if (!record) return null;

  // `decision` is the only field that makes an entry meaningful; drop entries
  // without one rather than render a blank row.
  const decision = asTrimmedString(record.decision);
  if (!decision) return null;

  return {
    decision,
    why: asTrimmedString(record.why),
    evidence: asTrimmedString(record.evidence),
    outcome: asTrimmedString(record.outcome),
  };
}

export const DecisionLog = {
  /**
   * Parse the raw text of `.checks/decisions.jsonl` into ordered
   * {@link Decision} entries. Splits on newlines and keeps every line that
   * parses into a decision; malformed, blank, and non-decision lines are
   * dropped. Returns `[]` when there's nothing to show (empty/garbage input) —
   * the caller renders no Decisions section in that case.
   */
  parse(rawText: string): Decision[] {
    return rawText
      .split(/\r?\n/)
      .map(parseLine)
      .filter((entry): entry is Decision => entry !== null);
  },
} as const;
