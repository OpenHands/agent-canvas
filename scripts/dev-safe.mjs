import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import net from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_BACKEND_PORT = 18000;
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const DEFAULT_AGENT_SERVER_PACKAGE = "openhands-agent-server";
const AGENT_SERVER_GIT_REPO = "https://github.com/OpenHands/software-agent-sdk";
const LOCAL_AGENT_SERVER_SUBDIRS = [
  "openhands-agent-server",
  "openhands-sdk",
  "openhands-tools",
  "openhands-workspace",
];
// Default secret key for local development (DO NOT use in production)
const DEFAULT_SECRET_KEY = "openhands-dev-secret-key-change-in-prod";
// Default agent-server version (released PyPI version)
// Set OH_AGENT_SERVER_GIT_REF to use a git branch/SHA instead
const DEFAULT_AGENT_SERVER_VERSION = "1.21.1";

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
 * Environment variables (highest precedence first):
 * - OH_AGENT_SERVER_LOCAL_PATH: Absolute path to a software-agent-sdk checkout.
 *   Runs the local checkout via uvx with editable installs of the workspace
 *   packages (openhands-sdk, openhands-tools, openhands-workspace) so source
 *   edits are picked up without a manual reinstall. The agent-server itself
 *   is rebuilt from local source on each invocation (--reinstall).
 * - OH_AGENT_SERVER_GIT_REF: Git commit SHA or branch name
 * - OH_AGENT_SERVER_VERSION: Specific PyPI version (e.g., "1.21.1")
 *
 * If none are set, defaults to the released version specified by
 * DEFAULT_AGENT_SERVER_VERSION. Set OH_AGENT_SERVER_GIT_REF to use a
 * git branch or commit instead.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ command: string, args: string[], source: string }}
 */
