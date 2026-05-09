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
 *     container at /workspace/projects so the agent can read/edit your code.
 *
 * Optional credential mounts (only mounted when the host path exists):
 *   - ~/.openhands -> /home/openhands/.openhands  (persistence)
 *   - ~/.claude    -> /home/openhands/.claude     (Claude credentials)
 *   - ~/.codex     -> /home/openhands/.codex      (Codex credentials)
 *   - ~/.ssh       -> /home/openhands/.ssh        (git/ssh access)
 *
 * Usage:
 *   PROJECT_PATH=/path/to/your/projects npm run dev:docker
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

// Docker image for the agent-server. Update this tag to upgrade.
const AGENT_SERVER_IMAGE = "ghcr.io/openhands/agent-server:d3f4851-python";
const CONTAINER_NAME = "agent-canvas-dev-agent-server";

// Default secret key matches dev-safe.mjs so persisted settings stay
// decryptable across docker / non-docker runs.
const DEFAULT_SECRET_KEY = "openhands-dev-secret-key-change-in-prod";

function checkDockerPrereqs(config) {
  if (!commandExists("docker")) {
    logError("docker is required for dev:docker but was not found on PATH.");
    logError("Install Docker: https://docs.docker.com/get-docker/");
    process.exit(1);
  }
  logSuccess("docker found");

  if (!process.env.PROJECT_PATH) {
    logError("PROJECT_PATH is required for dev:docker.");
    logError("Set it to the directory containing your projects, e.g.:");
    logError("  export PROJECT_PATH=/path/to/your/projects");
    process.exit(1);
  }
  logSuccess(`PROJECT_PATH=${process.env.PROJECT_PATH}`);
}

function startAgentServerDocker(config) {
  logService(
    "agent-server",
    `Starting in Docker on port ${config.agentServerPort} (image: ${AGENT_SERVER_IMAGE})...`,
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
    `${process.env.PROJECT_PATH}:/workspace/projects`,
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

  dockerArgs.push(AGENT_SERVER_IMAGE);

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

export { AGENT_SERVER_IMAGE, CONTAINER_NAME, checkDockerPrereqs, startAgentServerDocker };
