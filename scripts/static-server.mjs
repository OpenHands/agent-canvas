/**
 * Combined static file server + reverse proxy.
 *
 * Replaces `sirv-cli` for the static launcher. The reason a plain static
 * server is not enough: Vite's dev server (used by `npm run dev`) configures
 * a proxy for `/api`, `/sockets`, `/server_info`, `/alive`, `/health`,
 * `/ready`, `/docs`, `/redoc`, `/openapi.json` (see vite.config.ts) so
 * requests to those paths are forwarded to
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
 *     --port 3001 --dir build \
 *     --route "/api/automation=http://localhost:18001" \
 *     --route "/api=http://localhost:18000" \
 *     --route "/server_info=http://localhost:18000" \
 *     --route "/sockets=http://localhost:18000"
 */

import { createServer, request as httpRequest } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, normalize, relative, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SERVER_INFO_PATH = "/server_info";

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
    host: "::",
    dir: "build",
    routes: {},
    rejectPrefixes: [],
    sessionApiKey: null,
    authRequired: false,
    runtimeServicesInfo: null,
    lockToCloud: null,
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
      case "--session-api-key":
        config.sessionApiKey = argv[++i] || null;
        break;
      case "--runtime-services-info":
        config.runtimeServicesInfo = argv[++i] || null;
        break;
      case "--lock-to-cloud":
        config.lockToCloud = argv[++i] || null;
        break;

      case "--auth-required":
        config.authRequired = true;
        break;
      case "--reject-prefix": {
        const prefix = argv[++i];
        if (!prefix || !prefix.startsWith("/")) {
          throw new Error(
            `--reject-prefix value must start with '/': ${prefix ?? "(empty)"}`,
          );
        }
        config.rejectPrefixes.push(prefix);
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

  // Guard: --session-api-key and --auth-required are semantically
  // mutually exclusive. The first auto-injects the key (local mode);
  // the second forces the user to paste it (public mode). Combining
  // both is a misconfiguration.
  if (config.sessionApiKey && config.authRequired) {
    console.error(
      "ERROR: --session-api-key and --auth-required are mutually exclusive.\n" +
        "  Use --session-api-key for local mode (key auto-injected).\n" +
        "  Use --auth-required for public mode (user pastes key).",
    );
    process.exit(1);
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
  -H, --host  <host>           Hostname to bind (default: :: dual-stack)
  -d, --dir   <dir>            Directory to serve (default: build)
  -r, --route <prefix=url>     Proxy <prefix> (and subpaths) to <url>;
                               may be repeated. WebSockets supported.
  --session-api-key <key>      Inject session API key into index.html so the
                               pre-built frontend authenticates to agent-server
                               without needing VITE_SESSION_API_KEY baked in.
  --auth-required              Inject authRequired flag into index.html so the
                               pre-built frontend shows the API key entry screen
                               (public mode) without VITE_AUTH_REQUIRED baked in.
  --runtime-services-info <json>
                               Serve a JSON description of the local runtime
                               services in ${SERVER_INFO_PATH} and inject it
                               into index.html for legacy builds.
  --lock-to-cloud <cloud-url>  Lock backend setup to a single OpenHands Cloud
                               URL. Hides manual/local backend setup and the
                               custom Cloud URL field in the pre-built frontend.
  --reject-prefix <prefix>     Return 503 for requests matching <prefix>
                               instead of SPA-fallbacking to index.html;
                               may be repeated. Useful in --frontend-only
                               mode to cleanly reject API paths.
  -h, --help                   Show this help

ROUTING:
  • Routes are matched by longest prefix first (most-specific wins).
  • Reject prefixes are checked before SPA fallback — matching requests
    get 503 immediately.
  • Anything that does not match a route or reject prefix is served
    from --dir.
  • Unknown paths fall back to index.html (SPA mode), unless they look
    like an asset request (have a known file extension), in which case
    a 404 is returned.
`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime config injection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a tiny inline script that seeds runtime config into the page.
 *
 * - `sessionApiKey`: exposed to the app two ways so a fresh-localStorage
 *   browser can authenticate even though the published bundle has no
 *   VITE_SESSION_API_KEY baked in:
 *     1. `window.__AGENT_CANVAS_SESSION_API_KEY__` — read by
 *        `getBakedSessionApiKey()` in `agent-server-config.ts` as a fallback
 *        when the env var is empty. This is symmetric with how
 *        `__AGENT_CANVAS_AUTH_REQUIRED__` works for the auth-required flag.
 *     2. Written to `openhands-agent-server-config.sessionApiKey` in
 *        localStorage for compatibility with the legacy storage key. Useful
 *        for any code path that still reads it (e.g. e2e test fixtures).
 *        Always overwrites when the stored value differs so a rotated key
 *        is not shadowed by a stale one.
 *
 * - `authRequired`: sets `window.__AGENT_CANVAS_AUTH_REQUIRED__ = true` so the
 *   pre-built frontend shows the API key entry screen (public mode) without
 *   VITE_AUTH_REQUIRED baked in.
 *
 * - `runtimeServicesInfo`: a JSON string describing the local services
 *   (agent-server, automation, …). The current frontend reads this from the
 *   backend's `/server_info.runtime_services`; the injected window global is
 *   retained for compatibility with older pre-built frontend bundles.
 *
 * - `lockToCloud`: an OpenHands Cloud URL exposed as
 *   `window.__AGENT_CANVAS_LOCK_TO_CLOUD__`. Read by `getLockedCloudHost()` in
 *   `agent-server-config.ts` so pre-built frontend bundles can hide manual
 *   backend setup and the custom Cloud URL field at runtime.
 */
function makeConfigInjectionScript(
  sessionApiKey,
  authRequired,
  runtimeServicesInfo,
  lockToCloud,
) {
  const parts = [];

  if (sessionApiKey) {
    const keyLiteral = JSON.stringify(sessionApiKey);
    // Window global — read at module init by getBakedSessionApiKey().
    // Set first so it's available even if the localStorage write throws.
    parts.push(`window.__AGENT_CANVAS_SESSION_API_KEY__=${keyLiteral};`);
    // Always overwrite when the stored key differs from the runtime key.
    // A previous session may have persisted a now-stale key; the runtime
    // value (from --session-api-key) is the server's truth.
    parts.push(
      `try{` +
        `var _k='openhands-agent-server-config',` +
        `_c=JSON.parse(localStorage.getItem(_k)||'{}');` +
        `if(_c.sessionApiKey!==${keyLiteral}){` +
        `_c.sessionApiKey=${keyLiteral};` +
        `localStorage.setItem(_k,JSON.stringify(_c));` +
        `}` +
        `}catch(e){}`,
    );
  }

  if (authRequired) {
    parts.push(`window.__AGENT_CANVAS_AUTH_REQUIRED__=true;`);
  }

  if (runtimeServicesInfo) {
    // Legacy compatibility for older frontend bundles that read runtime
    // services from a window global. New bundles read /server_info instead.
    // JSON.stringify produces a safe JS string literal for the inline script.
    parts.push(
      `window.__AGENT_CANVAS_RUNTIME_SERVICES_INFO__=${JSON.stringify(runtimeServicesInfo)};`,
    );
  }

  if (lockToCloud) {
    parts.push(
      `window.__AGENT_CANVAS_LOCK_TO_CLOUD__=${JSON.stringify(lockToCloud)};`,
    );
  }

  if (parts.length === 0) return "";

  return `<script>(function(){${parts.join("")}}());</script>`;
}

/**
 * Serve index.html with runtime config injected into <head>.
 * Returns true if the response was written, false if the file was not found.
 */
async function serveInjectedIndexHtml(
  req,
  res,
  indexPath,
  { sessionApiKey, authRequired, runtimeServicesInfo, lockToCloud } = {},
) {
  let content;
  try {
    content = await readFile(indexPath, "utf8");
  } catch {
    return false;
  }

  const script = makeConfigInjectionScript(
    sessionApiKey,
    authRequired,
    runtimeServicesInfo,
    lockToCloud,
  );
  // Inject right before </head> so the key is available before any app code runs.
  // replace() targets the first (and only) </head> in well-formed HTML.
  const injected = content.includes("</head>")
    ? content.replace("</head>", `${script}\n</head>`)
    : content.includes("</body>")
      ? content.replace("</body>", `${script}\n</body>`)
      : script + content;

  const buf = Buffer.from(injected, "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-cache",
  });
  if (req.method !== "HEAD") res.end(buf);
  return true;
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

function isServerInfoRequest(req) {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  return pathname === SERVER_INFO_PATH;
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

  // Absorb client-disconnect errors (EPIPE/ECONNRESET) so the server
  // process survives abrupt navigations and health-check probes.
  req.on("error", () => {});
  res.on("error", () => {});

  proxyReq.on("error", (err) => {
    console.error(`Proxy error for ${req.url} -> ${backendUrl}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end(`Bad Gateway: ${err.message}`);
    }
  });

  req.pipe(proxyReq, { end: true });
}

