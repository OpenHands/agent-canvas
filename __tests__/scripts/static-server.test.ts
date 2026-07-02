import type { Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { parseArgs, startStaticServer } from "../../scripts/static-server.mjs";

describe("static-server.mjs", () => {
  const servers: Server[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );

    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function startServer(dir: string) {
    const server = await startStaticServer({
      port: 0,
      host: "127.0.0.1",
      dir,
      routes: {},
    });
    servers.push(server);

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Static server did not bind to a TCP port");
    }

    return `http://127.0.0.1:${address.port}`;
  }

  describe("parseArgs", () => {
    it("defaults sessionApiKey to null", () => {
      const config = parseArgs([]);
      expect(config.sessionApiKey).toBeNull();
    });

    it("parses --session-api-key", () => {
      const config = parseArgs(["--session-api-key", "my-test-key"]);
      expect(config.sessionApiKey).toBe("my-test-key");
    });

    it("treats empty string as null for session key", () => {
      const config = parseArgs(["--session-api-key", ""]);
      expect(config.sessionApiKey).toBeNull();
    });

    it("defaults runtimeServicesInfo to null", () => {
      const config = parseArgs([]);
      expect(config.runtimeServicesInfo).toBeNull();
    });

    it("defaults lockToCloud to null", () => {
      const config = parseArgs([]);
      expect(config.lockToCloud).toBeNull();
    });

    it("parses --lock-to-cloud", () => {
      const config = parseArgs([
        "--lock-to-cloud",
        "https://cloud.example.com",
      ]);
      expect(config.lockToCloud).toBe("https://cloud.example.com");
    });

    it("treats empty string as null for lockToCloud", () => {
      const config = parseArgs(["--lock-to-cloud", ""]);
      expect(config.lockToCloud).toBeNull();
    });

    it("parses --runtime-services-info", () => {
      const json = '{"mode":"docker"}';
      const config = parseArgs(["--runtime-services-info", json]);
      expect(config.runtimeServicesInfo).toBe(json);
    });

    it("treats empty string as null for runtime services info", () => {
      const config = parseArgs(["--runtime-services-info", ""]);
      expect(config.runtimeServicesInfo).toBeNull();
    });

    it("defaults frameAncestors to 'none' (strict default-deny)", () => {
      const config = parseArgs([]);
      expect(config.frameAncestors).toBe("'none'");
    });

    it("parses --frame-ancestors for hosted deployments", () => {
      const config = parseArgs(["--frame-ancestors", "'self'"]);
      expect(config.frameAncestors).toBe("'self'");

      const portal = parseArgs([
        "--frame-ancestors",
        "https://portal.example.com",
      ]);
      expect(portal.frameAncestors).toBe("https://portal.example.com");
    });

    it("throws on --frame-ancestors without a value", () => {
      expect(() => parseArgs(["--frame-ancestors"])).toThrow();
    });
  });

  describe("runtime services info injection", () => {
    async function startServerWithRuntimeInfo(
      dir: string,
      runtimeServicesInfo: string,
    ) {
      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir,
        routes: {},
        runtimeServicesInfo,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Static server did not bind to a TCP port");
      }
      return `http://127.0.0.1:${address.port}`;
    }

    // Regression test for the Docker / published-binary path: static builds
    // have no VITE_RUNTIME_SERVICES_INFO baked in, so the agent's
    // <RUNTIME_SERVICES> block is populated from this injected window global
    // (see `parseRuntimeServicesInfo()` in src/api/agent-server-adapter.ts).
    it("exposes the JSON on window.__AGENT_CANVAS_RUNTIME_SERVICES_INFO__", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const info = JSON.stringify({
        mode: "docker",
        services: {
          agent_server: { url_from_agent: "http://127.0.0.1:18000" },
        },
      });
      const origin = await startServerWithRuntimeInfo(buildDir, info);
      const body = await (await fetch(`${origin}/`)).text();

      expect(body).toContain("window.__AGENT_CANVAS_RUNTIME_SERVICES_INFO__");
      // Stored as a JSON *string* (note the escaped quotes) so the browser can
      // JSON.parse it, exactly like the VITE_RUNTIME_SERVICES_INFO env var.
      expect(body).toContain('\\"mode\\"');
      expect(body).toContain("docker");
    });

    it("does not inject when runtimeServicesInfo is null", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir: buildDir,
        routes: {},
        runtimeServicesInfo: null,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const origin = `http://127.0.0.1:${(address as { port: number }).port}`;

      const body = await (await fetch(`${origin}/`)).text();
      expect(body).not.toContain("__AGENT_CANVAS_RUNTIME_SERVICES_INFO__");
    });
  });

  describe("lock-to-cloud injection", () => {
    async function startServerLockedToCloud(dir: string, lockToCloud: string) {
      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir,
        routes: {},
        lockToCloud,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Static server did not bind to a TCP port");
      }
      return `http://127.0.0.1:${address.port}`;
    }

    it("exposes the locked Cloud URL on window.__AGENT_CANVAS_LOCK_TO_CLOUD__", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerLockedToCloud(
        buildDir,
        "https://cloud.example.com",
      );
      const body = await (await fetch(`${origin}/`)).text();

      expect(body).toContain("window.__AGENT_CANVAS_LOCK_TO_CLOUD__");
      expect(body).toContain('"https://cloud.example.com"');
    });

    it("injects lock-to-cloud into SPA fallback index.html", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerLockedToCloud(
        buildDir,
        "https://cloud.example.com",
      );
      const response = await fetch(`${origin}/some/deep/route`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain("__AGENT_CANVAS_LOCK_TO_CLOUD__");
    });
  });

  describe("session key injection", () => {
    async function startServerWithKey(dir: string, sessionApiKey: string) {
      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir,
        routes: {},
        sessionApiKey,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Static server did not bind to a TCP port");
      }
      return `http://127.0.0.1:${address.port}`;
    }

    it("injects session key script into index.html", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "test-session-key");
      const response = await fetch(`${origin}/`);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("openhands-agent-server-config");
      expect(body).toContain("test-session-key");
      expect(body).toContain("sessionApiKey");
    });

    // Regression test: the published `agent-canvas` binary builds without
    // VITE_SESSION_API_KEY baked in, so the React app reads the key from
    // `window.__AGENT_CANVAS_SESSION_API_KEY__` (see
    // `getBakedSessionApiKey()` in `src/api/agent-server-config.ts`).
    // Without this assignment, `makeDefaultLocalBackend()` returns null
    // on a fresh install and the user gets the Manage Backends modal
    // instead of onboarding.
    it("exposes the session key on window.__AGENT_CANVAS_SESSION_API_KEY__", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "runtime-key");
      const response = await fetch(`${origin}/`);
      const body = await response.text();

      expect(body).toContain("window.__AGENT_CANVAS_SESSION_API_KEY__");
      expect(body).toContain('"runtime-key"');
      // The window assignment must precede the localStorage write so the
      // global is set even if storage access throws (private mode, etc.).
      const windowIdx = body.indexOf("__AGENT_CANVAS_SESSION_API_KEY__");
      const localStorageIdx = body.indexOf("openhands-agent-server-config");
      expect(windowIdx).toBeGreaterThan(-1);
      expect(localStorageIdx).toBeGreaterThan(-1);
      expect(windowIdx).toBeLessThan(localStorageIdx);
    });

    it("injects session key into SPA fallback index.html", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "fallback-key");
      const response = await fetch(`${origin}/some/deep/route`);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("fallback-key");
    });

    it("does not inject into non-html asset responses", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      mkdirSync(path.join(buildDir, "assets"));
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );
      writeFileSync(
        path.join(buildDir, "assets", "app.js"),
        "console.log('app');",
      );

      const origin = await startServerWithKey(buildDir, "should-not-inject");
      const response = await fetch(`${origin}/assets/app.js`);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).not.toContain("should-not-inject");
    });

    it("sets Cache-Control: no-cache for injected index.html", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "cache-test-key");
      const response = await fetch(`${origin}/`);

      expect(response.headers.get("cache-control")).toBe("no-cache");
    });

    it("does not inject when sessionApiKey is null", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir: buildDir,
        routes: {},
        sessionApiKey: null,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const origin = `http://127.0.0.1:${(address as { port: number }).port}`;

      const response = await fetch(`${origin}/`);
      const body = await response.text();
      expect(body).not.toContain("openhands-agent-server-config");
      expect(body).not.toContain("__AGENT_CANVAS_SESSION_API_KEY__");
    });

    it("injects session key into HTML without </head> tag (falls back to </body>)", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><body>no-head</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "no-head-key");
      const response = await fetch(`${origin}/`);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("no-head-key");
      expect(body).toContain("openhands-agent-server-config");
      // Script should appear before </body>, not at the very front of the document
      expect(body.indexOf("no-head-key")).toBeLessThan(body.indexOf("</body>"));
      expect(body.indexOf("no-head-key")).toBeGreaterThan(0);
    });
  });

  it("serves nested build assets on all platforms", async () => {
    const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
    tempDirs.push(buildDir);
    mkdirSync(path.join(buildDir, "assets"));
    writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");
    writeFileSync(
      path.join(buildDir, "assets", "entry.client-test.js"),
      "export const loaded = true;\n",
    );

    const origin = await startServer(buildDir);
    const response = await fetch(`${origin}/assets/entry.client-test.js`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/javascript",
    );
    await expect(response.text()).resolves.toContain("loaded = true");
  });

  it("keeps paths confined to the static directory", async () => {
    const parentDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-parent-"));
    tempDirs.push(parentDir);
    const buildDir = path.join(parentDir, "build");
    mkdirSync(buildDir);
    writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");
    writeFileSync(path.join(parentDir, "secret.txt"), "secret\n");

    const origin = await startServer(buildDir);
    const response = await fetch(`${origin}/../secret.txt`);

    expect(response.status).not.toBe(200);
    await expect(response.text()).resolves.not.toContain("secret");
  });

  describe("security headers", () => {
    it("emits a Content-Security-Policy header on HTML responses", async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "static-sec-"));
      tempDirs.push(dir);
      const buildDir = path.join(dir, "build");
      mkdirSync(buildDir);
      writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");

      const origin = await startServerWithRoutes(buildDir, {
        "/api": "http://127.0.0.1:18000",
      });
      const response = await fetch(`${origin}/index.html`);

      expect(response.status).toBe(200);
      const csp = response.headers.get("content-security-policy");
      expect(csp).toBeTruthy();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("http://127.0.0.1:18000");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
    });

    it("emits broad security headers on every response", async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "static-sec-"));
      tempDirs.push(dir);
      const buildDir = path.join(dir, "build");
      mkdirSync(buildDir);
      writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");
      writeFileSync(path.join(buildDir, "app.js"), "console.log('x')");

      const origin = await startServer(buildDir);
      const html = await fetch(`${origin}/index.html`);
      expect(html.headers.get("x-frame-options")).toBe("DENY");
      expect(html.headers.get("x-content-type-options")).toBe("nosniff");
      expect(html.headers.get("referrer-policy")).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(html.headers.get("strict-transport-security")).toContain(
        "max-age=",
      );
      expect(html.headers.get("permissions-policy")).toContain("camera=()");

      const js = await fetch(`${origin}/app.js`);
      expect(js.status).toBe(200);
      // CSP only goes on HTML; .js must not have it.
      expect(js.headers.get("content-security-policy")).toBeNull();
      // But the broad headers do.
      expect(js.headers.get("x-frame-options")).toBe("DENY");
      expect(js.headers.get("x-content-type-options")).toBe("nosniff");
    });

    it("includes every proxy target's origin in connect-src", async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "static-sec-"));
      tempDirs.push(dir);
      const buildDir = path.join(dir, "build");
      mkdirSync(buildDir);
      writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");

      const origin = await startServerWithRoutes(buildDir, {
        "/api": "http://localhost:18000",
        "/api/automation": "http://localhost:18001",
      });
      const response = await fetch(`${origin}/index.html`);
      const csp = response.headers.get("content-security-policy") ?? "";

      expect(csp).toContain("http://localhost:18000");
      expect(csp).toContain("http://localhost:18001");
      expect(csp).toContain("https://us.i.posthog.com");
      expect(csp).toContain("https://z.openhands.dev");
      expect(csp).toContain("ws:");
      expect(csp).toContain("wss:");
    });

    it("includes every proxy target's origin in form-action (hosted scenarios)", async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "static-sec-"));
      tempDirs.push(dir);
      const buildDir = path.join(dir, "build");
      mkdirSync(buildDir);
      writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");

      const origin = await startServerWithRoutes(buildDir, {
        "/api": "http://127.0.0.1:18000",
      });
      const csp =
        (await fetch(`${origin}/index.html`)).headers.get(
          "content-security-policy",
        ) ?? "";

      // The directive now covers the backend origin so cross-origin
      // form posts (file uploads, OAuth-style returns) are not
      // blocked on hosted deployments.
      expect(csp).toMatch(/form-action[^;]*'self'[^;]*http:\/\/127\.0\.0\.1:18000/);
    });

    it("relaxes frame-ancestors / X-Frame-Options for hosted embedding", async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "static-sec-"));
      tempDirs.push(dir);
      const buildDir = path.join(dir, "build");
      mkdirSync(buildDir);
      writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");

      // Use startStaticServer directly so we can pass frameAncestors.
      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir: buildDir,
        routes: {},
        frameAncestors: "'self'",
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Static server did not bind to a TCP port");
      }
      const origin = `http://127.0.0.1:${address.port}`;

      const response = await fetch(`${origin}/index.html`);
      const csp = response.headers.get("content-security-policy") ?? "";

      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).not.toContain("frame-ancestors 'none'");
      expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    });

    it("omits X-Frame-Options when frame-ancestors lists an arbitrary origin", async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "static-sec-"));
      tempDirs.push(dir);
      const buildDir = path.join(dir, "build");
      mkdirSync(buildDir);
      writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");

      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir: buildDir,
        routes: {},
        frameAncestors: "https://portal.example.com",
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Static server did not bind to a TCP port");
      }
      const origin = `http://127.0.0.1:${address.port}`;

      const response = await fetch(`${origin}/index.html`);
      const csp = response.headers.get("content-security-policy") ?? "";

      expect(csp).toContain("frame-ancestors https://portal.example.com");
      // No clean legacy header mapping when whitelisting a specific
      // origin — better to omit the header than ship a stricter
      // fallback that would undermine the CSP.
      expect(response.headers.get("x-frame-options")).toBeNull();
    });
  });

  // Helper that mirrors `startServer` but lets the test configure proxy
  // routes. Co-located with the security-headers describe so it can share
  // the `servers` / `tempDirs` cleanup closures.
  async function startServerWithRoutes(
    dir: string,
    routes: Record<string, string>,
  ) {
    const server = await startStaticServer({
      port: 0,
      host: "127.0.0.1",
      dir,
      routes,
    });
    servers.push(server);

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Static server did not bind to a TCP port");
    }
    return `http://127.0.0.1:${address.port}`;
  }
});
