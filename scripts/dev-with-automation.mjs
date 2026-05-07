#!/usr/bin/env node
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
 */

import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";

import {
  buildAgentServerCommand,
  buildSafeDevConfig,
  buildAgentServerEnv,
  buildNpmScriptCommand,
  formatMissingUvxGuidance,
} from "./dev-safe.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const DEFAULT_AUTOMATION_REPO = "https://github.com/OpenHands/automation";
const DEFAULT_AUTOMATION_GIT_REF = "main";
const DEFAULT_BACKEND_PORT = 18000;
const DEFAULT_AUTOMATION_PORT = 18001;
// Default local API key for automation backend auth (matches agent-server pattern)
const DEFAULT_LOCAL_API_KEY = "openhands-local-api-key";

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
  --automation-ref <ref>      Git ref for automation (branch/tag/SHA, default: main)
  --automation-repo <url>     Git repo URL (default: ${DEFAULT_AUTOMATION_REPO})
  -v, --verbose               Show detailed output
  -h, --help                  Show this help

ENVIRONMENT VARIABLES:
  PORT                        Alternative to --port
  OH_AUTOMATION_GIT_REF       Alternative to --automation-ref
  OH_AGENT_SERVER_GIT_REF     Git ref for agent-server SDK
  OH_SECRET_KEY               Secret key for sessions

ACCESS POINTS:
  Main UI:      http://localhost:PORT/
  API Docs:     http://localhost:PORT/api/automation/docs
`);
}

/**
 * Build the uvx command for running automation backend.
 */
function buildAutomationCommand(env = process.env) {
  const gitRef = env.OH_AUTOMATION_GIT_REF || DEFAULT_AUTOMATION_GIT_REF;
  const repoUrl = env.OH_AUTOMATION_REPO || DEFAULT_AUTOMATION_REPO;

  // Build git URL with ref
  const gitUrl = `git+${repoUrl}@${gitRef}`;

  // Use --refresh to ensure latest commit is fetched for git refs
  const args = ["--refresh", "--from", gitUrl, "uvicorn", "automation.app:app"];

  return {
    command: "uvx",
    args,
    source: `git (${gitRef})`,
  };
}

function buildConfig(args, env = process.env) {
  // Apply args to env for buildAutomationCommand
  if (args.automationGitRef) {
    env.OH_AUTOMATION_GIT_REF = args.automationGitRef;
  }
  if (args.automationRepo) {
    env.OH_AUTOMATION_REPO = args.automationRepo;
  }

  const ingressPort = args.port || parseInt(env.PORT, 10) || 8000;
  const backendPort = DEFAULT_BACKEND_PORT;
  const automationPort = DEFAULT_AUTOMATION_PORT;
  const vitePort = 3001;
  const vscodePort = backendPort + 1000;

  // Local API key for automation backend auth
  const localApiKey = env.AUTOMATION_LOCAL_API_KEY || DEFAULT_LOCAL_API_KEY;

  return {
    // Ingress port (main entry point)
    ingressPort,

    // Service ports (internal)
    agentServerPort: backendPort,
    autoBackendPort: automationPort,
    vitePort,
    vscodePort,

    // Paths
    canvasPath: projectRoot,

    // Data directories (same as dev-safe.mjs)
    stateDir: join(homedir(), ".openhands", "agent-canvas"),

    // Auth
    localApiKey,

    verbose: args.verbose,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Prerequisites & Setup
// ═══════════════════════════════════════════════════════════════════════════

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function checkPrerequisites() {
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
}

function ensureDirectories(config) {
  const dirs = [
    config.stateDir,
    join(config.stateDir, "tmux"),
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

function spawnService(name, command, args, options = {}) {
  const proc = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...options.env },
    cwd: options.cwd,
    shell: process.platform === "win32",
  });

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

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        logService(name, `Ready at ${url}`, c.green);
        return true;
      }
    } catch {
      // Keep trying
    }
    await delay(500);
  }

  logService(name, `Timeout waiting for ${url}`, c.red);
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
    proc.kill("SIGTERM");
  }

  setTimeout(() => {
    for (const [, proc] of processes) {
      if (!proc.killed) {
        proc.kill("SIGKILL");
      }
    }
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
      VITE_WORKING_DIR: join(config.stateDir, "workspaces"),
      VITE_FRONTEND_PORT: config.vitePort.toString(),
      // Automation API key for frontend to authenticate with automation backend
      VITE_AUTOMATION_API_KEY: config.localApiKey,
    },
    color: c.magenta,
  });
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

async function main() {
  const args = parseArgs();
  const config = buildConfig(args);

  console.log("");
  console.log(`${c.cyan}${c.bold}Agent Canvas + Automation Development Stack${c.reset}`);
  console.log("");

  // Setup phase
  checkPrerequisites();
  ensureDirectories(config);

  // Start services phase
  logStep("2/2", "Starting services...");

  // 1. Start agent-server first (other services depend on it)
  startAgentServer(config);
  await waitForService(
    "agent-server",
    `http://localhost:${config.agentServerPort}/server_info`
  );

  // 2. Start automation backend
  startAutomationBackend(config);

  // 3. Start Vite dev server (no proxy config needed - ingress handles routing)
  startVite(config);

  // 4. Wait for services to be ready
  await delay(2000);

  // 5. Start ingress proxy (routes traffic to all backends)
  startIngress(config);

  // Wait for ingress to start
  await delay(1000);

  printBanner(config);
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports for testing
// ═══════════════════════════════════════════════════════════════════════════

export {
  buildAutomationCommand,
  buildConfig,
  DEFAULT_AUTOMATION_REPO,
  DEFAULT_AUTOMATION_GIT_REF,
  DEFAULT_BACKEND_PORT,
  DEFAULT_AUTOMATION_PORT,
};

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point (only when run directly, not when imported)
// ═══════════════════════════════════════════════════════════════════════════

// Check if this module is the main entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  main().catch((err) => {
    logError(`Fatal error: ${err.message}`);
    if (err.stack) {
      console.error(c.dim + err.stack + c.reset);
    }
    process.exit(1);
  });
}
