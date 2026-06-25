import { describe, it, expect } from "vitest";
import { DecisionLog, DECISIONS_PATH, type Decision } from "./decision-log";

/** Join object lines into the JSONL text the parser receives. */
const jsonl = (...lines: unknown[]) =>
  lines.map((line) => JSON.stringify(line)).join("\n");

describe("DecisionLog.parse — empty / garbage inputs", () => {
  it.each([
    ["empty string", ""],
    ["whitespace only", "   \n  \n"],
    ["a single malformed line", "{ not json"],
    ["a JSON array line", "[1, 2, 3]"],
    ["a JSON string line", '"just a string"'],
    ["a JSON number line", "42"],
    ["an object with no decision", JSON.stringify({ why: "because" })],
    ["an object with a blank decision", JSON.stringify({ decision: "   " })],
  ])("returns [] for %s", (_label, raw) => {
    expect(DecisionLog.parse(raw)).toEqual([]);
  });
});

describe("DecisionLog.parse — resilient line handling", () => {
  it("keeps good lines and drops the malformed ones around them", () => {
    const raw = [
      JSON.stringify({ decision: "use Playwright" }),
      "{ half-written line", // e.g. the run is still appending
      "", // blank separator
      JSON.stringify({ decision: "ship advisory" }),
      "null",
      JSON.stringify({ no: "decision here" }),
    ].join("\n");

    expect(DecisionLog.parse(raw).map((d) => d.decision)).toEqual([
      "use Playwright",
      "ship advisory",
    ]);
  });

  it("tolerates a trailing newline (append-only logs end on one)", () => {
    const raw = `${JSON.stringify({ decision: "a" })}\n`;
    expect(DecisionLog.parse(raw)).toHaveLength(1);
  });

  it("handles CRLF line endings", () => {
    const raw = [
      JSON.stringify({ decision: "a" }),
      JSON.stringify({ decision: "b" }),
    ].join("\r\n");
    expect(DecisionLog.parse(raw).map((d) => d.decision)).toEqual(["a", "b"]);
  });

  it("preserves log order", () => {
    const raw = jsonl(
      { decision: "first" },
      { decision: "second" },
      { decision: "third" },
    );
    expect(DecisionLog.parse(raw).map((d) => d.decision)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
});

describe("DecisionLog.parse — fields and coercion", () => {
  it("parses a full entry and trims its strings", () => {
    const raw = JSON.stringify({
      decision: "  use the existing Playwright runner  ",
      why: "  avoids a new dependency  ",
      evidence: "playwright.config.ts:14",
      outcome: "verified-dev passed",
    });
    expect(DecisionLog.parse(raw)[0]).toEqual<Decision>({
      decision: "use the existing Playwright runner",
      why: "avoids a new dependency",
      evidence: "playwright.config.ts:14",
      outcome: "verified-dev passed",
    });
  });

  it("defaults missing optional fields to null (an in-flight entry has no outcome)", () => {
    const raw = JSON.stringify({ decision: "promote Bet D" });
    expect(DecisionLog.parse(raw)[0]).toEqual<Decision>({
      decision: "promote Bet D",
      why: null,
      evidence: null,
      outcome: null,
    });
  });

  it("coerces non-string optional fields to null rather than keeping them", () => {
    const raw = JSON.stringify({ decision: "d", why: 7, evidence: false });
    expect(DecisionLog.parse(raw)[0]).toMatchObject({
      why: null,
      evidence: null,
    });
  });
});

describe("DECISIONS_PATH", () => {
  it("is the agreed worktree-relative log location", () => {
    expect(DECISIONS_PATH).toBe(".checks/decisions.jsonl");
  });
});
