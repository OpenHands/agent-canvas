# Source Resolution Updates for GitHub Extensions

**Status:** Proposed  
**Component:** `src/extensions/sources/`  
**Related:** GitHub API Resolver, Extension Proxy Endpoint  
**Priority:** Medium — Ties the other two issues together

---

## Problem Statement

The current source resolution pipeline for `gh:` extensions has a tight coupling to jsDelivr:

```
parseSourceRef ──▶ resolveSourceRef ──▶ jsDelivr API ──▶ CDN URL ──▶ Direct HTTP Load
```

This creates several issues:

1. **Single Point of Failure** — jsDelivr outage = no extension installs
2. **CDN-Specific URL Format** — `baseUrl` is a jsDelivr URL, not abstractable
3. **Direct Loading** — Bundle source fetches directly from CDN, hitting CSP issues
4. **No Proxy Integration** — No seam to route through the backend proxy

We need to update the resolution flow to:

```
parseSourceRef ──▶ resolveSourceRef ──▶ GitHub API ──▶ Proxy Source Ref ──▶ Proxy Load
```

---

## Proposed Solution

Refactor the source resolution to:

1. **Decouple version resolution from CDN** — Use GitHub API for `gh:`, keep jsDelivr for `npm:`
2. **Return proxy-compatible descriptors** — `baseUrl` becomes a source ref, not a CDN URL
3. **Create appropriate BundleSource** — Factory that returns proxied or direct sources
4. **Maintain backward compatibility** — Existing `npm:` and `url:` sources continue working

### Updated Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ parseSourceRef  │ ──▶ │ resolveSourceRef │ ──▶ │ ArtifactDescriptor  │
│ (unchanged)     │     │ (updated)        │     │ (updated shape)     │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
                               │                          │
                               ▼                          ▼
                        ┌──────────────┐          ┌─────────────────┐
                        │ GitHub API   │          │ toBundleSource  │
                        │ (new)        │          │ (updated)       │
                        └──────────────┘          └─────────────────┘
                                                          │
                                                          ▼
                                                  ┌─────────────────┐
                                                  │ ProxiedBundle   │
                                                  │ Source (new)    │
                                                  └─────────────────┘
```

---

## Implementation Guidance

### 1. Update ArtifactDescriptor

The descriptor needs to carry enough information to construct either a direct or proxied
bundle source:

```typescript
// File: src/extensions/sources/resolve.ts

export interface ArtifactDescriptor {
  /** Canonical source ref string (for persistence/display). */
  sourceRef: string;
  
  /** Source kind for routing to correct bundle source factory. */
  kind: ExtensionSourceRef["kind"];
  
  /** Resolved concrete version (SHA for gh, version for npm). */
  version?: string;
  
  /**
   * For `npm:`/`url:`: direct URL to the bundle directory.
   * For `gh:`: the resolved source ref to pass to the proxy.
   * 
   * The interpretation depends on `kind` — use `toBundleSource()` to get
   * the appropriate loader.
   */
  baseUrl: string;
  
  /** Physical packaging format. */
  format: "dir";
  
  /**
   * Whether this source should be loaded through the proxy.
   * True for `gh:` (due to CSP), false for `npm:` (jsDelivr works directly).
   */
  requiresProxy: boolean;
}
```

### 2. Update resolveSourceRef

```typescript
// File: src/extensions/sources/resolve.ts

import { resolveGitHubRef } from "./github-api";
import { resolveNpmVersion, npmBaseUrl } from "./jsdelivr";

export async function resolveSourceRef(
  ref: ExtensionSourceRef,
  fetchImpl: FetchLike = fetch,
): Promise<ArtifactDescriptor> {
  const sourceRef = formatSourceRef(ref);
  
  switch (ref.kind) {
    case "npm": {
      // npm continues using jsDelivr — it works and has good CDN properties
      const version = await resolveNpmVersion(ref.name, ref.range, fetchImpl);
      return {
        sourceRef,
        kind: "npm",
        version,
        baseUrl: npmBaseUrl(ref.name, version),
        format: "dir",
        requiresProxy: false,  // jsDelivr has CORS, works directly
      };
    }
    
    case "gh": {
      // GitHub uses our resolver + proxy
      const resolved = await resolveGitHubRef(
        ref.owner,
        ref.repo,
        ref.range,
      );
      
      // Build the source ref that the proxy will use
      const proxySourceRef = `gh:${ref.owner}/${ref.repo}${
        ref.subpath ? `/${ref.subpath}` : ""
      }@${resolved.sha}`;
      
      return {
        sourceRef,
        kind: "gh",
        version: resolved.sha,
        baseUrl: proxySourceRef,  // Pass to proxy, not a direct URL
        format: "dir",
        requiresProxy: true,  // Must go through proxy for CSP
      };
    }
    
    case "url": {
      // Raw URLs pass through unchanged
      // Note: These may or may not work depending on CORS/CSP
      return {
        sourceRef,
        kind: "url",
        baseUrl: ref.baseUrl,
        format: "dir",
        requiresProxy: false,  // User's responsibility
      };
    }
  }
}
```

### 3. Update toBundleSource Factory

```typescript
// File: src/extensions/sources/resolve.ts

