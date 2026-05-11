#!/usr/bin/env node

/**
 * Check SDK Version Sync
 *
 * Verifies that the released automation package (openhands-automation on PyPI)
 * uses the same SDK version as specified in dev-safe.mjs for all agent SDK libraries:
 *   - openhands-sdk
 *   - openhands-tools
 *   - openhands-workspace
 *   - openhands-agent-server
 *
 * This script checks the RELEASED PyPI version of openhands-automation (as specified
 * by DEFAULT_AUTOMATION_VERSION in dev-with-automation.mjs), not the main branch.
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

Verifies that the released openhands-automation package on PyPI uses the same
SDK version as specified in this repo's dev-safe.mjs.

The automation version is read from DEFAULT_AUTOMATION_VERSION in
dev-with-automation.mjs (currently used for local development).

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
 * Read the automation version from dev-with-automation.mjs
 */
function getAutomationVersion() {
  const devAutomationPath = join(projectRoot, "scripts", "dev-with-automation.mjs");
  const content = readFileSync(devAutomationPath, "utf8");

  const match = content.match(
    /const DEFAULT_AUTOMATION_VERSION = "([^"]+)"/,
  );
  if (!match) {
    throw new Error(
      "Could not find DEFAULT_AUTOMATION_VERSION in dev-with-automation.mjs",
    );
  }
  return match[1];
}

/**
 * Fetch package metadata from PyPI and extract dependencies
 */
async function fetchPyPIDependencies(packageName, version) {
  const url = `https://pypi.org/pypi/${packageName}/${version}/json`;

  console.log(`${colors.dim}Fetching ${url}${colors.reset}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${packageName}==${version} from PyPI: ${response.status} ${response.statusText}`,
    );
  }
  const data = await response.json();
  return data.info?.requires_dist || [];
}

/**
 * Parse PyPI requires_dist array and extract SDK package versions
 *
 * PyPI returns dependencies in PEP 508 format like:
 *   "openhands-sdk>=1.22.0,<2.0.0"
 *   "openhands-tools==1.22.0"
 *   "openhands-workspace (>=1.22.0)"
 */
function parseSdkVersionsFromRequiresDist(requiresDist) {
  const versions = {};

  for (const pkg of SDK_PACKAGES) {
    for (const dep of requiresDist) {
      // Match the package name at the start, then extract version
      // Examples: "openhands-sdk>=1.22.0,<2", "openhands-sdk (>=1.22.0)"
      const pattern = new RegExp(
        `^${pkg}\\s*(?:\\(|[><=~!]+)\\s*([0-9]+\\.[0-9]+\\.[0-9]+)`,
        "i",
      );
      const match = dep.match(pattern);
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

    // Get automation version from dev-with-automation.mjs
    const automationVersion = getAutomationVersion();
    console.log(
      `Automation package version: ${colors.cyan}openhands-automation==${automationVersion}${colors.reset}`,
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

    // Fetch automation package dependencies from PyPI
    const requiresDist = await fetchPyPIDependencies("openhands-automation", automationVersion);
    const automationVersions = parseSdkVersionsFromRequiresDist(requiresDist);

    // Check each SDK package
    let hasErrors = false;
    let foundAny = false;
    const mismatches = [];

    console.log(`Checking openhands-automation==${automationVersion} SDK dependencies:`);
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
        `${colors.yellow}Warning: No SDK packages found in openhands-automation==${automationVersion} dependencies${colors.reset}`,
      );
      console.log("This might indicate a parsing issue or the package is not yet published.");
      console.log("");
      process.exit(1);
    }

    if (hasErrors) {
      console.log(
        `${colors.red}Version mismatch detected!${colors.reset}`,
      );
      console.log("");
      console.log(`The released openhands-automation==${automationVersion} uses different SDK versions than expected.`);
      console.log("");
      console.log("Mismatched packages:");
      for (const m of mismatches) {
        console.log(`  - ${m.package}: ${m.actual} (expected ${m.expected})`);
      }
      console.log("");
      console.log("To fix, update one of the following:");
      console.log(
        `  1. Update DEFAULT_AGENT_SERVER_VERSION in scripts/dev-safe.mjs to match the automation release`,
      );
      console.log(
        `  2. Release a new version of openhands-automation with SDK dependencies pinned to ${expectedVersion}`,
      );
      console.log(
        `  3. Update DEFAULT_AUTOMATION_VERSION in scripts/dev-with-automation.mjs to a newer release`,
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
