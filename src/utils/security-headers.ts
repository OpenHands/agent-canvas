import type { Backend } from "#/api/backend-registry/types";

/**
 * Content Security Policy builder for the agent-canvas frontend.
 *
 * Why this exists: the frontend runs arbitrary JavaScript from a large npm
 * dependency graph. Without a Content-Security-Policy (CSP), any successful
 * XSS (compromised dep, malicious browser extension) gets free rein. CSP is
 * the *real* mitigation for XSS-driven key exfiltration, ahead of where we
 * store API keys.
 *
 * The policy is intentionally permissive in `script-src` (allows `'unsafe-inline'`)
 * because React Router v7 emits inline `<script>` tags for its server-stream
 * replay and the static-server injects additional inline scripts to set
 * `window.__AGENT_CANVAS_*` runtime config. A nonce-based setup would be
 * tighter but breaks Vite's HMR. We tighten everything else (frame-src,
 * img-src, base-uri, form-action, object-src) so a successful XSS still
 * can't exfiltrate credentials or embed hostile iframes.
 *
 * `connect-src` is broadened to include every registered backend's origin
 * (the user can switch backends at runtime) plus known telemetry endpoints
 * (PostHog for product analytics, z.openhands.dev for library telemetry)
 * and `ws:` / `wss:` for the WebSocket event streams.
 *
 * Future tightening: once every entry-point that emits inline scripts is
 * nonce-driven, drop `'unsafe-inline'` from `script-src` and require a
 * per-request nonce. Tracked in SECURITY.md.
 */
const POSTHOG_API_HOST = "https://us.i.posthog.com";
const TELEMETRY_PROXY_HOST = "https://z.openhands.dev";

/**
 * Convert a backend host string into a CSP `connect-src` / `frame-src` token.
 * Accepts full URLs and bare hostnames (with optional ports). Returns
 * `null` if the value cannot be parsed as a URL — the caller must drop the
 * entry rather than emit a malformed token, since a malformed token can
 * silently disable the whole source-expression.
 */