import { createHttpBundleSource } from "../dev-bundle-source";
import { createProxiedBundleSource } from "./proxied-bundle-source";

/**
 * Turn a resolved descriptor into a BundleSource for the loader.
 * Routes to the appropriate source implementation based on the descriptor.
 */
export function toBundleSource(descriptor: ArtifactDescriptor): BundleSource {
  if (descriptor.requiresProxy) {
    // GitHub sources go through the proxy
    return createProxiedBundleSource(descriptor.baseUrl);
  }
  
  // npm and url sources load directly via HTTP
  return createHttpBundleSource(descriptor.baseUrl);
}
```

### 4. Create ProxiedBundleSource

```typescript
// File: src/extensions/sources/proxied-bundle-source.ts

import type { BundleSource } from "../loader";

/**
 * A BundleSource that loads extension assets through the backend proxy endpoint.
 * 
 * This is necessary for sources (like GitHub) where direct browser access is blocked
 * by CSP. The proxy fetches content server-side and serves it from the same origin.
 * 
 * @param source - The resolved source ref (e.g., "gh:owner/repo/path@sha")
 */
export function createProxiedBundleSource(source: string): BundleSource {
  const proxyEndpoint = "/api/extensions/proxy";
  
  const buildProxyUrl = (file: string): string => {
    const params = new URLSearchParams({
      source,
      file: file.replace(/^\/+/, ""),  // Remove leading slashes
    });
    return `${proxyEndpoint}?${params}`;
  };
  
  return {
    readManifest: async () => {
      const url = buildProxyUrl("extension.json");
      const response = await fetch(url);
      
      if (!response.ok) {
        const status = response.status;
        if (status === 404) {
          throw new Error(`Extension manifest not found at ${source}`);
        }
        if (status === 502) {
          throw new Error(`Failed to fetch extension from upstream: ${source}`);
        }
        throw new Error(`Failed to fetch manifest: HTTP ${status}`);
      }
      
      return response.json();
    },
    
    assetUrl: async (path: string) => buildProxyUrl(path),
  };
}
```

### 5. Update the Install Flow

The install flow in the UI needs to use the updated resolution:

```typescript
// File: src/components/features/extensions/install-dialog.tsx (conceptual)

async function installExtension(sourceInput: string) {
  // 1. Parse the source ref
  const ref = parseSourceRef(sourceInput);
  
  // 2. Resolve to artifact descriptor (now uses GitHub API for gh:)
  const descriptor = await resolveSourceRef(ref);
  
  // 3. Create appropriate bundle source (now uses proxy for gh:)
  const bundleSource = toBundleSource(descriptor);
  
  // 4. Load and validate the extension
  const result = await loadExtension(bundleSource, extensionHost);
  
  if (!result.ok) {
    throw new Error(result.errors.join(", "));
  }
  
  // 5. Persist the installation
  await persistInstallation({
    sourceRef: descriptor.sourceRef,
    version: descriptor.version,
    // ... other metadata
  });
}
```

### 6. Handle the Transition

For existing installations that have old-style descriptors:

```typescript
// File: src/extensions/installed-persistence.ts

interface PersistedInstallation {
  sourceRef: string;
  version?: string;
  // ... other fields
}

/**
 * Migrate old installations that may have direct CDN URLs.
 */
