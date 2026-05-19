/**
 * Mini Setup Server
 *
 * A lightweight HTTP server that lets the browser frontend manage Docker
 * lifecycle. This bridges the gap between the pure-browser UI and system
 * operations (Docker start/stop) that require Node.js access.
 *
 * Listens on 127.0.0.1 only — not exposed to the network.
 *
 * Endpoints:
 *   GET    /setup/status  → Docker availability + running state
 *   POST   /setup/docker  → Start Docker agent-server container
 *   DELETE /setup/docker  → Stop Docker agent-server container
 *
 * Usage (standalone):
 *   node scripts/setup-server.mjs [--port 18099]
 *
 * Usage (from dev scripts):
 *   import { startSetupServer } from "./setup-server.mjs";
 *   startSetupServer({ port: 18099, config });
 */

import { createServer } from "node:http";
import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_PORT = 18099;
const DOCKER_BACKEND_PORT = 18002;
const CONTAINER_NAME = "agent-canvas-dev-docker-backend";
const AGENT_SERVER_REPO = "ghcr.io/openhands/agent-server";
const DEFAULT_AGENT_SERVER_TAG = "1.22.1-python";
const DEFAULT_SECRET_KEY = "openhands-dev-secret-key-change-in-prod";
const CONTAINER_CANVAS_TOOLS_DIR = "/canvas-tools";
const HOST_CANVAS_TOOLS_DIR = (() => {
  try {
    return fileURLToPath(new URL("../tools", import.meta.url));
  } catch {
    return resolve(process.cwd(), "tools");
  }
})();

// Track the running Docker process
let dockerProcess = null;
let dockerProjectPath = null;
let shutdownHandlersRegistered = false;

// ═══════════════════════════════════════════════════════════════════════════
// Docker Detection
// ═══════════════════════════════════════════════════════════════════════════

function isDockerInstalled() {
  const result =
    process.platform === "win32"
      ? spawnSync("where.exe", ["docker"], { stdio: "pipe" })
      : spawnSync("sh", ["-c", "command -v docker"], { stdio: "pipe" });
  return result.status === 0;
}

function isDockerRunning() {
  const result = spawnSync("docker", ["info"], {
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 10_000,
  });
  return result.status === 0;
}

function isDockerBackendRunning() {
  const result = spawnSync(
    "docker",
    ["inspect", "-f", "{{.State.Running}}", CONTAINER_NAME],
    { stdio: ["ignore", "pipe", "pipe"], timeout: 5_000 },
  );
  return result.status === 0 && result.stdout?.toString().trim() === "true";
}

// ═══════════════════════════════════════════════════════════════════════════
// Docker Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

function getAgentServerImage() {
  const gitRef = process.env.OH_AGENT_SERVER_GIT_REF;
  if (gitRef && !/^[a-zA-Z0-9._-]+$/.test(gitRef)) {
    throw new Error("Invalid OH_AGENT_SERVER_GIT_REF format");
  }

  const tag = gitRef ? `${gitRef}-python` : DEFAULT_AGENT_SERVER_TAG;
  return `${AGENT_SERVER_REPO}:${tag}`;
}

function getDockerBackendEndpoint() {
  return { host: "http://127.0.0.1", port: DOCKER_BACKEND_PORT };
}

function startDockerBackend(projectPath, options = {}) {
  const { sessionApiKey } = options;

  if (dockerProcess || isDockerBackendRunning()) {
    return getDockerBackendEndpoint();
  }

  const image = getAgentServerImage();
  dockerProjectPath = projectPath;

  // Best-effort cleanup of any leftover container
  spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "ignore" });

  const home = homedir();
  const dockerArgs = [
    "run",
    "--rm",
    "--name",
    CONTAINER_NAME,
    "--init",
    "-v",
    `${projectPath}:/projects`,
    "-v",
    `${HOST_CANVAS_TOOLS_DIR}:${CONTAINER_CANVAS_TOOLS_DIR}:ro`,
    "-p",
    `${DOCKER_BACKEND_PORT}:8000`,
  ];

  // Mount credentials when available
  const optionalMounts = [
    [join(home, ".openhands"), "/home/openhands/.openhands"],
    [join(home, ".claude"), "/home/openhands/.claude"],
    [join(home, ".codex"), "/home/openhands/.codex"],
    [join(home, ".ssh"), "/home/openhands/.ssh"],
  ];
  for (const [src, dest] of optionalMounts) {
    if (existsSync(src)) {
      dockerArgs.push("-v", `${src}:${dest}`);
    }
  }

  // Container environment
  const containerEnv = {
    OH_CONVERSATIONS_PATH:
      "/home/openhands/.openhands/agent-canvas/conversations",
    OH_PERSISTENCE_DIR: "/home/openhands/.openhands",
    OH_BASH_EVENTS_DIR: "/home/openhands/.openhands/agent-canvas/bash_events",
    OH_SECRET_KEY: process.env.OH_SECRET_KEY || DEFAULT_SECRET_KEY,
    OH_EXTRA_PYTHON_PATH: CONTAINER_CANVAS_TOOLS_DIR,
  };
  if (sessionApiKey) {
    containerEnv.OH_SESSION_API_KEYS_0 = sessionApiKey;
  }
  for (const [k, v] of Object.entries(containerEnv)) {
    dockerArgs.push("-e", `${k}=${v}`);
  }

  dockerArgs.push(image);

  dockerProcess = spawn("docker", dockerArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  dockerProcess.on("error", (err) => {
    console.error("[setup-server] Docker spawn failed:", err);
    dockerProcess = null;
  });

  dockerProcess.on("exit", () => {
    dockerProcess = null;
  });

  return getDockerBackendEndpoint();
}

