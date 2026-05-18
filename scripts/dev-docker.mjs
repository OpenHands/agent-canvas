/**
 * Dockerized Development Stack
 *
 * Same as `dev-with-automation.mjs`, but runs the agent-server inside a Docker
 * container instead of via `uvx`. The default frontend is a static production
 * build for stability over tunnels and slow networks; pass `--dynamic` for the
 * Vite dev server with live reload.
 *
 * The agent-server image listens on port 8000 inside the container; we map
 * it to the host's `agentServerPort` (default 18000) so the ingress proxy
 * and the secret-seeding step can reach it via http://localhost:18000.
 *
 * Required environment variables:
 *   - PROJECTS_PATH: Absolute host path to your projects. Mounted into the
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
 *   PROJECTS_PATH=/path/to/your/projects npm run dev:docker
 *   PROJECTS_PATH=/path/to/your/projects npm run dev:docker -- --dynamic
 *   OH_AGENT_SERVER_GIT_REF=main PROJECTS_PATH=... npm run dev:docker
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
  registerShutdownHook,
  spawnService,
} from "./dev-with-automation.mjs";
import { validateLocalAgentServerPath } from "./dev-safe.mjs";
import { buildFrontend } from "./static-build.mjs";

// Path inside the container where OH_AGENT_SERVER_LOCAL_PATH is bind-mounted.
const CONTAINER_LOCAL_SDK_DIR = "/agent-server-src";

// Host directory containing Agent-Canvas-specific Python tools (e.g. the
// canvas_ui tool). Mounted read-only into the container and added to
// sys.path via OH_EXTRA_PYTHON_PATH so the agent-server can import the
// modules listed in `tool_module_qualnames`.
const CONTAINER_CANVAS_TOOLS_DIR = "/canvas-tools";
const HOST_CANVAS_TOOLS_DIR = fileURLToPath(
  new URL("../tools", import.meta.url),
);

// Docker image for the agent-server.
const AGENT_SERVER_REPO = "ghcr.io/openhands/agent-server";
// Default tag used when OH_AGENT_SERVER_GIT_REF is not set.
// Should match DEFAULT_AGENT_SERVER_VERSION in dev-safe.mjs for consistency.
// Format: {version}-python (e.g., 1.22.1-python) for released versions.
// Note: The SDK build script strips the "v" prefix from semver release tags.
const DEFAULT_AGENT_SERVER_TAG = "1.22.1-python";
const CONTAINER_NAME = "agent-canvas-dev-agent-server";

// Keep the in-container home at the path advertised by the agent-server
// image. The default isolated-home launch overlays this path with tmpfs
// before mounting ~/.openhands below it, so OH_PERSISTENCE_DIR can stay at
// the conventional $HOME/.openhands instead of inventing a second home root.
const CONTAINER_HOME_DIR = "/home/openhands";
const CONTAINER_OPENHANDS_DIR = `${CONTAINER_HOME_DIR}/.openhands`;

// Default secret key matches dev-safe.mjs so persisted settings stay
// decryptable across docker / non-docker runs.
const DEFAULT_SECRET_KEY = "openhands-dev-secret-key-change-in-prod";

// Path inside the container where the agent-server stores per-conversation
// workspace directories. Mirrors dev-with-automation.mjs's host-side
// `${stateDir}/workspaces`, but rooted under the container's persistence
// dir (which is `~/.openhands` on the host, mounted in below). The frontend
// receives this via VITE_WORKING_DIR so the working_dir it sends to the
// agent-server is one the container can actually mkdir.
const CONTAINER_WORKSPACES_DIR = `${CONTAINER_OPENHANDS_DIR}/agent-canvas/workspaces`;

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

function isDockerPermissionDenied(stderr) {
  const normalized = stderr.toLowerCase();
  return (
    normalized.includes("permission denied") &&
    (normalized.includes("docker.sock") ||
      normalized.includes("docker api") ||
      normalized.includes("/var/run/docker") ||
      normalized.includes("/run/docker"))
  );
}

function logDockerInfoFailure(stderr) {
  if (isDockerPermissionDenied(stderr)) {
    logError(
      "docker is installed and the daemon may be running, but this user cannot access the Docker API.",
    );
    if (stderr) {
      logError(`  ${stderr.split("\n")[0]}`);
    }
    logError(
      "On Linux, add your user to the docker group, then log out and back in:",
    );
    logError("  sudo usermod -aG docker $USER");
    logError("Verify with: docker info");
    return;
  }

  logError("docker is installed but the daemon does not appear to be running.");
  if (stderr) {
    logError(`  ${stderr.split("\n")[0]}`);
  }
  logError("Start Docker (e.g. open Docker Desktop) and try again.");
}

function getHostDockerUserSpec() {
  if (
    typeof process.getuid !== "function" ||
    typeof process.getgid !== "function"
  ) {
    return null;
  }
  return `${process.getuid()}:${process.getgid()}`;
}

function getDockerUserArgs(userSpec = getHostDockerUserSpec()) {
  return userSpec ? ["--user", userSpec] : [];
}

/**
 * When `docker run --user <host uid>:<host gid>` is set, the process no
 * longer runs as the image's `openhands` user. The image home directory is
 * owned by that image user and has mode 0700, so the mapped host user cannot
 * enter `/home/openhands` unless we replace or mutate it.
 *
 * We deliberately use a tmpfs overlay instead of:
 * - chown/chmod: would require starting the container as root and adding a
 *   wrapper just to repair the image home before dropping privileges.
 * - a custom home path: would make OH_PERSISTENCE_DIR stop looking like the
 *   normal $HOME/.openhands location and make future path reasoning harder.
 *
 * Cache/config writes that libraries place under $HOME stay ephemeral in this
 * tmpfs. The only persisted default-home state is the explicit
 * ~/.openhands -> /home/openhands/.openhands bind mount below.
 *
 * We explicitly pass `exec` because docker's `--tmpfs` default option set is
 * `rw,noexec,nosuid,nodev`. `noexec` breaks any agent flow that needs to run a
 * binary out of `$HOME` -- most visibly stdio MCP servers installed via
 * `npx -y @modelcontextprotocol/server-*`, which cache their executables under
 * `~/.npm/_npx/...` and then exec them. With the default `noexec` flag, those
 * execs fail with "Permission denied" regardless of the file mode bits, and
 * the failure only surfaces when a conversation tries to spin the MCP server
 * up -- aborting agent initialization with a confusing traceback.
 *
 * `nosuid` and `nodev` are preserved (the home dir has no business hosting
 * setuid binaries or device nodes); only the `noexec` default is overridden.
 */
