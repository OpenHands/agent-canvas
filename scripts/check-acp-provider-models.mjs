#!/usr/bin/env node

/**
 * Check ACP Provider Models Sync
 *
 * Launches each built-in ACP subprocess from src/constants/acp-providers.ts,
 * creates a minimal ACP session, reads the process-advertised
 * models.availableModels, and compares those model IDs to Canvas's
 * available_models suggestions.
 *
 * Canvas intentionally filters generic "default" placeholders such as Claude
 * Code's "Default (recommended)" before comparing. The UI must surface concrete
 * model choices, not a provider-specific default sentinel.
 *
 * Usage:
 *   node scripts/check-acp-provider-models.mjs
 *   node scripts/check-acp-provider-models.mjs --provider codex
 *
 * Options:
 *   --provider <key>   Check only one provider key. Can be passed multiple times.
 *   --timeout-ms <n>   Timeout for each ACP request. Default: 30000.
 *   --help, -h         Show help.
 *
 * Exit codes:
 *   0 - Canvas suggestions match the ACP subprocess-advertised model IDs.
 *   1 - Drift detected, subprocess error, or parse error.
 */

import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const DEFAULT_TS_PATH = join(
  projectRoot,
  "src",
  "constants",
  "acp-providers.ts",
);

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function parseArgs(argv) {
  const args = {
    help: false,
    providers: [],
    timeoutMs: Number(process.env.ACP_MODEL_CHECK_TIMEOUT_MS || 30_000),
    tsFile: DEFAULT_TS_PATH,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--provider") {
      args.providers.push(argv[++i]);
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number(argv[++i]);
    } else if (arg === "--ts-file") {
      args.tsFile = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number");
  }

  return args;
}

function showHelp() {
  process.stdout.write(
    `\nACP Provider Models Sync Check\n\n` +
      `Launches each built-in ACP subprocess and verifies that Canvas's\n` +
      `available_models suggestions match the model IDs advertised by\n` +
      `session/new -> models.availableModels, after filtering generic\n` +
      `default placeholders.\n\n` +
      `Usage:\n` +
      `  node scripts/check-acp-provider-models.mjs [options]\n\n` +
      `Options:\n` +
      `  --provider <key>   Check only one provider key. Repeatable.\n` +
      `  --timeout-ms <n>   Timeout for each ACP request. Default: 30000.\n` +
      `  --ts-file <path>   Override TS mirror path.\n` +
      `  --help, -h         Show this help.\n\n`,
  );
}

function findMatchingDelimiter(source, openIdx, open, close) {
  let depth = 0;
  let i = openIdx;

  while (i < source.length) {
    const char = source[i];

    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      i++;
      while (i < source.length) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (char === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    if (char === "/" && source[i + 1] === "*") {
      i += 2;
      while (
        i < source.length - 1 &&
        !(source[i] === "*" && source[i + 1] === "/")
      ) {
        i++;
      }
      i += 2;
      continue;
    }

    if (char === open) depth++;
    if (char === close) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }

  return -1;
}

function extractStringList(source) {
  const out = [];
  const re = /"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    out.push(match[1].replace(/\\(.)/g, "$1"));
  }
  return out;
}

function parseModelOptionArrays(source) {
  const arrays = new Map();
  const re = /const\s+(\w+)\s*:\s*ACPModelOption\[\]\s*=\s*\[/g;
  let match;

  while ((match = re.exec(source)) !== null) {
    const name = match[1];
    const equalsIdx = source.indexOf("=", match.index);
    const openIdx = source.indexOf("[", equalsIdx);
    const closeIdx = findMatchingDelimiter(source, openIdx, "[", "]");
    if (closeIdx === -1) {
      throw new Error(`Could not find end of model array ${name}`);
    }

    const body = source.slice(openIdx + 1, closeIdx);
    const models = splitTopLevelObjects(body).map((modelSource) => {
      const id = modelSource.match(/id:\s*"((?:\\.|[^"\\])*)"/)?.[1];
      const label = modelSource.match(/label:\s*"((?:\\.|[^"\\])*)"/)?.[1];
      if (!id || !label) {
        throw new Error(
          `Could not parse model option in ${name}: ${modelSource}`,
        );
      }
      return {
        id: id.replace(/\\(.)/g, "$1"),
        label: label.replace(/\\(.)/g, "$1"),
      };
    });

    arrays.set(name, models);
    re.lastIndex = closeIdx + 1;
  }

  return arrays;
}

function splitTopLevelObjects(source) {
  const objects = [];
  let i = 0;

  while (i < source.length) {
    if (source[i] !== "{") {
      i++;
      continue;
    }

    const closeIdx = findMatchingDelimiter(source, i, "{", "}");
    if (closeIdx === -1) {
      throw new Error("Could not find end of provider object");
    }

    objects.push(source.slice(i, closeIdx + 1));
    i = closeIdx + 1;
  }

  return objects;
}

