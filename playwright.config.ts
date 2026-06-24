import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // `verified/**` holds agent-authored verification specs (Bet D). They run
  // ONLY under the `verified-dev` / `verified-prod` projects below (against a
  // preview / prod URL), never under the default browser projects that target
  // the local mock dev server — so ignore them globally and re-include them
  // per verified project via that project's own testDir.
  testIgnore: ["**/e2e/live/**", "**/e2e/mock-llm/**", "**/e2e/verified/**"],
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Use 2 workers on CI (matches ubuntu-24.04's 2 vCPUs). Tests are isolated
   * per browser context so parallel execution is safe. */
  workers: process.env.CI ? 2 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters
   * `EMIT_CHECKS=1` (the Bet D verification run, e.g.
   * `EMIT_CHECKS=1 npx playwright test --project=verified-dev`) adds the checks
   * reporter, which writes `.checks/result.json` for the cockpit Checks tab.
   * Normal `npm test` / CI runs keep the plain html reporter. */
  reporter: process.env.EMIT_CHECKS
    ? [["list"], ["./tests/e2e/verified/checks-reporter.ts"]]
    : "html",

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3001/",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    /* Ignore SSL errors for browser agent test */
    /* Solution inspired by StackOverflow post: https://stackoverflow.com/questions/67048422/ignore-ssl-errors-with-playwright-code-generation */
    ignoreHTTPSErrors: true,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

    /* Bet D — verified projects. Same spec, different target, differing only
     * by baseURL (Playwright-projects-as-targets). They run the committed
     * `tests/e2e/verified/*.spec.ts` artifacts an agent emits after a
     * browser-toolbelt run, recording video + trace as the durable proof a
     * reviewer inspects without running anything locally. `testDir` re-includes
     * the globally-ignored `verified/` dir; `testIgnore: []` clears the
     * inherited global ignores so these specs actually collect. */
    {
      name: "verified-dev",
      testDir: "./tests/e2e/verified",
      testIgnore: [],
      use: {
        ...devices["Desktop Chrome"],
        // Portless preview URL (RUNTIME_SERVICES); falls back to the local mock
        // server so the project is runnable in dev without extra setup.
        baseURL: process.env.VERIFY_DEV_URL ?? "http://localhost:3001/",
        video: "on",
        trace: "on",
      },
    },
    {
      name: "verified-prod",
      testDir: "./tests/e2e/verified",
      testIgnore: [],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.VERIFY_PROD_URL ?? "http://localhost:3001/",
        video: "on",
        trace: "on",
      },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "npm run dev:mock -- --port 3001",
    url: "http://localhost:3001/",
    reuseExistingServer: !process.env.CI,
  },
});
