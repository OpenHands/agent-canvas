import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";

const configuredLiveE2ESessionApiKey =
  process.env.LIVE_E2E_SESSION_API_KEY?.trim();
const liveE2ESessionApiKey =
  configuredLiveE2ESessionApiKey || randomBytes(32).toString("hex");
process.env.LIVE_E2E_SESSION_API_KEY = liveE2ESessionApiKey;

const liveE2EFrontendPort = process.env.LIVE_E2E_FRONTEND_PORT ?? "3102";
const configuredLiveE2EBackendURL = process.env.LIVE_E2E_BACKEND_URL?.trim();
let liveE2EBackendPort = process.env.LIVE_E2E_BACKEND_PORT ?? "18000";
if (!process.env.LIVE_E2E_BACKEND_PORT && configuredLiveE2EBackendURL) {
  try {
    liveE2EBackendPort =
      new URL(configuredLiveE2EBackendURL).port || liveE2EBackendPort;
  } catch {
    throw new Error("Invalid LIVE_E2E_BACKEND_URL. Expected an absolute URL.");
  }
}
const liveE2EBackendURL =
  configuredLiveE2EBackendURL ?? `http://127.0.0.1:${liveE2EBackendPort}`;
const liveE2EDockerBackendURL =
  process.env.LIVE_E2E_DOCKER_BACKEND_URL ?? "http://127.0.0.1:18002";

process.env.LIVE_E2E_BACKEND_URL = liveE2EBackendURL;
process.env.LIVE_E2E_DOCKER_BACKEND_URL = liveE2EDockerBackendURL;
process.env.LIVE_E2E_RECORD_VIDEO = process.env.LIVE_E2E_RECORD_VIDEO ?? "on";

const liveE2EFrontendURL = `http://localhost:${liveE2EFrontendPort}/`;

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function envAssignment(name: string, value: string) {
  return `${name}=${shellQuote(value)}`;
}

export default defineConfig({
  testDir: "./tests/e2e/live",
  testMatch: /onboarding-dual-backend\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 420_000,
  reporter: [
    ["line"],
    ["json", { outputFile: "test-results-live-onboarding/results.json" }],
    [
      "html",
      { outputFolder: "playwright-report-live-onboarding", open: "never" },
    ],
  ],
  outputDir: "test-results-live-onboarding",
  use: {
    baseURL: liveE2EFrontendURL,
    screenshot: "only-on-failure",
    trace: "off",
    video: "on",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "node -e \"const fs=require('node:fs'); for (const p of ['.tmp/live-onboarding-e2e-state','node_modules/.vite']) fs.rmSync(p,{recursive:true,force:true});\" && " +
      [
        "OH_CANVAS_SAFE_STATE_DIR=.tmp/live-onboarding-e2e-state",
        envAssignment("SESSION_API_KEY", liveE2ESessionApiKey),
        envAssignment("OH_SESSION_API_KEYS_0", liveE2ESessionApiKey),
        envAssignment("OH_CANVAS_SAFE_BACKEND_PORT", liveE2EBackendPort),
        envAssignment("VITE_SESSION_API_KEY", liveE2ESessionApiKey),
        "VITE_DO_NOT_TRACK=1",
        "VITE_ENABLE_BROWSER_TOOLS=false",
        envAssignment("PORT", liveE2EFrontendPort),
        "npm run dev",
      ].join(" "),
    url: liveE2EFrontendURL,
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
