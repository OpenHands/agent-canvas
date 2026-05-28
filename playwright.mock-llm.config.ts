/**
 * Playwright config for mock-LLM E2E tests.
 *
 * Starts three processes:
 *   1. Mock LLM server (Python, using openhands-sdk TestLLM)
 *   2. Mock Automation API server (Python, in-memory automation endpoints)
 *   3. Full agent-canvas stack via bin/agent-canvas.mjs (agent-server +
 *      automation backend + static frontend + ingress proxy), matching the
 *      production npm-published binary.
 *
 * The test creates an LLM profile via the UI that points at the mock server,
 * so no real LLM credentials are needed.
 *
 * A pre-built `build/` directory is required — the Playwright webServer
 * command runs `npm run build:app` when `build/index.html` is absent.
 * CI should run the build step explicitly before the tests for caching.
 */

import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";

// ── Port allocation (separate from live E2E / dev to avoid collisions) ─
const MOCK_LLM_PORT = process.env.MOCK_LLM_PORT ?? "9999";
const MOCK_AUTOMATION_PORT = process.env.MOCK_AUTOMATION_PORT ?? "18299";

// The agent-canvas binary exposes a single ingress port that routes:
//   /api/automation/* → automation backend
//   /api/*, /sockets  → agent-server
//   /*                → static frontend
// Tests use this single URL for both the browser (baseURL) and backend API
// calls (the ingress proxies /api/* transparently).
const INGRESS_PORT = process.env.MOCK_LLM_INGRESS_PORT ?? "18300";

// ── Session API key ────────────────────────────────────────────────────
const sessionApiKey =
  process.env.MOCK_LLM_SESSION_API_KEY?.trim() ||
  randomBytes(32).toString("hex");
process.env.MOCK_LLM_SESSION_API_KEY = sessionApiKey;

// ── State directory (isolated per test run) ────────────────────────────
const STATE_DIR = ".tmp/mock-llm-state";

// ── URLs ───────────────────────────────────────────────────────────────
const INGRESS_URL = `http://localhost:${INGRESS_PORT}/`;
const MOCK_LLM_URL = `http://127.0.0.1:${MOCK_LLM_PORT}`;
const MOCK_AUTOMATION_URL = `http://127.0.0.1:${MOCK_AUTOMATION_PORT}`;

// Python binary for the mock server — defaults to "python3" but CI can
// point this at a venv (e.g. ".mock-llm-venv/bin/python3") to avoid
// PEP 668 "externally managed" errors on Ubuntu 24.04+.
const MOCK_LLM_PYTHON = process.env.MOCK_LLM_PYTHON ?? "python3";

// Export for the test helpers — BACKEND_URL points to the ingress (API
// calls are proxied to the agent-server, so no direct backend port needed).
process.env.MOCK_LLM_BACKEND_URL = `http://localhost:${INGRESS_PORT}`;
process.env.MOCK_LLM_PORT = MOCK_LLM_PORT;
process.env.MOCK_AUTOMATION_PORT = MOCK_AUTOMATION_PORT;
process.env.VITE_SESSION_API_KEY = sessionApiKey;

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function envAssignment(name: string, value: string) {
  return `${name}=${shellQuote(value)}`;
}

export default defineConfig({
  testDir: "./tests/e2e/mock-llm",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  globalTimeout: process.env.CI ? 600_000 : 0, // 10 min hard cap in CI
  reporter: [
    ["line"],
    ["json", { outputFile: "test-results-mock-llm/results.json" }],
    ["html", { outputFolder: "playwright-report-mock-llm", open: "never" }],
    ["./tests/e2e/mock-llm/reporters/done-marker-reporter.ts"],
  ],
  outputDir: "test-results-mock-llm",
  use: {
    baseURL: INGRESS_URL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    // 1. Mock LLM server (Python)
    {
      command: `${MOCK_LLM_PYTHON} tests/e2e/mock-llm/scripts/mock-llm-server.py --port ${MOCK_LLM_PORT}`,
      url: MOCK_LLM_URL,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    // 2. Mock Automation API server (Python)
    {
      command: `${MOCK_LLM_PYTHON} tests/e2e/mock-llm/scripts/mock-automation-server.py --port ${MOCK_AUTOMATION_PORT}`,
      url: MOCK_AUTOMATION_URL,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    // 3. Full agent-canvas stack via bin/agent-canvas.mjs
    //
    // This mirrors the production `npx @openhands/agent-canvas` path:
    //   - Pre-built static frontend served via static-server.mjs
    //   - Agent-server via uvx
    //   - Automation backend via uvx
    //   - Ingress proxy unifying all routes on a single port
    //
    // `exec` replaces the shell so Playwright's tracked PID IS the node
    // process. SIGTERM goes directly to the shutdown handler, which
    // kills children via process groups and exits cleanly.
    {
      command:
        // Clean state dir to avoid stale profile/conversation data between runs
        `node -e "const fs=require('node:fs'); fs.rmSync('${STATE_DIR}',{recursive:true,force:true});" && ` +
        // Build frontend if not already built (CI should pre-build for caching)
        '[ -f build/index.html ] || npm run build:app && ' +
        [
          "exec env",
          envAssignment("OH_CANVAS_SAFE_STATE_DIR", STATE_DIR),
          envAssignment("PORT", INGRESS_PORT),
          envAssignment("SESSION_API_KEY", sessionApiKey),
          envAssignment("OH_SESSION_API_KEYS_0", sessionApiKey),
          envAssignment("VITE_SESSION_API_KEY", sessionApiKey),
          "VITE_DO_NOT_TRACK=1",
          "VITE_ENABLE_BROWSER_TOOLS=false",
          // Bypass npm — exec directly into node so SIGTERM reaches
          // the shutdown handler (npm swallows it).
          "node --env-file-if-exists=.env bin/agent-canvas.mjs",
        ].join(" "),
      url: INGRESS_URL,
      timeout: 180_000, // allow extra time for build + agent-server + automation startup
      reuseExistingServer: !process.env.CI,
    },
  ],
});