function proxyServerInfoRequest(req, res, backendUrl, runtimeServicesInfo) {
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
      const chunks = [];

      proxyRes.on("data", (chunk) => {
        chunks.push(Buffer.from(chunk));
      });

      proxyRes.on("end", () => {
        const statusCode = proxyRes.statusCode ?? 502;
        const headers = { ...proxyRes.headers };
        const originalBody = Buffer.concat(chunks);

        if (statusCode < 200 || statusCode >= 300 || req.method === "HEAD") {
          res.writeHead(statusCode, headers);
          res.end(req.method === "HEAD" ? "" : originalBody);
          return;
        }

        try {
          const serverInfo = JSON.parse(originalBody.toString("utf8"));
          const runtimeServices = JSON.parse(runtimeServicesInfo);
          const body = Buffer.from(
            JSON.stringify({
              ...serverInfo,
              runtime_services: runtimeServices,
            }),
            "utf8",
          );

          delete headers["content-length"];
          headers["content-type"] = "application/json; charset=utf-8";
          headers["cache-control"] = "no-store";
          res.writeHead(statusCode, headers);
          res.end(body);
        } catch (err) {
          console.warn(
            `Could not append runtime_services to ${SERVER_INFO_PATH}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          res.writeHead(statusCode, headers);
          res.end(originalBody);
        }
      });
    },
  );

  req.on("error", () => {});
  res.on("error", () => {});

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

  // Absorb socket errors so the process survives mid-flight disconnects.
  socket.on("error", () => socket.destroy());

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    proxySocket.on("error", () => proxySocket.destroy());

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
    // Handle errors on both sockets so an abrupt disconnect (ECONNRESET,
    // EPIPE) during test cleanup doesn't crash the process with an
    // uncaught 'error' event.
    proxySocket.on("error", (err) => {
      console.error(
        `WebSocket proxy backend socket error (${req.url}):`,
        err.message,
      );
      socket.destroy();
    });
    socket.on("error", (err) => {
      console.error(
        `WebSocket proxy client socket error (${req.url}):`,
        err.message,
      );
      proxySocket.destroy();
    });
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

async function handleStatic(
  req,
  res,
  dirAbs,
  injectionOpts = {},
  rejectPrefixes = [],
) {
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

  const needsInjection =
    injectionOpts.sessionApiKey ||
    injectionOpts.authRequired ||
    injectionOpts.runtimeServicesInfo ||
    injectionOpts.lockToCloud;

  // Serve index.html with runtime config injection when configured.
  if (needsInjection && filePath.endsWith("index.html")) {
    if (await serveInjectedIndexHtml(req, res, filePath, injectionOpts)) return;
    // Fall through to regular serveFile (handles 404 path correctly).
  }

  if (await serveFile(req, res, filePath, urlPath)) return;

  // Reject prefixes: return 503 for known API paths that have no backend
  // configured (e.g. in --frontend-only mode). Checked before SPA fallback
  // so these paths never silently serve index.html.
  if (rejectPrefixes.length > 0) {
    for (const prefix of rejectPrefixes) {
      if (
        urlPath === prefix ||
        urlPath.startsWith(prefix + "/") ||
        urlPath.startsWith(prefix + "?")
      ) {
        res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Service Unavailable (no backend configured for this route)");
        return;
      }
    }
  }

  // SPA fallback: only for non-asset requests, and not for non-GET/HEAD.
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    !looksLikeAssetRequest(urlPath)
  ) {
    const indexPath = resolve(dirAbs, "index.html");
    if (needsInjection) {
      if (await serveInjectedIndexHtml(req, res, indexPath, injectionOpts))
        return;
    } else if (await serveFile(req, res, indexPath, "/")) return;
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
  const injectionOpts = {
    sessionApiKey: config.sessionApiKey || null,
    authRequired: config.authRequired || false,
    runtimeServicesInfo: config.runtimeServicesInfo || null,
    lockToCloud: config.lockToCloud || null,
  };
  const rejectPrefixes = config.rejectPrefixes ?? [];

  const server = createServer((req, res) => {
    const backend = route(req.url);
    if (backend) {
      if (
        config.runtimeServicesInfo &&
        isServerInfoRequest(req) &&
        (req.method === "GET" || req.method === "HEAD")
      ) {
        proxyServerInfoRequest(req, res, backend, config.runtimeServicesInfo);
        return;
      }
      proxyRequest(req, res, backend);
      return;
    }
    handleStatic(req, res, dirAbs, injectionOpts, rejectPrefixes).catch(
      (err) => {
        console.error(`Static handler error for ${req.url}:`, err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal Server Error");
        }
      },
    );
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
      if (rejectPrefixes.length > 0) {
        for (const prefix of rejectPrefixes) {
          console.log(`  ${prefix} -> 503 (rejected)`);
        }
      }
      if (config.lockToCloud) {
        console.log(`  Backend setup locked to Cloud: ${config.lockToCloud}`);
      }
      if (config.runtimeServicesInfo) {
        console.log(`  ${SERVER_INFO_PATH} includes runtime_services`);
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
