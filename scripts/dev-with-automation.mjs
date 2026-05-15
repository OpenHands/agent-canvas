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
 *
 * Secrets:
 *   The automation API key is automatically seeded into agent-server secrets
 *   as OPENHANDS_AUTOMATION_API_KEY, making it available to agents in conversations.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";

import {
  buildAgentServerCommand,
  buildSafeDevConfig,
  buildAgentServerEnv,
  buildNpmScriptCommand,
  formatMissingUvxGuidance,
  generateRandomApiKey,
  findFreePorts,
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
const DEFAULT_AUTOMATION_VERSION = "1.0.0a2";
const DEFAULT_BACKEND_PORT = 18000;
const DEFAULT_AUTOMATION_PORT = 18001;

// Auto-generate a random API key for this dev session.
// This ensures services share the same key during a single invocation,
// but each restart gets a fresh key for better security isolation.
// Set AUTOMATION_LOCAL_API_KEY env var to use a consistent key across restarts.
const DEFAULT_LOCAL_API_KEY = generateRandomApiKey();

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
  -v, --verbose               Show detailed output
  -h, --help                  Show this help

ENVIRONMENT VARIABLES:
  PORT                        Alternative to --port
  OH_AUTOMATION_GIT_REF       Git ref for automation (overrides default version)
  OH_AUTOMATION_VERSION       Specific PyPI version for automation (default: ${DEFAULT_AUTOMATION_VERSION})
  OH_AGENT_SERVER_GIT_REF     Git ref for agent-server SDK (overrides default version)
  OH_AGENT_SERVER_VERSION     Specific PyPI version for agent-server
  OH_SECRET_KEY               Secret key for sessions
  AUTOMATION_LOCAL_API_KEY    Custom API key for automation backend auth

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
    uvxArgs.push("--refresh", "--from", gitUrl, "uvicorn", "openhands.automation.app:app");
    source = `git (${gitRef})`;
  } else if (version) {
    // Use specific PyPI version
    uvxArgs.push("--from", `${DEFAULT_AUTOMATION_PACKAGE}==${version}`, "uvicorn", "openhands.automation.app:app");
    source = `PyPI (${version})`;
  } else {
    // Default to released PyPI version
    uvxArgs.push("--from", `${DEFAULT_AUTOMATION_PACKAGE}==${DEFAULT_AUTOMATION_VERSION}`, "uvicorn", "openhands.automation.app:app");
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

  // Find available ports, preferring the defaults
  logStep("ports", "Allocating ports...");
  const ports = await findFreePorts([
    { name: "ingress", preferred: preferredIngressPort },
    { name: "backend", preferred: preferredBackendPort },
    { name: "automation", preferred: preferredAutomationPort },
    { name: "vite", preferred: preferredVitePort },
  ]);

  // Log any port changes
  if (ports.ingress !== preferredIngressPort) {
    logService("ports", `Port ${preferredIngressPort} busy, using ${ports.ingress} for ingress`, c.yellow);
  }
  if (ports.backend !== preferredBackendPort) {
    logService("ports", `Port ${preferredBackendPort} busy, using ${ports.backend} for agent-server`, c.yellow);
  }
  if (ports.automation !== preferredAutomationPort) {
    logService("ports", `Port ${preferredAutomationPort} busy, using ${ports.automation} for automation`, c.yellow);
  }
  if (ports.vite !== preferredVitePort) {
    logService("ports", `Port ${preferredVitePort} busy, using ${ports.vite} for vite`, c.yellow);
  }

  const vscodePort = ports.backend + 1000;

  // Local API key for automation backend auth
  const localApiKey = env.AUTOMATION_LOCAL_API_KEY || DEFAULT_LOCAL_API_KEY;
  
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
  const proc = spawn(command, args, getProcessTreeSpawnOptions({
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...options.env },
    cwd: options.cwd,
    shell: process.platform === "win32",
  }));

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
  logService("agent-server", `Starting on port ${config.agentServerPort}...`, c.blue);

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
    [...agentServerCmd.args, "--host", "127.0.0.1", "--port", String(config.agentServerPort)],
    {
      cwd: safeConfig.workspacesPath,
      env: agentServerEnv,
      color: c.blue,
    }
  );
}

