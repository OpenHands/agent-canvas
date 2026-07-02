import { describe, expect, it } from "vitest";
import type { Backend } from "../../src/api/backend-registry/types";
import {
  backendHostToCspSource,
  buildConnectSrc,
  buildContentSecurityPolicy,
  buildFormActionSrc,
  buildFrameSrc,
  buildImgSrc,
  buildPermissionsPolicy,
  buildSecurityHeaders,
} from "../../src/utils/security-headers";

const localBackend: Backend = {
  id: "default-local",
  name: "Local",
  host: "http://localhost:18000",
  apiKey: "redacted",
  kind: "local",
};

const cloudBackend: Backend = {
  id: "cloud-1",
  name: "Cloud",
  host: "https://app.all-hands.dev",
  apiKey: "redacted",
  kind: "cloud",
};

const loopbackBackend: Backend = {
  id: "loopback",
  name: "Loopback",
  host: "https://127.0.0.1:18100",
  apiKey: "redacted",
  kind: "local",
};

describe("backendHostToCspSource", () => {
  it("strips the path from a full URL", () => {
    expect(backendHostToCspSource("https://example.com/api/v1")).toBe(
      "https://example.com",
    );
  });

  it("preserves the port", () => {
    expect(backendHostToCspSource("http://localhost:18000")).toBe(
      "http://localhost:18000",
    );
  });

  it("strips userinfo (URL constructor does this for security)", () => {
    // The WHATWG URL parser deliberately discards userinfo from `host`
    // (CVE-2021-29918 / https://url.spec.whatwg.org/#host-parsing). Our CSP
    // source must follow suit — emitting userinfo would be a credential
    // leak in headers.
    expect(backendHostToCspSource("https://user:pw@example.com")).toBe(
      "https://example.com",
    );
  });

  it("returns null for empty / whitespace input", () => {
    expect(backendHostToCspSource("")).toBeNull();
    expect(backendHostToCspSource("   ")).toBeNull();
    expect(backendHostToCspSource(null)).toBeNull();
    expect(backendHostToCspSource(undefined)).toBeNull();
  });

  it("returns null for non-http(s) schemes", () => {
    expect(backendHostToCspSource("javascript:alert(1)")).toBeNull();
    expect(backendHostToCspSource("data:text/html,foo")).toBeNull();
    expect(backendHostToCspSource("ws://localhost:1234")).toBeNull();
    expect(backendHostToCspSource("ftp://example.com")).toBeNull();
  });

  it("returns null for bare hostnames (no scheme)", () => {
    expect(backendHostToCspSource("example.com")).toBeNull();
    expect(backendHostToCspSource("localhost:18000")).toBeNull();
  });

  it("returns null for malformed URLs", () => {
    expect(backendHostToCspSource("https://")).toBeNull();
    expect(backendHostToCspSource("https://[")).toBeNull();
  });
});

