import { once } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, request as requestHttp } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { server as mockServer } from "#/mocks/node";
import { startIngress } from "./ingress.mjs";
import { createRouter } from "./proxy-utils.mjs";
import { startStaticServer } from "./static-server.mjs";

const servers = [];

beforeAll(() => {
  mockServer.close();
});

function track(server) {
  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.__testSockets = sockets;
  servers.push(server);
  return server;
}

async function listen(server) {
  track(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function waitListening(server) {
  if (server.listening) return;
  await once(server, "listening");
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
    for (const socket of server.__testSockets ?? []) {
      socket.destroy();
    }
  });
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function requestLocal(url, { body = null, method = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (body !== null) {
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = requestHttp(url, { headers, method }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          headers: res.headers,
          json: () => JSON.parse(text),
          status: res.statusCode,
          text,
        });
      });
    });

    req.on("error", reject);
    req.end(body ?? undefined);
  });
}

afterEach(async () => {
  const closing = servers.splice(0).reverse().map(closeServer);
  await Promise.all(closing);
});

describe("proxy routing helpers", () => {
  it("matches the longest complete path prefix", () => {
    const route = createRouter(
      {
        "/api": "api",
        "/api/automation": "automation",
      },
      "default",
    );

    expect(route("/api/automation/jobs")).toBe("automation");
    expect(route("/api?status=1")).toBe("api");
    expect(route("/apiary")).toBe("default");
    expect(route("/unknown")).toBe("default");
  });
});

describe("ingress proxy", () => {
  it("proxies HTTP requests through httpxy", async () => {
    const upstreamPort = await listen(
      createServer(async (req, res) => {
        const body = await readRequestBody(req);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            body,
            method: req.method,
            url: req.url,
          }),
        );
      }),
    );

    const ingress = track(
      startIngress({
        port: 0,
        routes: {
          "/api": `http://127.0.0.1:${upstreamPort}`,
        },
      }),
    );
    await waitListening(ingress);

    const response = await requestLocal(
      `http://127.0.0.1:${ingress.address().port}/api/echo?x=1`,
      {
        body: "hello",
        method: "POST",
      },
    );

    expect(response.status).toBe(200);
    expect(response.json()).toEqual({
      body: "hello",
      method: "POST",
      url: "/api/echo?x=1",
    });
  });

  it("proxies WebSocket upgrades through httpxy", async () => {
    const upstream = createServer();
    upstream.on("upgrade", (_req, socket) => {
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Connection: Upgrade\r\n" +
          "Upgrade: websocket\r\n" +
          "\r\n",
      );
      socket.on("data", (chunk) => socket.write(chunk));
    });
    const upstreamPort = await listen(upstream);

    const ingress = track(
      startIngress({
        port: 0,
        routes: {
          "/sockets": `http://127.0.0.1:${upstreamPort}`,
        },
      }),
    );
    await waitListening(ingress);

    await new Promise((resolve, reject) => {
      const client = createConnection(
        { host: "127.0.0.1", port: ingress.address().port },
        () => {
          client.write(
            "GET /sockets/events HTTP/1.1\r\n" +
              "Host: localhost\r\n" +
              "Connection: Upgrade\r\n" +
              "Upgrade: websocket\r\n" +
              "\r\n",
          );
        },
      );
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error("Timed out waiting for proxied upgrade echo"));
      }, 5000);
      let upgraded = false;
      let received = "";

      client.on("data", (chunk) => {
        received += chunk.toString("utf8");
        if (!upgraded && received.includes("\r\n\r\n")) {
          expect(received).toContain("101 Switching Protocols");
          upgraded = true;
          received = "";
          client.write("ping");
          return;
        }
        if (upgraded && received.includes("ping")) {
          clearTimeout(timeout);
          client.destroy();
          resolve();
        }
      });
      client.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });
});

describe("static server", () => {
  async function makeStaticBuild() {
    const dir = await mkdtemp(join(tmpdir(), "agent-canvas-static-"));
    await mkdir(join(dir, "assets"));
    await writeFile(
      join(dir, "index.html"),
      '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
    );
    await writeFile(join(dir, "assets", "app.js"), "console.log('ok');");
    return dir;
  }

  it("serves static assets, injects runtime config, and rejects backend paths", async () => {
    const dir = await makeStaticBuild();
    const server = track(
      await startStaticServer({
        authRequired: false,
        dir,
        host: "127.0.0.1",
        lockToCloud: null,
        port: 0,
        rejectPrefixes: ["/api"],
        routes: {},
        runtimeServicesInfo: null,
        sessionApiKey: "test-key",
      }),
    );
    const origin = `http://127.0.0.1:${server.address().port}`;

    const asset = await requestLocal(`${origin}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers["cache-control"]).toContain("immutable");
    expect(asset.text).toBe("console.log('ok');");

    const root = await requestLocal(`${origin}/`);
    expect(root.status).toBe(200);
    expect(root.headers["content-type"]).toContain("text/html");
    expect(root.text).toContain(
      'window.__AGENT_CANVAS_SESSION_API_KEY__="test-key"',
    );

    const fallback = await requestLocal(`${origin}/conversation/abc`);
    expect(fallback.status).toBe(200);
    expect(fallback.text).toContain(
      'window.__AGENT_CANVAS_SESSION_API_KEY__="test-key"',
    );

    const missingAsset = await requestLocal(`${origin}/missing.js`);
    expect(missingAsset.status).toBe(404);

    const backendPath = await requestLocal(`${origin}/api/settings`);
    expect(backendPath.status).toBe(503);
  });

  it("keeps SPA fallback limited to GET and HEAD requests", async () => {
    const dir = await makeStaticBuild();
    const server = track(
      await startStaticServer({
        authRequired: false,
        dir,
        host: "127.0.0.1",
        lockToCloud: null,
        port: 0,
        rejectPrefixes: [],
        routes: {},
        runtimeServicesInfo: null,
        sessionApiKey: null,
      }),
    );
    const origin = `http://127.0.0.1:${server.address().port}`;

    const getFallback = await requestLocal(`${origin}/conversation/abc`);
    expect(getFallback.status).toBe(200);

    const postFallback = await requestLocal(`${origin}/conversation/abc`, {
      method: "POST",
    });
    expect(postFallback.status).toBe(404);
  });
});
