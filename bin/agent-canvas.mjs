#!/usr/bin/env node
/**
 * CLI entry point for @openhands/agent-canvas
 *
 * Runs the full Agent Canvas stack locally:
 * - Agent-server via uvx
 * - Automation backend via uvx
 * - Pre-built static frontend
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
@openhands/agent-canvas - Run the Agent Canvas UI with agent-server

Runs the full stack with agent-server and automation backend via uvx,
and serves pre-built static frontend assets.

USAGE:
  npx @openhands/agent-canvas [options]

OPTIONS:
  -p, --port <port>     Ingress port (default: 8000)
  -h, --help            Show this help message

ENVIRONMENT VARIABLES:
  OH_SECRET_KEY                Secret key for encrypting settings
  OH_AGENT_SERVER_GIT_REF      Git ref for agent-server
  OH_AGENT_SERVER_LOCAL_PATH   Path to local SDK checkout (for development)
  OH_AGENT_SERVER_VERSION      Specific PyPI version for agent-server

Note: LLM settings are configured through the web UI settings page,
not environment variables.

EXAMPLES:
  # Start full stack
  npx @openhands/agent-canvas

  # Use a specific port
  npx @openhands/agent-canvas --port 3000

  # Use local SDK checkout for development
  OH_AGENT_SERVER_LOCAL_PATH=/path/to/sdk npx @openhands/agent-canvas
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

let main;
try {
  ({ main } = await import("../scripts/dev-with-automation.mjs"));
} catch (err) {
  console.error("Failed to load required scripts. Try reinstalling:");
  console.error("  npm install -g @openhands/agent-canvas@latest");
  console.error(`\nError: ${err.message}`);
  process.exit(1);
}

main({
  bannerTitle: "Agent Canvas",
  staticMode: true,
  staticDir: BUILD_DIR,
  mode: "agent-canvas",
}).catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
