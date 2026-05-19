#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const REQUIRED_LLM_API_KEY_ENV_VARS = [
  "LIVE_E2E_LLM_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "LLM_API_KEY",
];
const DEFAULT_BACKEND_URL = "http://127.0.0.1:18000";
const DEFAULT_DOCKER_BACKEND_URL = "http://127.0.0.1:18002";
const DEFAULT_FRONTEND_PORT = "3102";
const PLAYWRIGHT_CONFIG = "playwright.live.onboarding.config.ts";

let generatedSessionApiKey = false;

function hasValue(name) {
  return Boolean(process.env[name]?.trim());
}

function firstConfiguredEnvVar(names) {
  return names.find((name) => hasValue(name)) ?? "";
}

function platformCommand(command) {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

function commandExists(command) {
  const result = spawnSync(platformCommand(command), ["--version"], {
    stdio: "ignore",
  });
  return !result.error && result.status === 0;
}

function dockerDaemonIsRunning() {
  const result = spawnSync("docker", ["info"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function localPlaywrightExists() {
  const executable =
    process.platform === "win32" ? "playwright.cmd" : "playwright";
  return existsSync(
    path.join(process.cwd(), "node_modules", ".bin", executable),
  );
}

function ensureSessionApiKey() {
  if (hasValue("LIVE_E2E_SESSION_API_KEY")) {
    return;
  }
  process.env.LIVE_E2E_SESSION_API_KEY = randomBytes(32).toString("hex");
  generatedSessionApiKey = true;
}

function redactUrlForLog(value) {
  if (!value) return value;

  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = "redacted";
      url.password = "redacted";
    }
    return url.toString();
  } catch {
    return value.replace(/\/\/[^/@\s]+@/g, "//redacted:redacted@");
  }
}

function printUsage() {
  console.log(`
Run the live onboarding + dual-backend end-to-end test locally.

Usage:
  npm run test:e2e:live:onboarding-dual-backend
  npm run test:e2e:live:onboarding-dual-backend -- --headed
  npm run test:e2e:live:onboarding-dual-backend -- --check

Required:
  - Docker installed and running
  - uvx installed
  - one LLM credential: ${REQUIRED_LLM_API_KEY_ENV_VARS.join(", ")}

The script starts the full dev stack, walks first-run onboarding, starts
the Docker backend from the browser, then runs one local and one Docker
conversation with real LLM/tool execution. Video recording is forced on.
`);
}

function printConfiguration(apiKeySource) {
  console.log("Live onboarding dual-backend E2E configuration:");
  console.log(`- LLM API key source: ${apiKeySource || "(missing)"}`);
  console.log(
    `- LIVE_E2E_SESSION_API_KEY: ${
      generatedSessionApiKey ? "(generated for this run)" : "(configured)"
    }`,
  );
  console.log(
    `- LIVE_E2E_BACKEND_URL: ${
      hasValue("LIVE_E2E_BACKEND_URL")
        ? redactUrlForLog(process.env.LIVE_E2E_BACKEND_URL.trim())
        : `(default: ${DEFAULT_BACKEND_URL})`
    }`,
  );
  console.log(
    `- LIVE_E2E_DOCKER_BACKEND_URL: ${
      hasValue("LIVE_E2E_DOCKER_BACKEND_URL")
        ? redactUrlForLog(process.env.LIVE_E2E_DOCKER_BACKEND_URL.trim())
        : `(default: ${DEFAULT_DOCKER_BACKEND_URL})`
    }`,
  );
  console.log(
    `- LIVE_E2E_FRONTEND_PORT: ${
      hasValue("LIVE_E2E_FRONTEND_PORT")
        ? process.env.LIVE_E2E_FRONTEND_PORT.trim()
        : `(default: ${DEFAULT_FRONTEND_PORT})`
    }`,
  );
  console.log("- LIVE_E2E_RECORD_VIDEO: on");
}

function validateEnvironment() {
  ensureSessionApiKey();
  process.env.LIVE_E2E_RECORD_VIDEO = "on";

  const apiKeySource = firstConfiguredEnvVar(REQUIRED_LLM_API_KEY_ENV_VARS);
  const errors = [];

  if (!apiKeySource) {
    errors.push(
      `Missing LLM credential. Set one of: ${REQUIRED_LLM_API_KEY_ENV_VARS.join(", ")}.`,
    );
  }

  if (!localPlaywrightExists()) {
    errors.push("Missing local Playwright install. Run `npm ci` first.");
  }

  if (!commandExists("uvx")) {
    errors.push("Missing `uvx`, required by the full dev stack.");
  }

  if (!commandExists("docker")) {
    errors.push("Missing Docker CLI.");
  } else if (!dockerDaemonIsRunning()) {
    errors.push("Docker daemon is not running.");
  }

  printConfiguration(apiKeySource);

  if (errors.length === 0) {
    console.log("Environment check passed.");
    return true;
  }

  console.error("");
  console.error("Live onboarding dual-backend E2E is not ready to run:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  return false;
}

async function runPlaywright(args) {
  const child = spawn(
    platformCommand("npx"),
    ["playwright", "test", ...args, `--config=${PLAYWRIGHT_CONFIG}`],
    {
      stdio: "inherit",
    },
  );

  const exitCode = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });

  process.exit(exitCode);
}

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(0);
}

const checkOnly = args.includes("--check");
const playwrightArgs = args.filter((arg) => arg !== "--check");
const isValid = validateEnvironment();

if (!isValid) {
  process.exit(1);
}

if (checkOnly) {
  process.exit(0);
}

await runPlaywright(playwrightArgs);
