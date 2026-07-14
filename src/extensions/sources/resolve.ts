/**
 * Resolve a {@link ExtensionSourceRef} to a concrete, immutable {@link ArtifactDescriptor}
 * and from there to a {@link BundleSource} the loader consumes.
 *
 * This is the single per-source seam in the install pipeline:
 *
 *   source string ──parse──▶ ExtensionSourceRef ──resolve──▶ ArtifactDescriptor ──acquire──▶ BundleSource ──▶ loadExtension
 *
 * `npm:` resolves via jsDelivr; `gh:` resolves via GitHub API (for branch/tag/SHA support
 * including slashed branch names) then loads through the parent-window asset relay (no
 * backend proxy needed); `url:` passes through unchanged. A future first-party registry
 * (`registry:`) is just another branch here that returns the same descriptor shape
 * (likely `format: "zip"` with an `integrity` hash) — the acquire/load stages do not change.
 */

import { createHttpBundleSource } from "../dev-bundle-source";
import type { BundleSource } from "../loader";
import { resolveGitHubRef, type GitHubResolverOptions } from "./github-api";
import { createRelayBundleSource } from "./relay-bundle-source";
import {
  formatSourceRef,
  parseSourceRef,
  type ExtensionSourceRef,
} from "./ref";
import { npmBaseUrl, resolveNpmVersion } from "./jsdelivr";

/** Read GitHub token from environment (browser-side via Vite). */
export function getGitHubToken(): string | undefined {
  // Vite replaces import.meta.env at build time; this is undefined in Node tests
  // unless explicitly provided.
  return typeof import.meta?.env !== "undefined"
    ? import.meta.env.VITE_GITHUB_TOKEN
    : undefined;
}

export interface ArtifactDescriptor {
  /** Canonical source ref string (persisted for re-install, updates, and display). */
  sourceRef: string;
  kind: ExtensionSourceRef["kind"];
  /** Resolved concrete version (npm/gh); `undefined` for raw `url` sources. */
  version?: string;
  /**
   * Base URL or source ref for the bundle.
   * - For `npm:` and `url:`: direct URL to the bundle directory
   * - For `gh:`: the resolved source ref to pass to the proxy (e.g., "github:owner/repo/path@sha")
   *
   * Use `toBundleSource()` to get the appropriate loader.
   */
  baseUrl: string;
  /**
   * Physical packaging. Only `"dir"` (loose files, the existing HTTP source) exists
   * today; `"zip"` is reserved for a first-party registry that ships single archives.
   */
  format: "dir";
  /**
   * Whether this source should be loaded through the backend proxy.
   * True for `gh:` (CSP prevents direct external loading), false for `npm:` (jsDelivr works
   * directly) and `url:` (user's responsibility).
   */
  requiresProxy: boolean;
}

type FetchLike = typeof fetch;

export interface ResolveOptions {
  /** Custom fetch implementation (for testing). */
  fetch?: FetchLike;
  /** GitHub token for private repos or higher rate limits. */
  githubToken?: string;
}

/** Resolve a parsed ref to an immutable artifact descriptor. */
export async function resolveSourceRef(
  ref: ExtensionSourceRef,
  fetchOrOptions?: FetchLike | ResolveOptions,
): Promise<ArtifactDescriptor> {
  // Normalize options for backward compatibility with (ref, fetch) signature
  const options: ResolveOptions =
    typeof fetchOrOptions === "function"
      ? { fetch: fetchOrOptions }
      : (fetchOrOptions ?? {});
  const fetchImpl = options.fetch ?? fetch;
  const githubToken = options.githubToken ?? getGitHubToken();

  const sourceRef = formatSourceRef(ref);
  switch (ref.kind) {
    case "npm": {
      // npm continues using jsDelivr directly — it has CORS and works directly
      const version = await resolveNpmVersion(ref.name, ref.range, fetchImpl);
      return {
        sourceRef,
        kind: "npm",
        version,
        baseUrl: npmBaseUrl(ref.name, version),
        format: "dir",
        requiresProxy: false,
      };
    }
    case "gh": {
      // Use GitHub API for resolution (handles branches with slashes, SHAs, tags)
      const ghOptions: GitHubResolverOptions = {
        fetch: fetchImpl,
        token: githubToken,
      };
      const resolved = await resolveGitHubRef(
        ref.owner,
        ref.repo,
        ref.range,
        ghOptions,
      );
      // Build the source ref that the asset relay will use to fetch from GitHub.
      const version = resolved.sha;
      const proxySourceRef = `github:${ref.owner}/${ref.repo}${
        ref.subpath ? `/${ref.subpath}` : ""
      }@${version}`;
      return {
        sourceRef,
        kind: "gh",
        version,
        // baseUrl is the proxy source ref, not a direct URL
        baseUrl: proxySourceRef,
        format: "dir",
        requiresProxy: true,
      };
    }
    case "url":
      // Raw URLs pass through unchanged — user's responsibility for CSP
      return {
        sourceRef,
        kind: "url",
        baseUrl: ref.baseUrl,
        format: "dir",
        requiresProxy: false,
      };
  }
}

/** Parse + resolve a source ref string in one step. */
export function resolveSource(
  input: string,
  fetchOrOptions?: FetchLike | ResolveOptions,
): Promise<ArtifactDescriptor> {
  return resolveSourceRef(parseSourceRef(input), fetchOrOptions);
}

/**
 * Turn a resolved descriptor into a {@link BundleSource} for the loader.
 * Routes to the appropriate source implementation based on the descriptor.
 */
export function toBundleSource(descriptor: ArtifactDescriptor): BundleSource {
  // Only the `dir` format exists today; a `zip` format would unpack + mint blob URLs.
  if (descriptor.requiresProxy) {
    // GitHub sources go through the parent-window asset relay (no backend proxy needed).
    // The relay fetches from GitHub in the parent window (no CSP restrictions) and
    // serves content to webviews via blob URLs.
    return createRelayBundleSource(descriptor.baseUrl);
  }
  // npm and url sources load directly via HTTP
  return createHttpBundleSource(descriptor.baseUrl);
}
