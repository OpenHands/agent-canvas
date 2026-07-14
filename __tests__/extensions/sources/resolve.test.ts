import { describe, it, expect, vi } from "vitest";
import {
  resolveSource,
  toBundleSource,
  getGitHubToken,
  type ArtifactDescriptor,
} from "#/extensions/sources/resolve";

/** Mock fetch for npm jsDelivr resolution */
function mockNpmResolvedFetch(version: string) {
  return vi.fn(
    async (url: string | URL) =>
      new Response(JSON.stringify({ version }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

/**
 * Create a mock fetch for GitHub API resolution.
 * Routes requests based on URL patterns.
 */
function mockGitHubApiFetch(
  responses: Map<
    string | RegExp,
    { status: number; body?: unknown; headers?: Record<string, string> }
  >,
) {
  return vi.fn(async (url: string | URL) => {
    const urlStr = String(url);
    for (const [pattern, response] of responses) {
      const matches =
        typeof pattern === "string"
          ? urlStr.includes(pattern)
          : pattern.test(urlStr);
      if (matches) {
        return new Response(
          response.body !== undefined ? JSON.stringify(response.body) : null,
          {
            status: response.status,
            headers: {
              "content-type": "application/json",
              ...response.headers,
            },
          },
        );
      }
    }
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

describe("resolveSource", () => {
  describe("npm resolution (jsDelivr)", () => {
    it("resolves an npm ref to a pinned jsDelivr base URL", async () => {
      const fetchImpl = mockNpmResolvedFetch("1.4.2");
      const descriptor = await resolveSource("npm:@acme/hello@^1", fetchImpl);

      expect(descriptor).toEqual({
        sourceRef: "npm:@acme/hello@^1",
        kind: "npm",
        version: "1.4.2",
        baseUrl: "https://cdn.jsdelivr.net/npm/@acme/hello@1.4.2",
        format: "dir",
        requiresProxy: false,
      });
      const calledUrl = String(
        (fetchImpl as never as { mock: { calls: string[][] } }).mock.calls[0][0],
      );
      expect(calledUrl).toContain(
        "data.jsdelivr.com/v1/packages/npm/@acme/hello/resolved",
      );
      expect(calledUrl).toContain("specifier=%5E1");
    });

    it("defaults to latest (specifier=*) when no range is given", async () => {
      const fetchImpl = mockNpmResolvedFetch("9.9.9");
      await resolveSource("npm:hello", fetchImpl);
      const calledUrl = String(
        (fetchImpl as never as { mock: { calls: string[][] } }).mock.calls[0][0],
      );
      expect(calledUrl).toContain("specifier=*");
    });

    it("surfaces a clear error when no version satisfies the range", async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(JSON.stringify({ version: null }), { status: 200 }),
      ) as unknown as typeof fetch;
      await expect(resolveSource("npm:hello@^99", fetchImpl)).rejects.toThrow(
        /no version of npm:hello satisfies/,
      );
    });
  });

  describe("gh resolution (GitHub API)", () => {
    it("resolves a gh ref using GitHub API, returns proxy source ref", async () => {
      const sha = "abc123def456789012345678901234567890abcd";
      const fetchImpl = mockGitHubApiFetch(
        new Map([
          [
            "/git/ref/heads/main",
            { status: 200, body: { object: { sha, type: "commit" } } },
          ],
        ]),
      );

      const descriptor = await resolveSource("gh:acme/exts@main", fetchImpl);

      expect(descriptor).toEqual({
        sourceRef: "github:acme/exts@main",
        kind: "gh",
        version: sha,
        // baseUrl is now a proxy source ref, not a jsDelivr URL
        baseUrl: `github:acme/exts@${sha}`,
        format: "dir",
        requiresProxy: true,
      });
    });

    it("resolves a gh monorepo ref, pinning the SHA and keeping the subpath", async () => {
      const sha = "fedcba9876543210fedcba9876543210fedcba98";
      const fetchImpl = mockGitHubApiFetch(
        new Map([
          [
            "/git/ref/heads/main",
            { status: 200, body: { object: { sha, type: "commit" } } },
          ],
        ]),
      );

      const descriptor = await resolveSource(
        "gh:acme/exts/packages/hello@main",
        fetchImpl,
      );

      expect(descriptor).toEqual({
        sourceRef: "github:acme/exts/packages/hello@main",
        kind: "gh",
        version: sha,
        // baseUrl includes the subpath for the proxy
        baseUrl: `github:acme/exts/packages/hello@${sha}`,
        format: "dir",
        requiresProxy: true,
      });
    });

    it("resolves a gh ref with a slashed branch name (main motivation)", async () => {
      const sha = "1234567890abcdef1234567890abcdef12345678";
      const fetchImpl = mockGitHubApiFetch(
        new Map([
          [
            // Note: slashes in branch names are URL-encoded as %2F
            "/git/ref/heads/feature%2Fui%2Fextensions",
            { status: 200, body: { object: { sha, type: "commit" } } },
          ],
        ]),
      );

      const descriptor = await resolveSource(
        "gh:acme/exts@feature/ui/extensions",
        fetchImpl,
      );

      expect(descriptor).toEqual({
        sourceRef: "github:acme/exts@feature/ui/extensions",
        kind: "gh",
        version: sha,
        baseUrl: `github:acme/exts@${sha}`,
        format: "dir",
        requiresProxy: true,
      });

      // Verify the GitHub API was called with the correct encoded branch name
      const calledUrl = String(
        (fetchImpl as never as { mock: { calls: string[][] } }).mock.calls[0][0],
      );
      expect(calledUrl).toContain("feature%2Fui%2Fextensions");
    });

    it("resolves to default branch when no range is given", async () => {
      const sha = "defaultbranchsha123456789012345678901234";
      const fetchImpl = mockGitHubApiFetch(
        new Map<string | RegExp, { status: number; body?: unknown }>([
          [
            /\/repos\/acme\/exts$/,
            { status: 200, body: { default_branch: "main" } },
          ],
          [
            "/git/ref/heads/main",
            { status: 200, body: { object: { sha, type: "commit" } } },
          ],
        ]),
      );

      const descriptor = await resolveSource("gh:acme/exts", fetchImpl);

      expect(descriptor.kind).toBe("gh");
      expect(descriptor.version).toBe(sha);
      expect(descriptor.requiresProxy).toBe(true);
    });

    it("resolves a tag ref", async () => {
      const sha = "tagsha1234567890123456789012345678901234";
      const fetchImpl = mockGitHubApiFetch(
        new Map([
          ["/git/ref/heads/v1.0.0", { status: 404 }],
          [
            "/git/ref/tags/v1.0.0",
            { status: 200, body: { object: { sha, type: "commit" } } },
          ],
        ]),
      );

      const descriptor = await resolveSource("gh:acme/exts@v1.0.0", fetchImpl);

      expect(descriptor).toEqual({
        sourceRef: "github:acme/exts@v1.0.0",
        kind: "gh",
        version: sha,
        baseUrl: `github:acme/exts@${sha}`,
        format: "dir",
        requiresProxy: true,
      });
    });

    it("resolves a commit SHA ref", async () => {
      const sha = "abcdef1234567890abcdef1234567890abcdef12";
      const fetchImpl = mockGitHubApiFetch(
        new Map([
          [
            `/git/commits/${sha}`,
            { status: 200, body: { sha } },
          ],
        ]),
      );

      const descriptor = await resolveSource(`gh:acme/exts@${sha}`, fetchImpl);

      expect(descriptor).toEqual({
        sourceRef: `github:acme/exts@${sha}`,
        kind: "gh",
        version: sha,
        baseUrl: `github:acme/exts@${sha}`,
        format: "dir",
        requiresProxy: true,
      });
    });

    it("passes GitHub token via options", async () => {
      const sha = "authedsha1234567890123456789012345678901";
      const fetchImpl = mockGitHubApiFetch(
        new Map([
          [
            "/git/ref/heads/main",
            { status: 200, body: { object: { sha, type: "commit" } } },
          ],
        ]),
      );

      await resolveSource("gh:acme/private@main", {
        fetch: fetchImpl,
        githubToken: "ghp_testtoken123",
      });

      const call = fetchImpl.mock.calls[0] as [string, { headers: HeadersInit }];
      const headers = call[1].headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer ghp_testtoken123");
    });

    it("surfaces clear error for non-existent ref", async () => {
      const fetchImpl = mockGitHubApiFetch(
        new Map([
          ["/git/ref/heads/nonexistent", { status: 404 }],
          ["/git/ref/tags/nonexistent", { status: 404 }],
        ]),
      );

      await expect(
        resolveSource("gh:acme/exts@nonexistent", fetchImpl),
      ).rejects.toThrow(/Could not resolve ref "nonexistent"/);
    });
  });

  describe("url resolution (passthrough)", () => {
    it("passes raw url sources through without a network call", async () => {
      const fetchImpl = vi.fn();
      const descriptor = await resolveSource(
        "https://cdn.example.com/ext/",
        fetchImpl as unknown as typeof fetch,
      );
      expect(descriptor).toEqual({
        sourceRef: "https://cdn.example.com/ext",
        kind: "url",
        baseUrl: "https://cdn.example.com/ext",
        format: "dir",
        requiresProxy: false,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });
});

describe("getGitHubToken", () => {
  it("returns undefined when import.meta.env is not available", () => {
    // In Node test environment, import.meta.env.VITE_GITHUB_TOKEN is typically undefined
    const token = getGitHubToken();
    expect(token).toBeUndefined();
  });
});

describe("toBundleSource", () => {
  it("builds an HTTP bundle source for npm (direct loading)", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe(
        "https://cdn.jsdelivr.net/npm/hello@1.0.0/extension.json",
      );
      return new Response(JSON.stringify({ id: "acme.hello" }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    try {
      const source = toBundleSource({
        sourceRef: "npm:hello",
        kind: "npm",
        version: "1.0.0",
        baseUrl: "https://cdn.jsdelivr.net/npm/hello@1.0.0",
        format: "dir",
        requiresProxy: false,
      });
      await expect(source.readManifest()).resolves.toEqual({
        id: "acme.hello",
      });
      await expect(source.assetUrl("main.js")).resolves.toBe(
        "https://cdn.jsdelivr.net/npm/hello@1.0.0/main.js",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("builds a relay bundle source for gh (asset relay loading)", async () => {
    const sha = "abc123def456789012345678901234567890abcd";
    const fetchImpl = vi.fn(async (url: string | URL) => {
      // The relay fetches from raw.githubusercontent.com
      const urlStr = String(url);
      expect(urlStr).toContain("raw.githubusercontent.com");
      expect(urlStr).toContain("acme/repo");
      expect(urlStr).toContain(sha);
      return new Response(JSON.stringify({ id: "acme.repo" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchImpl);
    try {
      const source = toBundleSource({
        sourceRef: "github:acme/repo@main",
        kind: "gh",
        version: sha,
        baseUrl: `github:acme/repo@${sha}`,
        format: "dir",
        requiresProxy: true,
      });
      await expect(source.readManifest()).resolves.toEqual({
        id: "acme.repo",
      });
      // Asset URL should be a blob URL (created by AssetLoader)
      const assetUrl = await source.assetUrl("main.js");
      expect(assetUrl).toMatch(/^blob:/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
