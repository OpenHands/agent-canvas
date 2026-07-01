# Extension Asset Proxy Endpoint

**Status:** Proposed  
**Component:** Backend (agent-server), `src/extensions/`  
**Related:** GitHub API Resolver, Source Resolution Updates  
**Priority:** High — Blocker for first-class GitHub extension support

---

## Problem Statement

Extension webviews run in sandboxed iframes with strict Content Security Policy:

```
connect-src 'none'
```

This is a **deliberate security measure** — it prevents extension code from making network
requests, ensuring all communication goes through the capability-gated `postMessage` RPC.
This is non-negotiable for the security model.

However, this CSP also prevents webviews from loading when hosted on external origins:

### Current Failure Mode

1. User installs extension from `gh:owner/repo/path@ref`
2. Resolver returns `baseUrl` pointing to jsDelivr CDN
3. Webview iframe tries to load `https://cdn.jsdelivr.net/.../panel.html`
4. Browser blocks it: **"cdn.jsdelivr.net refused to connect"**

The same issue occurs with:
- `raw.githubusercontent.com` (direct GitHub access)
- Any external CDN or hosting

### Why We Can't Just Whitelist CDNs

Adding CDN origins to CSP would:
1. **Weaken security** — Extensions could exfiltrate data to those origins
2. **Create CDN dependency** — What if jsDelivr is down or changes policy?
3. **Not solve the real problem** — We still can't load from arbitrary URLs

---

## Proposed Solution

Create a **proxy endpoint** in the Agent Canvas backend that fetches extension assets and
serves them with the correct headers, making them appear as same-origin content.

### Architecture

```
┌──────────────┐     ┌────────────────────┐     ┌──────────────────┐
│   Browser    │     │   Agent Canvas     │     │   GitHub /       │
│   Webview    │ ──▶ │   /api/extensions  │ ──▶ │   CDN            │
│   (iframe)   │     │   /proxy           │     │                  │
└──────────────┘     └────────────────────┘     └──────────────────┘
                            │
                            ▼
                     Same-origin response
                     + correct MIME type
                     + CSP nonce stamping
```

### Key Benefits

1. **CSP Satisfied** — Assets served from same origin (`/api/extensions/proxy`)
2. **Works with Any Source** — GitHub, npm, custom URLs
3. **Caching Layer** — Can cache fetched content for performance
4. **Security Control** — Can validate, sanitize, add integrity checks
5. **Offline Support** — Cached assets work without network

---

## Implementation Guidance

### Endpoint Specification

```
GET /api/extensions/proxy

Query Parameters:
  source   - Extension source ref (e.g., "gh:owner/repo/path@sha")
  file     - File path within the bundle (e.g., "extension.json", "panel.html")

Headers:
  X-Session-API-Key  - Session authentication (existing auth mechanism)

Response:
  - 200 OK with file content and appropriate Content-Type
  - 404 if file not found in bundle
  - 400 if source ref is invalid
  - 502 if upstream fetch fails
```

### Example Requests

```bash
# Fetch manifest
GET /api/extensions/proxy?source=gh:owner/repo/path@abc123&file=extension.json

# Fetch webview HTML
GET /api/extensions/proxy?source=gh:owner/repo/path@abc123&file=panel.html

# Fetch icon
GET /api/extensions/proxy?source=gh:owner/repo/path@abc123&file=icon.svg
```

### Backend Implementation (Python/FastAPI)