function startAutomationBackend(config) {
  logService("automation", `Starting on port ${config.autoBackendPort}...`, c.green);

  const automationCmd = buildAutomationCommand(process.env);
  logService("automation", `Using ${automationCmd.source}`, c.dim);

  spawnService(
    "automation",
    automationCmd.command,
    [
      ...automationCmd.args,
      "--host", "127.0.0.1",
      "--port", config.autoBackendPort.toString(),
    ],
    {
      cwd: config.stateDir,
      env: {
        AUTOMATION_AGENT_SERVER_URL: `http://localhost:${config.agentServerPort}`,
        AUTOMATION_AGENT_SERVER_API_KEY: config.sessionApiKey,
        AUTOMATION_DB_URL: `sqlite+aiosqlite:///${join(config.stateDir, "automations.db")}`,
        AUTOMATION_BASE_URL: `http://localhost:${config.ingressPort}`,
        AUTOMATION_WORKSPACE_BASE: join(config.stateDir, "workspaces"),
        // Local API key for self-hosted auth (no cloud API needed)
        AUTOMATION_LOCAL_API_KEY: config.localApiKey,
        // CORS: allow localhost origins for dev
        AUTOMATION_CORS_ORIGINS: `http://localhost:${config.ingressPort},http://127.0.0.1:${config.ingressPort},http://localhost:3001,http://127.0.0.1:3001`,
        FILE_STORE: "local",
        LOCAL_STORAGE_PATH: join(config.stateDir, "storage"),
        OPENHANDS_SUPPRESS_BANNER: "1",
      },
      color: c.green,
    }
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
      "--port", config.ingressPort.toString(),
      "--route", `/api/automation=http://localhost:${config.autoBackendPort}`,
      "--route", `/api=http://localhost:${config.agentServerPort}`,
      "--route", `/sockets=http://localhost:${config.agentServerPort}`,
      "--route", `/server_info=http://localhost:${config.agentServerPort}`,
      "--route", `/health=http://localhost:${config.agentServerPort}`,
      "--route", `/ready=http://localhost:${config.agentServerPort}`,
      "--route", `/alive=http://localhost:${config.agentServerPort}`,
      "--default", `http://localhost:${config.vitePort}`,
    ],
    {
      cwd: projectRoot,
      color: c.yellow,
    }
  );
}

function startVite(config) {
  logService("vite", `Starting on port ${config.vitePort}...`, c.magenta);

  const frontendCommand = buildNpmScriptCommand("dev:frontend");

  spawnService("vite", frontendCommand.command, frontendCommand.args, {
    cwd: config.canvasPath,
    env: {
      // Point Vite at the ingress (so client-side fetches work)
      VITE_BACKEND_HOST: `127.0.0.1:${config.ingressPort}`,
      VITE_BACKEND_BASE_URL: `http://127.0.0.1:${config.ingressPort}`,
      VITE_WORKING_DIR: config.viteWorkingDir ?? join(config.stateDir, "workspaces"),
      VITE_FRONTEND_PORT: config.vitePort.toString(),
      // Session API key for frontend to authenticate with agent-server
      VITE_SESSION_API_KEY: config.sessionApiKey,
      // Automation API key for frontend to authenticate with automation backend
      VITE_AUTOMATION_API_KEY: config.localApiKey,
      // Session API key for agent-server auth (when SESSION_API_KEY is set)
      ...(config.sessionApiKey && { VITE_SESSION_API_KEY: config.sessionApiKey }),
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
  const {
    maxRetries = 5,
    retryDelayMs = 2000,
    timeoutMs = 10000,
  } = options;

  const secretName = "OPENHANDS_AUTOMATION_API_KEY";
  const secretDescription = "API key for authenticating with the automation backend";

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
        logService("secrets", `Warning: Failed to seed secret (${response.status}): ${text}`, c.yellow);
        return false;
      }

      // Retry on server errors or service unavailable
      if (attempt < maxRetries) {
        logService("secrets", `Retry ${attempt}/${maxRetries} after ${response.status}...`, c.dim);
        await delay(retryDelayMs);
      }
    } catch (err) {
      lastError = err.message;

      // Connection errors likely mean server isn't ready - wait and retry
      if (attempt < maxRetries) {
        logService("secrets", `Retry ${attempt}/${maxRetries}: ${err.message}`, c.dim);
        await delay(retryDelayMs);
      }
    }
  }

  logService("secrets", `Warning: Failed to seed secret after ${maxRetries} attempts: ${lastError}`, c.yellow);
  return false;
}

