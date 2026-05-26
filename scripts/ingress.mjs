#!/usr/bin/env node
/**
 * Standalone Ingress / Reverse Proxy
 *
 * A minimal HTTP reverse proxy that routes requests to multiple backends
 * based on URL path. Completely independent of any backend implementation.
 *
 * Usage:
 *   node scripts/ingress.mjs [options]
 *   node scripts/ingress.mjs --port 8000 --route "/api/automation=http://localhost:18001" --route "/api=http://localhost:18000" --default "http://localhost:3001"
 *
 * Environment variables:
 *   INGRESS_PORT          - Port to listen on (default: 8000)
 *   INGRESS_ROUTES        - JSON object of path prefix -> backend URL
 *   INGRESS_DEFAULT       - Default backend for unmatched routes
 *
 * Route matching:
 *   - Routes are matched by longest prefix first
 *   - More specific routes take precedence (e.g., /api/automation before /api)
 */

import { createServer, request as httpRequest } from "node:http";
import process from "node:process";

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    port: 8000,
    host: "0.0.0.0",
    routes: {},
    defaultBackend: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "-p":
      case "--port":
        config.port = parseInt(args[++i], 10);
        break;
      case "-H":
      case "--host":
        config.host = args[++i];
        break;
      case "-r":
      case "--route":
        // Format: "/path=http://host:port"
        const [path, url] = args[++i].split("=");
        config.routes[path] = url;
        break;
      case "-d":
      case "--default":
        config.defaultBackend = args[++i];
        break;
      case "-h":
      case "--help":
        showHelp();
        process.exit(0);
    }
  }

  return config;
}

function showHelp() {
  console.log(`
Standalone Ingress / Reverse Proxy

Routes HTTP requests to multiple backends based on URL path prefix.

USAGE:
  node scripts/ingress.mjs [options]

OPTIONS:
  -p, --port <port>           Port to listen on (default: 8000)
  -H, --host <host>           Host to bind to (default: 0.0.0.0)
  -r, --route <path=url>      Add a route (can be repeated)
  -d, --default <url>         Default backend for unmatched routes
  -h, --help                  Show this help

ENVIRONMENT VARIABLES:
  INGRESS_PORT                Port to listen on
  INGRESS_ROUTES              JSON object: {"path": "url", ...}
  INGRESS_DEFAULT             Default backend URL

EXAMPLES:
  # Basic setup with agent server and automation
  node scripts/ingress.mjs \\
    --port 8000 \\
    --route "/api/automation=http://localhost:18001" \\
    --route "/api=http://localhost:18000" \\
    --route "/sockets=http://localhost:18000" \\
    --default "http://localhost:3001"

  # Using environment variables
  INGRESS_PORT=8000 \\
  INGRESS_ROUTES='{"/ api/automation":"http://localhost:18001","/api":"http://localhost:18000"}' \\
  INGRESS_DEFAULT="http://localhost:3001" \\
  node scripts/ingress.mjs

ROUTE MATCHING:
  Routes are sorted by path length (longest first), so more specific
  routes like /api/automation will match before /api.
`);
}

