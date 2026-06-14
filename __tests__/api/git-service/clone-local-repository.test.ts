import { describe, expect, it } from "vitest";
import { parseRepositoryInput } from "#/api/git-service/clone-local-repository";

describe("parseRepositoryInput", () => {
  it("expands bare owner/repo shorthand to a GitHub HTTPS URL", () => {
    expect(parseRepositoryInput("octocat/Hello-World")).toEqual({
      url: "https://github.com/octocat/Hello-World",
      name: "Hello-World",
    });
  });

  it("keeps a full HTTPS URL and derives the name without .git", () => {
    expect(
      parseRepositoryInput("https://github.com/octocat/Hello-World.git"),
    ).toEqual({
      url: "https://github.com/octocat/Hello-World.git",
      name: "Hello-World",
    });
  });

  it("supports SSH-style remotes", () => {
    expect(
      parseRepositoryInput("git@github.com:octocat/Hello-World.git"),
    ).toEqual({
      url: "git@github.com:octocat/Hello-World.git",
      name: "Hello-World",
    });
  });

  it("handles a trailing slash on a URL", () => {
    expect(parseRepositoryInput("https://gitlab.com/group/proj/")).toEqual({
      url: "https://gitlab.com/group/proj/",
      name: "proj",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseRepositoryInput("  owner/repo  ")).toEqual({
      url: "https://github.com/owner/repo",
      name: "repo",
    });
  });

  it("returns null for empty input", () => {
    expect(parseRepositoryInput("")).toBeNull();
    expect(parseRepositoryInput("   ")).toBeNull();
  });

  it("returns null for input that is neither shorthand nor a URL", () => {
    expect(parseRepositoryInput("just-some-text")).toBeNull();
    expect(parseRepositoryInput("not a repo!")).toBeNull();
  });
});
