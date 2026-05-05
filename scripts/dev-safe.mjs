import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_BACKEND_PORT = 18000;
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const DEV_TOKEN_FILENAME = ".dev-vscode-token";
const DEV_TOKEN_BYTES = 32;
const COMPOSE_FILE = "docker-compose.dev.yml";

function isEnoentError(error) {
  return Boolean(
    (error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT") ||
    /ENOENT/.test(String(error)),
  );
}

export function formatMissingAgentServerGuidance(cwd = process.cwd()) {
  const readmePath = path.join(cwd, "README.md");

  return [
    "Failed to start agent-server. Make sure it is installed and on your PATH.",
    "",
    "To fix this:",
    "1. Install the backend CLI:",
    "   uv tool install -U --with openhands-tools --with openhands-workspace openhands-agent-server",
    "2. Make sure the uv tool bin dir is on your PATH:",
    '   export PATH="$HOME/.local/bin:$PATH"',
    "   command -v agent-server",
    "",
    "Need Windows or another install method? https://docs.astral.sh/uv/getting-started/installation/",
    `See the local Quickstart for details: ${readmePath}`,
    "- README > Quickstart > 2. Install OpenHands Agent Server",
    "",
    "Other options:",
    "- npm run dev:frontend   # use an already running backend",
    "- npm run dev:mock       # run the frontend with mock APIs",
  ].join("\n");
}

export function formatMissingDockerGuidance() {
  return [
    "Docker Desktop is required for `npm run dev` (it provides the VSCode Server container).",
    "",
    "To fix this:",
    "- Start Docker Desktop and re-run `npm run dev`.",
    "- Or set OH_GUI_DISABLE_VSCODE_DOCKER=1 to skip Docker (the Code tab will be unavailable).",
    "- Or run `npm run dev:frontend` against a separately managed backend.",
  ].join("\n");
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

function parseBoolean(value) {
  if (value == null || value === "") return false;
  return /^(1|true|yes|on)$/i.test(String(value));
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
  const hostUid =
    typeof process.getuid === "function" ? process.getuid() : null;
  const hostGid =
    typeof process.getgid === "function" ? process.getgid() : null;

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
    tokenFile: path.join(stateDir, DEV_TOKEN_FILENAME),
    composeFile: path.join(cwd, COMPOSE_FILE),
    hostUid,
    hostGid,
    disableVscodeDocker: parseBoolean(env.OH_GUI_DISABLE_VSCODE_DOCKER),
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

async function waitForServer(url, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS, headers) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { headers });
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
    if (isEnoentError(error) && command === "agent-server") {
      console.error(formatMissingAgentServerGuidance(options?.cwd));
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

function readOrCreateDevToken(tokenFile) {
  try {
    const raw = readFileSync(tokenFile, "utf8").trim();
    if (/^[0-9a-f]{64,}$/i.test(raw)) {
      return raw;
    }
  } catch (error) {
    if (!isEnoentError(error)) {
      throw error;
    }
  }

  const token = randomBytes(DEV_TOKEN_BYTES).toString("hex");
  writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  return token;
}

function checkDockerAvailable() {
  const result = spawnSync("docker", ["info"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      message:
        result.error?.message ||
        (result.stderr ? result.stderr.toString().trim() : "docker info failed"),
    };
  }
  return { ok: true };
}

function runComposeCommand(args, config, env, options = {}) {
  const composeArgs = ["compose", "-f", config.composeFile, ...args];
  return spawnSync("docker", composeArgs, {
    cwd: config.cwd,
    env,
    stdio: options.silent ? "pipe" : "inherit",
  });
}

function buildComposeEnv(config, token) {
  return {
    ...process.env,
    OH_GUI_SAFE_BACKEND_PORT: String(config.backendPort),
    OH_GUI_SAFE_VSCODE_PORT: String(config.vscodePort),
    OH_GUI_HOST_UID: config.hostUid != null ? String(config.hostUid) : "0",
    OH_GUI_HOST_GID: config.hostGid != null ? String(config.hostGid) : "0",
    OH_GUI_WORKSPACES_DIR: config.workspacesPath,
    OH_VSCODE_DEV_TOKEN: token,
  };
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

  if (
    process.platform === "darwin" &&
    !config.disableVscodeDocker &&
    !config.stateDir.startsWith(homedir() + path.sep) &&
    config.stateDir !== homedir()
  ) {
    console.warn(
      `[dev-safe] OH_GUI_SAFE_STATE_DIR (${config.stateDir}) is outside ${homedir()}.`,
    );
    console.warn(
      "[dev-safe] Docker Desktop for Mac may not see this path; the Code tab can fail.",
    );
    console.warn(
      "[dev-safe] Add the path to Docker Desktop > Settings > Resources > File Sharing, or move it under your home directory.",
    );
  }

  let token = null;
  let composeStarted = false;

  if (!config.disableVscodeDocker) {
    const dockerCheck = checkDockerAvailable();
    if (!dockerCheck.ok) {
      console.error(formatMissingDockerGuidance());
      if (dockerCheck.message) {
        console.error(`(docker info: ${dockerCheck.message})`);
      }
      process.exit(1);
    }

    token = readOrCreateDevToken(config.tokenFile);
    try {
      const stat = statSync(config.tokenFile);
      if ((stat.mode & 0o077) !== 0) {
        // Tighten perms if a previous version wrote them more permissively.
        writeFileSync(config.tokenFile, `${token}\n`, { mode: 0o600 });
      }
    } catch {
      // Already created above; ignore.
    }

    const composeEnv = buildComposeEnv(config, token);
    const upResult = runComposeCommand(
      ["up", "-d", "--wait"],
      config,
      composeEnv,
    );
    if (upResult.error || upResult.status !== 0) {
      console.error(
        "[dev-safe] Failed to start the VSCode Server container via docker compose.",
      );
      if (upResult.error) {
        console.error(upResult.error.message);
      }
      process.exit(upResult.status ?? 1);
    }
    composeStarted = true;
  }

  console.log("Starting isolated agent-server + frontend dev stack...");
  console.log(`- backend: ${config.backendBaseUrl}`);
  console.log(`- vscode port: ${config.vscodePort}`);
  console.log(`- working dir: ${config.workingDir}`);
  console.log(`- isolated state dir: ${config.stateDir}`);
  if (composeStarted) {
    console.log(`- vscode container: agent-server-gui-vscode-${config.backendPort}`);
  } else {
    console.log("- vscode container: disabled (OH_GUI_DISABLE_VSCODE_DOCKER set)");
  }
  console.log("");

  const backendEnv = {
    ...process.env,
    TMUX_TMPDIR: config.tmuxTmpDir,
    OH_CONVERSATIONS_PATH: config.conversationsPath,
    OH_BASH_EVENTS_DIR: config.bashEventsDir,
    OH_VSCODE_PORT: String(config.vscodePort),
  };
  if (token) {
    backendEnv.OH_SESSION_API_KEYS_0 = token;
  }

  const backend = spawnProcess(
    "agent-server",
    ["--host", "127.0.0.1", "--port", String(config.backendPort)],
    {
      cwd: config.cwd,
      env: backendEnv,
    },
  );

  let shuttingDown = false;
  let frontend = null;

  const composeDown = () => {
    if (!composeStarted) return;
    try {
      const result = runComposeCommand(
        ["down"],
        config,
        buildComposeEnv(config, token ?? ""),
        { silent: true },
      );
      if (result.error) {
        console.warn(
          `[dev-safe] docker compose down failed: ${result.error.message}`,
        );
      }
    } catch (error) {
      console.warn(
        `[dev-safe] docker compose down failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  };

  const shutdown = (signal = "SIGTERM") => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    frontend?.kill(signal);
    backend.kill(signal);
    composeDown();
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
    const waitHeaders = token ? { "X-Session-API-Key": token } : undefined;
    await Promise.race([
      waitForServer(`${config.backendBaseUrl}/server_info`, undefined, waitHeaders),
      backendErrored,
      backendExited,
    ]);
  } catch (error) {
    shutdown();
    throw error;
  }

  const frontendCommand = buildNpmScriptCommand("dev:frontend");
  const frontendEnv = {
    ...process.env,
    VITE_BACKEND_HOST: config.backendHost,
    VITE_BACKEND_BASE_URL: config.backendBaseUrl,
    VITE_WORKING_DIR: config.workingDir,
  };
  if (token) {
    frontendEnv.VITE_SESSION_API_KEY = token;
    frontendEnv.VITE_VSCODE_BASE_URL = `http://localhost:${config.vscodePort}`;
  }

  frontend = spawnProcess(frontendCommand.command, frontendCommand.args, {
    cwd: config.cwd,
    env: frontendEnv,
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
