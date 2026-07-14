/**
 * Extension **source refs**: a compact, distribution-agnostic way to name *which*
 * extension to install and at *what* version, independent of where the bytes live.
 *
 * Supported forms (see `docs/extensions/ARCHITECTURE.md` § Source Resolution Pipeline):
 * - `npm:<pkg>[@<range>]`         e.g. `npm:@acme/hello@^1` — an npm package (per-package
 *                                 versioning; the natural fit for monorepos)
 * - `github:<owner>/<repo>[/<subpath>][@<range>]`  e.g.
 *                                 `github:acme/exts/packages/hello@^1` — a GitHub repo at
 *                                 a ref; the optional `<subpath>` selects one extension
 *                                 inside a monorepo. `gh:` and `github://` are accepted as
 *                                 silent parser-only aliases, normalized to `github:`.
 * - `https://…` / `http://…`     a raw bundle **directory** URL (dev / self-hosted),
 *                                 served as loose files with correct MIME + CORS
 *
 * A ref with no `<subpath>` resolves to the package/repo root — the zero-config default.
 * The manifest filename is always `extension.json`; the subpath only selects a
 * directory, it is never threaded through the loader.
 *
 * This is the single home for GitHub scheme parsing (see {@link splitGithubScheme} and
 * {@link parseGithubShorthand}); the marketplace parser, the catalog, and the asset
 * relay all funnel through the helpers here so there is exactly one grammar.
 *
 * The scheme token (`github:`/`gh:`/`github://`) is matched **case-insensitively** — a
 * mobile keyboard or browser autocapitalization turning `github:` into `GitHub:` should
 * not misclassify the ref — but only the scheme token is normalized; the owner/repo,
 * ref, and subpath remainder is preserved verbatim because those are case-sensitive.
 * This mirrors the canonical Python parser in `software-agent-sdk`
 * (`openhands/sdk/extensions/fetch.py::parse_extension_source`); the shared
 * input→output cases live in `github-source-fixtures.json`.
 *
 * Resolution to a concrete, immutable artifact (and to a `BundleSource`) lives in
 * `resolve.ts`; this module is pure parsing/formatting so it stays trivially testable.
 */

export interface NpmSourceRef {
  kind: "npm";
  /** Package name, including an `@scope/` prefix when scoped. */
  name: string;
  /** Optional semver range/tag; defaults to latest when omitted. */
  range?: string;
}

export interface GithubSourceRef {
  kind: "gh";
  owner: string;
  repo: string;
  /** Optional directory within the repo (for monorepos). */
  subpath?: string;
  /** Optional semver range/tag; defaults to latest when omitted. */
  range?: string;
}

export interface UrlSourceRef {
  kind: "url";
  /** Raw base URL of the bundle directory (no trailing slash). */
  baseUrl: string;
}

export type ExtensionSourceRef = NpmSourceRef | GithubSourceRef | UrlSourceRef;

const NPM_NAME_PATTERN =
  /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;

/** The canonical GitHub scheme shown to users; `gh`/`github://` are parser-only aliases. */
export const CANONICAL_GITHUB_SCHEME = "github:";

/**
 * GitHub scheme aliases, longest first so `github://` wins over `github:`. Each is
 * matched case-insensitively against the leading scheme token only.
 */
const GITHUB_SCHEME_ALIASES = ["github://", "github:", "gh:"] as const;

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * If `input` begins with a GitHub scheme alias (`github:`, `gh:`, or `github://`),
 * return the remainder **with its case preserved**; otherwise return `null`.
 *
 * The scheme token is matched case-insensitively (so `GitHub:owner/repo` is recognized)
 * but nothing after it is lowercased — owner/repo/ref/subpath are all case-sensitive.
 * This is the single choke point for GitHub scheme aliasing across the codebase.
 */
export function splitGithubScheme(input: string): string | null {
  const trimmed = input.trimStart();
  for (const alias of GITHUB_SCHEME_ALIASES) {
    if (trimmed.slice(0, alias.length).toLowerCase() === alias) {
      return trimmed.slice(alias.length);
    }
  }
  return null;
}

function parseNpmRef(spec: string): NpmSourceRef {
  // Split off an optional `@range`. For scoped packages the leading `@scope` `@` must
  // not be mistaken for the range separator, so search past index 0.
  const at = spec.indexOf("@", spec.startsWith("@") ? 1 : 0);
  const name = at === -1 ? spec : spec.slice(0, at);
  const range = at === -1 ? undefined : spec.slice(at + 1).trim() || undefined;
  if (!NPM_NAME_PATTERN.test(name)) {
    throw new Error(
      `invalid npm extension source "npm:${spec}": expected npm:<package>[@<range>]`,
    );
  }
  return { kind: "npm", name, range };
}