function getDockerHomeTmpfsArgs(userSpec = getHostDockerUserSpec()) {
  if (!userSpec) {
    return [];
  }

  const [uid, gid] = userSpec.split(":");
  if (!uid || !gid) {
    return [];
  }

  return [
    "--tmpfs",
    `${CONTAINER_HOME_DIR}:exec,nosuid,nodev,uid=${uid},gid=${gid},mode=700`,
  ];
}

/**
 * Check that the docker CLI is on PATH AND that the docker daemon is
 * actually responding. `commandExists("docker")` only verifies the binary is
 * installed, which is not enough -- on macOS / Windows the daemon may be
 * stopped, and on Linux the user may not have permissions to talk to it.
 */
function getProjectsPathDockerArgs(env = process.env) {
  return env.PROJECTS_PATH ? ["-v", `${env.PROJECTS_PATH}:/projects`] : [];
}

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
    const stderr = info.stderr ? info.stderr.toString().trim() : "";
    logDockerInfoFailure(stderr);
    suggestDockerless();
    process.exit(1);
  }
  logSuccess("docker daemon is running");

  if (!process.env.PROJECTS_PATH) {
    logError("PROJECTS_PATH is required for dev:docker.");
    logError("Set it to the directory containing your projects, e.g.:");
    logError("  export PROJECTS_PATH=/path/to/your/projects");
    process.exit(1);
  }
  logSuccess(`PROJECTS_PATH=${process.env.PROJECTS_PATH}`);
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
  registerShutdownHook(() => {
    spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "ignore" });
  });

  const home = homedir();
  const userSpec = getHostDockerUserSpec();
  const dockerArgs = ["run", "--rm", "--name", CONTAINER_NAME, "--init"];
  dockerArgs.push(...getDockerUserArgs(userSpec));
  dockerArgs.push(...getProjectsPathDockerArgs());
  // Read-only mount of the Agent-Canvas tools directory. Coupled with
  // OH_EXTRA_PYTHON_PATH below so the agent-server can import
  // canvas_ui_tool when the conversation request lists it under
  // tool_module_qualnames.
  dockerArgs.push(
    "-v",
    `${HOST_CANVAS_TOOLS_DIR}:${CONTAINER_CANVAS_TOOLS_DIR}:ro`,
  );

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
    dockerArgs.push("-v", `${home}:${CONTAINER_HOME_DIR}`);
  } else {
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
  }

  // Map agent-server's in-container port (8000) to the host port the
  // ingress proxy expects.
  dockerArgs.push("-p", `${config.agentServerPort}:8000`);

  // Environment variables for the agent-server inside the container.
  // These mirror buildAgentServerEnv() from dev-safe.mjs but use paths
  // that exist inside the container (under the mounted ~/.openhands).
  const containerEnv = {
    HOME: CONTAINER_HOME_DIR,
    OH_CONVERSATIONS_PATH: `${CONTAINER_OPENHANDS_DIR}/agent-canvas/conversations`,
    OH_PERSISTENCE_DIR: CONTAINER_OPENHANDS_DIR,
    OH_BASH_EVENTS_DIR: `${CONTAINER_OPENHANDS_DIR}/agent-canvas/bash_events`,
    OH_SECRET_KEY: process.env.OH_SECRET_KEY || DEFAULT_SECRET_KEY,
    // Required so the secret-seeding PUT /api/settings/secrets call from
    // the host can authenticate against the agent-server in the container.
    OH_SESSION_API_KEYS_0: config.sessionApiKey,
    // Alias for the agent-server's own URL. The agent-server itself sets
    // OH_INTERNAL_SERVER_URL=http://127.0.0.1:8000 at startup (host
    // 0.0.0.0 is rewritten to loopback) and the value is inherited by
    // every bash subprocess it spawns — including the automation run's
    // main.py / setup.sh. Those scripts read AGENT_SERVER_URL (the
    // canonical SDK name) instead of the OH_-prefixed variant, so we
    // mirror it here. 127.0.0.1:8000 is the agent-server's own URL from
    // *inside* its container (it always listens on port 8000 in
    // dev:docker).
    //
    // We deliberately do NOT set a SESSION_API_KEY alias: the SDK's
    // sanitized_env() would strip it from bash subprocesses anyway, and
    // a follow-up change to the automation preset reads
    // OH_SESSION_API_KEYS_0 directly (which is already in env).
    AGENT_SERVER_URL: "http://127.0.0.1:8000",
    // Make the mounted canvas-tools directory importable so the agent-server
    // can resolve modules listed in tool_module_qualnames (e.g. canvas_ui_tool).
    OH_EXTRA_PYTHON_PATH: CONTAINER_CANVAS_TOOLS_DIR,
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
    // The automation backend runs on the host but its dispatched
    // `mkdir -p ...` commands execute inside the agent-server container.
    // Force `AUTOMATION_WORKSPACE_BASE` to a path that exists in that
    // container so runs don't fail trying to create host paths like
    // /Users/<you>/... inside Linux. Users can still override by setting
    // AUTOMATION_WORKSPACE_BASE in their environment.
    automationWorkspaceBase: CONTAINER_WORKSPACES_DIR,
    // The automation backend tells each automation sandbox where to
    // reach it back via `AUTOMATION_API_URL` (used by setup.sh to fetch
    // /sdk-version and by the SDK to POST run completion). The sandbox
    // is a separate Docker container, so `localhost` inside it is the
    // sandbox itself — it cannot resolve `http://localhost:<ingress>`
    // to the host ingress. Use the cross-container hostname instead.
    // Users can still override by setting AUTOMATION_BASE_URL.
    automationApiHost: "host.docker.internal",
    defaultStaticMode: true,
    buildStaticFrontend: buildFrontend,
    // The agent-server runs inside a Docker container in this mode, so
    // host services (ingress, automation, vite) are reachable via
    // "host.docker.internal" rather than "localhost" from the agent's POV.
    agentHostAlias: "host.docker.internal",
    mode: "dev:docker",
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
  CONTAINER_CANVAS_TOOLS_DIR,
  CONTAINER_HOME_DIR,
  CONTAINER_LOCAL_SDK_DIR,
  CONTAINER_NAME,
  CONTAINER_OPENHANDS_DIR,
  CONTAINER_WORKSPACES_DIR,
  DEFAULT_AGENT_SERVER_TAG,
  HOST_CANVAS_TOOLS_DIR,
  checkDockerPrereqs,
  getDockerHomeTmpfsArgs,
  getDockerUserArgs,
  getHostDockerUserSpec,
  getProjectsPathDockerArgs,
  isDockerPermissionDenied,
  resolveAgentServerImage,
  startAgentServerDocker,
};