export function backendHostToCspSource(
  host: string | null | undefined,
): string | null {
  if (!host) return null;
  const trimmed = host.trim();
  if (!trimmed) return null;

  // Reject anything that isn't http(s)://… — CSP source expressions do not
  // understand other schemes, and emitting them would either be ignored or
  // (for `data:` / `javascript:`) actively dangerous.
  if (!/^https?:\/\//i.test(trimmed)) return null;

  try {
    const url = new URL(trimmed);
    // CSP source expressions are scheme + host [+ port]; strip the path /
    // query so they match all paths under that origin.
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * Build the `connect-src` source list for the policy.
 *
 * Includes:
 * - `'self'` for the page's own origin
 * - every registered backend's origin (any of them may become active)
 * - PostHog for product analytics
 * - the telemetry proxy for library-level events
 * - `ws:` and `wss:` for WebSocket connections (CSP requires explicit
 *   upgrade of `ws:` ↔ `http:` and `wss:` ↔ `https:`)
 */
export function buildConnectSrc(backends: ReadonlyArray<Backend>): string {
  const sources = new Set<string>(["'self'"]);
  for (const backend of backends) {
    const origin = backendHostToCspSource(backend.host);
    if (origin) sources.add(origin);
  }
  sources.add(POSTHOG_API_HOST);
  sources.add(TELEMETRY_PROXY_HOST);
  sources.add("ws:");
  sources.add("wss:");
  return Array.from(sources).join(" ");
}

/**
 * Build the `form-action` source list. Includes `'self'` and every registered
 * backend origin so that legitimate form submissions (e.g. file uploads,
 * password-manager relaunches, OAuth-style redirects that re-enter the app
 * via `<form>`) are not blocked by the default-deny stance.
 *
 * For local-only deployments this is `'self'` only by default; for hosted
 * deployments the backend typically lives on a different origin (a remote
 * agent-server, the OpenHands cloud app, or a runtime sandbox under
 * `*.prod-runtime.all-hands.dev`), and a hosted canvas must be able to
 * POST back to those origins to drive the agent. CSP `form-action` does
 * not affect `<a>` navigation, only HTML form submissions and the rare
 * `window.location` trick — so widening it does not enable exfiltration
 * via simple link clicks.
 */
export function buildFormActionSrc(backends: ReadonlyArray<Backend>): string {
  const sources = new Set<string>(["'self'"]);
  for (const backend of backends) {
    const origin = backendHostToCspSource(backend.host);
    if (origin) sources.add(origin);
  }
  return Array.from(sources).join(" ");
}

/**
 * Build the `frame-src` source list. Workspace artifacts are embedded as
 * `<iframe src>` against the conversation's static fileserver, which is the
 * active backend's origin. Restrict to backend origins only — we never
 * want third-party iframes.
 */
export function buildFrameSrc(backends: ReadonlyArray<Backend>): string {
  const sources = new Set<string>(["'self'"]);
  for (const backend of backends) {
    const origin = backendHostToCspSource(backend.host);
    if (origin) sources.add(origin);
  }
  return Array.from(sources).join(" ");
}

/**
 * Build the `img-src` source list. Covers the page origin (favicons, SVG
 * icons in the bundle), `data:` for inline image previews, `blob:` for
 * workspace file content previews, `https:` for arbitrary remote images
 * (avatars, repo icons in extensions UI), and every backend origin for
 * workspace-relative `<img src>` embeds.
 */
export function buildImgSrc(backends: ReadonlyArray<Backend>): string {
  const sources = new Set<string>(["'self'", "data:", "blob:", "https:"]);
  for (const backend of backends) {
    const origin = backendHostToCspSource(backend.host);
    if (origin) sources.add(origin);
  }
  return Array.from(sources).join(" ");
}

export interface BuildContentSecurityPolicyOptions {
  /** All registered backends (any of them may become active). */
  backends: ReadonlyArray<Backend>;
  /**
   * When `true`, omit `frame-ancestors` so this policy can be safely used as
   * a `<meta>` tag (frame-ancestors is ignored in meta tags anyway).
   * Defaults to `false` for HTTP-header use.
   */
  forMetaTag?: boolean;
  /**
   * Override the `frame-ancestors` directive value. Defaults to `'none'`
   * (refuse to be embedded by anyone). Set to `'self'` for hosted
   * deployments that genuinely need to be embedded inside their own
   * portal, or to a specific origin for third-party embedding.
   *
   * Has no effect when `forMetaTag` is `true` (the directive is ignored
   * inside `<meta>` tags anyway).
   */
  frameAncestors?: string;
}

/**
 * Compute the source-list expressions shared between
 * `buildContentSecurityPolicy` and `buildSecurityHeaders`.
 */
function computeSourceLists(backends: ReadonlyArray<Backend>): {
  connectSrc: string;
  frameSrc: string;
  formActionSrc: string;
  imgSrc: string;
} {
  return {
    connectSrc: buildConnectSrc(backends),
    frameSrc: buildFrameSrc(backends),
    formActionSrc: buildFormActionSrc(backends),
    imgSrc: buildImgSrc(backends),
  };
}

/**
 * Build the full Content-Security-Policy string.
 *
 * The policy is structured for defense-in-depth:
 * - `default-src 'self'` so every fetch type is restricted by default
 * - `script-src` allows `'unsafe-inline'` (see file comment) plus `'self'`,
 *   `'wasm-unsafe-eval'` (xterm.js needs it), and the PostHog/telemetry
 *   origins. We deliberately do NOT allow eval() / Function().
 * - `style-src 'self' 'unsafe-inline'` — Tailwind/HeroUI inject styles,
 *   and Monaco injects editor styles
 * - `connect-src` covers all known backend origins plus telemetry + ws
 * - `frame-src` restricted to backend origins (workspace iframes)
 * - `frame-ancestors 'none'` so the UI cannot be embedded by other sites
 *   (overridable via `options.frameAncestors` — see SECURITY.md for why
 *   some hosted deployments legitimately need to relax this)
 * - `base-uri 'self'` blocks `<base>` tag injection that would redirect
 *   relative URLs to an attacker-controlled origin
 * - `form-action` covers self + every backend origin so legitimate
 *   cross-origin form submissions (file uploads, OAuth returns, the
 *   workspace password-manager relaunch flow) are not blocked
 * - `object-src 'none'` blocks `<object>` / `<embed>` plugins (Flash, Java)
 * - `upgrade-insecure-requests` upgrades any stray http: requests to https:
 */
export function buildContentSecurityPolicy(
  options: BuildContentSecurityPolicyOptions,
): string {
  const { backends, forMetaTag = false, frameAncestors = "'none'" } = options;
  const { connectSrc, frameSrc, formActionSrc, imgSrc } =
    computeSourceLists(backends);

  const directives: string[] = [
    "default-src 'self'",
    // `'unsafe-inline'` is needed for React Router's inline replay scripts
    // and the static-server's __AGENT_CANVAS_* config injection. Drop once
    // those become nonce-driven.
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${POSTHOG_API_HOST}`,
    // Tailwind/HeroUI and Monaco require inline styles.
    "style-src 'self' 'unsafe-inline'",
    `font-src 'self' data:`,
    `img-src ${imgSrc}`,
    `connect-src ${connectSrc}`,
    `frame-src ${frameSrc}`,
    // Only emit frame-ancestors when this is going out as an HTTP header;
    // the directive is ignored inside <meta> tags, but emitting it costs
    // nothing and keeps the two delivery paths in sync. The value is
    // configurable because some hosted deployments embed the canvas
    // inside their own portal.
    ...(forMetaTag ? [] : [`frame-ancestors ${frameAncestors}`]),
    "base-uri 'self'",
    `form-action ${formActionSrc}`,
    "object-src 'none'",
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}

/**
 * Build a `Permissions-Policy` string that disables browser features the
 * app does not need. Each disabled feature reduces the attack surface for
 * XSS payloads and hostile iframe embeds. Keep this list narrow — disabling
 * features the app actually uses will silently break things.
 */
export function buildPermissionsPolicy(): string {
  return [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "payment=()",
    "usb=()",
    "serial=()",
    "bluetooth=()",
    "magnetometer=()",
    "gyroscope=()",
    "accelerometer=()",
    "ambient-light-sensor=()",
    "autoplay=()",
    "encrypted-media=()",
    "picture-in-picture=()",
    "publickey-credentials-get=(self)",
    "xr-spatial-tracking=()",
  ].join(", ");
}

/**
 * Convenience: build all security-relevant response headers at once, for
 * the static-server and any future HTTP-header injection points.
 */
export function buildSecurityHeaders(
  backends: ReadonlyArray<Backend>,
  options: Pick<BuildContentSecurityPolicyOptions, "frameAncestors"> = {},
): Record<string, string> {
  const { frameAncestors = "'none'" } = options;
  // `X-Frame-Options: DENY` matches `frame-ancestors 'none'` (the strict
  // default). When the CSP is relaxed to allow some embeds (e.g.
  // `frameAncestors = "'self'"` for same-origin hosting), we relax the
  // legacy header to the same value to keep them in sync.
  const xFrameOptions =
    frameAncestors === "'none'"
      ? "DENY"
      : frameAncestors === "'self'"
        ? "SAMEORIGIN"
        : ""; // empty string tells the static-server to omit the header entirely

  return {
    "Content-Security-Policy": buildContentSecurityPolicy({
      backends,
      frameAncestors,
    }),
    "Permissions-Policy": buildPermissionsPolicy(),
    // Defence-in-depth: refuse to be embedded by any site by default. The
    // workspace artifacts embed *us* via <iframe src>; this header governs
    // who can embed *us*. Relaxed in lock-step with `frame-ancestors`
    // above for hosted-deployments that need it.
    ...(xFrameOptions ? { "X-Frame-Options": xFrameOptions } : {}),
    // Tell browsers the body of this page should not be sniffed for content;
    // we always emit proper Content-Type.
    "X-Content-Type-Options": "nosniff",
    // Limit how much the Referer header leaks when the user clicks external
    // links (docs, GitHub repo, etc.). `strict-origin-when-cross-origin`
    // sends the full URL for same-origin requests and only the origin for
    // cross-origin ones — the standard modern default.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // HSTS only meaningful for HTTPS deployments; harmless on plain http
    // because the browser ignores it there. 1 year, include subdomains,
    // allow preload-list submission.
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
}
