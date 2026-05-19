/**
 * Development Stack with Automation Service
 *
 * Extends agent-canvas's dev-safe.mjs to additionally run the OpenHands Automation
 * backend via uvx. No cloning required - runs directly from git reference.
 *
 * Uses a standalone ingress proxy to route traffic to multiple backends.
 *
 * Architecture:
 *   ┌──────────────────────────────────────────────────────────────────────────┐
 *   │              http://localhost:8000 (Ingress Proxy)                       │
 *   │              /api/automation/* → Automation Backend                      │
 *   │              /api/*, /sockets  → Agent Server                            │
 *   │              /*                → Vite Dev Server                         │
 *   └──────────────────────────────────────────────────────────────────────────┘
 *          │                    │                         │
 *          ▼                    ▼                         ▼
 *   ┌─────────────┐    ┌───────────────┐         ┌──────────────────┐
 *   │ Vite        │    │ Agent Server  │         │ Automation       │
 *   │ :3001       │    │ (uvx) :18000  │         │ Backend (uvx)    │
 *   │             │    │               │         │ :18001           │
 *   └─────────────┘    └───────────────┘         └──────────────────┘
 *
 * Usage:
 *   node scripts/dev-with-automation.mjs
 *   node scripts/dev-with-automation.mjs --automation-ref feat/my-branch
 *   node scripts/dev-with-automation.mjs --port 12000
 *
 * Environment variables:
 *   - PORT: Ingress port (default: 8000)
 *   - OH_AUTOMATION_GIT_REF: Git ref for automation (default: main)
 *   - OH_AGENT_SERVER_GIT_REF: Git ref for agent-server
 *   - AUTOMATION_LOCAL_API_KEY: Custom API key for automation backend auth
 *   - OH_AUTOMATION_API_KEY_PATH: Override persisted default automation key path
 *
 * Secrets:
 *   The automation API key is automatically seeded into agent-server secrets
 *   as OPENHANDS_AUTOMATION_API_KEY, making it available to agents in conversations.
 */

import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join, resolve, dirname, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";

import {
  buildAgentServerCommand,
  buildSafeDevConfig,
  buildAgentServerEnv,
  buildNpmScriptCommand,
  buildRuntimeServicesInfo,
  formatMissingUvxGuidance,
  findFreePorts,
  getOrCreatePersistedApiKey,
  validateFrontendDependencies,
} from "./dev-safe.mjs";
import {
  createShutdownHookRegistry,
  getProcessTreeSpawnOptions,
  isProcessRunning,
  signalProcessTree,
} from "./dev-process-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const DEFAULT_AUTOMATION_REPO = "https://github.com/OpenHands/automation";
const DEFAULT_AUTOMATION_PACKAGE = "openhands-automation";
// Default automation version (released PyPI version)
// Set OH_AUTOMATION_GIT_REF to use a git branch/SHA instead
const DEFAULT_AUTOMATION_VERSION = "1.0.0a3";
// SDK version used by DEFAULT_AUTOMATION_VERSION. This can intentionally lag
// DEFAULT_AGENT_SERVER_VERSION while automation releases catch up.
const DEFAULT_AUTOMATION_SDK_VERSION = "1.22.1";
const DEFAULT_BACKEND_PORT = 18000;
const DEFAULT_AUTOMATION_PORT = 18001;
const DEFAULT_DOCKER_BACKEND_PORT = 18002;
// Where the auto-generated default automation API key is persisted. Static
// frontend builds bake VITE_AUTOMATION_API_KEY at build time, so the default
// must remain stable across restarts and --skip-build reuse.
const DEFAULT_AUTOMATION_API_KEY_PATH = join(
  homedir(),
  ".openhands",
  "agent-canvas",
  "automation-api-key.txt",
);
// Persisted backend choice so the interactive prompt remembers the user's
// previous answer across restarts.
const DEFAULT_BACKEND_CHOICE_PATH = join(
  homedir(),
  ".openhands",
  "agent-canvas",
  "backend-choice.json",
);


// ═══════════════════════════════════════════════════════════════════════════
// Terminal Styling
// ═══════════════════════════════════════════════════════════════════════════

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function logService(name, message, color = c.reset) {
  const ts = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`${c.dim}${ts}${c.reset} ${color}[${name}]${c.reset} ${message}`);
}

function logStep(step, message) {
  console.log(`${c.cyan}[${step}]${c.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${c.green}✓${c.reset} ${message}`);
}

function logError(message) {
  console.error(`${c.red}✗${c.reset} ${message}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    port: null,
    automationGitRef: null,
    automationRepo: null,
    verbose: false,
    static: false,
    dynamic: false,
    staticDir: null,
    skipBuild: false,
    withDocker: null, // null = prompt (or env), true = yes, false = no
    dockerProjectsPath: null,
    reconfigure: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "-p":
      case "--port":
        config.port = parseInt(args[++i], 10);
        break;
      case "--automation-ref":
        config.automationGitRef = args[++i];
        break;
      case "--automation-repo":
        config.automationRepo = args[++i];
        break;
      case "-v":
      case "--verbose":
        config.verbose = true;
        break;
      case "--static":
        config.static = true;
        break;
      case "--dynamic":
        config.dynamic = true;
        break;
      case "--static-dir":
        config.staticDir = args[++i];
        break;
      case "--skip-build":
        config.skipBuild = true;
        break;
      case "--with-docker":
        config.withDocker = true;
        break;
      case "--no-docker":
        config.withDocker = false;
        break;
      case "--docker-projects-path":
        config.dockerProjectsPath = args[++i];
        break;
      case "--reconfigure":
        config.reconfigure = true;
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
Agent Canvas + Automation Development Stack

Runs agent-canvas with the automation backend (via uvx, no clone needed).
Uses a standalone ingress proxy to route traffic.

USAGE:
  node scripts/dev-with-automation.mjs [options]

OPTIONS:
  -p, --port <port>           Ingress port (default: 8000)
  --automation-ref <ref>      Git ref for automation (branch/tag/SHA)
  --automation-repo <url>     Git repo URL (default: ${DEFAULT_AUTOMATION_REPO})
  --static                    Serve an existing production build instead of Vite
  --static-dir <dir>          Static build directory (default: build/)
  --skip-build                Reuse build/ when the launcher builds static assets
  --dynamic                   Force Vite dev server when a wrapper defaults static
  --with-docker               Also start a Docker backend (sandboxed execution)
  --no-docker                 Skip the Docker backend prompt
  --docker-projects-path <p>  Host directory to mount into the Docker container
  --reconfigure               Re-prompt for backend choice (deletes saved backend-choice.json)
  -v, --verbose               Show detailed output
  -h, --help                  Show this help

ENVIRONMENT VARIABLES:
  PORT                        Alternative to --port
  DOCKER_BACKEND              Set to "1" to enable Docker backend without prompt
  PROJECTS_PATH               Host directory for Docker container (same as dev:docker)
  OH_AUTOMATION_GIT_REF       Git ref for automation (overrides default version)
  OH_AUTOMATION_VERSION       Specific PyPI version for automation (default: ${DEFAULT_AUTOMATION_VERSION})
  OH_AGENT_SERVER_GIT_REF     Git ref for agent-server SDK (overrides default version)
  OH_AGENT_SERVER_VERSION     Specific PyPI version for agent-server
  OH_SECRET_KEY               Secret key for sessions
  AUTOMATION_LOCAL_API_KEY    Custom API key for automation backend auth
  OH_AUTOMATION_API_KEY_PATH  Override persisted default automation key path

SECRETS:
  The automation API key is automatically seeded into agent-server secrets
  as OPENHANDS_AUTOMATION_API_KEY, making it available to agents in conversations.

ACCESS POINTS:
  Main UI:      http://localhost:PORT/
  API Docs:     http://localhost:PORT/api/automation/docs
`);
}

