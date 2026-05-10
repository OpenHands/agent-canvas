/**
 * Dockerized Development Stack
 *
 * Same as `dev-with-automation.mjs` (Vite + ingress + automation backend),
 * but runs the agent-server inside a Docker container instead of via `uvx`.
 *
 * The agent-server image listens on port 8000 inside the container; we map
 * it to the host's `agentServerPort` (default 18000) so the ingress proxy
 * and the secret-seeding step can reach it via http://localhost:18000.
 *
 * Required environment variables:
 *   - PROJECT_PATH: Absolute host path to your projects. Mounted into the
 *     container at /projects so the agent can read/edit your code. The
 *     frontend always treats /projects as a "workspace parent", so the
 *     dropdown lists its immediate subdirectories as workspaces.
 *
 * Optional environment variables:
 *   - OH_AGENT_SERVER_GIT_REF: Git ref (branch/tag/SHA) of the agent-server
 *     to use. Translates to the docker tag `${ref}-python`, e.g.
 *     `main` -> `ghcr.io/openhands/agent-server:main-python`.
 *
 * Optional credential mounts (only mounted when the host path exists):
 *   - ~/.openhands -> /home/openhands/.openhands  (persistence)
 *   - ~/.claude    -> /home/openhands/.claude     (Claude credentials)
 *   - ~/.codex     -> /home/openhands/.codex      (Codex credentials)
 *   - ~/.ssh       -> /home/openhands/.ssh        (git/ssh access)
 *
 * Usage:
 *   PROJECT_PATH=/path/to/your/projects npm run dev:docker
 *   OH_AGENT_SERVER_GIT_REF=main PROJECT_PATH=... npm run dev:docker
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

import {
  c,
  commandExists,
  logError,
  logService,
  logSuccess,
  main,
  spawnService,
} from "./dev-with-automation.mjs";

// Docker image for the agent-server.
const AGENT_SERVER_REPO = "ghcr.io/openhands/agent-server";
// Default tag used when OH_AGENT_SERVER_GIT_REF is not set. Update to upgrade.
const DEFAULT_AGENT_SERVER_TAG = "d3f4851-python";
const CONTAINER_NAME = "agent-canvas-dev-agent-server";

// Default secret key matches dev-safe.mjs so persisted settings stay
// decryptable across docker / non-docker runs.
const DEFAULT_SECRET_KEY = "openhands-dev-secret-key-change-in-prod";

/**
 * Resolve the docker image to use based on environment.
 *
 * If OH_AGENT_SERVER_GIT_REF is set, use `${ref}-python` as the tag, mirroring
 * the publishing convention (e.g. `main` -> `main-python`, `abc1234` ->
 * `abc1234-python`). Otherwise fall back to the pinned default tag.
 */
function resolveAgentServerImage(env = process.env) {
  const gitRef = env.OH_AGENT_SERVER_GIT_REF;
  const tag = gitRef ? `${gitRef}-python` : DEFAULT_AGENT_SERVER_TAG;
  return `${AGENT_SERVER_REPO}:${tag}`;
}

function suggestDockerless() {
  logError("");
  logError(
    "If you'd rather not use Docker, you can run the agent-server directly with:",
  );
  logError("  npm run dev:dangerously-dockerless");
  logError(
    "Note: this runs the agent with full access to your filesystem.",
  );
}

/**
 * Check that the docker CLI is on PATH AND that the docker daemon is
 * actually responding. `commandExists("docker")` only verifies the binary is
 * installed, which is not enough -- on macOS / Windows the daemon may be
 * stopped, and on Linux the user may not have permissions to talk to it.
 */
function checkDockerPrereqs(config) {
  if (!commandExists("docker")) {
    logError("docker is required for dev:docker but was not found on PATH.");
    logError("Install Docker: https://docs.docker.com/get-docker/");
    suggestDockerless();
    process.exit(1);
  }
  logSuccess("docker found");

  // `docker info` exits non-zero (and writes to stderr) if the daemon
  // isn't reachable. Use a short timeout to avoid hanging.
  const info = spawnSync("docker", ["info"], {
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 10_000,
  });
  if (info.status !== 0) {
    logError("docker is installed but the daemon does not appear to be running.");
    const stderr = info.stderr ? info.stderr.toString().trim() : "";
    if (stderr) {
      logError(`  ${stderr.split("\n")[0]}`);
    }
    logError("Start Docker (e.g. open Docker Desktop) and try again.");
    suggestDockerless();
    process.exit(1);
  }
  logSuccess("docker daemon is running");

  if (!process.env.PROJECT_PATH) {
    logError("PROJECT_PATH is required for dev:docker.");
    logError("Set it to the directory containing your projects, e.g.:");
    logError("  export PROJECT_PATH=/path/to/your/projects");
    process.exit(1);
  }
  logSuccess(`PROJECT_PATH=${process.env.PROJECT_PATH}`);
}

function startAgentServerDocker(config) {
  const image = resolveAgentServerImage();
  logService(
    "agent-server",
    `Starting in Docker on port ${config.agentServerPort} (image: ${image})...`,
    c.blue,
  );

  // Best-effort cleanup of any leftover container from a previous run.
  spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "ignore" });

  const home = homedir();
  const dockerArgs = [
    "run",
    "--rm",
    "--name",
    CONTAINER_NAME,
    "--init",
    "-v",
    `${process.env.PROJECT_PATH}:/projects`,
  ];

  // Optional credential / state mounts. Only mount when the host path
  // exists so docker doesn't auto-create empty directories on the host.
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

  // Map agent-server's in-container port (8000) to the host port the
  // ingress proxy expects.
  dockerArgs.push("-p", `${config.agentServerPort}:8000`);

  // Environment variables for the agent-server inside the container.
  // These mirror buildAgentServerEnv() from dev-safe.mjs but use paths
  // that exist inside the container (under the mounted ~/.openhands).
  const containerEnv = {
    OH_CONVERSATIONS_PATH:
      "/home/openhands/.openhands/agent-canvas/conversations",
    OH_PERSISTENCE_DIR: "/home/openhands/.openhands",
    OH_BASH_EVENTS_DIR:
      "/home/openhands/.openhands/agent-canvas/bash_events",
    TMUX_TMPDIR: "/home/openhands/.openhands/agent-canvas/tmux",
    OH_SECRET_KEY: process.env.OH_SECRET_KEY || DEFAULT_SECRET_KEY,
    // Required so the secret-seeding PUT /api/settings/secrets call from
    // the host can authenticate against the agent-server in the container.
    OH_SESSION_API_KEYS_0: config.sessionApiKey,
  };
  for (const [k, v] of Object.entries(containerEnv)) {
    dockerArgs.push("-e", `${k}=${v}`);
  }

  dockerArgs.push(image);

  spawnService("agent-server", "docker", dockerArgs, {
    color: c.blue,
  });
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main({
    bannerTitle: "Agent Canvas + Automation Development Stack (Docker)",
    extraPrereqs: checkDockerPrereqs,
    startAgentServer: startAgentServerDocker,
  }).catch((err) => {
    logError(`Fatal error: ${err.message}`);
    if (err.stack) {
      console.error(c.dim + err.stack + c.reset);
    }
    process.exit(1);
  });
}

export {
  AGENT_SERVER_REPO,
  CONTAINER_NAME,
  DEFAULT_AGENT_SERVER_TAG,
  checkDockerPrereqs,
  resolveAgentServerImage,
  startAgentServerDocker,
};
