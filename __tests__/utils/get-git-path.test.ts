import { describe, it, expect } from "vitest";
import { DEFAULT_WORKING_DIR } from "#/api/agent-server-config";
import { getGitPath } from "#/utils/get-git-path";

describe("getGitPath", () => {
  it("should return the default working dir when no repository is selected", () => {
    expect(getGitPath(null)).toBe(DEFAULT_WORKING_DIR);
    expect(getGitPath(undefined)).toBe(DEFAULT_WORKING_DIR);
  });

  it("should handle standard owner/repo format (GitHub)", () => {
    expect(getGitPath("OpenHands/OpenHands")).toBe(
      `${DEFAULT_WORKING_DIR}/OpenHands`,
    );
    expect(getGitPath("facebook/react")).toBe(`${DEFAULT_WORKING_DIR}/react`);
  });

  it("should handle nested group paths (GitLab)", () => {
    expect(getGitPath("modernhealth/frontend-guild/pan")).toBe(
      `${DEFAULT_WORKING_DIR}/pan`,
    );
    expect(getGitPath("group/subgroup/repo")).toBe(
      `${DEFAULT_WORKING_DIR}/repo`,
    );
    expect(getGitPath("a/b/c/d/repo")).toBe(`${DEFAULT_WORKING_DIR}/repo`);
  });

  it("should handle single segment paths", () => {
    expect(getGitPath("repo")).toBe(`${DEFAULT_WORKING_DIR}/repo`);
  });

  it("should handle empty string", () => {
    expect(getGitPath("")).toBe(DEFAULT_WORKING_DIR);
  });

  describe("with a backend-provided workspace path", () => {
    it("prefers selectedRepository over workingDir when repo is selected", () => {
      // When a repo is selected, we use the selectedRepository-derived path
      // because workingDir may be stale during repository switches
      // (it's updated asynchronously by the agent after cloning)
      expect(
        getGitPath(
          "OpenHands/software-agent-sdk",
          "/workspace/project/agent-canvas",
        ),
      ).toBe(`${DEFAULT_WORKING_DIR}/software-agent-sdk`);
    });

    it("uses workingDir only when no repository is selected", () => {
      // When no repository is selected, fall back to workingDir
      expect(getGitPath(null, "/workspace/project/agent-canvas")).toBe(
        "/workspace/project/agent-canvas",
      );
    });

    it("ignores blank workspace paths and falls back to repo-derived path", () => {
      expect(getGitPath("OpenHands/software-agent-sdk", " ")).toBe(
        `${DEFAULT_WORKING_DIR}/software-agent-sdk`,
      );
    });

    it("ignores blank workspace paths and falls back to default when no repo", () => {
      expect(getGitPath(null, "  ")).toBe(DEFAULT_WORKING_DIR);
    });
  });
});