/**
 * A parsed GitHub shorthand: exactly `owner` and `repo`, with case preserved.
 */
export interface GithubShorthand {
  owner: string;
  repo: string;
}

/**
 * Strict GitHub shorthand parser matching the canonical `software-agent-sdk` grammar:
 * `github:owner/repo` (or the `gh:`/`github://` aliases) with **exactly one slash** and
 * no packed subpath or `@ref`. Rejects anything else (this is the row that mirrors the
 * SDK's `test_parse_github_shorthand_invalid_format`).
 *
 * Returns `null` when the input is not a GitHub scheme at all, so callers can fall
 * through to other source kinds; throws when it *is* a GitHub scheme but malformed.
 */
export function parseGithubShorthand(input: string): GithubShorthand | null {
  const remainder = splitGithubScheme(input);
  if (remainder === null) return null;
  const repoPath = stripTrailingSlashes(remainder.trim());
  const segments = repoPath.split("/");
  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    throw new Error(
      `invalid GitHub shorthand "${input.trim()}": expected ${CANONICAL_GITHUB_SCHEME}<owner>/<repo>`,
    );
  }
  return { owner: segments[0], repo: segments[1].replace(/\.git$/, "") };
}

/** Normalize a GitHub shorthand to the canonical clone URL (SDK parity). */
export function githubShorthandUrl(shorthand: GithubShorthand): string {
  return `https://github.com/${shorthand.owner}/${shorthand.repo}.git`;
}

/**
 * Parse the remainder after a GitHub scheme into the agent-canvas superset ref, which
 * additionally supports a monorepo `/<subpath>` and an `@<range>`. This superset is only
 * ever produced internally (resolved proxy refs, marketplace-generated install sources,
 * and persisted `sourceRef`s that round-trip through {@link formatSourceRef}); the
 * user-facing grammar shown in the UI stays the strict {@link parseGithubShorthand}.
 */
function parseGithubSupersetRemainder(
  remainder: string,
  original: string,
): GithubSourceRef {
  const spec = remainder.trim();
  // GitHub superset refs have no leading `@`, so the last `@` (if any) is the range.
  const at = spec.lastIndexOf("@");
  const pathPart = at > 0 ? spec.slice(0, at) : spec;
  const range = at > 0 ? spec.slice(at + 1).trim() || undefined : undefined;
  const segments = stripTrailingSlashes(pathPart).split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error(
      `invalid GitHub extension source "${original.trim()}": expected ` +
        `${CANONICAL_GITHUB_SCHEME}<owner>/<repo>[/<subpath>][@<range>]`,
    );
  }
  const [owner, repo, ...rest] = segments;
  return {
    kind: "gh",
    owner,
    repo: repo.replace(/\.git$/, ""),
    subpath: rest.length > 0 ? rest.join("/") : undefined,
    range,
  };
}

/**
 * Parse a source ref string into a structured {@link ExtensionSourceRef}.
 * Throws with actionable guidance on an unrecognized form.
 */
export function parseSourceRef(input: string): ExtensionSourceRef {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("empty extension source");

  if (trimmed.startsWith("npm:")) return parseNpmRef(trimmed.slice(4));

  const githubRemainder = splitGithubScheme(trimmed);
  if (githubRemainder !== null) {
    return parseGithubSupersetRemainder(githubRemainder, trimmed);
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return { kind: "url", baseUrl: stripTrailingSlashes(trimmed) };
  }

  throw new Error(
    `unsupported extension source "${input}": use npm:<package>, ` +
      `${CANONICAL_GITHUB_SCHEME}<owner>/<repo>[/<subpath>], or an https:// bundle URL`,
  );
}

/** Render a ref back to its canonical string form (for persistence/display). */
export function formatSourceRef(ref: ExtensionSourceRef): string {
  switch (ref.kind) {
    case "npm":
      return `npm:${ref.name}${ref.range ? `@${ref.range}` : ""}`;
    case "gh":
      return `${CANONICAL_GITHUB_SCHEME}${ref.owner}/${ref.repo}${
        ref.subpath ? `/${ref.subpath}` : ""
      }${ref.range ? `@${ref.range}` : ""}`;
    case "url":
      return ref.baseUrl;
  }
}