function migrateInstallation(persisted: PersistedInstallation): PersistedInstallation {
  // Old format might have baseUrl as jsDelivr URL
  // New format just stores sourceRef, version is re-resolved on load
  return {
    sourceRef: persisted.sourceRef,
    version: persisted.version,
  };
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// File: src/extensions/sources/__tests__/resolve.test.ts

describe("resolveSourceRef", () => {
  describe("gh: sources", () => {
    it("resolves branch with slashes", async () => {
      const ref = parseSourceRef("gh:owner/repo@feature/test");
      const descriptor = await resolveSourceRef(ref);
      
      expect(descriptor.kind).toBe("gh");
      expect(descriptor.requiresProxy).toBe(true);
      expect(descriptor.baseUrl).toMatch(/^gh:owner\/repo@[a-f0-9]+$/);
    });
    
    it("includes subpath in proxy source", async () => {
      const ref = parseSourceRef("gh:owner/repo/packages/ext@v1");
      const descriptor = await resolveSourceRef(ref);
      
      expect(descriptor.baseUrl).toContain("/packages/ext@");
    });
  });
  
  describe("npm: sources", () => {
    it("continues using jsDelivr directly", async () => {
      const ref = parseSourceRef("npm:@acme/ext@^1.0.0");
      const descriptor = await resolveSourceRef(ref);
      
      expect(descriptor.kind).toBe("npm");
      expect(descriptor.requiresProxy).toBe(false);
      expect(descriptor.baseUrl).toContain("cdn.jsdelivr.net");
    });
  });
});

describe("toBundleSource", () => {
  it("returns proxied source for gh:", () => {
    const descriptor: ArtifactDescriptor = {
      sourceRef: "gh:owner/repo@abc123",
      kind: "gh",
      version: "abc123",
      baseUrl: "gh:owner/repo@abc123",
      format: "dir",
      requiresProxy: true,
    };
    
    const source = toBundleSource(descriptor);
    // Verify it creates proxy URLs
  });
  
  it("returns HTTP source for npm:", () => {
    const descriptor: ArtifactDescriptor = {
      sourceRef: "npm:@acme/ext@1.0.0",
      kind: "npm",
      version: "1.0.0",
      baseUrl: "https://cdn.jsdelivr.net/npm/@acme/ext@1.0.0",
      format: "dir",
      requiresProxy: false,
    };
    
    const source = toBundleSource(descriptor);
    // Verify it creates direct URLs
  });
});
```

### Integration Tests

```typescript
describe("Extension Installation Flow", () => {
  it("installs gh: extension through proxy", async () => {
    // Mock the proxy endpoint
    server.use(
      rest.get("/api/extensions/proxy", (req, res, ctx) => {
        const file = req.url.searchParams.get("file");
        if (file === "extension.json") {
          return res(ctx.json({ id: "test.ext", name: "Test", version: "1.0.0" }));
        }
        return res(ctx.status(404));
      })
    );
    
    // Install should succeed
    await installExtension("gh:test/repo@main");
    
    // Verify extension is registered
    expect(contributionRegistry.get("test.ext")).toBeDefined();
  });
});
```

---

## Migration Path

### Phase 1: Add New Code (Non-Breaking)

1. Add `github-api.ts` resolver
2. Add `proxied-bundle-source.ts`
3. Add `requiresProxy` field to descriptor (default `false`)
4. Update `toBundleSource` to check `requiresProxy`

All existing code continues working.

### Phase 2: Switch gh: to New Path

1. Update `resolveSourceRef` for `gh:` case to use GitHub API
2. Set `requiresProxy: true` for `gh:` descriptors
3. Proxy endpoint must be deployed

`gh:` extensions now use the new path.

### Phase 3: Clean Up (Optional)

1. Remove jsDelivr GitHub resolution code
2. Remove direct CDN loading for `gh:` sources
3. Update documentation

---

## Open Questions

1. **Error Handling Consistency**: How should errors from the proxy be surfaced vs. errors from direct loading? Should they have the same shape?

2. **Offline Behavior**: If the proxy has cached content but the browser is offline, should we serve from browser cache? Service worker?

3. **Version Display**: When showing "v1.0.0" vs "abc123f", should we always show the tag name if available, even though we resolve to SHA internally?

4. **URL Sources**: Should `url:` sources also go through the proxy for consistency, or is direct loading acceptable for user-provided URLs?

---

## Success Criteria

- [ ] `gh:owner/repo@feature/branch` resolves and loads successfully
- [ ] `npm:@scope/pkg@^1` continues working (no regression)
- [ ] Webviews load without CSP errors
- [ ] Extension worker (`main.js`) loads and activates
- [ ] Icons and assets load correctly
- [ ] Existing installations continue working after update
- [ ] Clear error messages for resolution failures
- [ ] Unit and integration tests pass