function stopDockerBackend() {
  spawnSync("docker", ["rm", "-f", CONTAINER_NAME], {
    stdio: "ignore",
    timeout: 10_000,
  });
  dockerProjectPath = null;
  if (dockerProcess) {
    dockerProcess.kill("SIGTERM");
    dockerProcess = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP Server
// ═══════════════════════════════════════════════════════════════════════════

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString();
        resolve(text ? JSON.parse(text) : {});
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function handleStatus(_req, res) {
  const installed = isDockerInstalled();
  sendJson(res, 200, {
    dockerInstalled: installed,
    dockerRunning: installed && isDockerRunning(),
    dockerBackendRunning: installed && isDockerBackendRunning(),
    dockerBackendPort: DOCKER_BACKEND_PORT,
    dockerBackendUrl: `${getDockerBackendEndpoint().host}:${DOCKER_BACKEND_PORT}`,
    projectPath: dockerProjectPath,
  });
}

async function handleStartDocker(req, res, serverOptions) {
  try {
    const body = await readBody(req);
    const projectPath = body.projectPath;

    if (!projectPath) {
      sendJson(res, 400, { error: "projectPath is required" });
      return;
    }

    if (!isAbsolute(projectPath)) {
      sendJson(res, 400, { error: "projectPath must be an absolute path" });
      return;
    }

    const resolvedProjectPath = resolve(projectPath);
    if (!existsSync(resolvedProjectPath)) {
      sendJson(res, 400, {
        error: `Path does not exist: ${resolvedProjectPath}`,
      });
      return;
    }

    if (!isDockerInstalled()) {
      sendJson(res, 400, {
        error: "Docker is not installed",
        installUrl: "https://docs.docker.com/get-docker/",
      });
      return;
    }

    if (!isDockerRunning()) {
      sendJson(res, 400, {
        error:
          "Docker daemon is not running. Start Docker Desktop and try again.",
      });
      return;
    }

    const result = startDockerBackend(resolvedProjectPath, {
      sessionApiKey: serverOptions?.sessionApiKey,
    });

    sendJson(res, 200, {
      status: "starting",
      host: result.host,
      port: result.port,
      url: `${result.host}:${result.port}`,
    });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

function handleStopDocker(_req, res) {
  stopDockerBackend();
  sendJson(res, 200, { status: "stopped" });
}

/**
 * Start the setup server.
 *
 * @param {object} options
 * @param {number} [options.port=18099] Port to listen on
 * @param {string} [options.sessionApiKey] Session API key to pass to Docker backend
 * @returns {import("node:http").Server}
 */
function startSetupServer(options = {}) {
  const port = options.port || DEFAULT_PORT;

  const server = createServer(async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      sendJson(res, 204, null);
      return;
    }

    const url = req.url?.split("?")[0];

    if (url === "/setup/status" && req.method === "GET") {
      handleStatus(req, res);
    } else if (url === "/setup/docker" && req.method === "POST") {
      await handleStartDocker(req, res, options);
    } else if (url === "/setup/docker" && req.method === "DELETE") {
      handleStopDocker(req, res);
    } else {
      sendJson(res, 404, { error: "Not found" });
    }
  });

  server.on("error", (err) => {
    console.error("[setup-server] Failed:", err);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[setup-server] Listening on http://127.0.0.1:${port}`);
  });

  if (!shutdownHandlersRegistered) {
    shutdownHandlersRegistered = true;
    process.on("SIGTERM", () => stopDockerBackend());
    process.on("SIGINT", () => stopDockerBackend());
  }

  return server;
}

export {
  startSetupServer,
  isDockerInstalled,
  isDockerRunning,
  isDockerBackendRunning,
  startDockerBackend,
  stopDockerBackend,
  DEFAULT_PORT,
  DOCKER_BACKEND_PORT,
  CONTAINER_NAME,
  CONTAINER_CANVAS_TOOLS_DIR,
  HOST_CANVAS_TOOLS_DIR,
};

// ═══════════════════════════════════════════════════════════════════════════
// Standalone entry point
// ═══════════════════════════════════════════════════════════════════════════

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const port = parseInt(
    process.argv[2] || process.env.SETUP_SERVER_PORT || DEFAULT_PORT,
    10,
  );
  startSetupServer({ port });
}
