#!/usr/bin/env node

/**
 * Check ACP Providers Sync
 *
 * Verifies the canvas TypeScript mirror in ``src/constants/acp-providers.ts``
 * stays in lockstep with the Python source of truth at
 * ``openhands-sdk/openhands/sdk/settings/acp_providers.py`` in
 * https://github.com/OpenHands/software-agent-sdk.
 *
 * Why this exists (#587): the registries can drift silently and the failure
 * mode is invisible — a stale ``default_command`` spawns a CLI that doesn't
 * speak ACP and the agent-server deadlocks on the handshake (we shipped
 * ``["npx","-y","@openai/codex","acp"]`` once and it took an E2E session to
 * find). This check fails CI before that ships.
 *
 * Compared fields (the subset the TS mirror actually carries):
 *   - key
 *   - display_name
 *   - default_command
 *
 * The richer SDK record (api_key_env_var, base_url_env_var, session mode,
 * agent_name_patterns, supports_set_session_model, session_meta_key) is
 * intentionally NOT mirrored on the canvas side — canvas only uses this
 * registry in Settings → Agent + onboarding tile rendering. Those fields
 * live in the SDK because ``ACPAgent`` reads them at spawn time inside
 * the agent-server, where canvas never runs.
 *
 * Usage:
 *   node scripts/check-acp-providers-sync.mjs
 *   node scripts/check-acp-providers-sync.mjs --sdk-ref v1.23.0
 *   node scripts/check-acp-providers-sync.mjs --sdk-file /path/to/acp_providers.py
 *
 * Options:
 *   --sdk-ref <ref>     Git ref in OpenHands/software-agent-sdk to fetch
 *                       acp_providers.py from. Default: ``main``. Also
 *                       overridable via ``ACP_SDK_REF`` env var.
 *   --sdk-repo <owner/name>   Override the SDK repo (default
 *                             ``OpenHands/software-agent-sdk``).
 *   --sdk-file <path>   Read the Python source from a local file instead
 *                       of GitHub. Wins over --sdk-ref. Useful for testing
 *                       offline or against a local SDK checkout.
 *   --ts-file <path>    Override the TS mirror path (default
 *                       ``src/constants/acp-providers.ts``).
 *   --json              Emit a machine-readable summary on stdout
 *                       (the human-readable report still goes to stderr).
 *   --help, -h          Show help.
 *
 * Exit codes:
 *   0 — Registries match on the compared fields.
 *   1 — Drift detected, or parse/fetch error.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const DEFAULT_SDK_REPO = "OpenHands/software-agent-sdk";
const DEFAULT_SDK_PATH =
  "openhands-sdk/openhands/sdk/settings/acp_providers.py";
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
    sdkFile: null,
    sdkRef: process.env.ACP_SDK_REF || "main",
    sdkRepo: DEFAULT_SDK_REPO,
    tsFile: DEFAULT_TS_PATH,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--sdk-file") args.sdkFile = argv[++i];
    else if (a === "--sdk-ref") args.sdkRef = argv[++i];
    else if (a === "--sdk-repo") args.sdkRepo = argv[++i];
    else if (a === "--ts-file") args.tsFile = argv[++i];
    else if (a === "--json") args.json = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function showHelp() {
  process.stdout.write(
    `\nACP Providers Sync Check\n\n` +
      `Verifies that src/constants/acp-providers.ts matches the SDK's\n` +
      `acp_providers.py on the fields canvas mirrors (key, display_name,\n` +
      `default_command).\n\n` +
      `Usage:\n` +
      `  node scripts/check-acp-providers-sync.mjs [options]\n\n` +
      `Options:\n` +
      `  --sdk-ref <ref>           Git ref to fetch from (default: main, env ACP_SDK_REF)\n` +
      `  --sdk-repo <owner/name>   Override SDK repo (default: ${DEFAULT_SDK_REPO})\n` +
      `  --sdk-file <path>         Read Python source from a local path instead\n` +
      `  --ts-file <path>          Override TS mirror path\n` +
      `  --json                    Emit JSON summary on stdout\n` +
      `  --help, -h                Show this help\n\n` +
      `Exit codes: 0 = in sync, 1 = drift or error.\n\n`,
  );
}

/**
 * String-aware brace matcher. Skips characters inside ``"…"`` / ``'…'``
 * (with backslash escapes), Python triple-quoted strings, ``#`` line
 * comments, and JS ``//`` / ``/* … *\/`` comments — anywhere we know
 * the source file might legitimately contain the delimiter without
 * meaning a real depth change. Returns the index of the matching close
 * delimiter or -1 if none.
 */