function parseCanvasProviders(tsFile) {
  const source = readFileSync(tsFile, "utf8");
  const modelArrays = parseModelOptionArrays(source);
  const providersStart = source.search(
    /export\s+const\s+ACP_PROVIDERS\s*:\s*ACPProviderConfig\[\]\s*=\s*\[/,
  );
  if (providersStart === -1) {
    throw new Error("Could not find exported ACP_PROVIDERS array");
  }

  const equalsIdx = source.indexOf("=", providersStart);
  const openIdx = source.indexOf("[", equalsIdx);
  const closeIdx = findMatchingDelimiter(source, openIdx, "[", "]");
  if (closeIdx === -1) {
    throw new Error("Could not find end of ACP_PROVIDERS array");
  }

  const providerObjects = splitTopLevelObjects(
    source.slice(openIdx + 1, closeIdx),
  );

  return providerObjects
    .map((objectSource) => {
      const key = objectSource.match(/key:\s*"([^"]+)"/)?.[1];
      const displayName = objectSource.match(/display_name:\s*"([^"]+)"/)?.[1];
      const defaultCommandBody = objectSource.match(
        /default_command:\s*\[([\s\S]*?)\]/,
      )?.[1];
      const modelArrayName = objectSource.match(
        /available_models:\s*(\w+)/,
      )?.[1];
      const defaultModel = objectSource.match(
        /default_model:\s*"([^"]+)"/,
      )?.[1];

      if (!key || !displayName || !defaultCommandBody) {
        throw new Error(`Could not parse provider object:\n${objectSource}`);
      }

      return {
        key,
        display_name: displayName,
        default_command: extractStringList(defaultCommandBody),
        available_models: modelArrayName
          ? (modelArrays.get(modelArrayName) ?? [])
          : [],
        default_model: defaultModel ?? null,
      };
    })
    .filter((provider) => provider.available_models.length > 0);
}

function isGenericDefaultModel(model) {
  const id = String(model.modelId ?? "")
    .trim()
    .toLowerCase();
  const name = String(model.name ?? "")
    .trim()
    .toLowerCase();
  return (
    id === "default" || name === "default" || name === "default (recommended)"
  );
}

function providerEnv(providerKey, tempRoot) {
  const env = {
    ...process.env,
    CI: "1",
    NO_COLOR: "1",
  };

  if (providerKey === "claude-code") {
    env.CLAUDE_CONFIG_DIR = join(tempRoot, "claude-config");
  }

  if (providerKey === "codex") {
    env.CODEX_HOME = join(tempRoot, "codex-home");
  }

  if (providerKey === "gemini-cli") {
    env.GEMINI_CLI_HOME = join(tempRoot, "gemini-home");
    env.GEMINI_API_KEY =
      process.env.GEMINI_API_KEY || "dummy-acp-model-drift-check";
  }

  return env;
}

function writeJsonLine(stream, message) {
  stream.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function terminateProcessGroup(child) {
  if (!child.pid) return;

  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    // The process may have exited between the response and cleanup.
  }

  await waitForExit(child, 1_000);

  if (child.exitCode === null && child.signalCode === null) {
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid, "SIGKILL");
    } catch {
      // Best-effort cleanup.
    }
  }

  child.stdin?.destroy();
  child.stdout?.destroy();
  child.stderr?.destroy();
}

