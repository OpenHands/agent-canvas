/**
 * Combined static file server + reverse proxy.
 *
 * Replaces `sirv-cli` for the dockerless static launcher. The reason a plain static
 * server is not enough: Vite's dev server (used by `npm run dev`) configures
 * a proxy for `/api`, `/sockets`, `/server_info`, `/alive`, `/health`,
 * `/ready` (see vite.config.ts) so requests to those paths are forwarded to
 * the agent-server even when the browser is hitting Vite directly on :3001.
 * sirv-cli has no proxy support, so under `--single` it falls back to
 * index.html for any of those paths — making `/server_info` look like HTML
 * to the SPA when the user hits the static port directly (e.g. via a tunnel
 * that exposes :3001).
 *
 * This script provides Vite-equivalent behaviour: serve static files from
 * --dir, fall back to index.html for HTML navigations, and reverse-proxy
 * configured prefixes to upstream backends. The proxy + WebSocket logic is
 * deliberately kept identical in spirit to scripts/ingress.mjs so the two
 * servers route the same way.
 *
 * Usage (mirrors scripts/ingress.mjs's --route flag style):
 *   node scripts/static-server.mjs \
 *     --port 3001 --host 0.0.0.0 --dir build \
 *     --route "/api/automation=http://localhost:18001" \
 *     --route "/api=http://localhost:18000" \
 *     --route "/server_info=http://localhost:18000" \
 *     --route "/sockets=http://localhost:18000"
 */

import { createServer, request as httpRequest } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, isAbsolute, normalize, relative, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

// ─────────────────────────────────────────────────────────────────────────────
// MIME types
// ─────────────────────────────────────────────────────────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".map": "application/json",
};

// ─────────────────────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv = process.argv.slice(2)) {
  const config = {
    port: 3001,
    host: "0.0.0.0",
    dir: "build",
    routes: {},
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case "-p":
      case "--port":
        config.port = Number.parseInt(argv[++i], 10);
        break;
      case "-H":
      case "--host":
        config.host = argv[++i];
        break;
      case "-d":
      case "--dir":
        config.dir = argv[++i];
        break;
      case "-r":
      case "--route": {
        const value = argv[++i];
        const eq = value.indexOf("=");
        if (eq < 0) {
          throw new Error(`Invalid --route (expected /prefix=url): ${value}`);
        }
        const prefix = value.slice(0, eq);
        const url = value.slice(eq + 1);
        if (!prefix.startsWith("/")) {
          throw new Error(`--route prefix must start with '/': ${prefix}`);
        }
        config.routes[prefix] = url;
        break;
      }
      case "-h":
      case "--help":
        showHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  return config;
}

function showHelp() {
  console.log(`
Combined static file server + reverse proxy.

USAGE:
  node scripts/static-server.mjs [options]

OPTIONS:
  -p, --port  <port>           Port to bind (default: 3001)
  -H, --host  <host>           Hostname to bind (default: 0.0.0.0)
  -d, --dir   <dir>            Directory to serve (default: build)
  -r, --route <prefix=url>     Proxy <prefix> (and subpaths) to <url>;
                               may be repeated. WebSockets supported.
  -h, --help                   Show this help

ROUTING:
  • Routes are matched by longest prefix first (most-specific wins).
  • Anything that does not match a route is served from --dir.
  • Unknown paths fall back to index.html (SPA mode), unless they look
    like an asset request (have a known file extension), in which case
    a 404 is returned.
`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Router (kept structurally identical to scripts/ingress.mjs)
// ─────────────────────────────────────────────────────────────────────────────

export function createRouter(routes) {
  const sortedRoutes = Object.entries(routes).sort(
    ([a], [b]) => b.length - a.length,
  );

  return function route(url) {
    for (const [prefix, backend] of sortedRoutes) {
      if (
        url === prefix ||
        url.startsWith(prefix + "/") ||
        url.startsWith(prefix + "?")
      ) {
        return backend;
      }
    }
    return null;
  };
}

function parseBackendUrl(backendUrl) {
  const url = new URL(backendUrl);
  return {
    hostname: url.hostname,
    port:
      Number.parseInt(url.port, 10) || (url.protocol === "https:" ? 443 : 80),
    protocol: url.protocol,
  };
}

function proxyRequest(req, res, backendUrl) {
  const backend = parseBackendUrl(backendUrl);

  const proxyReq = httpRequest(
    {
      hostname: backend.hostname,
      port: backend.port,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${backend.hostname}:${backend.port}`,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    },
  );

  proxyReq.on("error", (err) => {
    console.error(`Proxy error for ${req.url} -> ${backendUrl}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end(`Bad Gateway: ${err.message}`);
    }
  });

  req.pipe(proxyReq, { end: true });
}

function proxyWebSocket(req, socket, head, backendUrl) {
  const backend = parseBackendUrl(backendUrl);

  const proxyReq = httpRequest({
    hostname: backend.hostname,
    port: backend.port,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${backend.hostname}:${backend.port}`,
    },
  });

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`,
    );
    for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
      socket.write(
        `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`,
      );
    }
    socket.write("\r\n");
    if (proxyHead.length > 0) {
      socket.write(proxyHead);
    }
    proxySocket.pipe(socket, { end: true });
    socket.pipe(proxySocket, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error(
      `WebSocket proxy error for ${req.url} -> ${backendUrl}:`,
      err.message,
    );
    socket.destroy();
  });

  proxyReq.end();
}