function findMatchingDelimiter(source, openIdx, open, close) {
  let depth = 0;
  let i = openIdx;
  while (i < source.length) {
    const c = source[i];
    // Python triple-quoted strings.
    if (
      (c === '"' || c === "'") &&
      source[i + 1] === c &&
      source[i + 2] === c
    ) {
      const q = c;
      i += 3;
      while (i < source.length - 2) {
        if (source[i] === q && source[i + 1] === q && source[i + 2] === q) {
          i += 3;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < source.length) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === "#") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (
        i < source.length - 1 &&
        !(source[i] === "*" && source[i + 1] === "/")
      )
        i++;
      i += 2;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** Extract the contents of every double-quoted string literal in ``s``, in order. */
function extractStringList(s) {
  const out = [];
  const re = /"((?:\\.|[^"\\])*)"/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    // Resolve the common escapes we might see in command tokens.
    out.push(m[1].replace(/\\(.)/g, "$1"));
  }
  return out;
}

/**
 * Parse the SDK Python source and return one record per provider entry:
 *   { mapKey, key, display_name, default_command }
 *
 * ``mapKey`` is the outer mapping key (``"claude-code"`` in the example
 * below); ``key`` is the ``key=...`` argument inside ``ACPProviderInfo``.
 * They should always agree in practice, but we surface them separately
 * so a drift between them is caught as a field mismatch rather than
 * silently dropped.
 *
 * Expected shape:
 *   ACP_PROVIDERS: Mapping[str, ACPProviderInfo] = MappingProxyType(
 *       {
 *           "claude-code": ACPProviderInfo(
 *               key="claude-code",
 *               display_name="Claude Code",
 *               default_command=("npx", "-y", "@…"),
 *               …
 *           ),
 *           …
 *       }
 *   )
 */
export function parsePython(source) {
  const startMatch = source.match(
    /ACP_PROVIDERS\s*:\s*Mapping[^=]*=\s*MappingProxyType\s*\(\s*\{/,
  );
  if (!startMatch) {
    throw new Error(
      "Could not find `ACP_PROVIDERS: Mapping[...] = MappingProxyType({...})` in Python source",
    );
  }
  const braceIdx = startMatch.index + startMatch[0].length - 1;
  const mapEnd = findMatchingDelimiter(source, braceIdx, "{", "}");
  if (mapEnd === -1)
    throw new Error("Unclosed `ACP_PROVIDERS` mapping literal");
  const body = source.slice(braceIdx + 1, mapEnd);

  const records = [];
  const reEntry = /"([^"]+)"\s*:\s*ACPProviderInfo\s*\(/g;
  let m;
  while ((m = reEntry.exec(body)) !== null) {
    const mapKey = m[1];
    const parenStart = m.index + m[0].length - 1;
    const parenEnd = findMatchingDelimiter(body, parenStart, "(", ")");
    if (parenEnd === -1)
      throw new Error(`Unclosed ACPProviderInfo(...) for ${mapKey}`);
    const inner = body.slice(parenStart + 1, parenEnd);

    const keyMatch = inner.match(/\bkey\s*=\s*"([^"]+)"/);
    const dnMatch = inner.match(/\bdisplay_name\s*=\s*"([^"]+)"/);
    if (!keyMatch || !dnMatch) {
      throw new Error(
        `Failed to parse key/display_name for Python provider ${mapKey}`,
      );
    }
    // default_command is a tuple — match the keyword then balance the opening `(`.
    const dcKwMatch = inner.match(/\bdefault_command\s*=\s*\(/);
    if (!dcKwMatch) {
      throw new Error(
        `Failed to find default_command tuple for Python provider ${mapKey}`,
      );
    }
    const dcOpen = dcKwMatch.index + dcKwMatch[0].length - 1;
    const dcClose = findMatchingDelimiter(inner, dcOpen, "(", ")");
    if (dcClose === -1)
      throw new Error(`Unclosed default_command tuple for ${mapKey}`);
    const default_command = extractStringList(inner.slice(dcOpen + 1, dcClose));

    records.push({
      mapKey,
      key: keyMatch[1],
      display_name: dnMatch[1],
      default_command,
    });
  }
  if (records.length === 0) {
    throw new Error("No ACPProviderInfo entries found in Python source");
  }
  return records;
}

/**
 * Parse ``export const ACP_PROVIDERS: ACPProviderConfig[] = [...]`` and
 * return one record per object literal:
 *   { key, display_name, default_command }
 */
