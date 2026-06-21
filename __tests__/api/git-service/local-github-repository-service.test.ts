import { describe, expect, test } from "vitest";

import { parseLocalRepositoryInput } from "#/api/git-service/local-github-repository-service";

describe("parseLocalRepositoryInput", () => {
  test("accepts owner/repo references", () => {
    expect(parseLocalRepositoryInput("SpotwiseAI/spotwise-ui")).toEqual({
      fullName: "SpotwiseAI/spotwise-ui",
      directoryName: "spotwise-ui",
      cloneUrl: "https://github.com/SpotwiseAI/spotwise-ui.git",
    });
  });

  test("normalizes HTTPS clone URLs", () => {
    expect(
      parseLocalRepositoryInput(
        "https://github.com/SpotwiseAI/spotwise-ui.git",
      ),
    ).toEqual({
      fullName: "SpotwiseAI/spotwise-ui",
      directoryName: "spotwise-ui",
      cloneUrl: "https://github.com/SpotwiseAI/spotwise-ui.git",
    });
  });

  test("normalizes SSH clone URLs", () => {
    expect(
      parseLocalRepositoryInput("git@github.com:SpotwiseAI/spotwise-ui.git"),
    ).toEqual({
      fullName: "SpotwiseAI/spotwise-ui",
      directoryName: "spotwise-ui",
      cloneUrl: "https://github.com/SpotwiseAI/spotwise-ui.git",
    });
  });

  test("rejects non-GitHub references", () => {
    expect(() =>
      parseLocalRepositoryInput("https://gitlab.com/a/b.git"),
    ).toThrow("Repository must be a GitHub owner/repo name.");
  });
});