describe("buildConnectSrc", () => {
  it("always includes 'self' and the telemetry endpoints", () => {
    const out = buildConnectSrc([]);
    expect(out).toContain("'self'");
    expect(out).toContain("https://us.i.posthog.com");
    expect(out).toContain("https://z.openhands.dev");
    expect(out).toContain("ws:");
    expect(out).toContain("wss:");
  });

  it("includes every backend's origin", () => {
    const out = buildConnectSrc([localBackend, cloudBackend]);
    expect(out).toContain("http://localhost:18000");
    expect(out).toContain("https://app.all-hands.dev");
  });

  it("deduplicates origins", () => {
    const a: Backend = { ...localBackend, id: "a" };
    const b: Backend = { ...localBackend, id: "b" };
    const out = buildConnectSrc([a, b]);
    const matches = out.match(/http:\/\/localhost:18000/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("silently drops backends with malformed hosts", () => {
    const broken: Backend = { ...localBackend, host: "not-a-url" };
    const out = buildConnectSrc([broken, localBackend]);
    expect(out).not.toContain("not-a-url");
    expect(out).toContain("http://localhost:18000");
  });
});

describe("buildFrameSrc", () => {
  it("includes backend origins but excludes telemetry", () => {
    const out = buildFrameSrc([localBackend, cloudBackend]);
    expect(out).toContain("'self'");
    expect(out).toContain("http://localhost:18000");
    expect(out).toContain("https://app.all-hands.dev");
    expect(out).not.toContain("posthog");
    expect(out).not.toContain("z.openhands.dev");
    expect(out).not.toContain("ws:");
  });
});

describe("buildImgSrc", () => {
  it("includes data:, blob:, https:, and all backend origins", () => {
    const out = buildImgSrc([localBackend]);
    expect(out).toContain("'self'");
    expect(out).toContain("data:");
    expect(out).toContain("blob:");
    expect(out).toContain("https:");
    expect(out).toContain("http://localhost:18000");
  });
});

describe("buildContentSecurityPolicy", () => {
  it("starts with default-src 'self'", () => {
    const policy = buildContentSecurityPolicy({ backends: [localBackend] });
    expect(policy).toMatch(/^default-src 'self'/);
  });

  it("contains every required directive", () => {
    const policy = buildContentSecurityPolicy({ backends: [localBackend] });
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
    expect(policy).toContain("connect-src");
    expect(policy).toContain("frame-src");
    expect(policy).toContain("img-src");
  });

  it("omits frame-ancestors when forMetaTag is true", () => {
    const meta = buildContentSecurityPolicy({
      backends: [],
      forMetaTag: true,
    });
    expect(meta).not.toContain("frame-ancestors");
  });

  it("includes frame-ancestors by default for HTTP-header use", () => {
    const header = buildContentSecurityPolicy({ backends: [] });
    expect(header).toContain("frame-ancestors 'none'");
  });

  it("never enables bare eval() in script-src", () => {
    const policy = buildContentSecurityPolicy({
      backends: [localBackend, cloudBackend],
    });
    // script-src must not contain plain `'unsafe-eval'` (only
    // `'wasm-unsafe-eval'` is allowed for xterm.js).
    const scriptSrc = policy
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    // Allow `'wasm-unsafe-eval'` but not plain `'unsafe-eval'`.
    expect(scriptSrc).not.toMatch(/(^|\s)'unsafe-eval'/);
    expect(scriptSrc).not.toMatch(/\beval\s*\(/);
  });

  it("uses ;  separators (not ,)", () => {
    const policy = buildContentSecurityPolicy({ backends: [] });
    const directives = policy.split(";");
    expect(directives.length).toBeGreaterThan(5);
  });
});

describe("buildPermissionsPolicy", () => {
  it("disables dangerous features by default", () => {
    const policy = buildPermissionsPolicy();
    expect(policy).toContain("camera=()");
    expect(policy).toContain("microphone=()");
    expect(policy).toContain("geolocation=()");
    expect(policy).toContain("payment=()");
    expect(policy).toContain("usb=()");
    expect(policy).toContain("bluetooth=()");
  });

  it("allows WebAuthn for the same origin", () => {
    // publickey-credentials-get=(self) — important so WebAuthn still works
    // for any future passkey login flow.
    expect(buildPermissionsPolicy()).toContain(
      "publickey-credentials-get=(self)",
    );
  });
});

describe("buildSecurityHeaders", () => {
  it("returns every security-relevant header", () => {
    const headers = buildSecurityHeaders([localBackend]);
    expect(headers["Content-Security-Policy"]).toBeDefined();
    expect(headers["Permissions-Policy"]).toBeDefined();
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=");
  });

  it("includes all registered backends in the CSP", () => {
    const headers = buildSecurityHeaders([
      localBackend,
      cloudBackend,
      loopbackBackend,
    ]);
    const csp = headers["Content-Security-Policy"];
    expect(csp).toContain("http://localhost:18000");
    expect(csp).toContain("https://app.all-hands.dev");
    expect(csp).toContain("https://127.0.0.1:18100");
  });
});

describe("form-action (hosted deployment support)", () => {
  it("includes 'self' plus every registered backend", () => {
    const sources = buildFormActionSrc([localBackend, cloudBackend]);
    expect(sources).toContain("'self'");
    expect(sources).toContain("http://localhost:18000");
    expect(sources).toContain("https://app.all-hands.dev");
    expect(sources).not.toContain("https://us.i.posthog.com");
  });

  it("falls back to 'self' when no backends are registered", () => {
    expect(buildFormActionSrc([])).toBe("'self'");
  });

  it("drops malformed backend hosts", () => {
    const malformed: Backend = {
      id: "bad",
      name: "Bad",
      host: "not-a-url",
      apiKey: "x",
      kind: "local",
    };
    const sources = buildFormActionSrc([malformed]);
    expect(sources).toBe("'self'");
  });
});

describe("frame-ancestors (hosted embedding support)", () => {
  it("defaults to 'frame-ancestors 'none'' for tight default-deny", () => {
    const csp = buildContentSecurityPolicy({
      backends: [localBackend],
    });
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("relaxes to 'frame-ancestors 'self'' when frameAncestors is set", () => {
    const csp = buildContentSecurityPolicy({
      backends: [localBackend],
      frameAncestors: "'self'",
    });
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("frame-ancestors 'none'");
  });

  it("accepts a specific origin (hosted-deployment portal)", () => {
    const csp = buildContentSecurityPolicy({
      backends: [localBackend],
      frameAncestors: "https://portal.example.com",
    });
    expect(csp).toContain("frame-ancestors https://portal.example.com");
  });

  it("synchronizes X-Frame-Options with the CSP frame-ancestors value", () => {
    expect(
      buildSecurityHeaders([localBackend])["X-Frame-Options"],
    ).toBe("DENY");

    expect(
      buildSecurityHeaders([localBackend], {
        frameAncestors: "'self'",
      })["X-Frame-Options"],
    ).toBe("SAMEORIGIN");

    // For an arbitrary origin whitelist there is no clean legacy header
    // mapping; the static-server / Vite dev path should omit it entirely
    // so we don't undermine the CSP with a stricter legacy directive.
    expect(
      buildSecurityHeaders([localBackend], {
        frameAncestors: "https://portal.example.com",
      })["X-Frame-Options"],
    ).toBeUndefined();
  });
});