export function parseTypeScript(source) {
  const m = source.match(
    /export\s+const\s+ACP_PROVIDERS\s*:\s*ACPProviderConfig\[\]\s*=\s*\[/,
  );
  if (!m) {
    throw new Error(
      "Could not find `export const ACP_PROVIDERS: ACPProviderConfig[] = [...]` in TS mirror",
    );
  }
  const bracketIdx = m.index + m[0].length - 1;
  const arrEnd = findMatchingDelimiter(source, bracketIdx, "[", "]");
  if (arrEnd === -1) throw new Error("Unclosed ACP_PROVIDERS array literal");
  const body = source.slice(bracketIdx + 1, arrEnd);

  // Walk the array body and split out each top-level `{...}` literal.
  const objects = [];
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === "{") {
      const close = findMatchingDelimiter(body, i, "{", "}");
      if (close === -1)
        throw new Error("Unclosed object literal in ACP_PROVIDERS");
      objects.push(body.slice(i + 1, close));
      i = close + 1;
    } else {
      i++;
    }
  }

  return objects.map((inner) => {
    const keyMatch = inner.match(/\bkey\s*:\s*"([^"]+)"/);
    const dnMatch = inner.match(/\bdisplay_name\s*:\s*"([^"]+)"/);
    const dcKwMatch = inner.match(/\bdefault_command\s*:\s*\[/);
    if (!keyMatch || !dnMatch || !dcKwMatch) {
      throw new Error(
        "Failed to parse key / display_name / default_command in TS provider entry",
      );
    }
    const dcOpen = dcKwMatch.index + dcKwMatch[0].length - 1;
    const dcClose = findMatchingDelimiter(inner, dcOpen, "[", "]");
    if (dcClose === -1)
      throw new Error("Unclosed default_command array in TS provider entry");
    const default_command = extractStringList(inner.slice(dcOpen + 1, dcClose));
    return { key: keyMatch[1], display_name: dnMatch[1], default_command };
  });
}

export function diffRegistries(pyRecs, tsRecs) {
  const pyByKey = new Map();
  for (const r of pyRecs) pyByKey.set(r.key, r);
  const tsByKey = new Map();
  for (const r of tsRecs) tsByKey.set(r.key, r);

  const issues = [];

  // Order-of-keys drift is worth flagging: the SDK iterates ACP_PROVIDERS in
  // insertion order for agent-name detection, and the onboarding tile list
  // surfaces providers in TS order. A reorder shouldn't break correctness,
  // but does mean the two files no longer mean exactly the same thing.
  const pyOrder = pyRecs.map((r) => r.key).join(",");
  const tsOrder = tsRecs.map((r) => r.key).join(",");
  if (pyOrder !== tsOrder) {
    issues.push({
      kind: "order-mismatch",
      py: pyRecs.map((r) => r.key),
      ts: tsRecs.map((r) => r.key),
    });
  }

  for (const r of pyRecs) {
    if (r.mapKey !== r.key) {
      issues.push({
        kind: "python-internal-mismatch",
        key: r.key,
        mapKey: r.mapKey,
      });
    }
  }

  for (const key of pyByKey.keys()) {
    if (!tsByKey.has(key)) {
      issues.push({ kind: "missing-in-ts", key, py: pyByKey.get(key) });
    }
  }
  for (const key of tsByKey.keys()) {
    if (!pyByKey.has(key)) {
      issues.push({ kind: "missing-in-py", key, ts: tsByKey.get(key) });
    }
  }
  for (const [key, py] of pyByKey) {
    const ts = tsByKey.get(key);
    if (!ts) continue;
    if (py.display_name !== ts.display_name) {
      issues.push({
        kind: "field-mismatch",
        key,
        field: "display_name",
        py: py.display_name,
        ts: ts.display_name,
      });
    }
    const pyCmd = JSON.stringify(py.default_command);
    const tsCmd = JSON.stringify(ts.default_command);
    if (pyCmd !== tsCmd) {
      issues.push({
        kind: "field-mismatch",
        key,
        field: "default_command",
        py: py.default_command,
        ts: ts.default_command,
      });
    }
  }

  return issues;
}

async function fetchSdkSource({ sdkFile, sdkRef, sdkRepo }) {
  if (sdkFile) {
    return {
      source: readFileSync(resolve(sdkFile), "utf8"),
      origin: `file:${sdkFile}`,
    };
  }
  const url = `https://raw.githubusercontent.com/${sdkRepo}/${sdkRef}/${DEFAULT_SDK_PATH}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}. ` +
        `Verify --sdk-ref names a branch or tag in ${sdkRepo}.`,
    );
  }
  return { source: await res.text(), origin: url };
}