```python
# File: openhands/server/routes/extensions.py

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import Response
import httpx
import hashlib
from typing import Optional

router = APIRouter(prefix="/api/extensions", tags=["extensions"])

# In-memory cache (use Redis/disk in production)
_cache: dict[str, tuple[bytes, str]] = {}

MIME_TYPES = {
    ".json": "application/json",
    ".js": "application/javascript",
    ".html": "text/html",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}

def get_mime_type(filename: str) -> str:
    """Determine MIME type from file extension."""
    for ext, mime in MIME_TYPES.items():
        if filename.lower().endswith(ext):
            return mime
    return "application/octet-stream"

def parse_github_source(source: str) -> tuple[str, str, str, Optional[str]]:
    """
    Parse gh:owner/repo/path@ref into components.
    Returns: (owner, repo, ref, subpath)
    """
    if not source.startswith("gh:"):
        raise ValueError("Only gh: sources supported")
    
    rest = source[3:]  # Remove "gh:"
    
    # Split off @ref
    if "@" in rest:
        path_part, ref = rest.rsplit("@", 1)
    else:
        path_part, ref = rest, "HEAD"
    
    parts = path_part.split("/")
    if len(parts) < 2:
        raise ValueError("Invalid gh: source format")
    
    owner, repo = parts[0], parts[1]
    subpath = "/".join(parts[2:]) if len(parts) > 2 else None
    
    return owner, repo, ref, subpath

def build_raw_github_url(owner: str, repo: str, ref: str, subpath: Optional[str], file: str) -> str:
    """Build raw.githubusercontent.com URL for a file."""
    base = f"https://raw.githubusercontent.com/{owner}/{repo}/{ref}"
    if subpath:
        base = f"{base}/{subpath}"
    return f"{base}/{file}"

@router.get("/proxy")
async def proxy_extension_asset(
    request: Request,
    source: str = Query(..., description="Extension source ref (e.g., gh:owner/repo@ref)"),
    file: str = Query(..., description="File path within the bundle"),
) -> Response:
    """
    Proxy extension assets from external sources.
    
    This endpoint fetches extension files (manifest, HTML, JS, CSS, images) from
    their source (GitHub, npm, etc.) and serves them with appropriate headers,
    enabling the browser to load them despite CSP restrictions.
    """
    # Validate file path (prevent directory traversal)
    if ".." in file or file.startswith("/"):
        raise HTTPException(400, "Invalid file path")
    
    # Build cache key
    cache_key = hashlib.sha256(f"{source}:{file}".encode()).hexdigest()
    
    # Check cache
    if cache_key in _cache:
        content, mime_type = _cache[cache_key]
        return build_response(content, mime_type, file)
    
    # Parse source and build upstream URL
    try:
        owner, repo, ref, subpath = parse_github_source(source)
        upstream_url = build_raw_github_url(owner, repo, ref, subpath, file)
    except ValueError as e:
        raise HTTPException(400, str(e))
    
    # Fetch from upstream
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(upstream_url, follow_redirects=True)
        except httpx.RequestError as e:
            raise HTTPException(502, f"Failed to fetch from upstream: {e}")
    
    if response.status_code == 404:
        raise HTTPException(404, f"File not found: {file}")
    if not response.is_success:
        raise HTTPException(502, f"Upstream returned {response.status_code}")
    
    content = response.content
    mime_type = get_mime_type(file)
    
    # Cache the result (for immutable refs like SHAs)
    if looks_like_sha(ref):
        _cache[cache_key] = (content, mime_type)
    
    return build_response(content, mime_type, file)

def looks_like_sha(ref: str) -> bool:
    """Check if ref looks like a commit SHA (safe to cache indefinitely)."""
    return len(ref) >= 7 and all(c in "0123456789abcdef" for c in ref.lower())

def build_response(content: bytes, mime_type: str, filename: str) -> Response:
    """Build response with appropriate headers."""
    headers = {
        "Content-Type": mime_type,
        "Cache-Control": "public, max-age=31536000, immutable",  # 1 year for SHAs
        "X-Content-Type-Options": "nosniff",
    }
    
    # For HTML files serving as webviews, add CSP header
    if filename.endswith(".html"):
        # Note: The webview runtime will add nonce; here we add base CSP
        headers["Content-Security-Policy"] = (
            "default-src 'none'; "
            "script-src 'unsafe-inline'; "  # Nonce added by runtime
            "style-src 'unsafe-inline'; "
            "img-src data: blob:; "
            "font-src data:; "
            "connect-src 'none'; "
            "form-action 'none'; "
            "base-uri 'none'"
        )
    
    return Response(content=content, headers=headers)
```

### Frontend Integration

Update the bundle source to use the proxy:

```typescript
// File: src/extensions/sources/proxied-bundle-source.ts

import type { BundleSource } from "../loader";

/**
 * A BundleSource that loads extension assets through the backend proxy.
 * This satisfies CSP by serving content from the same origin.
 */
export function createProxiedBundleSource(
  source: string,  // e.g., "gh:owner/repo/path@sha"
): BundleSource {
  const proxyBase = "/api/extensions/proxy";
  
  const buildUrl = (file: string) => {
    const params = new URLSearchParams({ source, file });
    return `${proxyBase}?${params}`;
  };
  
  return {
    readManifest: async () => {
      const response = await fetch(buildUrl("extension.json"));
      if (!response.ok) {
        throw new Error(`Failed to fetch manifest: HTTP ${response.status}`);
      }
      return response.json();
    },
    assetUrl: async (path) => buildUrl(path),
  };
}
```

Update the resolver to use proxied sources:

```typescript
// File: src/extensions/sources/resolve.ts (updated)

export async function resolveSourceRef(
  ref: ExtensionSourceRef,
  fetchImpl: FetchLike = fetch,
): Promise<ArtifactDescriptor> {
  const sourceRef = formatSourceRef(ref);
  
  switch (ref.kind) {
    case "gh": {
      const resolved = await resolveGitHubRef(
        ref.owner,
        ref.repo,
        ref.range,
      );
      
      // Build the source string for the proxy
      const proxySource = `gh:${ref.owner}/${ref.repo}${
        ref.subpath ? `/${ref.subpath}` : ""
      }@${resolved.sha}`;
      
      return {
        sourceRef,
        kind: "gh",
        version: resolved.sha,
        // baseUrl is now a proxy URL pattern, not a direct CDN URL
        baseUrl: proxySource,  // Will be passed to createProxiedBundleSource
        format: "dir",
      };
    }
    // ... npm and url cases
  }
}
```

