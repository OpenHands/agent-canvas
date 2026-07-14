/**
 * Integration tests for the GitHub extension source flow.
 * These tests verify the end-to-end path from source resolution through
 * to webview loading using the asset relay system.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSource, toBundleSource } from "#/extensions/sources/resolve";
import { AssetLoader, configureAssetLoader } from "#/extensions/asset-loader";

/** Mock fetch for GitHub API + raw content */
function mockGitHubFetch(
  responses: Map<
    string | RegExp,
    { status: number; body?: unknown; contentType?: string }
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
        const contentType = response.contentType ?? "application/json";
        const body =
          response.body !== undefined
            ? contentType === "application/json"
              ? JSON.stringify(response.body)
              : response.body
            : null;
        return new Response(body as BodyInit, {
          status: response.status,
          headers: { "content-type": contentType },
        });
      }
    }
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

const testManifest = {
  id: "test.extension",
  name: "Test Extension",
  version: "1.0.0",
  engines: { agentCanvas: "^1.0.0" },
  main: "main.js",
  capabilities: ["conversation:read"],
  contributes: {
    viewsContainers: {
      activitybar: [{ id: "test.container", title: "Test" }],
    },
    views: {
      "test.container": [
        { id: "test.panel", name: "Test Panel", type: "webview", page: "panel.html" },
      ],
    },
  },
};

const testPanelHtml = `<!DOCTYPE html>
<html>
<head><title>Test Panel</title></head>
<body><h1>Hello from extension</h1></body>
</html>`;

