import { defineConfig, devices } from "@playwright/test";

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
    ["html", { outputFolder: "playwright-report-live", open: "never" }],
  ],
  outputDir: "test-results-live",
  use: {
    baseURL: "http://localhost:3001/",
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
        "VITE_ENABLE_BROWSER_TOOLS=false",
        "VITE_FRONTEND_PORT=3001",
        "npm run dev:minimal",
      ].join(" "),
    url: "http://localhost:3001/",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