### Caching Strategy

```python
# Production caching with Redis

import redis
from typing import Optional

redis_client = redis.Redis(host="localhost", port=6379, db=0)

CACHE_TTL_IMMUTABLE = 60 * 60 * 24 * 365  # 1 year for SHA-pinned content
CACHE_TTL_MUTABLE = 60 * 5  # 5 minutes for branch refs

async def get_cached(key: str) -> Optional[bytes]:
    return redis_client.get(f"ext:proxy:{key}")

async def set_cached(key: str, content: bytes, ttl: int):
    redis_client.setex(f"ext:proxy:{key}", ttl, content)
```

---

## Security Considerations

### Path Traversal Prevention

```python
def validate_file_path(file: str) -> bool:
    """Ensure file path is safe."""
    # No parent directory traversal
    if ".." in file:
        return False
    # No absolute paths
    if file.startswith("/"):
        return False
    # No query strings or fragments
    if "?" in file or "#" in file:
        return False
    # Reasonable length
    if len(file) > 256:
        return False
    return True
```

### Source Validation

```python
ALLOWED_SOURCE_KINDS = {"gh", "npm"}

def validate_source(source: str) -> bool:
    """Ensure source is from an allowed origin."""
    prefix = source.split(":")[0] if ":" in source else ""
    return prefix in ALLOWED_SOURCE_KINDS
```

### Rate Limiting

```python
from fastapi import Depends
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.get("/proxy")
@limiter.limit("100/minute")  # 100 requests per minute per IP
async def proxy_extension_asset(...):
    ...
```

### Content Validation (Optional)

```python
def validate_content(content: bytes, filename: str) -> bool:
    """Optional: validate content matches expected type."""
    mime = get_mime_type(filename)
    
    if mime == "application/json":
        try:
            json.loads(content)
            return True
        except json.JSONDecodeError:
            return False
    
    if mime == "text/html":
        # Could check for malicious content
        pass
    
    return True
```

---

## Testing

### Unit Tests

```python
# tests/unit/server/routes/test_extensions_proxy.py

import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_proxy_fetches_manifest():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get(
            "/api/extensions/proxy",
            params={"source": "gh:test/repo@abc123", "file": "extension.json"}
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"

@pytest.mark.asyncio
async def test_proxy_rejects_path_traversal():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get(
            "/api/extensions/proxy",
            params={"source": "gh:test/repo@abc123", "file": "../../../etc/passwd"}
        )
        assert response.status_code == 400

@pytest.mark.asyncio
async def test_proxy_caches_immutable_refs():
    # First request fetches from upstream
    # Second request serves from cache
    pass

@pytest.mark.asyncio  
async def test_proxy_returns_correct_mime_types():
    for file, expected_mime in [
        ("extension.json", "application/json"),
        ("panel.html", "text/html"),
        ("main.js", "application/javascript"),
        ("icon.svg", "image/svg+xml"),
    ]:
        response = await client.get(
            "/api/extensions/proxy",
            params={"source": "gh:test/repo@abc123", "file": file}
        )
        assert response.headers["content-type"] == expected_mime
```

### Integration Tests

```typescript
// src/extensions/__tests__/proxied-bundle-source.test.ts

describe("ProxiedBundleSource", () => {
  it("loads manifest through proxy", async () => {
    const source = createProxiedBundleSource("gh:test/repo@abc123");
    const manifest = await source.readManifest();
    expect(manifest).toHaveProperty("id");
  });

  it("generates correct asset URLs", async () => {
    const source = createProxiedBundleSource("gh:test/repo/path@abc123");
    const url = await source.assetUrl("panel.html");
    expect(url).toBe("/api/extensions/proxy?source=gh%3Atest%2Frepo%2Fpath%40abc123&file=panel.html");
  });
});
```

---

## Open Questions

1. **npm Sources**: Should the proxy also handle `npm:` sources, or continue using jsDelivr CDN for those? (jsDelivr works well for npm)

2. **Private Repos**: How should GitHub tokens be passed to the proxy? Query param? Header? Stored in backend settings?

3. **Cache Invalidation**: For non-SHA refs (branches), how do we handle cache invalidation when the branch updates?

4. **Size Limits**: Should we limit the size of proxied files? What's reasonable? (10MB?)

5. **Allowed File Types**: Should we whitelist allowed file extensions for security?

---

## Success Criteria

- [ ] `/api/extensions/proxy` endpoint implemented and tested
- [ ] Webview HTML loads successfully through proxy (no CSP errors)
- [ ] Webview JS (`main.js` worker) loads through proxy
- [ ] Icons and other assets load through proxy
- [ ] Caching works for SHA-pinned refs
- [ ] Path traversal attacks are blocked
- [ ] Appropriate rate limiting in place
- [ ] MIME types correctly set for all file types
- [ ] Integration with existing extension loading pipeline
