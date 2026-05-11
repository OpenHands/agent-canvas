#!/usr/bin/env node

/**
 * Check SDK Version Sync
 *
 * Verifies that the automation project (openhands-automation) uses the same
 * SDK version as specified in dev-safe.mjs for all agent SDK libraries:
 *   - openhands-sdk
 *   - openhands-tools
 *   - openhands-workspace
 *   - openhands-agent-server
 *
 * This script is run in CI to catch version drift between projects.
 *
 * Usage:
 *   node scripts/check-sdk-version-sync.mjs
 *   EXPECTED_SDK_VERSION=1.22.0 node scripts/check-sdk-version-sync.mjs
 *   node scripts/check-sdk-version-sync.mjs --check-pypi
 *
 * Environment variables:
 *   EXPECTED_SDK_VERSION - Override the expected version (instead of reading from dev-safe.mjs)
 *
 * Options:
 *   --check-pypi    Also check the latest SDK version on PyPI
 *   --help          Show help
 *
 * Exit codes:
 *   0 - All SDK versions match
 *   1 - Version mismatch detected or error occurred
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// Parse command line arguments
const args = process.argv.slice(2);
const checkPyPI = args.includes("--check-pypi");
const showHelp = args.includes("--help") || args.includes("-h");

if (showHelp) {
  console.log(`
SDK Version Sync Check

Verifies that the automation project uses the same SDK version as this repo.

Usage:
  node scripts/check-sdk-version-sync.mjs [options]

Options:
  --check-pypi    Also check the latest SDK version on PyPI
  --help, -h      Show this help

Environment variables:
  EXPECTED_SDK_VERSION    Override the expected version (instead of reading from dev-safe.mjs)

Triggering from other repos:
  The automation repo or SDK repo can trigger this check via GitHub repository_dispatch:

  curl -X POST \\
    -H "Authorization: token \$GITHUB_TOKEN" \\
    -H "Accept: application/vnd.github.v3+json" \\
    https://api.github.com/repos/OpenHands/agent-canvas/dispatches \\
    -d '{"event_type": "sdk-version-check", "client_payload": {"version": "1.22.0"}}'
`);
  process.exit(0);
}

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

// SDK packages that must have matching versions
const SDK_PACKAGES = [
  "openhands-sdk",
  "openhands-tools",
  "openhands-workspace",
  "openhands-agent-server",
];

/**
 * Read the expected SDK version from environment variable or dev-safe.mjs
 */
function getExpectedVersion() {
  // Allow override via environment variable (useful for CI triggers)
  const envVersion = process.env.EXPECTED_SDK_VERSION;
  if (envVersion && envVersion.trim()) {
    return { version: envVersion.trim(), source: "EXPECTED_SDK_VERSION env var" };
  }

  // Read from dev-safe.mjs
  const devSafePath = join(projectRoot, "scripts", "dev-safe.mjs");
  const content = readFileSync(devSafePath, "utf8");

  const match = content.match(
    /const DEFAULT_AGENT_SERVER_VERSION = "([^"]+)"/,
  );
  if (!match) {
    throw new Error(
      "Could not find DEFAULT_AGENT_SERVER_VERSION in dev-safe.mjs",
    );
  }
  return { version: match[1], source: "dev-safe.mjs" };
}

/**
 * Fetch the latest version of a package from PyPI
 */
async function fetchPyPIVersion(packageName) {
  const url = `https://pypi.org/pypi/${packageName}/json`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.info?.version || null;
  } catch {
    return null;
  }
}

/**
 * Fetch the pyproject.toml from the automation repository
 */