function printBanner(config) {
  console.log("");
  console.log(
    `${c.green}${c.bold}╔══════════════════════════════════════════════════════════════╗${c.reset}`
  );
  console.log(
    `${c.green}${c.bold}║${c.reset}  ${c.bold}Agent Canvas + Automation Stack${c.reset}                            ${c.green}${c.bold}║${c.reset}`
  );
  console.log(
    `${c.green}${c.bold}╠══════════════════════════════════════════════════════════════╣${c.reset}`
  );
  console.log(
    `${c.green}${c.bold}║${c.reset}                                                              ${c.green}${c.bold}║${c.reset}`
  );
  console.log(
    `${c.green}${c.bold}║${c.reset}  Main UI:      ${c.cyan}http://localhost:${config.ingressPort}/${c.reset}`.padEnd(75) + `${c.green}${c.bold}║${c.reset}`
  );
  console.log(
    `${c.green}${c.bold}║${c.reset}  API Docs:     ${c.cyan}http://localhost:${config.ingressPort}/api/automation/docs${c.reset}`.padEnd(75) + `${c.green}${c.bold}║${c.reset}`
  );
  console.log(
    `${c.green}${c.bold}║${c.reset}                                                              ${c.green}${c.bold}║${c.reset}`
  );
  console.log(
    `${c.green}${c.bold}╚══════════════════════════════════════════════════════════════╝${c.reset}`
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
    staticMode: staticModeOverride,
    defaultStaticMode = false,
    buildStaticFrontend,
    staticDir: staticDirOverride,
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

  // Build config with dynamic port allocation
  const config = await buildConfig(args);
  if (viteWorkingDir) config.viteWorkingDir = viteWorkingDir;
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

  // 1. Start agent-server first (other services depend on it)
  const agentServerStarter = startAgentServerOverride ?? startAgentServer;
  agentServerStarter(config);

  // Wait for agent-server to be ready (60s timeout for slow systems)
  const agentServerReady = await waitForService(
    "agent-server",
    `http://localhost:${config.agentServerPort}/server_info`,
    60000  // 60 second timeout for initial startup
  );

  // 2. Seed automation API key into agent-server secrets
  // This makes the key available to agents during conversations
  // Note: seedAutomationSecret has its own retry logic if server is still warming up
  if (agentServerReady) {
    await seedAutomationSecret(config);
  } else {
    logService("secrets", "Skipping secret seeding - agent-server not ready", c.yellow);
  }

  // 3. Start automation backend
  startAutomationBackend(config);

  // 4. Start frontend server (Vite dev server OR static server)
  if (useStaticMode) {
    startStaticFrontend(config, staticDir);
  } else {
    startVite(config);
  }

  // 5. Wait for services to be ready
  await delay(2000);

  // 6. Start ingress proxy (routes traffic to all backends)
  startIngress(config);

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
      "--dir", staticDir,
      "--host", "0.0.0.0",
      "--port", String(config.vitePort),
      // Proxy routes to backends (same as ingress but for direct access to vitePort)
      "--route", `/api/automation=http://localhost:${config.autoBackendPort}`,
      "--route", `/api=http://localhost:${config.agentServerPort}`,
      "--route", `/sockets=http://localhost:${config.agentServerPort}`,
      "--route", `/server_info=http://localhost:${config.agentServerPort}`,
      "--route", `/health=http://localhost:${config.agentServerPort}`,
      "--route", `/ready=http://localhost:${config.agentServerPort}`,
      "--route", `/alive=http://localhost:${config.agentServerPort}`,
    ],
    {
      cwd: config.canvasPath,
      color: c.magenta,
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports for testing
// ═══════════════════════════════════════════════════════════════════════════

export {
  buildAutomationCommand,
  buildConfig,
  generateRandomApiKey,
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
  DEFAULT_BACKEND_PORT,
  DEFAULT_AUTOMATION_PORT,
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
