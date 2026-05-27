/**
 * Playwright config for mock-LLM E2E tests.
 *
 * Starts two processes:
 *   1. Mock LLM server (Python, using openhands-sdk TestLLM)
 *   2. Agent-server + frontend (via npm run dev:minimal)
 *
 * The test creates an LLM profile via the UI that points at the mock server,
 * so no real LLM credentials are needed.
 */

import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";

// ── Port allocation (separate from live E2E to avoid collisions) ───────
const MOCK_LLM_PORT = process.env.MOCK_LLM_PORT ?? "9999";
const BACKEND_PORT = process.env.MOCK_LLM_BACKEND_PORT ?? "18200";
const FRONTEND_PORT = process.env.MOCK_LLM_FRONTEND_PORT ?? "3102";

// ── Session API key ────────────────────────────────────────────────────
const sessionApiKey =
  process.env.MOCK_LLM_SESSION_API_KEY?.trim() ||
  randomBytes(32).toString("hex");
process.env.MOCK_LLM_SESSION_API_KEY = sessionApiKey;

// ── URLs ───────────────────────────────────────────────────────────────
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}/`;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const MOCK_LLM_URL = `http://127.0.0.1:${MOCK_LLM_PORT}`;

// Export for the test helpers
process.env.MOCK_LLM_BACKEND_URL = BACKEND_URL;
process.env.MOCK_LLM_PORT = MOCK_LLM_PORT;
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
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report-mock-llm", open: "never" }],
  ],
  outputDir: "test-results-mock-llm",
  use: {
    baseURL: FRONTEND_URL,
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
      command: `python3 tests/e2e/mock-llm/scripts/mock-llm-server.py --port ${MOCK_LLM_PORT}`,
      url: MOCK_LLM_URL,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    // 2. Agent-server + Vite frontend via dev:minimal
    {
      command:
        // Clean state dir to avoid stale profile/conversation data between runs
        "node -e \"const fs=require('node:fs'); for (const p of ['.tmp/mock-llm-state','node_modules/.vite']) fs.rmSync(p,{recursive:true,force:true});\" && " +
        [
          "OH_CANVAS_SAFE_STATE_DIR=.tmp/mock-llm-state",
          envAssignment("SESSION_API_KEY", sessionApiKey),
          envAssignment("OH_SESSION_API_KEYS_0", sessionApiKey),
          envAssignment("OH_CANVAS_SAFE_BACKEND_PORT", BACKEND_PORT),
          envAssignment("VITE_SESSION_API_KEY", sessionApiKey),
          "VITE_DO_NOT_TRACK=1",
          "VITE_ENABLE_BROWSER_TOOLS=false",
          envAssignment("VITE_FRONTEND_PORT", FRONTEND_PORT),
          "npm run dev:minimal",
        ].join(" "),
      url: FRONTEND_URL,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
