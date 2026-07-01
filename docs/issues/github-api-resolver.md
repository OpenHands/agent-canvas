# GitHub API Resolver for Extension Sources

**Status:** Proposed  
**Component:** `src/extensions/sources/`  
**Related:** Extension Proxy Endpoint, Source Resolution Updates

---

## Problem Statement

The current `gh:` extension source resolver relies on jsDelivr's version resolution API
(`data.jsdelivr.com/v1/packages/gh/{owner}/{repo}/resolved?specifier={range}`), which has
significant limitations:

### 1. Branch Names with Slashes Fail

jsDelivr's API returns HTTP 500 for branch names containing slashes:

```
# Works
gh:owner/repo@v1.0.0
gh:owner/repo@main

# Fails with HTTP 500
gh:owner/repo@feature/my-feature
gh:owner/repo@fix/bug-123
```

This is a common Git branching convention (GitFlow, feature branches) that we must support.

### 2. Limited to Tags and Simple Branch Names

jsDelivr's resolution is designed for semver tags and simple refs. It doesn't support:
- Commit SHAs (`gh:owner/repo@abc123f`)
- Branches with special characters
- Private repositories (no auth support)

### 3. No Control Over Resolution Logic

We can't customize how refs are resolved, add fallback logic, or provide better error
messages when resolution fails.

---

## Proposed Solution

Create a **GitHub API resolver** that uses the GitHub REST API directly to resolve refs,
providing full control over the resolution process and supporting all valid Git refs.

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  parseSourceRef │ ──▶ │ resolveGitHubRef │ ──▶ │  GitHub REST    │
│  (ref.ts)       │     │ (github-api.ts)  │     │  API            │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │ ArtifactDescriptor│
                        │ with resolved SHA │
                        └──────────────────┘
```

### Resolution Strategy

The resolver should attempt to resolve a ref in this order:

1. **Exact branch match** — `GET /repos/{owner}/{repo}/git/ref/heads/{ref}`
2. **Exact tag match** — `GET /repos/{owner}/{repo}/git/ref/tags/{ref}`
3. **Commit SHA** — `GET /repos/{owner}/{repo}/git/commits/{ref}` (if ref looks like a SHA)
4. **Default branch** — `GET /repos/{owner}/{repo}` → use `default_branch` (when ref is omitted)

For semver ranges (e.g., `^1.0.0`), list tags and find the best match:
- `GET /repos/{owner}/{repo}/tags` → filter/sort by semver

---

## Implementation Guidance

### File: `src/extensions/sources/github-api.ts`

```typescript
/**
 * GitHub API-based ref resolution for extension sources. Replaces jsDelivr's
 * resolution for `gh:` refs, providing support for all Git ref types including
 * branches with slashes, commit SHAs, and semver ranges against tags.
 */

export interface GitHubResolvedRef {
  /** The resolved commit SHA (40 hex characters). */
  sha: string;
  /** The ref type that matched. */
  type: "branch" | "tag" | "commit";
  /** The original ref string that was resolved. */
  ref: string;
}

export interface GitHubResolverOptions {
  /** GitHub API token for private repos or higher rate limits. */
  token?: string;
  /** Custom fetch implementation (for testing). */
  fetch?: typeof fetch;
  /** GitHub API base URL (default: https://api.github.com). */
  apiBase?: string;
}

const GITHUB_API = "https://api.github.com";
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

/**
 * Resolve a GitHub ref (branch, tag, commit, or semver range) to a concrete SHA.
 * 
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param ref - Ref to resolve (branch, tag, SHA, semver range, or undefined for default)
 * @param options - Resolution options
 * @returns Resolved ref with SHA
 * @throws Error if the ref cannot be resolved
 */