async function fetchAutomationPyproject() {
  // The automation project is at https://github.com/OpenHands/automation
  // We fetch its pyproject.toml from the main branch
  const url =
    "https://raw.githubusercontent.com/OpenHands/automation/main/pyproject.toml";

  console.log(`${colors.dim}Fetching ${url}${colors.reset}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch automation pyproject.toml: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

/**
 * Parse pyproject.toml and extract SDK package versions
 *
 * Looks for patterns like:
 *   "openhands-sdk>=1.22.0,<2.0.0"
 *   "openhands-tools==1.22.0"
 *   openhands-workspace = "^1.22.0"
 */
function parseSdkVersions(pyprojectContent) {
  const versions = {};

  for (const pkg of SDK_PACKAGES) {
    // Match various dependency formats:
    // "pkg>=X.Y.Z" or "pkg==X.Y.Z" or "pkg~=X.Y.Z" or pkg = "^X.Y.Z"
    const patterns = [
      // Standard PEP 508 format: "pkg>=1.22.0" or "pkg==1.22.0"
      new RegExp(`["']${pkg}[><=~!]+([0-9]+\\.[0-9]+\\.[0-9]+)`, "i"),
      // Poetry-style: pkg = "^1.22.0" or pkg = ">=1.22.0"
      new RegExp(`${pkg}\\s*=\\s*["'][^0-9]*([0-9]+\\.[0-9]+\\.[0-9]+)`, "i"),
    ];

    for (const pattern of patterns) {
      const match = pyprojectContent.match(pattern);
      if (match) {
        versions[pkg] = match[1];
        break;
      }
    }
  }

  return versions;
}

/**
 * Main entry point
 */
async function main() {
  console.log("");
  console.log(
    `${colors.cyan}SDK Version Sync Check${colors.reset}`,
  );
  console.log("─".repeat(50));
  console.log("");

  try {
    // Get expected version from env var or dev-safe.mjs
    const { version: expectedVersion, source: versionSource } = getExpectedVersion();
    console.log(
      `Expected SDK version: ${colors.green}${expectedVersion}${colors.reset} (from ${versionSource})`,
    );

    // Optionally check PyPI for the latest SDK version
    if (checkPyPI) {
      console.log("");
      console.log("Checking latest SDK versions on PyPI:");
      for (const pkg of SDK_PACKAGES) {
        const pypiVersion = await fetchPyPIVersion(pkg);
        if (pypiVersion) {
          const status = pypiVersion === expectedVersion
            ? colors.green
            : colors.yellow;
          console.log(`  ${pkg.padEnd(25)} ${status}${pypiVersion}${colors.reset}`);
        } else {
          console.log(`  ${pkg.padEnd(25)} ${colors.dim}(not found on PyPI)${colors.reset}`);
        }
      }
    }

    console.log("");

    // Fetch and parse automation project dependencies
    const pyprojectContent = await fetchAutomationPyproject();
    const automationVersions = parseSdkVersions(pyprojectContent);

    // Check each SDK package
    let hasErrors = false;
    let foundAny = false;
    const mismatches = [];

    console.log("Checking automation project SDK dependencies:");
    console.log("");

    for (const pkg of SDK_PACKAGES) {
      const actualVersion = automationVersions[pkg];

      if (actualVersion) {
        foundAny = true;
        if (actualVersion === expectedVersion) {
          console.log(
            `  ${pkg.padEnd(25)} ${colors.green}✓ ${actualVersion}${colors.reset}`,
          );
        } else {
          hasErrors = true;
          console.log(
            `  ${pkg.padEnd(25)} ${colors.red}✗ ${actualVersion} (expected ${expectedVersion})${colors.reset}`,
          );
          mismatches.push({
            package: pkg,
            expected: expectedVersion,
            actual: actualVersion,
          });
        }
      } else {
        // Package not found - might be a transitive dependency, not an error
        console.log(
          `  ${pkg.padEnd(25)} ${colors.dim}- not a direct dependency${colors.reset}`,
        );
      }
    }

    console.log("");

    if (!foundAny) {
      console.log(
        `${colors.yellow}Warning: No SDK packages found in automation pyproject.toml${colors.reset}`,
      );
      console.log("This might indicate a parsing issue or structural change.");
      console.log("");
      process.exit(1);
    }

    if (hasErrors) {
      console.log(
        `${colors.red}Version mismatch detected!${colors.reset}`,
      );
      console.log("");
      console.log("The automation project uses different SDK versions than expected.");
      console.log("");
      console.log("Mismatched packages:");
      for (const m of mismatches) {
        console.log(`  - ${m.package}: ${m.actual} (expected ${m.expected})`);
      }
      console.log("");
      console.log("To fix, update one of the following:");
      console.log(
        `  1. Update DEFAULT_AGENT_SERVER_VERSION in scripts/dev-safe.mjs to match automation`,
      );
      console.log(
        `  2. Update the automation project's SDK dependencies to ${expectedVersion}`,
      );
      console.log("");
      process.exit(1);
    }

    console.log(
      `${colors.green}All SDK versions are in sync!${colors.reset}`,
    );
    console.log("");
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

main();
