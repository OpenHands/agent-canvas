#!/usr/bin/env node
/**
 * CLI entry point for @openhands/agent-canvas
 *
 * Thin wrapper that delegates to sirv-cli to serve the built React application.
 */

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = join(__dirname, "..", "build", "client");

// Handle --help before anything else
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
@openhands/agent-canvas - Serve the Agent Canvas UI

Usage:
  npx @openhands/agent-canvas [sirv options]

Common Options:
  --port, -p <port>   Port to serve on (default: 8080)
  --host <host>       Host to bind to (default: localhost)
  --help, -h          Show this help message

All sirv-cli options are supported. See: https://github.com/lukeed/sirv

Environment Variables:
  VITE_BACKEND_BASE_URL    Agent server URL (default: http://127.0.0.1:8000)
  VITE_SESSION_API_KEY     Session API key for agent server auth
`);
  process.exit(0);
}

// Check if build exists
if (!existsSync(BUILD_DIR)) {
  console.error(`
Error: No build found at ${BUILD_DIR}

To use this package, you need to build it first:

  cd ${join(__dirname, "..")}
  npm install
  npm run build

Or install and run in development mode:

  git clone https://github.com/OpenHands/agent-canvas
  cd agent-canvas
  npm install
  npm run dev
`);
  process.exit(1);
}

// Pass through to sirv-cli with --single for SPA routing
const args = [BUILD_DIR, "--single", ...process.argv.slice(2)];
const child = spawn("npx", ["sirv-cli", ...args], {
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
