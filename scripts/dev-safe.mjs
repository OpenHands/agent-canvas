import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_BACKEND_PORT = 18000;
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const DEFAULT_AGENT_SERVER_PACKAGE = "openhands-agent-server";
const AGENT_SERVER_GIT_REPO = "https://github.com/OpenHands/software-agent-sdk";
// Default secret key for local development (DO NOT use in production)
const DEFAULT_SECRET_KEY = "openhands-dev-secret-key-change-in-prod";

function isEnoentError(error) {
  return Boolean(
    (error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT") ||
    /ENOENT/.test(String(error)),
  );
}

export function formatMissingUvxGuidance(cwd = process.cwd()) {
  const readmePath = path.join(cwd, "README.md");

  return [
    "Failed to start uvx. Make sure uv is installed and on your PATH.",
    "",
    "To fix this:",
    "1. Install uv:",
    "   curl -LsSf https://astral.sh/uv/install.sh | sh",
    "2. Make sure the uv bin dir is on your PATH:",
    '   export PATH="$HOME/.local/bin:$PATH"',
    "   command -v uvx",
    "",
    "Need Windows or another install method? https://docs.astral.sh/uv/getting-started/installation/",
    `See the local Quickstart for details: ${readmePath}`,
    "",
    "Other options:",
    "- npm run dev:frontend   # use an already running backend",
    "- npm run dev:mock       # run the frontend with mock APIs",
  ].join("\n");
}

/**
 * Build the uvx command and arguments for running agent-server.
 *
 * Environment variables:
 * - OH_AGENT_SERVER_VERSION: Specific PyPI version (e.g., "1.18.0")
 * - OH_AGENT_SERVER_GIT_REF: Git commit SHA or branch name (takes precedence over version)
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ command: string, args: string[] }}
 */
export function buildAgentServerCommand(env = process.env) {
  const gitRef = env.OH_AGENT_SERVER_GIT_REF;
  const version = env.OH_AGENT_SERVER_VERSION;

  const uvxArgs = [];

  if (gitRef) {
    // Use git ref with subdirectory syntax for uv workspace monorepo
    // The software-agent-sdk repo has packages in subdirectories:
    // openhands-agent-server/, openhands-tools/, openhands-workspace/
    const baseGitUrl = `git+${AGENT_SERVER_GIT_REPO}@${gitRef}`;
    uvxArgs.push(
      "--from",
      `${baseGitUrl}#subdirectory=openhands-agent-server`,
      "--with",
      `${baseGitUrl}#subdirectory=openhands-tools`,
      "--with",
      `${baseGitUrl}#subdirectory=openhands-workspace`,
      "agent-server",
    );
  } else if (version) {
    // Use specific PyPI version: uvx --with ... openhands-agent-server==version
    uvxArgs.push(
      "--with",
      "openhands-tools",
      "--with",
      "openhands-workspace",
      `${DEFAULT_AGENT_SERVER_PACKAGE}==${version}`,
    );
  } else {
    // Use latest released version: uvx --with ... openhands-agent-server
    uvxArgs.push(
      "--with",
      "openhands-tools",
      "--with",
      "openhands-workspace",
      DEFAULT_AGENT_SERVER_PACKAGE,
    );
  }

  return {
    command: "uvx",
    args: uvxArgs,
  };
}

function parsePort(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid port: ${value}`);
  }

  return parsed;
}

export function buildSafeDevConfig(cwd = process.cwd(), env = process.env) {
  const backendPort = parsePort(
    env.OH_GUI_SAFE_BACKEND_PORT,
    DEFAULT_BACKEND_PORT,
  );
  const vscodePort = parsePort(env.OH_GUI_SAFE_VSCODE_PORT, backendPort + 1);
  const stateDir = path.resolve(
    cwd,
    env.OH_GUI_SAFE_STATE_DIR ||
      path.join(homedir(), ".openhands", "agent-server-gui"),
  );
  const conversationsPath = path.join(stateDir, "conversations");
  const workspacesPath = path.join(stateDir, "workspaces");
  // Use provided secret key or default for local development
  const secretKey = env.OH_SECRET_KEY || DEFAULT_SECRET_KEY;

  return {
    cwd,
    backendPort,
    vscodePort,
    stateDir,
    tmuxTmpDir: path.join(stateDir, "tmux"),
    conversationsPath,
    workspacesPath,
    bashEventsDir: path.join(stateDir, "bash_events"),
    backendBaseUrl: `http://127.0.0.1:${backendPort}`,
    backendHost: `127.0.0.1:${backendPort}`,
    workingDir: env.VITE_WORKING_DIR || workspacesPath,
    secretKey,
  };
}

