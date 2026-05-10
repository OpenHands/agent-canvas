import { createServer, type Server } from "node:http";
import { connect as netConnect, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const ingressScript = path.join(repoRoot, "scripts", "ingress.mjs");

describe("ingress.mjs CLI", () => {
  it("shows help with --help flag", async () => {
    const child = spawn(process.execPath, [ingressScript, "--help"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    const [code] = await once(child, "exit");

    expect(code).toBe(0);
    expect(output).toContain("Standalone Ingress / Reverse Proxy");
    expect(output).toContain("--port");
    expect(output).toContain("--route");
    expect(output).toContain("--default");
  });

  it("exits with error when no routes configured", async () => {
    const child = spawn(process.execPath, [ingressScript], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const [code] = await once(child, "exit");

    expect(code).toBe(1);
    expect(stderr).toContain("No routes configured");
  });

  it("parses --port argument correctly", async () => {
    const child = spawn(
      process.execPath,
      [ingressScript, "--port", "9999", "--default", "http://localhost:3000"],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    // Wait for startup message
    await delay(500);
    child.kill("SIGTERM");

    expect(output).toContain("9999");
  });

  it("parses --route arguments correctly", async () => {
    const child = spawn(
      process.execPath,
      [
        ingressScript,
        "--port",
        "9998",
        "--route",
        "/api=http://localhost:8000",
        "--route",
        "/static=http://localhost:3000",
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    await delay(500);
    child.kill("SIGTERM");

    expect(output).toContain("/api");
    expect(output).toContain("http://localhost:8000");
    expect(output).toContain("/static");
    expect(output).toContain("http://localhost:3000");
  });
});

describe("ingress proxy functionality", () => {
  let backend1: Server;
  let backend2: Server;
  let ingressProcess: ChildProcess;
  // Use ports in 29000 range to avoid conflicts with VS Code server (19000)
  const backend1Port = 29001;
  const backend2Port = 29002;
  const ingressPort = 29000;

  beforeAll(async () => {
    // Create mock backend 1
    backend1 = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ backend: 1, path: req.url }));
    });
    await new Promise<void>((resolve) => backend1.listen(backend1Port, resolve));

    // Create mock backend 2
    backend2 = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ backend: 2, path: req.url }));
    });
    await new Promise<void>((resolve) => backend2.listen(backend2Port, resolve));

    // Start ingress
    ingressProcess = spawn(
      process.execPath,
      [
        ingressScript,
        "--port",
        ingressPort.toString(),
        "--route",
        `/api/v2=http://localhost:${backend2Port}`,
        "--route",
        `/api=http://localhost:${backend1Port}`,
        "--default",
        `http://localhost:${backend1Port}`,
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    // Wait for ingress to start
    await delay(1000);
  });

  afterAll(async () => {
    ingressProcess?.kill("SIGTERM");
    await new Promise<void>((resolve) => backend1?.close(() => resolve()));
    await new Promise<void>((resolve) => backend2?.close(() => resolve()));
  });

  it("routes /api requests to backend1", async () => {
    const response = await fetch(`http://localhost:${ingressPort}/api/test`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.backend).toBe(1);
    expect(data.path).toBe("/api/test");
  });

  it("routes /api/v2 requests to backend2 (more specific route)", async () => {
    const response = await fetch(`http://localhost:${ingressPort}/api/v2/test`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.backend).toBe(2);
    expect(data.path).toBe("/api/v2/test");
  });

  it("routes unmatched paths to default backend", async () => {
    const response = await fetch(`http://localhost:${ingressPort}/other/path`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.backend).toBe(1);
    expect(data.path).toBe("/other/path");
  });

  it("preserves query parameters", async () => {
    const response = await fetch(
      `http://localhost:${ingressPort}/api/test?foo=bar&baz=123`,
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.path).toBe("/api/test?foo=bar&baz=123");
  });

  it("returns 502 when backend is unavailable", async () => {
    // Start a fresh ingress pointing to a non-existent backend
    const badIngressPort = 29003;
    const badIngress = spawn(
      process.execPath,
      [
        ingressScript,
        "--port",
        badIngressPort.toString(),
        "--default",
        "http://localhost:59999", // Non-existent port
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    await delay(500);

    try {
      const response = await fetch(`http://localhost:${badIngressPort}/test`);
      expect(response.status).toBe(502);
      const text = await response.text();
      expect(text).toContain("Bad Gateway");
    } finally {
      badIngress.kill("SIGTERM");
    }
  });
});

describe("ingress route matching", () => {
  let backend: Server;
  let ingressProcess: ChildProcess;
  const backendPort = 19011;
  const ingressPort = 19010;

  beforeAll(async () => {
    backend = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(req.url);
    });
    await new Promise<void>((resolve) => backend.listen(backendPort, resolve));

    ingressProcess = spawn(
      process.execPath,
      [
        ingressScript,
        "--port",
        ingressPort.toString(),
        "--route",
        `/api/automation=http://localhost:${backendPort}`,
        "--route",
        `/api=http://localhost:${backendPort}`,
        "--route",
        `/sockets=http://localhost:${backendPort}`,
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    await delay(1000);
  });

  afterAll(async () => {
    ingressProcess?.kill("SIGTERM");
    await new Promise<void>((resolve) => backend?.close(() => resolve()));
  });

  it("matches exact path", async () => {
    const response = await fetch(`http://localhost:${ingressPort}/api`);
    expect(response.status).toBe(200);
  });

  it("matches path with trailing content", async () => {
    const response = await fetch(`http://localhost:${ingressPort}/api/users`);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe("/api/users");
  });

  it("matches longer prefix before shorter", async () => {
    const response = await fetch(
      `http://localhost:${ingressPort}/api/automation/docs`,
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe("/api/automation/docs");
  });

  it("matches path with query string", async () => {
    const response = await fetch(
      `http://localhost:${ingressPort}/api?foo=bar`,
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe("/api?foo=bar");
  });

  it("returns 503 for unmatched routes with no default", async () => {
    const response = await fetch(`http://localhost:${ingressPort}/unknown`);
    expect(response.status).toBe(503);
  });
});

describe("ingress socket-error resilience", () => {
  // Regression coverage for crashes like:
  //   Error: read ECONNRESET ... Emitted 'error' event on Socket instance
  // which previously took down the whole ingress process when a WebSocket's
  // underlying TCP socket reset.
  let upstream: Server;
  let upstreamSockets: Duplex[];
  let ingressProcess: ChildProcess;
  let ingressStderr: string;
  const upstreamPort = 29111;
  const ingressPort = 29110;

  beforeAll(async () => {
    upstreamSockets = [];

    upstream = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });

    // Accept WebSocket upgrades, immediately RST the upstream socket on the
    // next tick. This reproduces the production crash without requiring a
    // real WebSocket handshake handler.
    upstream.on("upgrade", (_req, socket) => {
      upstreamSockets.push(socket);
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n\r\n",
      );
      // Force a TCP RST instead of a clean FIN to mirror ECONNRESET.
      setImmediate(() => {
        const s = socket as Duplex & { resetAndDestroy?: () => void };
        if (typeof s.resetAndDestroy === "function") {
          s.resetAndDestroy();
        } else {
          s.destroy(
            Object.assign(new Error("forced reset"), { code: "ECONNRESET" }),
          );
        }
      });
    });

    await new Promise<void>((resolve) => upstream.listen(upstreamPort, resolve));

    ingressStderr = "";
    ingressProcess = spawn(
      process.execPath,
      [
        ingressScript,
        "--port",
        ingressPort.toString(),
        "--default",
        `http://localhost:${upstreamPort}`,
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    ingressProcess.stderr?.on("data", (chunk) => {
      ingressStderr += chunk.toString();
    });

    await delay(800);
  });

  afterAll(async () => {
    ingressProcess?.kill("SIGTERM");
    for (const s of upstreamSockets) {
      try {
        s.destroy();
      } catch {
        // ignore
      }
    }
    await new Promise<void>((resolve) => upstream?.close(() => resolve()));
  });

  function openWebSocketHandshake(port: number): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const sock = netConnect({ host: "127.0.0.1", port }, () => {
        sock.write(
          "GET /sockets/events/test HTTP/1.1\r\n" +
            `Host: 127.0.0.1:${port}\r\n` +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            "Sec-WebSocket-Version: 13\r\n" +
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
        );
        resolve(sock);
      });
      // The upstream RST will surface here as ECONNRESET; we just want the
      // handshake to be initiated, so swallow any error after that.
      sock.on("error", () => {});
      sock.once("error", reject);
    });
  }

  it("survives upstream WebSocket ECONNRESET without crashing", async () => {
    // Trigger the bug repeatedly to make sure no path crashes the proxy.
    for (let i = 0; i < 5; i++) {
      const client = await openWebSocketHandshake(ingressPort);
      // Wait long enough for the upstream RST to propagate through the proxy.
      await delay(150);
      client.destroy();
      await delay(50);
    }

    // Process must still be alive.
    expect(ingressProcess.exitCode).toBeNull();
    expect(ingressProcess.signalCode).toBeNull();

    // And it must still be serving HTTP traffic.
    const response = await fetch(`http://localhost:${ingressPort}/health`);
    expect(response.status).toBe(200);

    // The unhandled-error crash signature must not appear in stderr.
    expect(ingressStderr).not.toContain("Unhandled 'error' event");
    expect(ingressStderr).not.toMatch(/throw er;/);
  });

  it("survives client aborting an in-flight HTTP request", async () => {
    // Open and abruptly destroy a TCP connection mid-request to make sure
    // req/res 'error' events on the client side are handled.
    const client = netConnect({ host: "127.0.0.1", port: ingressPort }, () => {
      client.write(
        "GET /something HTTP/1.1\r\n" +
          `Host: 127.0.0.1:${ingressPort}\r\n` +
          "Connection: close\r\n\r\n",
      );
      // Reset before the upstream finishes responding.
      setImmediate(() => client.destroy());
    });
    client.on("error", () => {});

    await delay(200);

    expect(ingressProcess.exitCode).toBeNull();
    expect(ingressProcess.signalCode).toBeNull();
    expect(ingressStderr).not.toContain("Unhandled 'error' event");
  });
});
