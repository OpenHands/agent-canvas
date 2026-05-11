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
 *   - OH_AGENT_SERVER_LOCAL_PATH: Absolute host path to a software-agent-sdk
 *     checkout. When set, mounts the checkout at /agent-server-src inside the
 *     container and reinstalls the four workspace packages
 *     (openhands-{sdk,tools,workspace,agent-server}) as editable installs on
 *     top of the image's pre-built venv before starting the server. Source
 *     edits on the host are reflected in the running container on module
 *     reload / process restart, matching the non-Docker dev loop.
 *
 * Optional credential mounts (only mounted when the host path exists):
 *   - ~/.openhands -> /home/openhands/.openhands  (persistence)
 *   - ~/.claude    -> /home/openhands/.claude     (Claude credentials)
 *   - ~/.codex     -> /home/openhands/.codex      (Codex credentials)
 *   - ~/.ssh       -> /home/openhands/.ssh        (git/ssh access)
 *
 * Optional host home mount (opt-in):
 *   Set `OH_MOUNT_HOST_HOME=1` to bind-mount your entire host home onto
 *   the container user's home at `/home/openhands`. This lets the
 *   "Add Workspace" file browser navigate your real host filesystem
 *   (and credentials/persistence dirs above are picked up automatically
 *   as subpaths). Off by default so the container stays isolated from
 *   the host home unless you opt in.
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
import { validateLocalAgentServerPath } from "./dev-safe.mjs";

// Path inside the container where OH_AGENT_SERVER_LOCAL_PATH is bind-mounted.
const CONTAINER_LOCAL_SDK_DIR = "/agent-server-src";

// Docker image for the agent-server.
const AGENT_SERVER_REPO = "ghcr.io/openhands/agent-server";
// Default tag used when OH_AGENT_SERVER_GIT_REF is not set. Update to upgrade.
const DEFAULT_AGENT_SERVER_TAG = "0924962-python";
const CONTAINER_NAME = "agent-canvas-dev-agent-server";

// Default secret key matches dev-safe.mjs so persisted settings stay
// decryptable across docker / non-docker runs.
const DEFAULT_SECRET_KEY = "openhands-dev-secret-key-change-in-prod";

// Path inside the container where the agent-server stores per-conversation
// workspace directories. Mirrors dev-with-automation.mjs's host-side
// `${stateDir}/workspaces`, but rooted under the container's persistence
// dir (which is `~/.openhands` on the host, mounted in below). The frontend
// receives this via VITE_WORKING_DIR so the working_dir it sends to the
// agent-server is one the container can actually mkdir.
const CONTAINER_WORKSPACES_DIR =
  "/home/openhands/.openhands/agent-canvas/workspaces";

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
  logError("Note: this runs the agent with full access to your filesystem.");
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
    logError(
      "docker is installed but the daemon does not appear to be running.",
    );
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
  const localSdkPath = process.env.OH_AGENT_SERVER_LOCAL_PATH;

  // Validate up-front so we fail fast before touching docker if the user
  // pointed at a missing / incomplete checkout.
  if (localSdkPath) {
    validateLocalAgentServerPath(localSdkPath);
  }

  logService(
    "agent-server",
    `Starting in Docker on port ${config.agentServerPort} (image: ${image})...`,
    c.blue,
  );
  if (localSdkPath) {
    logService(
      "agent-server",
      `Using local SDK source: ${localSdkPath} (mounted at ${CONTAINER_LOCAL_SDK_DIR})`,
      c.blue,
    );
  }

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

  // Bind-mount the local software-agent-sdk checkout if requested. Mounted
  // rw so editable installs can write their .dist-info into each package
  // (matches the side effect of the non-Docker uvx --with-editable path).
  if (localSdkPath) {
    dockerArgs.push("-v", `${localSdkPath}:${CONTAINER_LOCAL_SDK_DIR}`);
  }

  // Mount credentials / state individually by default so the container
  // stays isolated from the host home. Opt in to bind-mounting the
  // entire host home with OH_MOUNT_HOST_HOME=1 — useful when you want
  // the Add Workspace file browser to navigate your real host
  // filesystem (those credential subpaths come along automatically as
  // part of the same mount).
  if (process.env.OH_MOUNT_HOST_HOME === "1") {
    dockerArgs.push("-v", `${home}:/home/openhands`);
  } else {
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
    OH_BASH_EVENTS_DIR: "/home/openhands/.openhands/agent-canvas/bash_events",
    OH_SECRET_KEY: process.env.OH_SECRET_KEY || DEFAULT_SECRET_KEY,
    // Required so the secret-seeding PUT /api/settings/secrets call from
    // the host can authenticate against the agent-server in the container.
    OH_SESSION_API_KEYS_0: config.sessionApiKey,
  };
  for (const [k, v] of Object.entries(containerEnv)) {
    dockerArgs.push("-e", `${k}=${v}`);
  }

  // When using a local SDK checkout, override the image's entrypoint to
  // reinstall the four workspace packages as editable on top of the baked-in
  // venv, then exec the server. Reusing the image's venv avoids
  // redownloading transitive deps; editable installs make host-side edits
  // visible on the next module load (or container restart).
  if (localSdkPath) {
    dockerArgs.push("--entrypoint", "/bin/sh");
  }

  dockerArgs.push(image);

  if (localSdkPath) {
    const installCmd = [
      "uv pip install",
      "--python /agent-server/.venv/bin/python",
      "--reinstall",
      `-e ${CONTAINER_LOCAL_SDK_DIR}/openhands-sdk`,
      `-e ${CONTAINER_LOCAL_SDK_DIR}/openhands-tools`,
      `-e ${CONTAINER_LOCAL_SDK_DIR}/openhands-workspace`,
      `-e ${CONTAINER_LOCAL_SDK_DIR}/openhands-agent-server`,
    ].join(" ");
    const runCmd =
      "exec /agent-server/.venv/bin/python -m openhands.agent_server --host 0.0.0.0 --port 8000";
    dockerArgs.push("-c", `${installCmd} && ${runCmd}`);
  }

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
    viteWorkingDir: CONTAINER_WORKSPACES_DIR,
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
  CONTAINER_LOCAL_SDK_DIR,
  CONTAINER_NAME,
  CONTAINER_WORKSPACES_DIR,
  DEFAULT_AGENT_SERVER_TAG,
  checkDockerPrereqs,
  resolveAgentServerImage,
  startAgentServerDocker,
};