export function buildNpmScriptCommand(
  scriptName,
  platform = process.platform,
  env = process.env,
  nodeExecPath = process.execPath,
) {
  if (env.npm_execpath) {
    return {
      command: env.npm_node_execpath || nodeExecPath,
      args: [env.npm_execpath, "run", scriptName],
    };
  }

  if (platform === "win32") {
    return {
      command: env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npm", "run", scriptName],
    };
  }

  return {
    command: "npm",
    args: ["run", scriptName],
  };
}

async function waitForServer(url, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for agent-server at ${url}`);
}

function spawnProcess(command, args, options) {
  const child = spawn(command, args, { stdio: "inherit", ...options });

  child.once("error", (error) => {
    if (isEnoentError(error) && command === "uvx") {
      console.error(formatMissingUvxGuidance(options?.cwd));
    } else if (isEnoentError(error)) {
      console.error(
        `Failed to start ${command}. Make sure it is installed and on your PATH.`,
      );
    } else {
      console.error(`Failed to start ${command}:`, error);
    }
  });

  return child;
}

async function main() {
  const config = buildSafeDevConfig();

  for (const dir of [
    config.stateDir,
    config.tmuxTmpDir,
    config.conversationsPath,
    config.workspacesPath,
    config.bashEventsDir,
  ]) {
    mkdirSync(dir, { recursive: true });
  }

  const agentServerCmd = buildAgentServerCommand();
  const agentServerSource = process.env.OH_AGENT_SERVER_GIT_REF
    ? `git ref: ${process.env.OH_AGENT_SERVER_GIT_REF}`
    : process.env.OH_AGENT_SERVER_VERSION
      ? `version: ${process.env.OH_AGENT_SERVER_VERSION}`
      : "latest release";

  const secretKeySource = process.env.OH_SECRET_KEY
    ? "custom (from OH_SECRET_KEY)"
    : "default (for local development)";

  console.log("Starting isolated agent-server + frontend dev stack...");
  console.log(`- agent-server: ${agentServerSource}`);
  console.log(`- backend: ${config.backendBaseUrl}`);
  console.log(`- vscode port: ${config.vscodePort}`);
  console.log(`- working dir: ${config.workingDir}`);
  console.log(`- isolated state dir: ${config.stateDir}`);
  console.log(`- secret key: ${secretKeySource}`);
  console.log("");

  const backend = spawnProcess(
    agentServerCmd.command,
    [
      ...agentServerCmd.args,
      "--host",
      "127.0.0.1",
      "--port",
      String(config.backendPort),
    ],
    {
      cwd: config.cwd,
      env: {
        ...process.env,
        TMUX_TMPDIR: config.tmuxTmpDir,
        OH_CONVERSATIONS_PATH: config.conversationsPath,
        OH_BASH_EVENTS_DIR: config.bashEventsDir,
        OH_VSCODE_PORT: String(config.vscodePort),
        OH_SECRET_KEY: config.secretKey,
      },
    },
  );

  let shuttingDown = false;
  let frontend = null;

  const shutdown = (signal = "SIGTERM") => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    frontend?.kill(signal);
    backend.kill(signal);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const backendErrored = new Promise((_, reject) => {
    backend.once("error", (error) => reject(error));
  });
  const backendExited = new Promise((_, reject) => {
    backend.once("exit", (code, signal) => {
      if (!shuttingDown) {
        reject(
          new Error(
            `agent-server exited before startup completed (code=${code ?? "null"}, signal=${signal ?? "null"})`,
          ),
        );
      }
    });
  });

  try {
    await Promise.race([
      waitForServer(`${config.backendBaseUrl}/server_info`),
      backendErrored,
      backendExited,
    ]);
  } catch (error) {
    shutdown();
    throw error;
  }

  const frontendCommand = buildNpmScriptCommand("dev:frontend");
  frontend = spawnProcess(frontendCommand.command, frontendCommand.args, {
    cwd: config.cwd,
    env: {
      ...process.env,
      VITE_BACKEND_HOST: config.backendHost,
      VITE_BACKEND_BASE_URL: config.backendBaseUrl,
      VITE_WORKING_DIR: config.workingDir,
    },
  });

  frontend.once("exit", (code) => {
    shutdown();
    process.exitCode = code ?? 0;
  });

  backend.once("exit", (code) => {
    if (!shuttingDown) {
      console.error(`agent-server exited unexpectedly with code ${code ?? 0}`);
      shutdown();
      process.exitCode = code ?? 1;
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
