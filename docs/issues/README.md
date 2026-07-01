# Extension System Issues & Proposals

This directory contains detailed issue documents for planned improvements to the Agent Canvas
extension system.

## First-Class GitHub Repository Support

**Goal:** Enable extensions hosted in GitHub repositories to work seamlessly, including
branches with slashes, commit SHAs, and eventually private repos.

### Current Limitation

Extensions installed via `gh:owner/repo/path@ref` fail when:
- The ref contains slashes (e.g., `feature/my-branch`) — jsDelivr API returns 500
- The webview tries to load — CSP blocks external origins

### Solution Overview

Three interconnected changes are needed:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Extension Install Flow                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   User Input                                                                 │
│       │                                                                      │
│       ▼                                                                      │
│   ┌─────────────────┐                                                        │
│   │ Parse Source    │  gh:owner/repo/path@feature/branch                     │
│   │ (unchanged)     │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐     ┌─────────────────┐                               │
│   │ GitHub API      │────▶│ Resolve ref to  │  Issue #1: GitHub API Resolver│
│   │ Resolver (NEW)  │     │ commit SHA      │                               │
│   └────────┬────────┘     └─────────────────┘                               │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │ Source          │  Returns proxy-compatible descriptor                   │
│   │ Resolution      │  Issue #3: Source Resolution Updates                   │
│   │ (updated)       │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐     ┌─────────────────┐                               │
│   │ Extension       │────▶│ Fetch assets    │  Issue #2: Proxy Endpoint     │
│   │ Proxy (NEW)     │     │ from GitHub     │                               │
│   └────────┬────────┘     └─────────────────┘                               │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │ Load Extension  │  Webview loads from same origin ✓                     │
│   │ (unchanged)     │  CSP satisfied ✓                                      │
│   └─────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Issue Documents

| # | Issue | Priority | Description |
|---|-------|----------|-------------|
| 1 | [GitHub API Resolver](./github-api-resolver.md) | High | Replace jsDelivr resolution with GitHub API for `gh:` refs |
| 2 | [Extension Proxy Endpoint](./extension-proxy-endpoint.md) | High | Backend endpoint to proxy extension assets |
| 3 | [Source Resolution Updates](./source-resolution-updates.md) | Medium | Wire resolver and proxy into the install flow |

### Implementation Order

**Phase 1: Backend (Issues #1, #2)**
1. Implement GitHub API resolver (`github-api.ts`)
2. Implement proxy endpoint (`/api/extensions/proxy`)
3. Deploy backend changes

**Phase 2: Frontend (Issue #3)**
1. Add `ProxiedBundleSource`
2. Update `resolveSourceRef` for `gh:` case
3. Update `toBundleSource` factory
4. Test end-to-end

**Phase 3: Polish**
1. Add caching layer to proxy
2. Support GitHub tokens for private repos
3. Improve error messages
4. Update documentation

### Success Criteria

After all three issues are resolved:

- [ ] `gh:owner/repo@feature/my-branch` installs successfully
- [ ] Extension webview loads without CSP errors
- [ ] Extension worker activates and commands work
- [ ] Settings pages load correctly
- [ ] Icons and assets display properly
- [ ] `npm:` extensions continue working (no regression)
- [ ] Clear error messages for all failure modes

---

## Other Planned Improvements

(Add additional issue documents here as needed)

- [ ] Private GitHub repository support (requires token management UI)
- [ ] Extension marketplace integration
- [ ] Offline extension caching
- [ ] Extension integrity verification (content hashes)