function buildConfig(args, env = process.env) {
  let routes = { ...args.routes };

  // Merge env routes
  if (env.INGRESS_ROUTES) {
    try {
      const envRoutes = JSON.parse(env.INGRESS_ROUTES);
      routes = { ...routes, ...envRoutes };
    } catch (e) {
      console.error("Failed to parse INGRESS_ROUTES:", e.message);
    }
  }

  return {
    port: args.port || parseInt(env.INGRESS_PORT, 10) || 8000,
    host: args.host || env.INGRESS_HOST || "0.0.0.0",
    routes,
    defaultBackend: args.defaultBackend || env.INGRESS_DEFAULT || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Router
// ═══════════════════════════════════════════════════════════════════════════

function createRouter(routes, defaultBackend) {
  // Sort routes by path length (longest first) for most-specific matching
  const sortedRoutes = Object.entries(routes).sort(
    ([a], [b]) => b.length - a.length
  );

  return function route(url) {
    for (const [prefix, backend] of sortedRoutes) {
      if (url === prefix || url.startsWith(prefix + "/") || url.startsWith(prefix + "?")) {
        return backend;
      }
    }
    return defaultBackend;
  };
}

function parseBackendUrl(backendUrl) {
  const url = new URL(backendUrl);
  return {
    hostname: url.hostname,
    port: parseInt(url.port, 10) || (url.protocol === "https:" ? 443 : 80),
    protocol: url.protocol,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Proxy
// ═══════════════════════════════════════════════════════════════════════════

// Errors that are normal during connection teardown and should not be logged
// at error level (clients/upstreams routinely reset long-lived connections).
const BENIGN_SOCKET_ERRORS = new Set([
  "ECONNRESET",
  "EPIPE",
  "ECONNABORTED",
  "ERR_STREAM_PREMATURE_CLOSE",
]);

function isBenignSocketError(err) {
  return Boolean(err && BENIGN_SOCKET_ERRORS.has(err.code));
}

function proxyRequest(req, res, backendUrl) {
  const backend = parseBackendUrl(backendUrl);

  const options = {
    hostname: backend.hostname,
    port: backend.port,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${backend.hostname}:${backend.port}`,
    },
  };

  const proxyReq = httpRequest(options, (proxyRes) => {
    proxyRes.on("error", (err) => {
      if (!isBenignSocketError(err)) {
        console.error(`Upstream response error for ${req.url}:`, err.message);
      }
      if (!res.headersSent) {
        res.writeHead(502);
        res.end(`Bad Gateway: ${err.message}`);
      } else {
        res.destroy();
      }
    });

    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    if (!isBenignSocketError(err)) {
      console.error(`Proxy error for ${req.url}:`, err.message);
    }
    if (!res.headersSent) {
      res.writeHead(502);
      res.end(`Bad Gateway: ${err.message}`);
    } else {
      res.destroy();
    }
  });

  // If the client disconnects mid-request, abort the upstream call so we
  // don't leak connections or emit unhandled 'error' events.
  req.on("error", (err) => {
    if (!isBenignSocketError(err)) {
      console.error(`Client request error for ${req.url}:`, err.message);
    }
    proxyReq.destroy();
  });

  // The outbound HTTP response object can also emit 'error' (e.g. EPIPE if
  // the client socket is gone). Without a listener Node would crash.
  res.on("error", (err) => {
    if (!isBenignSocketError(err)) {
      console.error(`Client response error for ${req.url}:`, err.message);
    }
    proxyReq.destroy();
  });

  req.pipe(proxyReq, { end: true });
}

function proxyWebSocket(req, socket, head, backendUrl) {
  const backend = parseBackendUrl(backendUrl);

  const options = {
    hostname: backend.hostname,
    port: backend.port,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${backend.hostname}:${backend.port}`,
    },
  };

  const proxyReq = httpRequest(options);

  // Always attach an 'error' handler to the client socket immediately. The
  // client can drop the connection before the upstream upgrade completes
  // (e.g. during a slow DNS / connect), and an unhandled 'error' on the raw
  // TCP socket would crash the entire ingress process.
  socket.on("error", (err) => {
    if (!isBenignSocketError(err)) {
      console.error(`WebSocket client socket error for ${req.url}:`, err.message);
    }
    proxyReq.destroy();
  });

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    // Once the upgrade is established, errors on either raw TCP socket must
    // be handled or Node will throw. ECONNRESET / EPIPE on long-lived
    // WebSocket connections is routine (browser tab closed, NAT timeout,
    // mobile network handoff, …) and should never crash the proxy.
    const teardown = (label) => (err) => {
      if (err && !isBenignSocketError(err)) {
        console.error(`WebSocket ${label} error for ${req.url}:`, err.message);
      }
      socket.destroy();
      proxySocket.destroy();
    };
    proxySocket.on("error", teardown("upstream socket"));
    // Note: socket already has an 'error' listener from above; add a second
    // one that also destroys proxySocket so we don't leak the upstream half.
    socket.on("error", () => proxySocket.destroy());
    socket.on("close", () => proxySocket.destroy());
    proxySocket.on("close", () => socket.destroy());

    socket.write(
      `HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`
    );
    for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
      socket.write(`${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`);
    }
    socket.write("\r\n");

    if (proxyHead.length > 0) {
      socket.write(proxyHead);
    }

    proxySocket.pipe(socket, { end: true });
    socket.pipe(proxySocket, { end: true });
  });

  proxyReq.on("error", (err) => {
    if (!isBenignSocketError(err)) {
      console.error(`WebSocket proxy error for ${req.url}:`, err.message);
    }
    socket.destroy();
  });

  proxyReq.end();
}

