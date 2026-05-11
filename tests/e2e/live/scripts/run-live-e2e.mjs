#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const REQUIRED_LLM_API_KEY_ENV_VARS = [
  "LIVE_E2E_LLM_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "LLM_API_KEY",
];
const DEFAULT_PROXY_BASE_URL = "https://llm-proxy.app.all-hands.dev";
const DEFAULT_PROXY_MODEL = "openhands/claude-haiku-4-5-20251001";
const DEFAULT_OPENAI_MODEL = "openai/gpt-4o-mini";
const DEFAULT_ANTHROPIC_MODEL = "anthropic/claude-haiku-4-5-20251001";
const DEFAULT_SESSION_API_KEY = "live-e2e-session-key";
const DEFAULT_BACKEND_URL = "http://127.0.0.1:18000";
const PLAYWRIGHT_CONFIG = "playwright.live.config.ts";

function hasValue(name) {
  return Boolean(process.env[name]?.trim());
}

function firstConfiguredEnvVar(names) {
  return names.find((name) => hasValue(name)) ?? "";
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return !result.error && result.status === 0;
}

function localPlaywrightExists() {
  const executable =
    process.platform === "win32" ? "playwright.cmd" : "playwright";
  return existsSync(
    path.join(process.cwd(), "node_modules", ".bin", executable),
  );
}

function usesProxyDefaults(apiKeySource) {
  return (
    apiKeySource === "LIVE_E2E_LLM_API_KEY" ||
    (!hasValue("OPENAI_API_KEY") &&
      !hasValue("ANTHROPIC_API_KEY") &&
      apiKeySource === "LLM_API_KEY")
  );
}

function resolvedLLMBaseUrl(apiKeySource) {
  if (hasValue("LIVE_E2E_LLM_BASE_URL")) {
    return process.env.LIVE_E2E_LLM_BASE_URL.trim();
  }
  return usesProxyDefaults(apiKeySource) ? DEFAULT_PROXY_BASE_URL : "(unset)";
}

function resolvedLLMModel(apiKeySource) {
  if (!apiKeySource) {
    return "(depends on credential source)";
  }
  if (hasValue("LIVE_E2E_LLM_MODEL")) {
    return process.env.LIVE_E2E_LLM_MODEL.trim();
  }
  if (resolvedLLMBaseUrl(apiKeySource) !== "(unset)") {
    return DEFAULT_PROXY_MODEL;
  }
  if (apiKeySource === "OPENAI_API_KEY") {
    return DEFAULT_OPENAI_MODEL;
  }
  return DEFAULT_ANTHROPIC_MODEL;
}

function printUsage() {
  console.log(`
Run the live Agent Server end-to-end test locally.

Usage:
  npm run test:e2e:live
  npm run test:e2e:live -- --headed
  npm run test:e2e:live -- --debug
  npm run test:e2e:live -- --check

Required:
  Set one LLM credential before running:
  - LIVE_E2E_LLM_API_KEY
  - OPENAI_API_KEY
  - ANTHROPIC_API_KEY
  - LLM_API_KEY

Optional:
  - LIVE_E2E_LLM_BASE_URL
  - LIVE_E2E_LLM_MODEL
  - LIVE_E2E_SESSION_API_KEY
  - LIVE_E2E_BACKEND_URL

The npm script loads .env automatically through Node's --env-file-if-exists flag.
`);
}

function printConfiguration(apiKeySource) {
  console.log("Live Agent Server E2E configuration:");
  console.log(`- LLM API key source: ${apiKeySource || "(missing)"}`);
  console.log(`- LIVE_E2E_LLM_BASE_URL: ${resolvedLLMBaseUrl(apiKeySource)}`);
  console.log(`- LIVE_E2E_LLM_MODEL: ${resolvedLLMModel(apiKeySource)}`);
  console.log(
    `- LIVE_E2E_SESSION_API_KEY: ${
      hasValue("LIVE_E2E_SESSION_API_KEY")
        ? "(configured)"
        : `(default: ${DEFAULT_SESSION_API_KEY})`
    }`,
  );
  console.log(
    `- LIVE_E2E_BACKEND_URL: ${
      hasValue("LIVE_E2E_BACKEND_URL")
        ? process.env.LIVE_E2E_BACKEND_URL.trim()
        : `(default: ${DEFAULT_BACKEND_URL})`
    }`,
  );
}

function validateEnvironment() {
  const apiKeySource = firstConfiguredEnvVar(REQUIRED_LLM_API_KEY_ENV_VARS);
  const errors = [];

  if (!apiKeySource) {
    errors.push(
      [
        "Missing LLM credential.",
        `Set one of: ${REQUIRED_LLM_API_KEY_ENV_VARS.join(", ")}.`,
        "For the hosted LLM proxy, use LIVE_E2E_LLM_API_KEY or LLM_API_KEY.",
      ].join(" "),
    );
  }

  if (!localPlaywrightExists()) {
    errors.push(
      "Missing local Playwright install. Run `npm ci` before running live E2E.",
    );
  }

  if (!commandExists("uvx")) {
    errors.push(
      [
        "Missing `uvx`, which `npm run dev:minimal` uses to start the real Agent Server.",
        "Install uv with: `curl -LsSf https://astral.sh/uv/install.sh | sh`.",
      ].join(" "),
    );
  }

  printConfiguration(apiKeySource);

  if (errors.length === 0) {
    console.log("Environment check passed.");
    return true;
  }

  console.error("");
  console.error("Live Agent Server E2E is not ready to run:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  console.error("");
  console.error("After fixing the above, run `npm run test:e2e:live` again.");
  return false;
}

async function runPlaywright(args) {
  const child = spawn(
    "npx",
    ["playwright", "test", `--config=${PLAYWRIGHT_CONFIG}`, ...args],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
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
