import { describe, it, expect } from "vitest";
import {
  formatSourceRef,
  githubShorthandUrl,
  parseGithubShorthand,
  parseSourceRef,
  splitGithubScheme,
  type ExtensionSourceRef,
} from "#/extensions/sources/ref";
import githubFixtures from "#/extensions/sources/github-source-fixtures.json";

interface GithubFixtureRow {
  input: string;
  sdkType: "github" | "git" | "local" | "error";
  sdkUrl?: string;
  ts: "github" | "url" | "throws";
  owner?: string;
  repo?: string;
}

const FIXTURE_ROWS = (githubFixtures as { rows: GithubFixtureRow[] }).rows;

describe("parseSourceRef", () => {
  it("parses an unscoped npm ref with a range", () => {
    expect(parseSourceRef("npm:hello-ext@^1.2.0")).toEqual({
      kind: "npm",
      name: "hello-ext",
      range: "^1.2.0",
    });
  });

  it("parses a scoped npm ref, distinguishing the scope @ from the range @", () => {
    expect(parseSourceRef("npm:@acme/hello@^1")).toEqual({
      kind: "npm",
      name: "@acme/hello",
      range: "^1",
    });
    expect(parseSourceRef("npm:@acme/hello")).toEqual({
      kind: "npm",
      name: "@acme/hello",
      range: undefined,
    });
  });

  it("parses a github ref at repo root (zero-config default)", () => {
    expect(parseSourceRef("github:acme/hello")).toEqual({
      kind: "gh",
      owner: "acme",
      repo: "hello",
      subpath: undefined,
      range: undefined,
    });
  });

  it("accepts gh: and github:// as parser-only aliases of github:", () => {
    const canonical = parseSourceRef("github:acme/hello");
    expect(parseSourceRef("gh:acme/hello")).toEqual(canonical);
    expect(parseSourceRef("github://acme/hello")).toEqual(canonical);
  });

  it("parses a github monorepo ref with a subpath and range", () => {
    expect(parseSourceRef("github:acme/exts/packages/hello@^1.0.0")).toEqual({
      kind: "gh",
      owner: "acme",
      repo: "exts",
      subpath: "packages/hello",
      range: "^1.0.0",
    });
  });

  it("strips a .git suffix and trailing slashes on github repos", () => {
    expect(parseSourceRef("github:acme/hello.git")).toMatchObject({
      repo: "hello",
    });
    expect(parseSourceRef("github:acme/exts/sub/@^1")).toMatchObject({
      subpath: "sub",
      range: "^1",
    });
  });

  it("parses an https bundle directory URL and strips trailing slashes", () => {
    expect(parseSourceRef("https://cdn.example.com/ext/")).toEqual({
      kind: "url",
      baseUrl: "https://cdn.example.com/ext",
    });
  });

  it("rejects empty, bare, and malformed refs", () => {
    expect(() => parseSourceRef("   ")).toThrow(/empty/);
    expect(() => parseSourceRef("acme/hello")).toThrow(/unsupported/);
    expect(() => parseSourceRef("github:acme")).toThrow(/expected github:/);
    expect(() => parseSourceRef("npm:@bad@scope/x")).toThrow(/invalid npm/);
  });
});

describe("splitGithubScheme", () => {
  it("matches the scheme token case-insensitively, preserving the remainder case", () => {
    expect(splitGithubScheme("GitHub:Owner/RepoName")).toBe("Owner/RepoName");
    expect(splitGithubScheme("GH:acme/Hello")).toBe("acme/Hello");
    expect(splitGithubScheme("GITHUB://acme/hello")).toBe("acme/hello");
  });

  it("returns null for non-github schemes", () => {
    expect(splitGithubScheme("npm:pkg")).toBeNull();
    expect(splitGithubScheme("https://github.com/a/b")).toBeNull();
    expect(splitGithubScheme("git@github.com:a/b.git")).toBeNull();
  });
});

describe("parseGithubShorthand (strict SDK-parity grammar)", () => {
  it("returns null when the input is not a github scheme", () => {
    expect(parseGithubShorthand("npm:pkg")).toBeNull();
    expect(parseGithubShorthand("https://github.com/a/b")).toBeNull();
  });

  it("throws on a github scheme with != 1 slash (subpath/@ not packed)", () => {
    expect(() => parseGithubShorthand("github:invalid")).toThrow(
      /invalid GitHub shorthand/,
    );
    expect(() => parseGithubShorthand("github:too/many/parts")).toThrow(
      /invalid GitHub shorthand/,
    );
  });
});

// Shared anti-drift fixture table (mirrors software-agent-sdk test_fetch.py). The
// canonical grammar is verified against the strict parseGithubShorthand; git/local
// rows document the parse-vs-fetch boundary (the browser has no clone/ssh path).
describe("github source fixtures (SDK parity)", () => {
  it.each(FIXTURE_ROWS)("classifies $input", (row) => {
    if (row.sdkType === "github") {
      const shorthand = parseGithubShorthand(row.input);
      expect(shorthand).not.toBeNull();
      expect(shorthand).toEqual({ owner: row.owner, repo: row.repo });
      expect(githubShorthandUrl(shorthand!)).toBe(row.sdkUrl);
      // The full parser agrees and yields the same owner/repo.
      expect(parseSourceRef(row.input)).toMatchObject({
        kind: "gh",
        owner: row.owner,
        repo: row.repo,
      });
      return;
    }

    if (row.ts === "url") {
      // The browser treats an http(s) bundle URL as a `url` source (no git clone).
      expect(parseSourceRef(row.input)).toMatchObject({ kind: "url" });
      return;
    }

    // Remaining rows are git/local/error, which the browser cannot fetch.
    if (splitGithubScheme(row.input) !== null) {
      // A github-scheme input that is not a valid shorthand (e.g. too many parts)
      // is rejected by the strict grammar. It may still parse as the internal
      // monorepo *superset* via parseSourceRef, which is the documented divergence,
      // so we only assert the strict grammar here.
      expect(() => parseGithubShorthand(row.input)).toThrow();
      return;
    }

    // Not a github scheme: the shorthand parser declines and the browser parser,
    // having no clone/ssh/local path, throws.
    expect(parseGithubShorthand(row.input)).toBeNull();
    expect(() => parseSourceRef(row.input)).toThrow();
  });
});

describe("formatSourceRef round-trips", () => {
  const cases: ExtensionSourceRef[] = [
    { kind: "npm", name: "@acme/hello", range: "^1" },
    { kind: "npm", name: "hello", range: undefined },
    { kind: "gh", owner: "acme", repo: "hello", range: undefined },
    {
      kind: "gh",
      owner: "acme",
      repo: "exts",
      subpath: "packages/hello",
      range: "^1.0.0",
    },
    { kind: "url", baseUrl: "https://cdn.example.com/ext" },
  ];

  it.each(cases)("re-parses formatted ref %o", (ref) => {
    expect(parseSourceRef(formatSourceRef(ref))).toEqual(ref);
  });
});
