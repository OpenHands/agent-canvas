import { describe, expect, it, vi } from "vitest";
import { fetchMarketplace } from "#/extensions/marketplace/client";

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as Response;
}

const CATALOG = {
  name: "Examples",
  owner: { name: "Acme" },
  // A regular agent plugin must NOT surface as a UI extension.
  plugins: [{ name: "linter", source: "./linter", commands: "./commands" }],
  uiExtensions: [
    {
      name: "hello-sidebar",
      source: "./hello-sidebar",
      description: "Hello panel",
      version: "1.0.0",
      author: { name: "Acme" },
    },
    {
      name: "versioned-npm",
      source: "npm:@acme/hello@^1",
      version: "1.2.0",
    },
    {
      name: "versioned-gh",
      source: {
        source: "gh",
        repo: "acme/exts",
        path: "packages/hello",
        ref: "^2",
      },
    },
  ],
};

describe("fetchMarketplace", () => {
  it("falls back from .plugin to .claude-plugin and lists UI extensions", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, false, 404))
      .mockResolvedValueOnce(jsonResponse(CATALOG));

    const result = await fetchMarketplace("github://acme/repo", fetchImpl);

    expect(fetchImpl.mock.calls[0][0]).toContain(".plugin/marketplace.json");
    expect(fetchImpl.mock.calls[1][0]).toContain(
      ".claude-plugin/marketplace.json",
    );
    expect(result.catalogName).toBe("Examples");
    expect(result.listings).toEqual([
      {
        name: "hello-sidebar",
        description: "Hello panel",
        version: "1.0.0",
        author: "Acme",
        homepage: undefined,
        installSource:
          "https://raw.githubusercontent.com/acme/repo/main/hello-sidebar",
      },
      {
        name: "versioned-npm",
        description: undefined,
        version: "1.2.0",
        author: undefined,
        homepage: undefined,
        installSource: "npm:@acme/hello@^1",
      },
      {
        name: "versioned-gh",
        description: undefined,
        version: undefined,
        author: undefined,
        homepage: undefined,
        installSource: "gh:acme/exts/packages/hello@^2",
      },
    ]);
  });

  it("throws when no catalog is found", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(null, false, 404));
    await expect(
      fetchMarketplace("github://acme/repo", fetchImpl),
    ).rejects.toThrow(/no marketplace catalog found/);
  });

  it("throws on an invalid catalog", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ name: "x", plugins: [] }));
    await expect(
      fetchMarketplace("https://cdn.example/c.json", fetchImpl),
    ).rejects.toThrow(/invalid marketplace catalog/);
  });
});
