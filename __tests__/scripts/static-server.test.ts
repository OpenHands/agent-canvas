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

    it("parses --runtime-services-info", () => {
      const json = '{"mode":"docker"}';
      const config = parseArgs(["--runtime-services-info", json]);
      expect(config.runtimeServicesInfo).toBe(json);
    });

    it("treats empty string as null for runtime services info", () => {
      const config = parseArgs(["--runtime-services-info", ""]);
      expect(config.runtimeServicesInfo).toBeNull();
    });

    it("defaults defaultBackends to null", () => {
      const config = parseArgs([]);
      expect(config.defaultBackends).toBeNull();
    });

    it("parses --default-backends", () => {
      const json = '[{"host":"http://10.0.0.5:8000","apiKey":"k"}]';
      const config = parseArgs(["--default-backends", json]);
      expect(config.defaultBackends).toBe(json);
    });

    it("treats empty string as null for default backends", () => {
      const config = parseArgs(["--default-backends", ""]);
      expect(config.defaultBackends).toBeNull();
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

  describe("default backends injection", () => {
    async function startServerWithDefaultBackends(
      dir: string,
      defaultBackends: string,
    ) {
      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir,
        routes: {},
        defaultBackends,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Static server did not bind to a TCP port");
      }
      return `http://127.0.0.1:${address.port}`;
    }

    function writeIndex(): string {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );
      return buildDir;
    }

    it("exposes the backends on window.__AGENT_CANVAS_DEFAULT_BACKENDS__", async () => {
      const buildDir = writeIndex();
      const json = JSON.stringify([
        { host: "http://10.0.0.5:8000", apiKey: "fleet-key", name: "Fleet A" },
      ]);
      const origin = await startServerWithDefaultBackends(buildDir, json);
      const body = await (await fetch(`${origin}/`)).text();

      expect(body).toContain("window.__AGENT_CANVAS_DEFAULT_BACKENDS__");
      // Emitted as a real array literal (no escaped quotes) so the client
      // global is self-describing.
      expect(body).toContain('"host":"http://10.0.0.5:8000"');
      expect(body).toContain('"name":"Fleet A"');
    });

    it("ignores a non-array value without injecting the global", async () => {
      const buildDir = writeIndex();
      const origin = await startServerWithDefaultBackends(
        buildDir,
        '{"host":"http://10.0.0.5:8000"}',
      );
      const body = await (await fetch(`${origin}/`)).text();
      expect(body).not.toContain("__AGENT_CANVAS_DEFAULT_BACKENDS__");
    });

    it("does not inject when defaultBackends is null", async () => {
      const buildDir = writeIndex();
      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir: buildDir,
        routes: {},
        defaultBackends: null,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const origin = `http://127.0.0.1:${(address as { port: number }).port}`;

      const body = await (await fetch(`${origin}/`)).text();
      expect(body).not.toContain("__AGENT_CANVAS_DEFAULT_BACKENDS__");
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
});