function log(...parts) {
  process.stderr.write(parts.join(" ") + "\n");
}

function formatIssue(i) {
  if (i.kind === "missing-in-ts") {
    return (
      `  ${colors.red}+ ${i.key}${colors.reset} present in SDK, missing in TS mirror\n` +
      `      ${colors.dim}display_name:    ${JSON.stringify(i.py.display_name)}${colors.reset}\n` +
      `      ${colors.dim}default_command: ${JSON.stringify(i.py.default_command)}${colors.reset}`
    );
  }
  if (i.kind === "missing-in-py") {
    return (
      `  ${colors.red}- ${i.key}${colors.reset} present in TS mirror, missing in SDK\n` +
      `      ${colors.dim}default_command: ${JSON.stringify(i.ts.default_command)}${colors.reset}`
    );
  }
  if (i.kind === "field-mismatch") {
    const pyStr =
      typeof i.py === "string" ? JSON.stringify(i.py) : JSON.stringify(i.py);
    const tsStr =
      typeof i.ts === "string" ? JSON.stringify(i.ts) : JSON.stringify(i.ts);
    return (
      `  ${colors.red}~ ${i.key}.${i.field}${colors.reset}\n` +
      `      SDK: ${colors.green}${pyStr}${colors.reset}\n` +
      `      TS:  ${colors.yellow}${tsStr}${colors.reset}`
    );
  }
  if (i.kind === "order-mismatch") {
    return (
      `  ${colors.red}# provider order differs${colors.reset}\n` +
      `      SDK: ${colors.green}${i.py.join(", ")}${colors.reset}\n` +
      `      TS:  ${colors.yellow}${i.ts.join(", ")}${colors.reset}`
    );
  }
  if (i.kind === "python-internal-mismatch") {
    return (
      `  ${colors.red}~ Python mapping key vs ACPProviderInfo.key disagree${colors.reset}\n` +
      `      mapping key:           ${colors.yellow}${i.mapKey}${colors.reset}\n` +
      `      ACPProviderInfo.key:   ${colors.green}${i.key}${colors.reset}\n` +
      `      (fix this in the SDK, not in canvas.)`
    );
  }
  return `  unknown issue ${JSON.stringify(i)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    showHelp();
    return;
  }

  log("");
  log(`${colors.cyan}ACP Providers Sync Check${colors.reset}`);
  log("─".repeat(50));
  log("");

  const tsSource = readFileSync(args.tsFile, "utf8");
  const { source: pySource, origin: pyOrigin } = await fetchSdkSource(args);

  log(`SDK source: ${colors.dim}${pyOrigin}${colors.reset}`);
  log(`TS mirror:  ${colors.dim}${args.tsFile}${colors.reset}`);
  log("");

  const pyRecs = parsePython(pySource);
  const tsRecs = parseTypeScript(tsSource);

  log(`Python providers: ${pyRecs.length}`);
  log(`TS     providers: ${tsRecs.length}`);
  log("");

  const issues = diffRegistries(pyRecs, tsRecs);

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          in_sync: issues.length === 0,
          sdk_origin: pyOrigin,
          ts_path: args.tsFile,
          python_providers: pyRecs,
          ts_providers: tsRecs,
          issues,
        },
        null,
        2,
      ) + "\n",
    );
  }

  if (issues.length === 0) {
    log(
      `${colors.green}✓ Canvas ACP_PROVIDERS is in sync with the SDK on the mirrored fields.${colors.reset}`,
    );
    log("");
    return;
  }

  log(
    `${colors.red}✗ Drift detected (${issues.length} issue${
      issues.length === 1 ? "" : "s"
    }):${colors.reset}`,
  );
  log("");
  for (const i of issues) log(formatIssue(i));
  log("");
  log(
    `Update ${colors.cyan}src/constants/acp-providers.ts${colors.reset} to match the SDK,`,
  );
  log(
    `or — if the SDK changed intentionally — bump ${colors.cyan}@openhands/typescript-client${colors.reset}`,
  );
  log(`and re-run this check before merging.`);
  log("");
  process.exit(1);
}

// Only run main() when invoked as the entry script — importing the module
// (e.g. from tests) shouldn't hit the SDK or read the TS mirror.
const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    log(`${colors.red}Error: ${err.message}${colors.reset}`);
    process.exit(1);
  });
}