export function buildAgentServerCommand(env = process.env) {
  const localPath = env.OH_AGENT_SERVER_LOCAL_PATH;
  const gitRef = env.OH_AGENT_SERVER_GIT_REF;
  const version = env.OH_AGENT_SERVER_VERSION;

  const uvxArgs = [];
  let source = "";

  if (localPath) {
    if (!path.isAbsolute(localPath)) {
      throw new Error(
        `OH_AGENT_SERVER_LOCAL_PATH must be an absolute path, got: ${localPath}`,
      );
    }
    uvxArgs.push(
      "--reinstall",
      "--from",
      path.join(localPath, "openhands-agent-server"),
      "--with-editable",
      path.join(localPath, "openhands-sdk"),
      "--with-editable",
      path.join(localPath, "openhands-tools"),
      "--with-editable",
      path.join(localPath, "openhands-workspace"),
      "agent-server",
    );
    source = `local (${localPath})`;
  } else if (gitRef) {
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
    source = `git (${gitRef})`;
  } else if (version) {
    // Use specific PyPI version: uvx --from openhands-agent-server==version agent-server
    // The package name differs from the executable name, so we need --from syntax
    // Pin all SDK packages to the same version for consistency
    uvxArgs.push(
      "--from",
      `${DEFAULT_AGENT_SERVER_PACKAGE}==${version}`,
      "--with",
      `openhands-tools==${version}`,
      "--with",
      `openhands-workspace==${version}`,
      "agent-server",
    );
    source = `PyPI (${version})`;
  } else {
    // Default to released PyPI version
    // Pin all SDK packages to the same version for consistency
    uvxArgs.push(
      "--from",
      `${DEFAULT_AGENT_SERVER_PACKAGE}==${DEFAULT_AGENT_SERVER_VERSION}`,
      "--with",
      `openhands-tools==${DEFAULT_AGENT_SERVER_VERSION}`,
      "--with",
      `openhands-workspace==${DEFAULT_AGENT_SERVER_VERSION}`,
      "agent-server",
    );
    source = `PyPI (${DEFAULT_AGENT_SERVER_VERSION}, default)`;
  }

  return {
    command: "uvx",
    args: uvxArgs,
    source,
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
    env.OH_CANVAS_SAFE_BACKEND_PORT,
    DEFAULT_BACKEND_PORT,
  );
  const vscodePort = parsePort(
    env.OH_CANVAS_SAFE_VSCODE_PORT,
    backendPort + 1,
  );
  const stateDir = path.resolve(
    cwd,
    env.OH_CANVAS_SAFE_STATE_DIR ||
      path.join(homedir(), ".openhands", "agent-canvas"),
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

/**
 * Build the environment variables object for spawning the agent-server process.
 *
 * This is exported so downstream consumers (e.g., automation service) can use
 * the same env vars without duplicating the mapping logic.
 *
 * @param {ReturnType<typeof buildSafeDevConfig>} config - Config from buildSafeDevConfig
 * @returns {Record<string, string>} Environment variables for agent-server
 */
export function buildAgentServerEnv(config) {
  return {
    TMUX_TMPDIR: config.tmuxTmpDir,
    OH_CONVERSATIONS_PATH: config.conversationsPath,
    OH_BASH_EVENTS_DIR: config.bashEventsDir,
    OH_VSCODE_PORT: String(config.vscodePort),
    OH_SECRET_KEY: config.secretKey,
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

export function validateLocalAgentServerPath(localPath) {
  if (!path.isAbsolute(localPath)) {
    throw new Error(
      `OH_AGENT_SERVER_LOCAL_PATH must be an absolute path, got: ${localPath}`,
    );
  }
  if (!existsSync(localPath)) {
    throw new Error(
      `OH_AGENT_SERVER_LOCAL_PATH does not exist: ${localPath}`,
    );
  }
  for (const subdir of LOCAL_AGENT_SERVER_SUBDIRS) {
    const subdirPath = path.join(localPath, subdir);
    if (!existsSync(subdirPath)) {
      throw new Error(
        `OH_AGENT_SERVER_LOCAL_PATH is missing expected workspace package '${subdir}': ${subdirPath}`,
      );
    }
  }
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

  if (process.env.OH_AGENT_SERVER_LOCAL_PATH) {
    validateLocalAgentServerPath(process.env.OH_AGENT_SERVER_LOCAL_PATH);
  }

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

  const secretKeySource = process.env.OH_SECRET_KEY
    ? "custom (from OH_SECRET_KEY)"
    : "default (for local development)";

  console.log("Starting isolated agent-server + frontend dev stack...");
  console.log(`- agent-server: ${agentServerCmd.source}`);
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
        ...buildAgentServerEnv(config),
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

// ─────────────────────────────────────────────────────────────────────────────
// Conversation lease cleanup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if `host:port` accepts a TCP connection within `timeoutMs`.
 * Used to detect a live agent-server we shouldn't disturb.
 */
export function isPortBusy(port, host = "127.0.0.1", timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (busy) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

/**
 * Remove stale `owner_lease.json` files under `conversationsDir` so a
 * freshly spawned agent-server can claim ownership and re-load every
 * existing conversation.
 *
 * Why this is needed: each conversation directory carries an
 * `owner_lease.json` that locks it to a single agent-server's
 * `owner_instance_id` for a 45 s TTL refreshed by heartbeat. On
 * graceful shutdown the agent-server unlinks its leases; on a hard
 * kill (or a fast restart, well under 45 s) the leases linger. A new
 * agent-server with a fresh `owner_instance_id` will then raise
 * `ConversationLeaseHeldError` for each conversation at startup load
 * and skip it entirely — `/api/conversations/search` returns `[]`
 * even though the meta files are right there on disk.
 *
 * The caller MUST verify (e.g. with `isPortBusy`) that no agent-server
 * is currently bound to the backend port before calling this — there
 * is no other reliable way to tell a stale lease from an actively
 * renewed one.
 *
 * Returns the number of lease files unlinked.
 */
export function releaseStaleConversationLeases(conversationsDir) {
  if (!existsSync(conversationsDir)) return 0;

  let removed = 0;
  for (const name of readdirSync(conversationsDir)) {
    const convDir = path.join(conversationsDir, name);
    let isDir = false;
    try {
      isDir = statSync(convDir).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    const leasePath = path.join(convDir, "owner_lease.json");
    if (!existsSync(leasePath)) continue;
    try {
      unlinkSync(leasePath);
      removed += 1;
    } catch {
      // Best-effort: the new agent-server will simply skip this
      // conversation as before. Don't fail the whole start.
    }
  }
  return removed;
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