// ═══════════════════════════════════════════════════════════════════════════
// Server
// ═══════════════════════════════════════════════════════════════════════════

function startIngress(config) {
  const route = createRouter(config.routes, config.defaultBackend);

  const server = createServer((req, res) => {
    const backend = route(req.url);

    if (!backend) {
      res.writeHead(503);
      res.end("No backend configured for this route");
      return;
    }

    proxyRequest(req, res, backend);
  });

  // Handle WebSocket upgrades
  server.on("upgrade", (req, socket, head) => {
    const backend = route(req.url);

    if (!backend) {
      socket.destroy();
      return;
    }

    proxyWebSocket(req, socket, head, backend);
  });

  // Built-in protection against malformed client requests that can otherwise
  // bubble up as unhandled errors on the underlying TCP socket.
  server.on("clientError", (err, socket) => {
    if (!isBenignSocketError(err)) {
      console.error("Client error:", err.message);
    }
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    } else {
      socket.destroy();
    }
  });

  server.listen(config.port, config.host, () => {
    const displayHost = config.host === "0.0.0.0" ? "localhost" : config.host;
    console.log("");
    console.log("╔═══════════════════════════════════════════════════════════════╗");
    console.log("║  Ingress Proxy                                                ║");
    console.log("╠═══════════════════════════════════════════════════════════════╣");
    console.log(`║  Listening on: http://${displayHost}:${config.port}/ (${config.host})`.padEnd(66) + "║");
    console.log("╠═══════════════════════════════════════════════════════════════╣");
    console.log("║  Routes:                                                      ║");

    const sortedRoutes = Object.entries(config.routes).sort(
      ([a], [b]) => b.length - a.length
    );
    for (const [path, backend] of sortedRoutes) {
      const line = `    ${path} → ${backend}`;
      console.log(`║  ${line.padEnd(61)}║`);
    }

    if (config.defaultBackend) {
      const line = `    * (default) → ${config.defaultBackend}`;
      console.log(`║  ${line.padEnd(61)}║`);
    }

    console.log("║                                                               ║");
    console.log("╚═══════════════════════════════════════════════════════════════╝");
    console.log("");
  });

  return server;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

const args = parseArgs();
const config = buildConfig(args);

if (Object.keys(config.routes).length === 0 && !config.defaultBackend) {
  console.error("Error: No routes configured. Use --route or --default options.");
  console.error("Run with --help for usage information.");
  process.exit(1);
}

startIngress(config);

// Last-resort safety net: a benign socket reset on a stream we forgot to wire
// up should never crash the proxy. Anything else is re-thrown so real bugs
// stay visible.
process.on("uncaughtException", (err) => {
  if (isBenignSocketError(err)) {
    console.warn(`Ignoring socket reset: ${err.code} ${err.message}`);
    return;
  }
  throw err;
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down...");
  process.exit(0);
});
