import { defineConfig, devices } from "@playwright/test";

const liveE2ESessionApiKey =
  process.env.LIVE_E2E_SESSION_API_KEY ?? "live-e2e-session-key";
const liveE2EFrontendPort = process.env.LIVE_E2E_FRONTEND_PORT ?? "3101";
const liveE2EBackendURL =
  process.env.LIVE_E2E_BACKEND_URL ?? "http://127.0.0.1:18100";
const liveE2EBackendPort = new URL(liveE2EBackendURL).port || "18100";
const liveE2EFrontendURL = `http://localhost:${liveE2EFrontendPort}/`;

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function envAssignment(name: string, value: string) {
  return `${name}=${shellQuote(value)}`;
}

export default defineConfig({
  testDir: "./tests/e2e/live",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 180_000,
  reporter: [
    ["line"],
    ["json", { outputFile: "test-results-live/results.json" }],
    ["html", { outputFolder: "playwright-report-live", open: "never" }],
  ],
  outputDir: "test-results-live",
  use: {
    baseURL: liveE2EFrontendURL,
    extraHTTPHeaders: {
      "X-Session-API-Key": liveE2ESessionApiKey,
    },
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
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
      "rm -rf .tmp/live-e2e-state node_modules/.vite && " +
      [
        "OH_CANVAS_SAFE_STATE_DIR=.tmp/live-e2e-state",
        envAssignment("SESSION_API_KEY", liveE2ESessionApiKey),
        envAssignment("OH_SESSION_API_KEYS_0", liveE2ESessionApiKey),
        envAssignment("OH_CANVAS_SAFE_BACKEND_PORT", liveE2EBackendPort),
        envAssignment("VITE_SESSION_API_KEY", liveE2ESessionApiKey),
        "VITE_DO_NOT_TRACK=1",
        "VITE_ENABLE_BROWSER_TOOLS=false",
        envAssignment("VITE_FRONTEND_PORT", liveE2EFrontendPort),
        "npm run dev:minimal",
      ].join(" "),
    url: liveE2EFrontendURL,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
