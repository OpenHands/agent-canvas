#!/usr/bin/env node
/**
 * CLI entry point for @openhands/agent-canvas
 *
 * Runs the full Agent Canvas stack using Docker for the agent-server:
 * - Agent-server runs in Docker container
 * - Automation backend via uvx
 * - Pre-built static frontend (not Vite dev server)
 *
 * This is the production equivalent of `npm run dev` - it runs the full stack
 * but serves pre-built static assets instead of the Vite dev server.
 */

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Build output is in build/ (not build/client/) - see react-router.config.ts unpackClientDirectory
const BUILD_DIR = join(__dirname, "..", "build");

// Check for help flag first
const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log(`
@openhands/agent-canvas - Run the Agent Canvas UI with agent-server (Docker)

Runs the full stack with agent-server in Docker, automation backend via uvx,
and serves pre-built static frontend assets.

USAGE:
  npx @openhands/agent-canvas [options]

REQUIRED:
  PROJECT_PATH          Path to your projects directory (mounted into container)

OPTIONS:
  -p, --port <port>     Ingress port (default: 8000)
  -h, --help            Show this help message

ENVIRONMENT VARIABLES:
  PROJECT_PATH                 Required: path to your projects directory
  OH_SECRET_KEY                Secret key for encrypting settings
  OH_AGENT_SERVER_GIT_REF      Git ref for agent-server Docker image tag
  OH_AGENT_SERVER_LOCAL_PATH   Path to local SDK checkout (for development)
  OH_MOUNT_HOST_HOME           Set to "1" to mount entire home directory

Note: LLM settings are configured through the web UI settings page,
not environment variables.

EXAMPLES:
  # Start full stack (requires PROJECT_PATH)
  PROJECT_PATH=/path/to/projects npx @openhands/agent-canvas

  # Use a specific port
  PROJECT_PATH=/path/to/projects npx @openhands/agent-canvas --port 3000

  # Use local SDK checkout for development
  PROJECT_PATH=/path/to/projects OH_AGENT_SERVER_LOCAL_PATH=/path/to/sdk npx @openhands/agent-canvas

For more options, see: node scripts/dev-docker.mjs --help
`);
  process.exit(0);
}

// Check build exists before doing anything else
if (!existsSync(BUILD_DIR)) {
  console.error(`
Error: No build found at ${BUILD_DIR}

This package needs to be built first. If you installed from npm,
this is a packaging error. If running from source:

  npm install
  npm run build
`);
  process.exit(1);
}

// Import dev-docker's dependencies and run with static mode
let main, checkDockerPrereqs, startAgentServerDocker, CONTAINER_WORKSPACES_DIR;
try {
  ({ main } = await import("../scripts/dev-with-automation.mjs"));
  ({
    checkDockerPrereqs,
    startAgentServerDocker,
    CONTAINER_WORKSPACES_DIR,
  } = await import("../scripts/dev-docker.mjs"));
} catch (err) {
  console.error("Failed to load required scripts. Try reinstalling:");
  console.error("  npm install -g @openhands/agent-canvas@latest");
  console.error(`\nError: ${err.message}`);
  process.exit(1);
}

main({
  bannerTitle: "Agent Canvas",
  extraPrereqs: checkDockerPrereqs,
  startAgentServer: startAgentServerDocker,
  viteWorkingDir: CONTAINER_WORKSPACES_DIR,
  staticMode: true,
  staticDir: BUILD_DIR,
}).catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
