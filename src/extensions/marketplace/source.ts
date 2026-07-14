/**
 * Parsing and URL-building for marketplace / git sources, mirroring the OpenHands
 * conventions (`software-agent-sdk` + `Plugin-Directory`):
 *
 * - Source URIs: `github:owner/repo[@ref]` (canonical; `gh:`/`github://` are accepted
 *   aliases), the `owner/repo[@ref]` shorthand, a `github.com` web URL, or a direct
 *   `https://…` catalog URL.
 * - The marketplace manifest lives at `.plugin/marketplace.json` (preferred) or
 *   `.claude-plugin/marketplace.json` (Claude-compatible) at the repo root.
 *
 * GitHub scheme detection funnels through {@link splitGithubScheme} in `../sources/ref`
 * so there is exactly one grammar (case-insensitive scheme token, `gh:`/`github://`
 * aliases). Everything is fetched over HTTPS from `raw.githubusercontent.com` (which
 * serves `Access-Control-Allow-Origin: *`), so no git clone or backend is required for
 * public repositories.
 */

import { splitGithubScheme } from "../sources/ref";

const DEFAULT_REF = "main";

/** Manifest paths tried in order; `.plugin` is OpenHands-native, `.claude-plugin` is the Claude-compatible fallback. */
export const MARKETPLACE_MANIFEST_PATHS = [
  ".plugin/marketplace.json",
  ".claude-plugin/marketplace.json",
] as const;

export interface GithubSource {
  kind: "github";
  owner: string;
  repo: string;
  ref: string;
}

export interface UrlSource {
  kind: "url";
  url: string;
}

export type MarketplaceSource = GithubSource | UrlSource;

function parseOwnerRepoRef(spec: string): GithubSource {
  const [repoPart, ref] = spec.split("@", 2);
  const segments = repoPart.replace(/\/+$/, "").split("/");
  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    throw new Error(
      `invalid GitHub source "${spec}": expected "owner/repo" or "owner/repo@ref"`,
    );
  }
  return {
    kind: "github",
    owner: segments[0],
    repo: segments[1].replace(/\.git$/, ""),
    ref: ref || DEFAULT_REF,
  };
}

/**
 * Parse a marketplace source string into a structured source.
 * Accepts `github:owner/repo[@ref]` (canonical; `gh:`/`github://` aliases),
 * `owner/repo[@ref]`, a `github.com` URL, or a direct `https://…` URL to a catalog JSON.
 */
export function parseMarketplaceSource(raw: string): MarketplaceSource {
  const input = raw.trim();
  if (!input) throw new Error("empty marketplace source");

  const githubRemainder = splitGithubScheme(input);
  if (githubRemainder !== null) {
    return parseOwnerRepoRef(githubRemainder);
  }

  if (input.startsWith("http://") || input.startsWith("https://")) {
    const github = githubUrlToSource(input);
    return github ?? { kind: "url", url: input };
  }

  // Bare "owner/repo[@ref]" shorthand (no scheme, single slash segment count of 2).
  if (!input.includes("://") && input.split("/").length === 2) {
    return parseOwnerRepoRef(input);
  }

  throw new Error(
    `unsupported marketplace source "${raw}": use github:owner/repo, owner/repo, a github.com URL, or an https:// catalog URL`,
  );
}

/**
 * Convert a `github.com` web URL (optionally `/tree/<ref>/<path>`) into a GithubSource.
 * Returns null for non-github URLs. The optional `path` is exposed via {@link githubUrlPath}.
 */
export function githubUrlToSource(url: string): GithubSource | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "github.com") return null;
  const parts = parsed.pathname.replace(/^\/+/, "").split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");
  // .../tree/<ref>/<path...>
  const ref = parts[2] === "tree" && parts[3] ? parts[3] : DEFAULT_REF;
  return { kind: "github", owner, repo, ref };
}

/** Extract the subdirectory path from a `github.com/.../tree/<ref>/<path>` URL, if any. */
export function githubUrlPath(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.hostname !== "github.com") return undefined;
  const parts = parsed.pathname.replace(/^\/+/, "").split("/");
  if (parts[2] === "tree" && parts.length > 4) {
    return parts.slice(4).join("/");
  }
  return undefined;
}

/** Build a `raw.githubusercontent.com` URL for a path within a repo (no leading/trailing slash issues). */
export function rawGithubUrl(source: GithubSource, path: string): string {
  const clean = path.replace(/^\/+/, "").replace(/\/+$/, "");
  const base = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.ref}`;
  return clean ? `${base}/${clean}` : base;
}

/** Candidate catalog URLs to try, in order, for a marketplace source. */
export function marketplaceCatalogCandidates(
  source: MarketplaceSource,
): string[] {
  if (source.kind === "url") return [source.url];
  return MARKETPLACE_MANIFEST_PATHS.map((path) => rawGithubUrl(source, path));
}