/**
 * Build the uvx command for running automation backend.
 *
 * Environment variables (highest precedence first):
 * - OH_AUTOMATION_GIT_REF: Git commit SHA or branch name
 * - OH_AUTOMATION_VERSION: Specific PyPI version (e.g., "1.0.0a1")
 *
 * If none are set, defaults to the released version specified by
 * DEFAULT_AUTOMATION_VERSION. Set OH_AUTOMATION_GIT_REF to use a
 * git branch or commit instead.
 */
function buildAutomationCommand(env = process.env) {
  const gitRef = env.OH_AUTOMATION_GIT_REF;
  const version = env.OH_AUTOMATION_VERSION;
  const repoUrl = env.OH_AUTOMATION_REPO || DEFAULT_AUTOMATION_REPO;

  const uvxArgs = [];
  let source = "";

  if (gitRef) {
    // Use git ref - refresh to ensure latest commit is fetched
    const gitUrl = `git+${repoUrl}@${gitRef}`;
    uvxArgs.push(
      "--refresh",
      "--from",
      gitUrl,
      "uvicorn",
      "openhands.automation.app:app",
    );
    source = `git (${gitRef})`;
  } else if (version) {
    // Use specific PyPI version
    uvxArgs.push(
      "--from",
      `${DEFAULT_AUTOMATION_PACKAGE}==${version}`,
      "uvicorn",
      "openhands.automation.app:app",
    );
    source = `PyPI (${version})`;
  } else {
    // Default to released PyPI version
    uvxArgs.push(
      "--from",
      `${DEFAULT_AUTOMATION_PACKAGE}==${DEFAULT_AUTOMATION_VERSION}`,
      "uvicorn",
      "openhands.automation.app:app",
    );
    source = `PyPI (${DEFAULT_AUTOMATION_VERSION}, default)`;
  }

  return {
    command: "uvx",
    args: uvxArgs,
    source,
  };
}

async function buildConfig(args, env = process.env) {
  // Apply args to env for buildAutomationCommand
  if (args.automationGitRef) {
    env.OH_AUTOMATION_GIT_REF = args.automationGitRef;
  }
  if (args.automationRepo) {
    env.OH_AUTOMATION_REPO = args.automationRepo;
  }

  // Preferred ports (from env or defaults)
  const preferredIngressPort = args.port || parseInt(env.PORT, 10) || 8000;
  const preferredBackendPort = DEFAULT_BACKEND_PORT;
  const preferredAutomationPort = DEFAULT_AUTOMATION_PORT;
  const preferredVitePort = 3001;
  const preferredDockerBackendPort = DEFAULT_DOCKER_BACKEND_PORT;

  // Find available ports, preferring the defaults
  logStep("ports", "Allocating ports...");
  const portConfigs = [
    { name: "ingress", preferred: preferredIngressPort },
    { name: "backend", preferred: preferredBackendPort },
    { name: "automation", preferred: preferredAutomationPort },
    { name: "vite", preferred: preferredVitePort },
  ];
  if (args.withDocker) {
    portConfigs.push({
      name: "dockerBackend",
      preferred: preferredDockerBackendPort,
    });
  }
  const ports = await findFreePorts(portConfigs);

  // Log any port changes
  if (ports.ingress !== preferredIngressPort) {
    logService(
      "ports",
      `Port ${preferredIngressPort} busy, using ${ports.ingress} for ingress`,
      c.yellow,
    );
  }
  if (ports.backend !== preferredBackendPort) {
    logService(
      "ports",
      `Port ${preferredBackendPort} busy, using ${ports.backend} for agent-server`,
      c.yellow,
    );
  }
  if (ports.automation !== preferredAutomationPort) {
    logService(
      "ports",
      `Port ${preferredAutomationPort} busy, using ${ports.automation} for automation`,
      c.yellow,
    );
  }
  if (ports.vite !== preferredVitePort) {
    logService(
      "ports",
      `Port ${preferredVitePort} busy, using ${ports.vite} for vite`,
      c.yellow,
    );
  }

  const vscodePort = ports.backend + 1000;

  // Local API key for automation backend auth. Keep the generated default
  // stable across restarts because static frontend builds bake this value.
  const automationApiKeyPath =
    env.OH_AUTOMATION_API_KEY_PATH || DEFAULT_AUTOMATION_API_KEY_PATH;
  const localApiKey =
    env.AUTOMATION_LOCAL_API_KEY ||
    getOrCreatePersistedApiKey(automationApiKeyPath, "automation");

  // Session API key for agent-server auth
  // Build a preliminary safe config to get the auto-generated session key
  // This ensures both agent-server and frontend use the same key
  const stateDir = join(homedir(), ".openhands", "agent-canvas");
  const safeConfig = buildSafeDevConfig(projectRoot, {
    ...env,
    OH_CANVAS_SAFE_STATE_DIR: stateDir,
    OH_CANVAS_SAFE_BACKEND_PORT: ports.backend.toString(),
    OH_CANVAS_SAFE_VSCODE_PORT: vscodePort.toString(),
  });
  const sessionApiKey = safeConfig.sessionApiKey;

  return {
    // Ingress port (main entry point)
    ingressPort: ports.ingress,

    // Service ports (internal)
    agentServerPort: ports.backend,
    autoBackendPort: ports.automation,
    vitePort: ports.vite,
    vscodePort,

    // Docker backend (only allocated when --with-docker)
    dockerBackendPort: ports.dockerBackend ?? null,

    // Paths
    canvasPath: projectRoot,

    // Data directories (same as dev-safe.mjs)
    stateDir,

    // Auth
    localApiKey,
    sessionApiKey,

    verbose: args.verbose,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Prerequisites & Setup
// ═══════════════════════════════════════════════════════════════════════════

function commandExists(cmd) {
  const result =
    process.platform === "win32"
      ? spawnSync("where.exe", [cmd], { stdio: "pipe" })
      : spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "pipe" });

  return result.status === 0;
}

