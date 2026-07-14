/**
 * A BundleSource that loads extension assets through the backend proxy endpoint.
 *
 * This is necessary for sources (like GitHub) where direct browser access fails
 * due to CSP restrictions. The proxy fetches content server-side and serves it
 * from the same origin, satisfying CSP `connect-src` policies.
 *
 * The proxy endpoint at `/api/extensions/proxy` accepts:
 *   - `source`: The resolved source ref (e.g., "github:owner/repo/path@sha")
 *   - `file`: The file path within the bundle (e.g., "extension.json")
 *
 * Example URL: `/api/extensions/proxy?source=gh:acme/repo@abc123&file=extension.json`
 */

import type { BundleSource } from "../loader";

/** Build the proxy endpoint URL for a given source and file. */
function buildProxyUrl(source: string, file: string): string {
  const cleanFile = file.replace(/^\/+/, "");
  const params = new URLSearchParams({ source, file: cleanFile });
  return `/api/extensions/proxy?${params}`;
}

/**
 * Create a BundleSource that loads assets through the backend proxy endpoint.
 *
 * @param source - The resolved source ref (e.g., "github:owner/repo/path@sha")
 * @returns A BundleSource that routes fetches through `/api/extensions/proxy`
 */
export function createProxiedBundleSource(source: string): BundleSource {
  return {
    readManifest: async () => {
      const url = buildProxyUrl(source, "extension.json");
      const response = await fetch(url);

      if (!response.ok) {
        const status = response.status;
        if (status === 404) {
          throw new Error(`Extension manifest not found at ${source}`);
        }
        if (status === 502) {
          throw new Error(`Failed to fetch extension from upstream: ${source}`);
        }
        if (status === 400) {
          throw new Error(`Invalid extension source: ${source}`);
        }
        throw new Error(`Failed to fetch manifest: HTTP ${status}`);
      }

      return response.json();
    },

    assetUrl: async (path: string) => buildProxyUrl(source, path),
  };
}
