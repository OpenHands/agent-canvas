/**
 * Content-Security-Policy and other security-header builder for the
 * static-server and other Node.js delivery paths.
 *
 * Why a separate copy of the logic instead of importing
 * `src/utils/security-headers.ts`: that module is TypeScript, imports the
 * `Backend` type from the app, and depends on Vite's bundling pipeline to
 * resolve. Node-scripts in `scripts/` run before any bundling, so they
 * need a plain `.mjs` that uses `require()`-style ESM imports only.
 *
 * Both copies MUST stay in sync — the canonical documentation lives in
 * `src/utils/security-headers.ts`. If you change one, change the other and
 * update the corresponding tests in `__tests__/utils/security-headers.test.ts`.
 */

/**
 * Convert a backend target URL into a CSP source expression.
 * Mirrors `backendHostToCspSource` in src/utils/security-headers.ts.
 *
 * @param {string | null | undefined} target
 * @returns {string | null}
 */
export function targetToCspSource(target) {
  if (!target || typeof target !== "string") return null;
  const trimmed = target.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * Build a CSP string for the static-server, given the proxy route table
 * (a `{ prefix: targetUrl }` map, matching `parseArgs().routes`).
 *
 * The connect-src list includes each proxy target's origin (so the browser
 * can talk to the agent-server through Vite or the static-server's reverse
 * proxy), the same telemetry endpoints the browser-side policy lists, and
 * `ws:` / `wss:` for WebSockets.
 *
 * @param {Record<string, string>} routesMap
 * @param {object} [options]
 * @param {string} [options.frameAncestors="'none'"] value for the
 *   `frame-ancestors` directive. Use `"'self'"` for hosted deployments
 *   that legitimately embed the canvas inside their own portal, or a
 *   specific origin to whitelist.
 * @returns {string}
 */
export function buildContentSecurityPolicy(routesMap, options = {}) {
  const { frameAncestors = "'none'" } = options;
  const backendOrigins = new Set(["'self'"]);
  for (const target of Object.values(routesMap ?? {})) {
    const origin = targetToCspSource(target);
    if (origin) backendOrigins.add(origin);
  }
  const backendSources = Array.from(backendOrigins).join(" ");

  // Connect-src extends the backend list with telemetry endpoints + WS.
  const connectSources = [
    backendSources,
    "https://us.i.posthog.com",
    "https://z.openhands.dev",
    "ws:",
    "wss:",
  ].join(" ");

  // frame-src should ONLY contain the page origin and backend origins;
  // telemetry endpoints don't serve iframes.
  const frameSources = backendSources;

  // img-src adds data:, blob:, https: for inline previews and remote
  // avatars. Note `'self'` is already in `backendSources`.
  const imgSources = ["data:", "blob:", "https:", backendSources].join(" ");

  // form-action also covers backend origins so legitimate cross-origin
  // form submissions (file uploads, OAuth returns) are not blocked by
  // the default-deny stance on hosted deployments where the canvas and
  // the agent-server live on different origins.
  const formActionSources = backendSources;

  return [
    "default-src 'self'",
    // 'unsafe-inline' is required: React Router emits inline replay scripts
    // and this script injects window.__AGENT_CANVAS_* globals via an inline
    // <script>. Tightening this to a nonce-based policy requires both ends
    // to participate; tracked in docs/SECURITY.md.
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://us.i.posthog.com`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src ${imgSources}`,
    `connect-src ${connectSources}`,
    `frame-src ${frameSources}`,
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    `form-action ${formActionSources}`,
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const PERMISSIONS_POLICY = [
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

/**
 * Build the full set of security response headers for the static-server.
 *
 * @param {Record<string, string>} routesMap
 * @param {object} [options] forwarded to {@link buildContentSecurityPolicy}
 * @returns {Record<string, string>}
 */
export function buildSecurityHeaders(routesMap, options = {}) {
  const { frameAncestors = "'none'" } = options;
  // Keep X-Frame-Options in lock-step with frame-ancestors. The legacy
  // header is not needed when neither directive forbids the embed, but
  // we still want a tight default and an opt-out for hosted use cases.
  const xFrameOptions =
    frameAncestors === "'none'"
      ? "DENY"
      : frameAncestors === "'self'"
        ? "SAMEORIGIN"
        : "";

  const headers = {
    "Content-Security-Policy": buildContentSecurityPolicy(routesMap, options),
    "Permissions-Policy": PERMISSIONS_POLICY,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
  if (xFrameOptions) {
    headers["X-Frame-Options"] = xFrameOptions;
  }
  return headers;
}