export async function resolveGitHubRef(
  owner: string,
  repo: string,
  ref: string | undefined,
  options: GitHubResolverOptions = {},
): Promise<GitHubResolvedRef> {
  const { token, fetch: fetchImpl = fetch, apiBase = GITHUB_API } = options;
  
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const api = async (path: string) => {
    const response = await fetchImpl(`${apiBase}${path}`, { headers });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  };

  // No ref specified → use default branch
  if (!ref || ref === "*" || ref === "latest") {
    const repoData = await api(`/repos/${owner}/${repo}`);
    if (!repoData) throw new Error(`Repository ${owner}/${repo} not found`);
    const defaultBranch = repoData.default_branch;
    return resolveGitHubRef(owner, repo, defaultBranch, options);
  }

  // Looks like a commit SHA → verify it exists
  if (SHA_PATTERN.test(ref)) {
    const commit = await api(`/repos/${owner}/${repo}/git/commits/${ref}`);
    if (commit) {
      return { sha: commit.sha, type: "commit", ref };
    }
    // Fall through to try as branch/tag name
  }

  // Looks like a semver range → resolve against tags
  if (isSemverRange(ref)) {
    return resolveSemverRange(owner, repo, ref, options);
  }

  // Try as branch name (handles slashes correctly)
  const branchRef = await api(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(ref)}`);
  if (branchRef) {
    return { sha: branchRef.object.sha, type: "branch", ref };
  }

  // Try as tag name
  const tagRef = await api(`/repos/${owner}/${repo}/git/ref/tags/${encodeURIComponent(ref)}`);
  if (tagRef) {
    return { sha: tagRef.object.sha, type: "tag", ref };
  }

  throw new Error(
    `Could not resolve ref "${ref}" for ${owner}/${repo}. ` +
    `Tried as branch, tag, and commit SHA.`
  );
}

/**
 * Check if a string looks like a semver range rather than an exact version.
 */
function isSemverRange(ref: string): boolean {
  return /^[\^~><=]|^\d+\.\d+\.x$|^\*$/.test(ref);
}

/**
 * Resolve a semver range against repository tags.
 */
async function resolveSemverRange(
  owner: string,
  repo: string,
  range: string,
  options: GitHubResolverOptions,
): Promise<GitHubResolvedRef> {
  // Implementation note: Use a semver library (e.g., semver) to:
  // 1. Fetch all tags via GET /repos/{owner}/{repo}/tags
  // 2. Filter to tags that look like semver versions (v1.2.3 or 1.2.3)
  // 3. Find the highest version satisfying the range
  // 4. Return the SHA for that tag
  
  // For now, throw a clear error directing users to exact refs
  throw new Error(
    `Semver range "${range}" resolution not yet implemented for GitHub sources. ` +
    `Please use an exact tag (e.g., v1.0.0) or branch name.`
  );
}

/**
 * Build the raw.githubusercontent.com URL for a file in a resolved ref.
 * Note: This is for reference; the proxy endpoint will actually fetch these.
 */
export function rawGitHubUrl(
  owner: string,
  repo: string,
  sha: string,
  path: string,
): string {
  const cleanPath = path.replace(/^\/+/, "");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${cleanPath}`;
}
```

### Integration Points

1. **Update `resolve.ts`** to use this resolver instead of jsDelivr for `gh:` refs:

```typescript
case "gh": {
  const resolved = await resolveGitHubRef(
    ref.owner,
    ref.repo,
    ref.range,
    { token: getGitHubToken() }, // Optional: from settings/env
  );
  return {
    sourceRef,
    kind: "gh",
    version: resolved.sha,
    // Note: baseUrl will point to proxy, not raw GitHub
    baseUrl: buildProxyUrl(ref, resolved.sha),
    format: "dir",
  };
}
```

2. **Environment/Settings for Token**:
```typescript
// Allow users to configure a GitHub token for:
// - Private repo access
// - Higher API rate limits (60/hr unauthenticated → 5000/hr authenticated)
function getGitHubToken(): string | undefined {
  return import.meta.env.VITE_GITHUB_TOKEN ?? undefined;
}
```

### Testing

Create `src/extensions/sources/__tests__/github-api.test.ts`:

```typescript
describe("resolveGitHubRef", () => {
  it("resolves a simple branch name", async () => { /* ... */ });
  it("resolves a branch with slashes", async () => { /* ... */ });
  it("resolves a tag", async () => { /* ... */ });
  it("resolves a commit SHA", async () => { /* ... */ });
  it("resolves default branch when ref is omitted", async () => { /* ... */ });
  it("throws for non-existent ref", async () => { /* ... */ });
  it("uses auth token when provided", async () => { /* ... */ });
});
```

### Error Messages

Provide actionable error messages:

```typescript
// Bad
throw new Error("Not found");

// Good
throw new Error(
  `Could not resolve ref "feature/ui-extensions" for OpenHands/agent-canvas. ` +
  `This could mean the branch doesn't exist or the repository is private. ` +
  `For private repos, configure a GitHub token in Settings → Extensions.`
);
```

---

## Rate Limiting Considerations

GitHub API has rate limits:
- **Unauthenticated:** 60 requests/hour per IP
- **Authenticated:** 5,000 requests/hour per token

Mitigations:
1. Cache resolved SHAs (they're immutable once resolved)
2. Allow users to configure a token in extension settings
3. Show clear errors when rate limited with guidance to add a token

---

## Open Questions

1. **Should we support GitHub Enterprise?** If so, the API base URL should be configurable.
2. **Cache duration?** How long should resolved SHAs be cached? (They're immutable, so indefinitely for a given ref@sha, but refs can change.)
3. **Fallback to jsDelivr?** Should we keep jsDelivr as a fallback for simple refs, or fully replace it?

---

## Success Criteria

- [ ] `gh:owner/repo@feature/my-branch` resolves successfully
- [ ] `gh:owner/repo@v1.0.0` (tag) resolves successfully
- [ ] `gh:owner/repo@abc123f` (SHA) resolves successfully
- [ ] `gh:owner/repo` (no ref) uses default branch
- [ ] Clear error messages for invalid refs
- [ ] Rate limit handling with user guidance
- [ ] Unit tests for all resolution paths
