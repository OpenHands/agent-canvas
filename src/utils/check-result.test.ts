import { describe, it, expect } from "vitest";
import { CheckResult, CHECK_RESULT_PATH } from "./check-result";

/** Build the raw JSON text the parser actually receives from the worktree. */
const json = (value: unknown) => JSON.stringify(value);

describe("CheckResult.parse — invalid / empty inputs", () => {
  it.each([
    ["empty string", ""],
    ["whitespace", "   "],
    ["malformed JSON", "{ not json"],
    ["JSON null", "null"],
    ["JSON array", "[]"],
    ["JSON string", '"passed"'],
    ["JSON number", "42"],
    ["empty object (no verdict, no checks)", "{}"],
    ["object with only unknown status", json({ status: "errored" })],
    ["object with checks: [] and no status", json({ checks: [] })],
  ])("returns null for %s", (_label, raw) => {
    expect(CheckResult.parse(raw)).toBeNull();
  });
});

describe("CheckResult.parse — verdict resolution", () => {
  it("honors an explicit passed verdict even with no checks", () => {
    expect(CheckResult.parse(json({ status: "passed" }))?.status).toBe(
      "passed",
    );
  });

  it("honors an explicit failed verdict even with no checks", () => {
    expect(CheckResult.parse(json({ status: "failed" }))?.status).toBe(
      "failed",
    );
  });

  it("derives passed from an all-green check list when status is absent", () => {
    const result = CheckResult.parse(
      json({ checks: [{ title: "loads", status: "passed" }] }),
    );
    expect(result?.status).toBe("passed");
  });

  it("derives failed when any check failed and status is absent", () => {
    const result = CheckResult.parse(
      json({
        checks: [
          { title: "a", status: "passed" },
          { title: "b", status: "failed" },
        ],
      }),
    );
    expect(result?.status).toBe("failed");
  });

  it("forces failed when a check is red even if the verdict claims passed", () => {
    // A buggy/optimistic emitter must never be able to paint a red run green.
    const result = CheckResult.parse(
      json({
        status: "passed",
        checks: [{ title: "broken", status: "failed" }],
      }),
    );
    expect(result?.status).toBe("failed");
  });

  it("forces failed even when the red check has no title (must not be dropped)", () => {
    // Regression: a titleless `failed` entry must survive parsing so the
    // red-forces-failed rule still fires — dropping it would mask a red run.
    const result = CheckResult.parse(
      json({
        status: "passed",
        checks: [{ status: "failed", error: "boom" }],
      }),
    );
    expect(result?.status).toBe("failed");
    expect(result?.checks).toEqual([
      { title: null, status: "failed", durationMs: null, error: "boom" },
    ]);
  });
});

describe("CheckResult.parse — fields and coercion", () => {
  it("parses a full result, preserving check order", () => {
    const result = CheckResult.parse(
      json({
        status: "failed",
        spec: "tests/e2e/verified/cockpit-loads.spec.ts",
        video: ".checks/run.webm",
        trace: ".checks/trace.zip",
        commit: "abc1234",
        createdAt: "2026-06-24T12:00:00.000Z",
        checks: [
          { title: "first", status: "passed", durationMs: 120 },
          {
            title: "second",
            status: "failed",
            durationMs: 80,
            error: "expected visible",
          },
        ],
      }),
    );

    expect(result).toEqual({
      status: "failed",
      spec: "tests/e2e/verified/cockpit-loads.spec.ts",
      video: ".checks/run.webm",
      trace: ".checks/trace.zip",
      commit: "abc1234",
      createdAt: "2026-06-24T12:00:00.000Z",
      checks: [
        { title: "first", status: "passed", durationMs: 120, error: null },
        {
          title: "second",
          status: "failed",
          durationMs: 80,
          error: "expected visible",
        },
      ],
    });
  });

  it("defaults missing optional pointers to null", () => {
    const result = CheckResult.parse(json({ status: "passed" }));
    expect(result).toMatchObject({
      spec: null,
      video: null,
      trace: null,
      commit: null,
      createdAt: null,
      checks: [],
    });
  });

  it("trims string fields and treats whitespace-only as null", () => {
    const result = CheckResult.parse(
      json({ status: "passed", spec: "  a.spec.ts  ", video: "   " }),
    );
    expect(result?.spec).toBe("a.spec.ts");
    expect(result?.video).toBeNull();
  });

  it("drops only entries without a recognizable status; a titleless-but-valid check is kept", () => {
    const result = CheckResult.parse(
      json({
        checks: [
          { title: "keep", status: "passed" },
          { status: "passed" }, // no title → kept (title null), NOT dropped
          { title: "no status" }, // missing status → dropped
          { title: "bad status", status: "skipped" }, // unknown status → dropped
          "not an object", // dropped
        ],
      }),
    );
    expect(result?.checks).toEqual([
      { title: "keep", status: "passed", durationMs: null, error: null },
      { title: null, status: "passed", durationMs: null, error: null },
    ]);
    expect(result?.status).toBe("passed");
  });

  it("rejects non-finite durations, coercing them to null", () => {
    const result = CheckResult.parse(
      json({
        checks: [{ title: "t", status: "passed", durationMs: "120" }],
      }),
    );
    expect(result?.checks[0]?.durationMs).toBeNull();
  });
});

describe("CHECK_RESULT_PATH", () => {
  it("is the agreed worktree-relative emit location", () => {
    expect(CHECK_RESULT_PATH).toBe(".checks/result.json");
  });
});
