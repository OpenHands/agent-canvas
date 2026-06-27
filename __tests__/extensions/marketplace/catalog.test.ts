import { describe, expect, it } from "vitest";
import {
  parseCatalog,
  resolveEntryBundleUrl,
  resolveEntryInstallSource,
  type MarketplaceEntry,
} from "#/extensions/marketplace/catalog";
import type { MarketplaceSource } from "#/extensions/marketplace/source";

const github: MarketplaceSource = {
  kind: "github",
  owner: "acme",
  repo: "repo",
  ref: "main",
};

describe("parseCatalog", () => {
  it("accepts a UI-only catalog (no plugins) and preserves unknown fields", () => {
    const result = parseCatalog({
      name: "Examples",
      owner: { name: "Acme" },
      uiExtensions: [{ name: "hello", source: "./hello" }],
      extraTopLevel: true,
    });
    expect(result.ok).toBe(true);
  });

  it("reports missing required fields", () => {
    const result = parseCatalog({ uiExtensions: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("name"),
          expect.stringContaining("owner.name"),
          expect.stringContaining("uiExtensions"),
        ]),
      );
    }
  });

  it("validates entry sources", () => {
    const result = parseCatalog({
      name: "x",
      owner: { name: "y" },
      uiExtensions: [{ name: "bad", source: { source: "svn" } }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("resolveEntryBundleUrl", () => {
  const catalogUrl =
    "https://raw.githubusercontent.com/acme/repo/main/.plugin/marketplace.json";

  it("resolves a relative string source against the github repo", () => {
    const entry: MarketplaceEntry = { name: "hello", source: "./hello" };
    expect(resolveEntryBundleUrl(github, catalogUrl, entry)).toBe(
      "https://raw.githubusercontent.com/acme/repo/main/hello",
    );
  });

  it("resolves a github object source", () => {
    const entry: MarketplaceEntry = {
      name: "hello",
      source: { source: "github", repo: "other/pkg", ref: "v1", path: "ui" },
    };
    expect(resolveEntryBundleUrl(github, catalogUrl, entry)).toBe(
      "https://raw.githubusercontent.com/other/pkg/v1/ui",
    );
  });

  it("maps a github url object source to raw", () => {
    const entry: MarketplaceEntry = {
      name: "hello",
      source: { source: "url", url: "https://github.com/o/r/tree/main/p" },
    };
    expect(resolveEntryBundleUrl(github, catalogUrl, entry)).toBe(
      "https://raw.githubusercontent.com/o/r/main/p",
    );
  });

  it("returns null for a non-fetchable url source", () => {
    const entry: MarketplaceEntry = {
      name: "hello",
      source: { source: "url", url: "git@github.com:o/r.git" },
    };
    expect(resolveEntryBundleUrl(github, catalogUrl, entry)).toBeNull();
  });

  it("resolves relative sources against the catalog dir for url catalogs", () => {
    const urlSource: MarketplaceSource = {
      kind: "url",
      url: "https://cdn.example/repo/marketplace.json",
    };
    const entry: MarketplaceEntry = { name: "hello", source: "./hello" };
    expect(
      resolveEntryBundleUrl(
        urlSource,
        "https://cdn.example/repo/marketplace.json",
        entry,
      ),
    ).toBe("https://cdn.example/repo/hello");
  });
});

describe("resolveEntryInstallSource", () => {
  const catalogUrl =
    "https://raw.githubusercontent.com/acme/repo/main/.plugin/marketplace.json";

  it("returns string npm/gh refs verbatim", () => {
    expect(
      resolveEntryInstallSource(github, catalogUrl, {
        name: "x",
        source: "npm:@acme/hello@^1",
      }),
    ).toBe("npm:@acme/hello@^1");
    expect(
      resolveEntryInstallSource(github, catalogUrl, {
        name: "x",
        source: "gh:acme/exts/packages/hello@^2",
      }),
    ).toBe("gh:acme/exts/packages/hello@^2");
  });

  it("returns absolute https string sources verbatim", () => {
    expect(
      resolveEntryInstallSource(github, catalogUrl, {
        name: "x",
        source: "https://cdn.example/ext",
      }),
    ).toBe("https://cdn.example/ext");
  });

  it("builds a ref from an npm object source", () => {
    expect(
      resolveEntryInstallSource(github, catalogUrl, {
        name: "x",
        source: { source: "npm", name: "@acme/hello", range: "^1" },
      }),
    ).toBe("npm:@acme/hello@^1");
    expect(
      resolveEntryInstallSource(github, catalogUrl, {
        name: "x",
        source: { source: "npm", name: "hello" },
      }),
    ).toBe("npm:hello");
  });

  it("builds a ref from a gh object source, trimming the subpath", () => {
    expect(
      resolveEntryInstallSource(github, catalogUrl, {
        name: "x",
        source: {
          source: "gh",
          repo: "acme/exts",
          path: "/packages/hello/",
          ref: "^2",
        },
      }),
    ).toBe("gh:acme/exts/packages/hello@^2");
    expect(
      resolveEntryInstallSource(github, catalogUrl, {
        name: "x",
        source: { source: "gh", repo: "acme/hello" },
      }),
    ).toBe("gh:acme/hello");
  });

  it("falls back to a resolved raw URL for relative/legacy sources", () => {
    expect(
      resolveEntryInstallSource(github, catalogUrl, {
        name: "x",
        source: "./hello",
      }),
    ).toBe("https://raw.githubusercontent.com/acme/repo/main/hello");
  });

  it("accepts npm and gh object sources in catalog validation", () => {
    const result = parseCatalog({
      name: "x",
      owner: { name: "y" },
      uiExtensions: [
        { name: "a", source: { source: "npm", name: "@acme/hello" } },
        { name: "b", source: { source: "gh", repo: "acme/exts", path: "p" } },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an npm object source without a name", () => {
    const result = parseCatalog({
      name: "x",
      owner: { name: "y" },
      uiExtensions: [{ name: "a", source: { source: "npm" } }],
    });
    expect(result.ok).toBe(false);
  });
});