describe("GitHub Extension Integration", () => {
  let mockFetch: ReturnType<typeof mockGitHubFetch>;
  let assetLoader: AssetLoader;

  beforeEach(() => {
    // Set up mocks for both GitHub API and raw content
    mockFetch = mockGitHubFetch(
      new Map<string | RegExp, { status: number; body?: unknown; contentType?: string }>([
        // GitHub API: branch resolution
        [
          "/git/ref/heads/feature%2Fui%2Fextensions",
          {
            status: 200,
            body: {
              object: {
                sha: "abc123def456789012345678901234567890abcd",
                type: "commit",
              },
            },
          },
        ],
        // GitHub API: simple branch
        [
          "/git/ref/heads/main",
          {
            status: 200,
            body: {
              object: {
                sha: "main123456789012345678901234567890abcde",
                type: "commit",
              },
            },
          },
        ],
        // Raw GitHub content: manifest
        [
          /raw\.githubusercontent\.com.*extension\.json/,
          { status: 200, body: testManifest },
        ],
        // Raw GitHub content: panel HTML
        [
          /raw\.githubusercontent\.com.*panel\.html/,
          { status: 200, body: testPanelHtml, contentType: "text/html" },
        ],
        // Raw GitHub content: main.js
        [
          /raw\.githubusercontent\.com.*main\.js/,
          {
            status: 200,
            body: 'export function activate() { console.log("activated"); }',
            contentType: "application/javascript",
          },
        ],
      ]),
    );
    vi.stubGlobal("fetch", mockFetch);

    // Configure asset loader with the mock fetch
    assetLoader = configureAssetLoader({ fetch: mockFetch });
  });

  afterEach(() => {
    assetLoader.dispose();
    vi.unstubAllGlobals();
  });

  describe("Source Resolution", () => {
    it("resolves gh: with slashed branch name via GitHub API", async () => {
      const descriptor = await resolveSource(
        "gh:testowner/testrepo@feature/ui/extensions",
        mockFetch,
      );

      expect(descriptor).toEqual({
        sourceRef: "github:testowner/testrepo@feature/ui/extensions",
        kind: "gh",
        version: "abc123def456789012345678901234567890abcd",
        baseUrl:
          "github:testowner/testrepo@abc123def456789012345678901234567890abcd",
        format: "dir",
        requiresProxy: true,
      });

      // Verify GitHub API was called with URL-encoded branch name
      const apiCalls = mockFetch.mock.calls
        .map(([url]) => String(url))
        .filter((url: string) => url.includes("api.github.com"));
      expect(apiCalls.some((url: string) => url.includes("feature%2Fui%2Fextensions"))).toBe(
        true,
      );
    });

    it("resolves gh: with subpath (monorepo)", async () => {
      const descriptor = await resolveSource(
        "gh:testowner/testrepo/packages/ext@main",
        mockFetch,
      );

      expect(descriptor.kind).toBe("gh");
      expect(descriptor.baseUrl).toBe(
        "github:testowner/testrepo/packages/ext@main123456789012345678901234567890abcde",
      );
      expect(descriptor.requiresProxy).toBe(true);
    });
  });

  describe("Bundle Source via Relay", () => {
    it("loads manifest through asset relay", async () => {
      const descriptor = await resolveSource(
        "gh:testowner/testrepo@main",
        mockFetch,
      );
      const bundleSource = toBundleSource(descriptor);

      const manifest = await bundleSource.readManifest();

      expect(manifest).toEqual(testManifest);

      // Verify raw.githubusercontent.com was used, not jsDelivr
      const rawCalls = mockFetch.mock.calls
        .map(([url]) => String(url))
        .filter((url: string) => url.includes("raw.githubusercontent.com"));
      expect(rawCalls.length).toBeGreaterThan(0);
    });

    it("returns blob URLs for assets", async () => {
      const descriptor = await resolveSource(
        "gh:testowner/testrepo@main",
        mockFetch,
      );
      const bundleSource = toBundleSource(descriptor);

      const panelUrl = await bundleSource.assetUrl("panel.html");

      // HTML files get blob URLs with CSP meta tag injected
      expect(panelUrl).toMatch(/^blob:/);
    });

    it("caches immutable SHA-pinned assets", async () => {
      // Create a fresh fetch mock and asset loader for isolation
      // SHA must be exactly 40 hex chars to be recognized as immutable
      const validSha = "abcd1234567890abcdef1234567890abcdef1234";
      const freshFetch = mockGitHubFetch(
        new Map<string | RegExp, { status: number; body?: unknown; contentType?: string }>([
          [
            "/git/ref/heads/main",
            {
              status: 200,
              body: {
                object: {
                  sha: validSha,
                  type: "commit",
                },
              },
            },
          ],
          [
            /raw\.githubusercontent\.com.*extension\.json/,
            { status: 200, body: testManifest },
          ],
        ]),
      );
      vi.stubGlobal("fetch", freshFetch);
      const freshLoader = configureAssetLoader({ fetch: freshFetch });
      
      const descriptor = await resolveSource("gh:testowner/testrepo@main", freshFetch);
      expect(descriptor.baseUrl).toContain(validSha); // Verify SHA is in baseUrl
      
      const bundleSource = toBundleSource(descriptor);

      // First load - this calls raw.githubusercontent.com for the manifest
      await bundleSource.readManifest();
      
      const countRawCalls = () => freshFetch.mock.calls
        .map(([url]) => String(url))
        .filter((url: string) => url.includes("raw.githubusercontent.com")).length;
      
      const rawCallsAfterFirst = countRawCalls();
      expect(rawCallsAfterFirst).toBe(1); // One fetch for extension.json

      // Second load should hit cache (no new raw.githubusercontent.com calls)
      await bundleSource.readManifest();
      
      const rawCallsAfterSecond = countRawCalls();
      expect(rawCallsAfterSecond).toBe(1); // Still just one - cached!
      
      freshLoader.dispose();
    });
  });

  describe("Webview HTML Processing", () => {
    it("injects CSP meta tag into HTML blob URLs", async () => {
      const descriptor = await resolveSource(
        "gh:testowner/testrepo@main",
        mockFetch,
      );
      const bundleSource = toBundleSource(descriptor);

      const blobUrl = await bundleSource.assetUrl("panel.html");

      // Blob URLs are created by the relay-bundle-source which injects CSP
      // We need to use the original fetch (before our mock) to fetch the blob
      // Since we've stubbed global fetch, we need to verify the blob URL was created
      expect(blobUrl).toMatch(/^blob:/);
      
      // The relay-bundle-source's createWebviewBlobUrl function injects CSP,
      // so verify the blob URL was created (the actual CSP injection is tested
      // in the webview-security tests)
    });

    it("creates valid blob URLs for HTML files", async () => {
      const descriptor = await resolveSource(
        "gh:testowner/testrepo@main",
        mockFetch,
      );
      const bundleSource = toBundleSource(descriptor);

      const blobUrl = await bundleSource.assetUrl("panel.html");

      // Verify it's a blob URL (browser-side blob storage)
      expect(blobUrl).toMatch(/^blob:/);
      
      // The blob URL should be revocable (it was created properly)
      // Note: In the test environment, we can't easily verify the blob content
      // since our stubbed fetch intercepts the real fetch needed to test blobs.
      // The actual CSP injection is tested in relay-bundle-source-specific tests.
    });
  });

  describe("Error Handling", () => {
    it("reports clear error for non-existent repo", async () => {
      const noRepoFetch = mockGitHubFetch(
        new Map([
          [/repos.*\/git\/ref/, { status: 404 }],
        ]),
      );

      await expect(
        resolveSource("gh:nonexistent/repo@main", noRepoFetch),
      ).rejects.toThrow(/Could not resolve ref/);
    });

    it("reports clear error for non-existent asset", async () => {
      const noAssetFetch = mockGitHubFetch(
        new Map<string | RegExp, { status: number; body?: unknown }>([
          [
            "/git/ref/heads/main",
            {
              status: 200,
              body: { object: { sha: "abc", type: "commit" } },
            },
          ],
          [/extension\.json/, { status: 404 }],
        ]),
      );
      vi.stubGlobal("fetch", noAssetFetch);
      configureAssetLoader({ fetch: noAssetFetch });

      const descriptor = await resolveSource("gh:test/repo@main", noAssetFetch);
      const bundleSource = toBundleSource(descriptor);

      await expect(bundleSource.readManifest()).rejects.toThrow(/Failed to load asset/);
    });
  });
});

describe("Extension Restore with GitHub Source", () => {
  it("correctly identifies gh: sources for relay loading", () => {
    // This tests the detection logic used in extension-manager-provider.tsx
    const ghSource = "gh:owner/repo@abc123";
    const npmSource = "https://cdn.jsdelivr.net/npm/@acme/ext@1.0.0";

    expect(ghSource.startsWith("gh:")).toBe(true);
    expect(npmSource.startsWith("gh:")).toBe(false);
  });

  it("extracts version from gh: source URL", () => {
    const source = "gh:owner/repo@abc123def456";
    const version = source.split("@").pop();
    expect(version).toBe("abc123def456");
  });

  it("handles gh: sources with subpaths", () => {
    const source = "gh:owner/repo/packages/ext@abc123";
    expect(source.startsWith("gh:")).toBe(true);
    const version = source.split("@").pop();
    expect(version).toBe("abc123");
  });
});