async function fetchRuntimeModels(provider, timeoutMs) {
  const tempRoot = mkdtempSync(join(tmpdir(), `acp-models-${provider.key}-`));
  const workspace = join(tempRoot, "workspace");
  mkdirSync(workspace, { recursive: true });
  const command = provider.default_command;
  const env = providerEnv(provider.key, tempRoot);
  for (const key of ["CLAUDE_CONFIG_DIR", "CODEX_HOME", "GEMINI_CLI_HOME"]) {
    if (env[key]) mkdirSync(env[key], { recursive: true });
  }
  if (provider.key === "codex") {
    writeFileSync(
      join(env.CODEX_HOME, "auth.json"),
      JSON.stringify({
        auth_mode: "apikey",
        OPENAI_API_KEY:
          process.env.OPENAI_API_KEY || "dummy-acp-model-drift-check",
      }),
    );
  }
  let stderr = "";

  const child = spawn(command[0], command.slice(1), {
    cwd: workspace,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  const pending = new Map();
  let nextId = 1;

  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-8_000);
  });

  child.on("exit", (code, signal) => {
    for (const [id, entry] of pending) {
      entry.reject(
        new Error(
          `${provider.key} exited before response ${id} (code=${code}, signal=${signal})\n${stderr}`,
        ),
      );
    }
    pending.clear();
  });

  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      stderr = `${stderr}\n[stdout non-json] ${line}`.slice(-8_000);
      return;
    }

    if (message.id !== undefined && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      entry.resolve(message);
      return;
    }

    // Some agents may send client-side requests while setting up a session.
    // The model list does not depend on these, so return an empty success to
    // keep the handshake moving.
    if (message.id !== undefined && message.method) {
      writeJsonLine(child.stdin, { id: message.id, result: {} });
    }
  });

  function request(method, params) {
    const id = nextId++;
    writeJsonLine(child.stdin, { id, method, params });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(
            `${provider.key} timed out waiting for ${method} after ${timeoutMs}ms\n${stderr}`,
          ),
        );
      }, timeoutMs);

      pending.set(id, {
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  try {
    const init = await request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {
        auth: { terminal: false },
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: {
        name: "agent-canvas-acp-model-drift-check",
        version: "0.0.0",
      },
    });
    if (init.error) {
      throw new Error(
        `${provider.key} initialize failed: ${JSON.stringify(init.error)}`,
      );
    }

    const session = await request("session/new", {
      cwd: workspace,
      mcpServers: [],
    });
    if (session.error) {
      throw new Error(
        `${provider.key} session/new failed: ${JSON.stringify(session.error)}`,
      );
    }

    const models = session.result?.models?.availableModels;
    if (!Array.isArray(models)) {
      throw new Error(
        `${provider.key} did not return models.availableModels from session/new`,
      );
    }

    if (session.result?.sessionId) {
      await request("session/close", {
        sessionId: session.result.sessionId,
      }).catch(() => undefined);
    }

    return models;
  } finally {
    await terminateProcessGroup(child);
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function compareModelIds(provider, runtimeModels) {
  const ignored = runtimeModels.filter(isGenericDefaultModel);
  const actual = runtimeModels
    .filter((model) => !isGenericDefaultModel(model))
    .map((model) => ({
      id: model.modelId,
      label: model.name,
    }));
  const expected = provider.available_models;
  const actualIds = actual.map((model) => model.id);
  const expectedIds = expected.map((model) => model.id);
  const missing = actualIds.filter((id) => !expectedIds.includes(id));
  const extra = expectedIds.filter((id) => !actualIds.includes(id));
  const orderMatches =
    actualIds.length === expectedIds.length &&
    actualIds.every((id, index) => id === expectedIds[index]);

  return {
    ok: missing.length === 0 && extra.length === 0 && orderMatches,
    actual,
    actualIds,
    expected,
    expectedIds,
    extra,
    ignored,
    missing,
    orderMatches,
  };
}

function formatList(values) {
  return values.length > 0
    ? values.map((value) => `    - ${value}`).join("\n")
    : "    (none)";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    showHelp();
    return;
  }

  const selected = new Set(args.providers);
  const providers = parseCanvasProviders(args.tsFile).filter(
    (provider) => selected.size === 0 || selected.has(provider.key),
  );

  if (providers.length === 0) {
    throw new Error(
      selected.size > 0
        ? `No matching providers found: ${[...selected].join(", ")}`
        : "No providers with available_models found",
    );
  }

  process.stderr.write(
    `${colors.cyan}ACP Provider Models Sync Check${colors.reset}\n`,
  );

  const failures = [];

  for (const provider of providers) {
    process.stderr.write(
      `${colors.dim}- ${provider.key}: launching ${provider.default_command.join(" ")}${colors.reset}\n`,
    );

    const runtimeModels = await fetchRuntimeModels(provider, args.timeoutMs);
    const result = compareModelIds(provider, runtimeModels);

    if (result.ok) {
      const ignoredText =
        result.ignored.length > 0
          ? `; ignored ${result.ignored.length} default placeholder(s)`
          : "";
      process.stderr.write(
        `  ${colors.green}ok${colors.reset} ${result.expectedIds.length} model(s)${ignoredText}\n`,
      );
      continue;
    }

    failures.push({ provider, result });
    process.stderr.write(`  ${colors.red}drift detected${colors.reset}\n`);
    if (result.missing.length > 0) {
      process.stderr.write(
        `  ${colors.yellow}Missing from Canvas:${colors.reset}\n${formatList(result.missing)}\n`,
      );
    }
    if (result.extra.length > 0) {
      process.stderr.write(
        `  ${colors.yellow}Extra in Canvas:${colors.reset}\n${formatList(result.extra)}\n`,
      );
    }
    if (
      !result.orderMatches &&
      result.missing.length === 0 &&
      result.extra.length === 0
    ) {
      process.stderr.write(
        `  ${colors.yellow}Order differs.${colors.reset}\n` +
          `  Runtime:\n${formatList(result.actualIds)}\n` +
          `  Canvas:\n${formatList(result.expectedIds)}\n`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} ACP provider model list(s) drifted from their subprocess-advertised availableModels`,
    );
  }

  process.stderr.write(
    `${colors.green}Canvas ACP model suggestions match the ACP subprocess-advertised model IDs.${colors.reset}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${colors.red}ERROR:${colors.reset} ${error.message}\n`);
  process.exitCode = 1;
});
