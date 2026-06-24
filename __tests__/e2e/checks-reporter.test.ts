import { describe, it, expect } from "vitest";

import {
  buildCheckResult,
  toCheckStatus,
  type ReportedTest,
  type PlaywrightStatus,
} from "../../tests/e2e/verified/check-result-emit";
import { CheckResult } from "#/utils/check-result";

const META = { commit: "abc1234", createdAt: "2026-06-24T12:00:00.000Z" };

function reported(overrides: Partial<ReportedTest> = {}): ReportedTest {
  return {
    title: "a check",
    status: "passed",
    durationMs: 100,
    error: null,
    spec: "tests/e2e/verified/x.spec.ts",
    video: null,
    trace: null,
    ...overrides,
  };
}

describe("toCheckStatus", () => {
  it.each<[PlaywrightStatus, "passed" | "failed" | null]>([
    ["passed", "passed"],
    ["failed", "failed"],
    ["timedOut", "failed"],
    ["interrupted", "failed"],
    ["skipped", null],
  ])("maps %s → %s", (input, expected) => {
    expect(toCheckStatus(input)).toBe(expected);
  });
});

describe("buildCheckResult", () => {
  it("passes when every (non-skipped) test passed and rounds durations", () => {
    const result = buildCheckResult(
      [
        reported({ title: "one", durationMs: 120.7 }),
        reported({ title: "skipped one", status: "skipped" }),
      ],
      META,
    );
    expect(result.status).toBe("passed");
    // The skipped test carries no verdict, so it is excluded.
    expect(result.checks).toEqual([
      { title: "one", status: "passed", durationMs: 121, error: null },
    ]);
  });

  it("fails the run if any test is red, and points the run artifacts at the first failure", () => {
    const result = buildCheckResult(
      [
        reported({
          title: "green",
          status: "passed",
          spec: "a.spec.ts",
          video: ".checks/0-green.webm",
        }),
        reported({
          title: "red",
          status: "failed",
          error: "boom",
          spec: "b.spec.ts",
          video: ".checks/1-red.webm",
          trace: ".checks/1-red.zip",
        }),
      ],
      META,
    );
    expect(result.status).toBe("failed");
    // Run-level pointers favour the first failing test — what a reviewer opens.
    expect(result.spec).toBe("b.spec.ts");
    expect(result.video).toBe(".checks/1-red.webm");
    expect(result.trace).toBe(".checks/1-red.zip");
  });

  it("carries commit + timestamp and blank titles become null", () => {
    const result = buildCheckResult([reported({ title: "   " })], META);
    expect(result.commit).toBe("abc1234");
    expect(result.createdAt).toBe("2026-06-24T12:00:00.000Z");
    expect(result.checks[0]?.title).toBeNull();
  });

  // The load-bearing guarantee: the emitter writes exactly what the cockpit
  // Checks tab's parser reads. If these ever drift, this round-trip breaks.
  it("emits output that round-trips through CheckResult.parse unchanged", () => {
    const built = buildCheckResult(
      [
        reported({ title: "loads", durationMs: 1200, video: ".checks/0.webm" }),
        reported({ title: "fails", status: "failed", error: "nope" }),
      ],
      META,
    );
    const reparsed = CheckResult.parse(JSON.stringify(built));
    expect(reparsed).toEqual(built);
    expect(reparsed?.status).toBe("failed");
  });
});
