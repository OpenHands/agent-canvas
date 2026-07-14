import { describe, expect, it } from "vitest";
import {
  githubUrlPath,
  githubUrlToSource,
  marketplaceCatalogCandidates,
  parseMarketplaceSource,
  rawGithubUrl,
} from "#/extensions/marketplace/source";

describe("parseMarketplaceSource", () => {
  it("parses github:// with default ref", () => {
    expect(parseMarketplaceSource("github://acme/repo")).toEqual({
      kind: "github",
      owner: "acme",
      repo: "repo",
      ref: "main",
    });
  });

  it("parses github:// with an explicit ref", () => {
    expect(parseMarketplaceSource("github://acme/repo@v2")).toEqual({
      kind: "github",
      owner: "acme",
      repo: "repo",
      ref: "v2",
    });
  });

  it("accepts the canonical github: scheme and the gh: alias, case-insensitively", () => {
    const expected = {
      kind: "github",
      owner: "acme",
      repo: "repo",
      ref: "main",
    };
    expect(parseMarketplaceSource("github:acme/repo")).toEqual(expected);
    expect(parseMarketplaceSource("gh:acme/repo")).toEqual(expected);
    expect(parseMarketplaceSource("GitHub:acme/repo")).toEqual(expected);
  });

  it("parses the owner/repo shorthand", () => {
    expect(parseMarketplaceSource("acme/repo@dev")).toEqual({
      kind: "github",
      owner: "acme",
      repo: "repo",
      ref: "dev",
    });
  });

  it("parses a github.com web URL into a github source", () => {
    expect(parseMarketplaceSource("https://github.com/acme/repo")).toEqual({
      kind: "github",
      owner: "acme",
      repo: "repo",
      ref: "main",
    });
  });

  it("treats a non-github https URL as a direct catalog URL", () => {
    expect(parseMarketplaceSource("https://example.com/catalog.json")).toEqual({
      kind: "url",
      url: "https://example.com/catalog.json",
    });
  });

  it("rejects an unsupported source", () => {
    expect(() => parseMarketplaceSource("ftp://nope")).toThrow();
    expect(() => parseMarketplaceSource("not a source")).toThrow();
  });
});

describe("githubUrl helpers", () => {
  it("extracts ref and path from a /tree/ URL", () => {
    const url = "https://github.com/acme/repo/tree/dev/plugins/hello";
    expect(githubUrlToSource(url)).toEqual({
      kind: "github",
      owner: "acme",
      repo: "repo",
      ref: "dev",
    });
    expect(githubUrlPath(url)).toBe("plugins/hello");
  });

  it("returns null for non-github URLs", () => {
    expect(githubUrlToSource("https://example.com/x")).toBeNull();
  });
});

describe("rawGithubUrl + candidates", () => {
  it("builds raw URLs", () => {
    const source = {
      kind: "github" as const,
      owner: "acme",
      repo: "repo",
      ref: "main",
    };
    expect(rawGithubUrl(source, "hello/extension.json")).toBe(
      "https://raw.githubusercontent.com/acme/repo/main/hello/extension.json",
    );
    expect(rawGithubUrl(source, "")).toBe(
      "https://raw.githubusercontent.com/acme/repo/main",
    );
  });

  it("offers .plugin then .claude-plugin candidates for github sources", () => {
    expect(
      marketplaceCatalogCandidates({
        kind: "github",
        owner: "acme",
        repo: "repo",
        ref: "main",
      }),
    ).toEqual([
      "https://raw.githubusercontent.com/acme/repo/main/.plugin/marketplace.json",
      "https://raw.githubusercontent.com/acme/repo/main/.claude-plugin/marketplace.json",
    ]);
  });

  it("uses the URL directly for url sources", () => {
    expect(
      marketplaceCatalogCandidates({ kind: "url", url: "https://x/c.json" }),
    ).toEqual(["https://x/c.json"]);
  });
});