// ─────────────────────────────────────────────────────────────────────────────
// Static file serving
// ─────────────────────────────────────────────────────────────────────────────

async function tryStat(path) {
  try {
    const result = await stat(path);
    return result.isFile() ? result : null;
  } catch {
    return null;
  }
}

function makeEtag(stats) {
  // Match sirv's weak-ETag format: W/"<size>-<mtime ms>"
  return `W/"${stats.size}-${Math.floor(stats.mtimeMs)}"`;
}

function pickContentType(filePath) {
  return MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
}

function pickCacheControl(urlPath) {
  // Vite/react-router builds emit content-hashed assets under /assets/.
  // Those are safe to cache forever; everything else (index.html, public/
  // copies, locales) should revalidate so a rebuild is picked up.
  if (urlPath.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache";
}

function looksLikeAssetRequest(urlPath) {
  // If the last path segment has a known file extension, treat 404s as 404
  // instead of falling back to the SPA shell. Avoids serving index.html for
  // missing /favicon.ico, missing source maps, etc.
  const last = urlPath.split("/").pop() ?? "";
  const ext = extname(last).toLowerCase();
  return Boolean(ext) && ext in MIME;
}

function isPathInsideDir(dirAbs, filePath) {
  const relativePath = relative(dirAbs, filePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

async function serveFile(req, res, filePath, urlPath) {
  const stats = await tryStat(filePath);
  if (!stats) return false;

  const etag = makeEtag(stats);
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return true;
  }

  res.writeHead(200, {
    "Content-Type": pickContentType(filePath),
    "Content-Length": stats.size,
    "Cache-Control": pickCacheControl(urlPath),
    ETag: etag,
  });

  if (req.method === "HEAD") {
    res.end();
    return true;
  }

  createReadStream(filePath).pipe(res);
  return true;
}

async function handleStatic(req, res, dirAbs) {
  const rawPath = req.url.split("?")[0];
  let urlPath;
  try {
    urlPath = decodeURIComponent(rawPath);
  } catch {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  const safe = normalize(urlPath);
  let filePath = resolve(dirAbs, "." + safe);
  if (!isPathInsideDir(dirAbs, filePath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Directory request -> /index.html
  if (urlPath.endsWith("/")) {
    filePath = resolve(filePath, "index.html");
  }

  if (await serveFile(req, res, filePath, urlPath)) return;

  // SPA fallback: only for non-asset requests, and not for non-GET/HEAD.
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    !looksLikeAssetRequest(urlPath)
  ) {
    const indexPath = resolve(dirAbs, "index.html");
    if (await serveFile(req, res, indexPath, "/")) return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
}

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

export function startStaticServer(config) {
  const route = createRouter(config.routes);
  const dirAbs = resolve(config.dir);

  const server = createServer((req, res) => {
    const backend = route(req.url);
    if (backend) {
      proxyRequest(req, res, backend);
      return;
    }
    handleStatic(req, res, dirAbs).catch((err) => {
      console.error(`Static handler error for ${req.url}:`, err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const backend = route(req.url);
    if (backend) {
      proxyWebSocket(req, socket, head, backend);
      return;
    }
    socket.destroy();
  });

  return new Promise((resolveListen) => {
    server.listen(config.port, config.host, () => {
      console.log("");
      console.log(
        `Static-server + proxy listening on http://${config.host}:${config.port}/`,
      );
      console.log(`  Static dir: ${dirAbs}`);
      const sortedRoutes = Object.entries(config.routes).sort(
        ([a], [b]) => b.length - a.length,
      );
      for (const [prefix, backend] of sortedRoutes) {
        console.log(`  ${prefix} -> ${backend}`);
      }
      console.log("  * (default) -> static files + SPA fallback");
      console.log("");
      resolveListen(server);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  try {
    const config = parseArgs();
    await startStaticServer(config);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
