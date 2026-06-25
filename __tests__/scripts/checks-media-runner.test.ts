import { describe, expect, it } from "vitest";

import {
  buildChecksMediaPaths,
  buildChecksMediaRunId,
  buildRawGithubChecksMediaBaseUrl,
  getDefaultVerifiedCommand,
  normalizeMediaPathPrefix,
  parseGithubRemoteUrl,
} from "../../scripts/checks-media-runner.mjs";

describe("checks-media-runner helpers", () => {
  it.each([
    ["https://github.com/SpotwiseAI/agent-canvas.git"],
    ["git@github.com:SpotwiseAI/agent-canvas.git"],
  ])("parses GitHub remote URLs: %s", (remoteUrl) => {
    expect(parseGithubRemoteUrl(remoteUrl)).toEqual({
      owner: "SpotwiseAI",
      repo: "agent-canvas",
    });
  });

  it("rejects non-GitHub remotes", () => {
    expect(parseGithubRemoteUrl("https://example.com/o/r.git")).toBeNull();
  });

  it("builds a raw GitHub URL under the media branch run directory", () => {
    expect(
      buildRawGithubChecksMediaBaseUrl({
        owner: "SpotwiseAI",
        repo: "agent-canvas",
        branch: "checks-media",
        pathPrefix: "/.checks/",
        runId: "abc123-2026",
      }),
    ).toBe(
      "https://raw.githubusercontent.com/SpotwiseAI/agent-canvas/checks-media/.checks/abc123-2026",
    );
  });

  it("derives stable checkout and output paths", () => {
    expect(
      buildChecksMediaPaths({
        repoRoot: "/repo",
        worktreePath: ".tmp/media",
        pathPrefix: "checks",
        runId: "run-1",
      }),
    ).toEqual({
      checkoutDir: "/repo/.tmp/media",
      outputDir: "/repo/.tmp/media/checks/run-1",
    });
  });

  it("generates command defaults and safe path/run labels", () => {
    expect(getDefaultVerifiedCommand([])).toEqual([
      "npx",
      "playwright",
      "test",
      "--project=verified-dev",
    ]);
    expect(getDefaultVerifiedCommand(["--project=verified-prod"])).toEqual([
      "npx",
      "playwright",
      "test",
      "--project=verified-prod",
    ]);
    expect(getDefaultVerifiedCommand(["npm", "test"])).toEqual(["npm", "test"]);
    expect(normalizeMediaPathPrefix("//checks//")).toBe("checks");
    expect(
      buildChecksMediaRunId({
        sha: "b733ef0ce4",
        now: new Date("2026-06-25T19:52:21.123Z"),
      }),
    ).toBe("b733ef0c-2026-06-25T19-52-21-123Z");
  });
});