function checkPrerequisites({ checkFrontendDependencies = true } = {}) {
  logStep("1/2", "Checking prerequisites...");

  if (!commandExists("uvx")) {
    console.error(formatMissingUvxGuidance(projectRoot));
    process.exit(1);
  }
  logSuccess("uvx found");

  if (!commandExists("npm")) {
    logError("npm is required but not found");
    process.exit(1);
  }
  logSuccess("npm found");

  if (checkFrontendDependencies) {
    try {
      validateFrontendDependencies(projectRoot);
    } catch (error) {
      logError(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
    logSuccess("frontend dependencies found");
  }
}

function ensureDirectories(config) {
  const dirs = [
    config.stateDir,
    join(config.stateDir, "conversations"),
    join(config.stateDir, "workspaces"),
    join(config.stateDir, "bash_events"),
    join(config.stateDir, "storage"),
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Process Management
// ═══════════════════════════════════════════════════════════════════════════

const processes = new Map();
const shutdownHooks = createShutdownHookRegistry((err) => {
  logService("cleanup", `Cleanup hook failed: ${err.message}`, c.yellow);
});

function registerShutdownHook(hook) {
  return shutdownHooks.add(hook);
}

function spawnService(name, command, args, options = {}) {
  const proc = spawn(
    command,
    args,
    getProcessTreeSpawnOptions({
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...options.env },
      cwd: options.cwd,
      shell: process.platform === "win32",
    }),
  );

  const color = options.color || c.reset;

  proc.stdout.on("data", (data) => {
    data
      .toString()
      .split("\n")
      .filter(Boolean)
      .forEach((line) => {
        logService(name, line.trim(), color);
      });
  });

  proc.stderr.on("data", (data) => {
    data
      .toString()
      .split("\n")
      .filter(Boolean)
      .forEach((line) => {
        logService(name, line.trim(), c.yellow);
      });
  });

  proc.on("error", (error) => {
    logError(`${name} failed to start: ${error.message}`);
  });

  proc.on("exit", (code, signal) => {
    if (code !== 0 && code !== null && !shuttingDown) {
      logService(name, `Exited with code ${code}`, c.red);
    }
    processes.delete(name);
  });

  processes.set(name, proc);
  return proc;
}

async function waitForService(name, url, timeoutMs = 30000) {
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        logService(name, `Ready at ${url}`, c.green);
        return true;
      }
    } catch (err) {
      lastError = err;
      // Keep trying
    }
    await delay(500);
  }

  const elapsed = Math.round((Date.now() - start) / 1000);
  logService(name, `Timeout waiting for ${url} after ${elapsed}s`, c.red);
  if (lastError) {
    logService(name, `Last error: ${lastError.message}`, c.dim);
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// Service Starters
// ═══════════════════════════════════════════════════════════════════════════

function startAgentServer(config) {
  logService(
    "agent-server",
    `Starting on port ${config.agentServerPort}...`,
    c.blue,
  );

  const agentServerCmd = buildAgentServerCommand(process.env);
  logService("agent-server", `Using ${agentServerCmd.source}`, c.dim);

  // Build safe config for agent-server env vars
  const safeConfig = buildSafeDevConfig(config.canvasPath, {
    ...process.env,
    OH_CANVAS_SAFE_STATE_DIR: config.stateDir,
    OH_CANVAS_SAFE_BACKEND_PORT: config.agentServerPort.toString(),
    OH_CANVAS_SAFE_VSCODE_PORT: config.vscodePort.toString(),
  });

  const agentServerEnv = buildAgentServerEnv(safeConfig);

  spawnService(
    "agent-server",
    agentServerCmd.command,
    [
      ...agentServerCmd.args,
      "--host",
      "127.0.0.1",
      "--port",
      String(config.agentServerPort),
    ],
    {
      cwd: safeConfig.workspacesPath,
      env: agentServerEnv,
      color: c.blue,
    },
  );
}

function startAutomationBackend(config) {
  logService(
    "automation",
    `Starting on port ${config.autoBackendPort}...`,
    c.green,
  );

  const automationCmd = buildAutomationCommand(process.env);
  logService("automation", `Using ${automationCmd.source}`, c.dim);

  spawnService(
    "automation",
    automationCmd.command,
    [
      ...automationCmd.args,
      "--host",
      "127.0.0.1",
      "--port",
      config.autoBackendPort.toString(),
    ],
    {
      cwd: config.stateDir,
      env: {
        // The automation backend uses this to call the agent-server's REST
        // API for uploads and bash dispatch (host-side) AND it propagates
        // the same value into the in-sandbox bash command as the
        // `AGENT_SERVER_URL` env var that main.py reads to connect back.
        //
        // In dev:docker that script runs inside the agent-server container,
        // so the URL has to be reachable from *both* the host and the
        // container. `host.docker.internal:${agentServerPort}` satisfies
        // both: from the host it's a loopback alias, and from inside the
        // container Docker's host-gateway routes back through the published
        // port. A little wasteful (the in-container script bounces through
        // the host port-forward) but it's the only single value that works
        // both ways without changes to the automation backend.
        //
        // Priority:
        //   1. AUTOMATION_AGENT_SERVER_URL explicitly set in the user's env
        //   2. launcher-provided host (dev-docker.mjs sets
        //      `automationApiHost: "host.docker.internal"`)
        //   3. `localhost` (correct for dockerless mode where backend and
        //      agent-server both run on the host)
        AUTOMATION_AGENT_SERVER_URL:
          process.env.AUTOMATION_AGENT_SERVER_URL ||
          `http://${config.automationApiHost ?? "localhost"}:${config.agentServerPort}`,
        AUTOMATION_AGENT_SERVER_API_KEY: config.sessionApiKey,
        AUTOMATION_DB_URL: `sqlite+aiosqlite:///${join(config.stateDir, "automations.db")}`,
        // The automation backend uses this as its publicly-reachable base
        // URL: it's appended to callback URLs and injected into each
        // sandbox as `AUTOMATION_API_URL` (consumed by setup.sh for
        // /sdk-version and by the SDK for run completion). In dev:docker
        // the sandbox is a separate container, so `localhost` won't reach
        // the host ingress — the launcher therefore passes
        // `automationApiHost: "host.docker.internal"` to override the host.
        // Priority:
        //   1. AUTOMATION_BASE_URL explicitly set in the user's env
        //   2. launcher-provided host (dev-docker.mjs)
        //   3. `localhost` (correct for dockerless mode)
        AUTOMATION_BASE_URL:
          process.env.AUTOMATION_BASE_URL ||
          `http://${config.automationApiHost ?? "localhost"}:${config.ingressPort}`,
        // The dispatcher (running on the host) resolves this path and
        // embeds it into a `mkdir -p ...` shell command that is then
        // executed *inside* the agent-server container. So the value must
        // be valid in the container's filesystem, not just on the host.
        // Priority:
        //   1. AUTOMATION_WORKSPACE_BASE explicitly set in the user's env
        //   2. `automationWorkspaceBase` option passed by the launcher
        //      (dev-docker.mjs sets this to a container-safe path)
        //   3. host-side default that lives under config.stateDir — fine
        //      for dockerless mode where the dispatcher and agent-server
        //      share the host filesystem.
        AUTOMATION_WORKSPACE_BASE:
          process.env.AUTOMATION_WORKSPACE_BASE ||
          config.automationWorkspaceBase ||
          join(config.stateDir, "workspaces"),
        // Local API key for self-hosted auth (no cloud API needed)
        AUTOMATION_LOCAL_API_KEY: config.localApiKey,
        // CORS: allow localhost origins for dev
        AUTOMATION_CORS_ORIGINS: `http://localhost:${config.ingressPort},http://127.0.0.1:${config.ingressPort},http://localhost:3001,http://127.0.0.1:3001`,
        FILE_STORE: "local",
        LOCAL_STORAGE_PATH: join(config.stateDir, "storage"),
        OPENHANDS_SUPPRESS_BANNER: "1",
      },
      color: c.green,
    },
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("");
  console.log(`${c.yellow}Shutting down...${c.reset}`);

  for (const [name, proc] of processes) {
    logService(name, "Stopping...", c.dim);
    signalProcessTree(proc, "SIGTERM");
  }

  setTimeout(() => {
    for (const [name, proc] of processes) {
      if (isProcessRunning(proc)) {
        logService(name, "Force stopping...", c.dim);
        signalProcessTree(proc, "SIGKILL");
      }
    }
    shutdownHooks.run();
    process.exit(0);
  }, 3000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function startIngress(config) {
  logService("ingress", `Starting on port ${config.ingressPort}...`, c.yellow);

  const ingressScript = join(projectRoot, "scripts", "ingress.mjs");

  spawnService(
    "ingress",
    "node",
    [
      ingressScript,
      "--port",
      config.ingressPort.toString(),
      "--route",
      `/api/automation=http://localhost:${config.autoBackendPort}`,
      "--route",
      `/api=http://localhost:${config.agentServerPort}`,
      "--route",
      `/sockets=http://localhost:${config.agentServerPort}`,
      "--route",
      `/server_info=http://localhost:${config.agentServerPort}`,
      "--route",
      `/health=http://localhost:${config.agentServerPort}`,
      "--route",
      `/ready=http://localhost:${config.agentServerPort}`,
      "--route",
      `/alive=http://localhost:${config.agentServerPort}`,
      "--route",
      `/docs=http://localhost:${config.agentServerPort}`,
      "--route",
      `/redoc=http://localhost:${config.agentServerPort}`,
      "--route",
      `/openapi.json=http://localhost:${config.agentServerPort}`,
      "--default",
      `http://localhost:${config.vitePort}`,
    ],
    {
      cwd: projectRoot,
      color: c.yellow,
    },
  );
}

/**
 * Build the JSON-serializable runtime services info for an automation
 * stack. Used by both the Vite dev server (dev mode) and static-build.mjs
 * (static mode) so the frontend can populate the agent's
 * `<RUNTIME_SERVICES>` system-prompt block.
 */
export function buildAutomationRuntimeServicesInfo(config) {
  return buildRuntimeServicesInfo({
    mode: config.mode ?? "dev:automation",
    agentHostAlias: config.agentHostAlias ?? "localhost",
    agentServerPort: config.agentServerPort,
    ingressPort: config.ingressPort,
    frontendPort: config.vitePort,
    // The same port hosts Vite in dynamic mode and a static-file server
    // in static mode. The launcher records this on the config so the
    // description shown to the agent matches reality.
    frontendKind: config.frontendKind ?? "vite",
    automation: { port: config.autoBackendPort },
  });
}

function startVite(config, extraEnv = {}) {
  logService("vite", `Starting on port ${config.vitePort}...`, c.magenta);

  const frontendCommand = buildNpmScriptCommand("dev:frontend");
  const runtimeServicesInfo = buildAutomationRuntimeServicesInfo(config);

  spawnService("vite", frontendCommand.command, frontendCommand.args, {
    cwd: config.canvasPath,
    env: {
      // Point Vite at the ingress (so client-side fetches work)
      VITE_BACKEND_HOST: `127.0.0.1:${config.ingressPort}`,
      VITE_BACKEND_BASE_URL: `http://127.0.0.1:${config.ingressPort}`,
      VITE_WORKING_DIR:
        config.viteWorkingDir ?? join(config.stateDir, "workspaces"),
      VITE_FRONTEND_PORT: config.vitePort.toString(),
      // Session API key for frontend to authenticate with agent-server
      VITE_SESSION_API_KEY: config.sessionApiKey,
      // Automation API key for frontend to authenticate with automation backend
      VITE_AUTOMATION_API_KEY: config.localApiKey,
      // Inform the frontend (and downstream, the agent's system prompt) about
      // which services are available in this dev stack.
      VITE_RUNTIME_SERVICES_INFO: JSON.stringify(runtimeServicesInfo),
      // Session API key for agent-server auth (when SESSION_API_KEY is set)
      ...(config.sessionApiKey && {
        VITE_SESSION_API_KEY: config.sessionApiKey,
      }),
      // Extra env vars (e.g. VITE_DOCKER_BACKEND_HOST)
      ...extraEnv,
    },
    color: c.magenta,
  });
}

/**
 * Seed the automation API key into agent-server's secrets store.
 * This makes the key available to agents during conversations.
 *
 * Includes retry logic to handle slow server startup or transient failures.
 *
 * @param {object} config - Configuration object with agentServerPort, localApiKey, sessionApiKey
 * @param {object} options - Options for retry behavior
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 5)
 * @param {number} options.retryDelayMs - Delay between retries in ms (default: 2000)
 * @param {number} options.timeoutMs - Request timeout in ms (default: 10000)
 * @returns {Promise<boolean>} True if seeding succeeded, false otherwise
 */
async function seedAutomationSecret(config, options = {}) {
  const { maxRetries = 5, retryDelayMs = 2000, timeoutMs = 10000 } = options;

  const secretName = "OPENHANDS_AUTOMATION_API_KEY";
  const secretDescription =
    "API key for authenticating with the automation backend";

  logService("secrets", `Seeding ${secretName} into agent-server...`, c.dim);

  const url = `http://localhost:${config.agentServerPort}/api/settings/secrets`;
  const body = JSON.stringify({
    name: secretName,
    value: config.localApiKey,
    description: secretDescription,
  });

  const headers = {
    "Content-Type": "application/json",
    // Include session API key if configured
    ...(config.sessionApiKey && { "X-Session-API-Key": config.sessionApiKey }),
  };

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        logService("secrets", `${secretName} seeded successfully`, c.green);
        return true;
      }

      const text = await response.text();
      lastError = `HTTP ${response.status}: ${text}`;

      // Don't retry on authentication errors - they won't resolve with retries
      if (response.status === 401 || response.status === 403) {
        logService(
          "secrets",
          `Warning: Failed to seed secret (${response.status}): ${text}`,
          c.yellow,
        );
        return false;
      }

      // Retry on server errors or service unavailable
      if (attempt < maxRetries) {
        logService(
          "secrets",
          `Retry ${attempt}/${maxRetries} after ${response.status}...`,
          c.dim,
        );
        await delay(retryDelayMs);
      }
    } catch (err) {
      lastError = err.message;

      // Connection errors likely mean server isn't ready - wait and retry
      if (attempt < maxRetries) {
        logService(
          "secrets",
          `Retry ${attempt}/${maxRetries}: ${err.message}`,
          c.dim,
        );
        await delay(retryDelayMs);
      }
    }
  }

  logService(
    "secrets",
    `Warning: Failed to seed secret after ${maxRetries} attempts: ${lastError}`,
    c.yellow,
  );
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// Docker Backend (optional second agent-server in a container)
// ═══════════════════════════════════════════════════════════════════════════

function isDockerAvailable() {
  const result =
    process.platform === "win32"
      ? spawnSync("where.exe", ["docker"], { stdio: "pipe" })
      : spawnSync("sh", ["-c", "command -v docker"], { stdio: "pipe" });
  if (result.status !== 0) return false;

  const info = spawnSync("docker", ["info"], {
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 10_000,
  });
  return info.status === 0;
}

function promptLine(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Read the persisted backend choice from disk.
 * Returns null if nothing is persisted or the file is invalid.
 */
function readPersistedBackendChoice() {
  try {
    const raw = readFileSync(DEFAULT_BACKEND_CHOICE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed;
  } catch {
    // file doesn't exist or is invalid
  }
  return null;
}

/**
 * Persist the backend choice so the next restart can re-use it.
 */
function writePersistedBackendChoice(choice) {
  try {
    mkdirSync(dirname(DEFAULT_BACKEND_CHOICE_PATH), { recursive: true });
    writeFileSync(
      DEFAULT_BACKEND_CHOICE_PATH,
      JSON.stringify(choice, null, 2) + "\n",
    );
  } catch {
    // non-fatal: user will just get prompted again next time
  }
}

/**
 * Interactively ask the user about backend choices.
 *
 * Remembers the previous answer in ~/.openhands/agent-canvas/backend-choice.json
 * so subsequent restarts re-use the same config without re-prompting.
 * Pass --reconfigure to force a fresh prompt.
 *
 * Returns:
 *   { local: boolean, docker: { enabled: boolean, projectsPath?: string } }
 */
async function promptForBackends(env = process.env, { forcePrompt = false } = {}) {
  const isTTY = process.stdin.isTTY;

  // Try to load a previous choice (unless user asked to reconfigure)
  if (!forcePrompt) {
    const saved = readPersistedBackendChoice();
    if (saved) {
      const dockerLabel = saved.docker?.enabled
        ? `+ Docker (:${saved.docker.projectsPath ?? "?"})`
        : "";
      const localLabel = saved.local !== false ? "Local" : "no local";
      logService(
        "config",
        `Using saved backend choice: ${localLabel} ${dockerLabel} (--reconfigure to change)`,
        c.dim,
      );
      return {
        local: saved.local !== false,
        docker: saved.docker ?? { enabled: false },
      };
    }
  }

  console.log("");
  console.log(`${c.bold}Backend Configuration${c.reset}`);
  console.log("");
  console.log(
    `  ${c.green}Local backend${c.reset} (default)`,
  );
  console.log(
    `    ${c.green}✓${c.reset} Fast startup, no Docker needed`,
  );
  console.log(
    `    ${c.green}✓${c.reset} Direct filesystem access for quick iteration`,
  );
  console.log(
    `    ${c.red}✗${c.reset} Agent runs with your full host permissions — no sandbox`,
  );
  console.log(
    `    ${c.dim}Safety: confirmation mode is enabled so the agent asks before risky actions.${c.reset}`,
  );
  console.log("");
  console.log(
    `  ${c.cyan}Docker backend${c.reset} (optional, runs alongside local)`,
  );
  console.log(
    `    ${c.green}✓${c.reset} Sandboxed execution — agent runs in an isolated container`,
  );
  console.log(
    `    ${c.green}✓${c.reset} Closer to production/cloud behavior`,
  );
  console.log(
    `    ${c.red}✗${c.reset} Requires Docker Desktop running`,
  );
  console.log(
    `    ${c.red}✗${c.reset} Slightly slower startup; mounts a host directory for file access`,
  );
  console.log("");

  // --- Local backend prompt (default: Yes) ---
  let startLocal = true;
  if (isTTY) {
    const localAnswer = await promptLine(
      `  Start local agent-server? [Y/n] `,
    );
    startLocal = !/^n(o)?$/i.test(localAnswer);
  }

  // --- Docker backend prompt (default: No) ---
  let docker = { enabled: false };

  const dockerAvailable = isDockerAvailable();
  if (!dockerAvailable) {
    console.log(
      `  ${c.dim}Docker not detected — skipping Docker backend.${c.reset}`,
    );
  } else if (isTTY) {
    const dockerAnswer = await promptLine(
      `  Also start a Docker backend? [y/N] `,
    );

    if (/^y(es)?$/i.test(dockerAnswer)) {
      // Re-check in case Docker daemon stopped after initial detection
      if (!isDockerAvailable()) {
        logError(
          "Docker is no longer available. Install Docker: https://docs.docker.com/get-docker/",
        );
      } else {
        const defaultPath = env.PROJECTS_PATH || "";
        const pathPrompt = defaultPath
          ? `  Projects directory to mount [${defaultPath}]: `
          : `  Projects directory to mount (absolute path): `;
        const rawPath = await promptLine(pathPrompt);
        const projectsPath = rawPath || defaultPath;

        if (!projectsPath) {
          logError("No projects path provided. Skipping Docker backend.");
        } else if (!isAbsolute(projectsPath)) {
          logError(`Path must be absolute: ${projectsPath}. Skipping Docker backend.`);
        } else if (!existsSync(projectsPath)) {
          logError(`Path does not exist: ${projectsPath}. Skipping Docker backend.`);
        } else {
          docker = { enabled: true, projectsPath };
        }
      }
    }
  }

  const result = { local: startLocal, docker };

  // Persist the choice for next time
  writePersistedBackendChoice(result);

  console.log("");
  if (startLocal || docker.enabled) {
    console.log(
      `  ${c.dim}Tip: You can change security settings in Settings → Verification.${c.reset}`,
    );
    console.log("");
  }

  return result;
}

/**
 * Ensure confirmation_mode and security_analyzer are set on the local
 * agent-server. Reads the current settings first — only writes defaults
 * when they haven't been configured yet. The agent-server's own state-dir
 * persistence is the single source of truth.
 */
async function seedSecuritySettings(config, options = {}) {
  const { maxRetries = 5, retryDelayMs = 2000, timeoutMs = 10000 } = options;

  const url = `http://localhost:${config.agentServerPort}/api/settings`;
  const headers = {
    "Content-Type": "application/json",
    ...(config.sessionApiKey && { "X-Session-API-Key": config.sessionApiKey }),
  };

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 1. Read current settings
      const getResp = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!getResp.ok) {
        const text = await getResp.text();
        lastError = `GET ${getResp.status}: ${text}`;
        if ([400, 401, 403, 404, 422].includes(getResp.status)) {
          logService("settings", `Warning: could not read settings (${getResp.status})`, c.yellow);
          return false;
        }
        if (attempt < maxRetries) { await delay(retryDelayMs); continue; }
        break;
      }

      const current = await getResp.json();
      const conv = current?.conversation_settings ?? {};

      // 2. Only patch what's missing
      const diff = {};
      if (conv.confirmation_mode !== true) diff.confirmation_mode = true;
      if (!conv.security_analyzer) diff.security_analyzer = "llm";

      if (Object.keys(diff).length === 0) {
        logService("settings", "Security settings already configured", c.dim);
        return true;
      }

      // 3. Apply defaults
      const patchResp = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ conversation_settings_diff: diff }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (patchResp.ok) {
        const applied = Object.entries(diff)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        logService("settings", `Applied security defaults: ${applied}`, c.green);
        return true;
      }

      const text = await patchResp.text();
      lastError = `PATCH ${patchResp.status}: ${text}`;
      if ([400, 401, 403, 404, 422].includes(patchResp.status)) {
        logService("settings", `Warning: could not apply security settings (${patchResp.status})`, c.yellow);
        return false;
      }

      if (attempt < maxRetries) await delay(retryDelayMs);
    } catch (err) {
      lastError = err.message;
      if (attempt < maxRetries) await delay(retryDelayMs);
    }
  }

  logService(
    "settings",
    `Warning: could not seed security settings after ${maxRetries} attempts: ${lastError}`,
    c.yellow,
  );
  return false;
}

/**
 * Start a Docker agent-server on the given port.
 * Reuses image/mount logic from dev-docker.mjs but runs as a secondary
 * service rather than the primary agent-server.
 */
function startDockerBackend(config) {
  // Lazy import so the module doesn't hard-require dev-docker.mjs
  // when Docker is not used.
  const {
    resolveAgentServerImage,
    getHostDockerUserSpec,
    getDockerUserArgs,
    getDockerHomeTmpfsArgs,
    HOST_CANVAS_TOOLS_DIR,
    CONTAINER_CANVAS_TOOLS_DIR,
    CONTAINER_HOME_DIR,
    CONTAINER_OPENHANDS_DIR,
  } = /** @type {any} */ (config._dockerImports);

  const containerName = "agent-canvas-dev-docker-secondary";
  const image = resolveAgentServerImage();
  const port = config.dockerBackendPort;
  const projectsPath = config.dockerProjectsPath;

  logService(
    "docker-backend",
    `Starting on port ${port} (image: ${image})...`,
    c.blue,
  );

  // Best-effort cleanup of any leftover container
  spawnSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
  registerShutdownHook(() => {
    spawnSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
  });

  const home = homedir();
  const userSpec = getHostDockerUserSpec();
  const dockerArgs = ["run", "--rm", "--name", containerName, "--init"];
  dockerArgs.push(...getDockerUserArgs(userSpec));

  // Mount projects directory
  dockerArgs.push("-v", `${projectsPath}:/projects`);

  // Mount canvas tools
  dockerArgs.push(
    "-v",
    `${HOST_CANVAS_TOOLS_DIR}:${CONTAINER_CANVAS_TOOLS_DIR}:ro`,
  );

  // Isolated home with credential mounts
  dockerArgs.push(...getDockerHomeTmpfsArgs(userSpec));
  const optionalMounts = [
    [join(home, ".openhands"), CONTAINER_OPENHANDS_DIR],
    [join(home, ".claude"), `${CONTAINER_HOME_DIR}/.claude`],
    [join(home, ".codex"), `${CONTAINER_HOME_DIR}/.codex`],
    [join(home, ".ssh"), `${CONTAINER_HOME_DIR}/.ssh`],
  ];
  for (const [src, dest] of optionalMounts) {
    if (existsSync(src)) {
      dockerArgs.push("-v", `${src}:${dest}`);
    }
  }

  // Map container port 8000 to the allocated host port
  dockerArgs.push("-p", `${port}:8000`);

  // Container environment
  const DEFAULT_SECRET_KEY = "openhands-dev-secret-key-change-in-prod";
  const containerEnv = {
    HOME: CONTAINER_HOME_DIR,
    OH_CONVERSATIONS_PATH: `${CONTAINER_OPENHANDS_DIR}/agent-canvas/conversations`,
    OH_PERSISTENCE_DIR: CONTAINER_OPENHANDS_DIR,
    OH_BASH_EVENTS_DIR: `${CONTAINER_OPENHANDS_DIR}/agent-canvas/bash_events`,
    OH_SECRET_KEY: process.env.OH_SECRET_KEY || DEFAULT_SECRET_KEY,
    OH_SESSION_API_KEYS_0: config.sessionApiKey,
    OH_EXTRA_PYTHON_PATH: CONTAINER_CANVAS_TOOLS_DIR,
  };
  for (const [k, v] of Object.entries(containerEnv)) {
    dockerArgs.push("-e", `${k}=${v}`);
  }

  dockerArgs.push(image);

  spawnService("docker-backend", "docker", dockerArgs, {
    color: c.cyan,
  });
}

function printBanner(config) {
  console.log("");
  console.log(
    `${c.green}${c.bold}╔══════════════════════════════════════════════════════════════╗${c.reset}`,
  );
  console.log(
    `${c.green}${c.bold}║${c.reset}  ${c.bold}Agent Canvas + Automation Stack${c.reset}                            ${c.green}${c.bold}║${c.reset}`,
  );
  console.log(
    `${c.green}${c.bold}╠══════════════════════════════════════════════════════════════╣${c.reset}`,
  );
  console.log(
    `${c.green}${c.bold}║${c.reset}                                                              ${c.green}${c.bold}║${c.reset}`,
  );
  console.log(
    `${c.green}${c.bold}║${c.reset}  Main UI:      ${c.cyan}http://localhost:${config.ingressPort}/${c.reset}`.padEnd(
      75,
    ) + `${c.green}${c.bold}║${c.reset}`,
  );
  console.log(
    `${c.green}${c.bold}║${c.reset}  API Docs:     ${c.cyan}http://localhost:${config.ingressPort}/api/automation/docs${c.reset}`.padEnd(
      75,
    ) + `${c.green}${c.bold}║${c.reset}`,
  );
  if (config.dockerBackendPort) {
    console.log(
      `${c.green}${c.bold}║${c.reset}  Docker:       ${c.cyan}http://127.0.0.1:${config.dockerBackendPort}${c.reset}`.padEnd(
        75,
      ) + `${c.green}${c.bold}║${c.reset}`,
    );
  }
  console.log(
    `${c.green}${c.bold}║${c.reset}                                                              ${c.green}${c.bold}║${c.reset}`,
  );
  console.log(
    `${c.green}${c.bold}╚══════════════════════════════════════════════════════════════╝${c.reset}`,
  );
  console.log("");
  console.log(`${c.dim}State directory: ${config.stateDir}${c.reset}`);
  console.log(`${c.dim}Press Ctrl+C to stop${c.reset}`);
  console.log("");
}

async function main(options = {}) {
  const {
    bannerTitle = "Agent Canvas + Automation Development Stack",
    startAgentServer: startAgentServerOverride,
    extraPrereqs,
    viteWorkingDir,
    // Path (in whatever filesystem the agent-server can mkdir into) used
    // as `AUTOMATION_WORKSPACE_BASE` by the automation backend. dev-docker
    // sets this to a path that exists inside the agent-server container;
    // dockerless mode leaves it undefined so the host-side default applies.
    automationWorkspaceBase,
    // Host used in `AUTOMATION_BASE_URL` (the URL the automation sandbox
    // uses to call back into the automation backend). dev-docker sets
    // this to `host.docker.internal` so the sandbox container can reach
    // the host ingress; dockerless mode leaves it undefined and the
    // default `localhost` applies.
    automationApiHost,
    staticMode: staticModeOverride,
    defaultStaticMode = false,
    buildStaticFrontend,
    staticDir: staticDirOverride,
    // Hostname the agent uses to reach services running on the host.
    // dev-docker.mjs overrides this to "host.docker.internal" because the
    // agent-server runs in a container and the host is not "localhost"
    // from its perspective.
    agentHostAlias = "localhost",
    // Human-readable label for the dev mode, surfaced in the agent's
    // <RUNTIME_SERVICES> system-prompt block.
    mode = "dev:automation",
    // When true, skip the interactive backend prompt (used by dev-docker.mjs
    // which manages its own Docker container).
    skipBackendPrompt = false,
  } = options;

  const args = parseArgs();

  // Allow options to override CLI args (for bin/agent-canvas.mjs)
  const useStaticMode =
    staticModeOverride ??
    (args.dynamic ? false : args.static || defaultStaticMode);
  const staticDir =
    staticDirOverride ?? args.staticDir ?? join(projectRoot, "build");

  const modeLabel = useStaticMode ? "(Static)" : "";
  const titleWithMode = modeLabel ? `${bannerTitle} ${modeLabel}` : bannerTitle;

  console.log("");
  console.log(`${c.cyan}${c.bold}${titleWithMode}${c.reset}`);
  console.log("");

  // Setup phase
  // (uvx is still required even in docker mode because the automation
  // backend runs via uvx; only the agent-server is dockerized.)
  checkPrerequisites({
    checkFrontendDependencies:
      !useStaticMode || typeof buildStaticFrontend === "function",
  });

  // ── Handle --reconfigure ────────────────────────────────────────────
  // Clears persisted backend choice so the user gets a fresh prompt.
  if (args.reconfigure) {
    try {
      if (existsSync(DEFAULT_BACKEND_CHOICE_PATH)) unlinkSync(DEFAULT_BACKEND_CHOICE_PATH);
    } catch {
      // non-fatal
    }
    logService("config", "Cleared saved backend choice. Will re-prompt.", c.dim);
  }

  // ── Resolve Docker intent ──────────────────────────────────────────
  // Priority: --with-docker / --no-docker flags → DOCKER_BACKEND env var →
  // interactive prompt (TTY only) → default off.
  let wantDocker = args.withDocker; // null = not decided
  let dockerProjectsPath = args.dockerProjectsPath ?? process.env.PROJECTS_PATH ?? null;

  if (wantDocker === null && process.env.DOCKER_BACKEND === "1") {
    wantDocker = true;
  }

  // Resolve via interactive prompt when not yet decided and not skipped
  let wantLocal = true;
  if (!skipBackendPrompt && wantDocker === null) {
    const result = await promptForBackends(process.env, {
      forcePrompt: args.reconfigure,
    });
    wantLocal = result.local;
    wantDocker = result.docker.enabled;
    if (result.docker.enabled) {
      dockerProjectsPath = result.docker.projectsPath;
    }
  }

  // If Docker was requested, validate prerequisites now
  if (wantDocker) {
    if (!isDockerAvailable()) {
      logError("Docker is not available. Skipping Docker backend.");
      logError("Install Docker: https://docs.docker.com/get-docker/");
      wantDocker = false;
    } else if (!dockerProjectsPath) {
      logError(
        "No projects path for Docker backend. Set PROJECTS_PATH or use --docker-projects-path.",
      );
      wantDocker = false;
    } else if (!isAbsolute(dockerProjectsPath)) {
      logError(`Docker projects path must be absolute: ${dockerProjectsPath}`);
      wantDocker = false;
    } else if (!existsSync(dockerProjectsPath)) {
      logError(`Docker projects path does not exist: ${dockerProjectsPath}`);
      wantDocker = false;
    }
  }

  // Stamp Docker decision onto args so buildConfig allocates the port
  args.withDocker = wantDocker;

  // Build config with dynamic port allocation
  const config = await buildConfig(args);
  if (viteWorkingDir) config.viteWorkingDir = viteWorkingDir;
  if (automationWorkspaceBase) {
    config.automationWorkspaceBase = automationWorkspaceBase;
  }
  if (automationApiHost) {
    config.automationApiHost = automationApiHost;
  }
  // Stamp the dev-mode label, host alias, and frontend kind on the config
  // so downstream helpers (Vite spawn, static build) can produce a
  // runtime-services info object describing what the agent can reach.
  config.mode = mode;
  config.agentHostAlias = agentHostAlias;
  config.frontendKind = useStaticMode ? "static" : "vite";

  // Stash Docker projects path for startDockerBackend()
  if (wantDocker) {
    config.dockerProjectsPath = dockerProjectsPath;
  }

  ensureDirectories(config);
  if (typeof extraPrereqs === "function") {
    extraPrereqs(config);
  }

  if (useStaticMode && typeof buildStaticFrontend === "function") {
    buildStaticFrontend(config, args);
  }

  // In static mode, verify build exists after any launcher-managed build.
  if (useStaticMode && !existsSync(staticDir)) {
    logError(`Static directory not found: ${staticDir}`);
    logError(`Run 'npm run build' first to create the static files.`);
    process.exit(1);
  }

  // Start services phase
  logStep("2/2", "Starting services...");

  // 1. Start local agent-server (unless user opted out)
  let agentServerReady = false;
  if (wantLocal) {
    const agentServerStarter = startAgentServerOverride ?? startAgentServer;
    agentServerStarter(config);

    // Wait for agent-server to be ready (60s timeout for slow systems)
    agentServerReady = await waitForService(
      "agent-server",
      `http://localhost:${config.agentServerPort}/server_info`,
      60000,
    );

    // 2. Seed secrets and security settings
    if (agentServerReady) {
      await seedAutomationSecret(config);
      await seedSecuritySettings(config);
    } else {
      logService(
        "secrets",
        "Skipping secret/settings seeding - agent-server not ready",
        c.yellow,
      );
    }
  } else {
    logService("agent-server", "Skipped (user opted out)", c.dim);
  }

  // 3. Start automation backend
  startAutomationBackend(config);

  // 4. Start frontend server (Vite dev server OR static server)
  const viteEnvExtras = {};
  if (wantDocker && config.dockerBackendPort) {
    viteEnvExtras.VITE_DOCKER_BACKEND_HOST = `http://127.0.0.1:${config.dockerBackendPort}`;
  }
  if (useStaticMode) {
    startStaticFrontend(config, staticDir);
  } else {
    startVite(config, viteEnvExtras);
  }

  // 5. Wait for services to be ready
  await delay(2000);

  // 6. Start ingress proxy (routes traffic to all backends)
  startIngress(config);

  // 7. Start Docker backend (if requested)
  if (wantDocker && config.dockerBackendPort) {
    // Lazy-import dev-docker.mjs exports so we don't require Docker
    // dependencies when Docker is not used.
    try {
      const dockerModule = await import("./dev-docker.mjs");
      config._dockerImports = dockerModule;
      startDockerBackend(config);

      // Wait for Docker backend to be ready
      const dockerReady = await waitForService(
        "docker-backend",
        `http://127.0.0.1:${config.dockerBackendPort}/server_info`,
        90000, // Docker image pull can be slow
      );
      if (!dockerReady) {
        logService(
          "docker-backend",
          "Docker backend did not become ready in time",
          c.yellow,
        );
      }
    } catch (err) {
      logError(
        `Failed to start Docker backend: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Wait for ingress to start
  await delay(1000);

  printBanner(config);
}

function startStaticFrontend(config, staticDir) {
  logService("static", `Starting on port ${config.vitePort}...`, c.magenta);
  logService("static", `Serving from: ${staticDir}`, c.dim);

  const staticServerScript = join(projectRoot, "scripts", "static-server.mjs");
  spawnService(
    "static",
    "node",
    [
      staticServerScript,
      "--dir",
      staticDir,
      "--host",
      "0.0.0.0",
      "--port",
      String(config.vitePort),
      // Proxy routes to backends (same as ingress but for direct access to vitePort)
      "--route",
      `/api/automation=http://localhost:${config.autoBackendPort}`,
      "--route",
      `/api=http://localhost:${config.agentServerPort}`,
      "--route",
      `/sockets=http://localhost:${config.agentServerPort}`,
      "--route",
      `/server_info=http://localhost:${config.agentServerPort}`,
      "--route",
      `/health=http://localhost:${config.agentServerPort}`,
      "--route",
      `/ready=http://localhost:${config.agentServerPort}`,
      "--route",
      `/alive=http://localhost:${config.agentServerPort}`,
      "--route",
      `/docs=http://localhost:${config.agentServerPort}`,
      "--route",
      `/redoc=http://localhost:${config.agentServerPort}`,
      "--route",
      `/openapi.json=http://localhost:${config.agentServerPort}`,
    ],
    {
      cwd: config.canvasPath,
      color: c.magenta,
    },
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports for testing
// ═══════════════════════════════════════════════════════════════════════════

export {
  buildAutomationCommand,
  buildConfig,
  main,
  registerShutdownHook,
  spawnService,
  commandExists,
  logService,
  logStep,
  logSuccess,
  logError,
  c,
  DEFAULT_AUTOMATION_REPO,
  DEFAULT_AUTOMATION_PACKAGE,
  DEFAULT_AUTOMATION_VERSION,
  DEFAULT_AUTOMATION_SDK_VERSION,
  DEFAULT_BACKEND_PORT,
  DEFAULT_AUTOMATION_PORT,
  DEFAULT_AUTOMATION_API_KEY_PATH,
  DEFAULT_DOCKER_BACKEND_PORT,
  isDockerAvailable,
  promptForBackends,
  seedSecuritySettings,
  startDockerBackend,
};

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point (only when run directly, not when imported)
// ═══════════════════════════════════════════════════════════════════════════

// Check if this module is the main entry point
const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((err) => {
    logError(`Fatal error: ${err.message}`);
    if (err.stack) {
      console.error(c.dim + err.stack + c.reset);
    }
    process.exit(1);
  });
}
