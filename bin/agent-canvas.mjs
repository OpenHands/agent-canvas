#!/usr/bin/env node
/**
 * CLI entry point for @openhands/agent-canvas.
 *
 * `openhands` runs the full local Agent Canvas stack by default. The same
 * entry point also exposes split modes for users who want to run the agent
 * server and static frontend separately.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..");
// Build output is in build/ (not build/client/) - see react-router.config.ts unpackClientDirectory.
const BUILD_DIR = join(PACKAGE_ROOT, "build");
const DEFAULT_UI_PORT = 8000;
const DEFAULT_BACKEND_PORT = 18000;
const DEFAULT_BACKEND_URL = `http://127.0.0.1:${DEFAULT_BACKEND_PORT}`;

const args = process.argv.slice(2);

function hasFlag(...flags) {
  return flags.some((flag) => args.includes(flag));
}

function readOption(...flags) {
  for (const flag of flags) {
    const index = args.indexOf(flag);
    if (index >= 0) return args[index + 1];
  }
  return undefined;
}

function parsePort(value, fallback, label) {
  if (value === undefined) return fallback;
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`Invalid ${label}: ${value}`);
    process.exit(1);
  }
  return port;
}

function showHelp() {
  console.log(`
OpenHands Agent Canvas - run OpenHands locally

USAGE:
  openhands [options]
  npx @openhands/agent-canvas [options]

MODES:
  openhands                  Run the full local stack: agent server, automation, and UI
  openhands --backend-only   Run only the agent server (Docker)
  openhands --frontend-only  Run only the static frontend/proxy

OPTIONS:
  -p, --port <port>          UI/ingress port (default: ${DEFAULT_UI_PORT}). In
                             --backend-only mode, this is the backend port
                             (default: ${DEFAULT_BACKEND_PORT}).
  --backend-url <url>        Backend URL for --frontend-only
                             (default: ${DEFAULT_BACKEND_URL}).
  --automation-ref <ref>     Git ref for the automation backend (full stack only)
  --automation-repo <url>    Git repo URL for the automation backend
  --skip-build               Reuse build/ when the source launcher builds assets
  --dynamic                  Use Vite dev server when running from source
  -v, --verbose              Show detailed output
  -h, --help                 Show this help message

ENVIRONMENT VARIABLES:
  PROJECT_PATH               Optional: host projects directory to mount at
                             /projects for Docker-backed agent-server runs.
  OH_MOUNT_HOST_HOME=1       Optional: mount your host home for the Add Workspace
                             file browser.
  OH_AGENT_SERVER_GIT_REF    Git ref for the agent-server Docker image tag.
  OH_AGENT_SERVER_LOCAL_PATH Path to local SDK checkout (development).

EXAMPLES:
  npm install -g @openhands/agent-canvas
  openhands

  # Split services across terminals
  openhands --backend-only
  openhands --frontend-only

  # Expose existing local repositories to the Docker agent server
  PROJECT_PATH=/path/to/projects openhands
`);
}

function ensureBuildExists() {
  if (existsSync(BUILD_DIR)) return;

  console.error(`
Error: No build found at ${BUILD_DIR}

This package needs pre-built frontend assets. If you installed from npm,
this is a packaging error. If running from source:

  npm install
  npm run build
`);
  process.exit(1);
}

async function importStackLaunchers() {
  try {
    const stack = await import("../scripts/dev-with-automation.mjs");
    const docker = await import("../scripts/dev-docker.mjs");
    return { stack, docker };
  } catch (err) {
    console.error("Failed to load required scripts. Try reinstalling:");
    console.error("  npm install -g @openhands/agent-canvas@latest");
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  }
}

async function runFullStack() {
  ensureBuildExists();
  const { stack, docker } = await importStackLaunchers();

  await stack.main({
    bannerTitle: "OpenHands Agent Canvas",
    extraPrereqs: docker.checkDockerPrereqs,
    startAgentServer: docker.startAgentServerDocker,
    viteWorkingDir: docker.CONTAINER_WORKSPACES_DIR,
    staticMode: true,
    staticDir: BUILD_DIR,
  });
}

async function runBackendOnly() {
  const { stack, docker } = await importStackLaunchers();
  const backendPort = parsePort(
    readOption("-p", "--port") ?? process.env.PORT,
    DEFAULT_BACKEND_PORT,
    "backend port",
  );

  console.log("");
  console.log(
    `${stack.c.cyan}${stack.c.bold}OpenHands Agent Server${stack.c.reset}`,
  );
  console.log("");

  docker.checkDockerPrereqs({});
  const config = await stack.buildConfig({
    port: DEFAULT_UI_PORT,
    automationGitRef: null,
    automationRepo: null,
    verbose: hasFlag("-v", "--verbose"),
  });
  config.agentServerPort = backendPort;

  docker.startAgentServerDocker(config);
  await stack.waitForService(
    "agent-server",
    `http://localhost:${backendPort}/server_info`,
    60_000,
  );

  console.log("");
  console.log(
    `${stack.c.green}Agent server:${stack.c.reset} http://localhost:${backendPort}`,
  );
  console.log(`${stack.c.dim}Press Ctrl+C to stop${stack.c.reset}`);
  console.log("");
}

async function runFrontendOnly() {
  ensureBuildExists();

  const uiPort = parsePort(
    readOption("-p", "--port") ?? process.env.PORT,
    DEFAULT_UI_PORT,
    "frontend port",
  );
  const backendUrl =
    readOption("--backend-url") ??
    process.env.OPENHANDS_BACKEND_URL ??
    DEFAULT_BACKEND_URL;
  const { startStaticServer } = await import("../scripts/static-server.mjs");

  await startStaticServer({
    port: uiPort,
    host: "0.0.0.0",
    dir: BUILD_DIR,
    routes: {
      "/api": backendUrl,
      "/sockets": backendUrl,
      "/server_info": backendUrl,
      "/health": backendUrl,
      "/ready": backendUrl,
      "/alive": backendUrl,
    },
  });

  console.log(`OpenHands Agent Canvas UI: http://localhost:${uiPort}`);
  console.log(`Backend proxy target: ${backendUrl}`);
  console.log("Press Ctrl+C to stop");
}

if (hasFlag("-h", "--help")) {
  showHelp();
  process.exit(0);
}

if (hasFlag("--backend-only") && hasFlag("--frontend-only")) {
  console.error("Choose only one of --backend-only or --frontend-only.");
  process.exit(1);
}

try {
  if (hasFlag("--backend-only")) {
    await runBackendOnly();
  } else if (hasFlag("--frontend-only")) {
    await runFrontendOnly();
  } else {
    await runFullStack();
  }
} catch (err) {
  console.error(`Fatal error: ${err.message}`);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
}
