// @vitest-environment node
//
// Drift-detection: documented agent-server version examples must match the
// authoritative `versions.agentServer` pin in `config/defaults.json`.
//
// PR #670 bumped the central pin to 1.23.0 but left stale `1.22.1` examples in
// AGENTS.md and several script JSDocs. This test fails when those references
// drift from the central pin so the next bump cannot silently leave docs
// behind.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf-8");
}

const config = JSON.parse(read("config/defaults.json")) as {
  versions: { agentServer: string };
};
const v = config.versions.agentServer;

describe("docs/example references stay in sync with config/defaults.json", () => {
  it("AGENTS.md documents the current default version", () => {
    const agentsMd = read("AGENTS.md");
    expect(agentsMd).toContain(
      `\`OH_AGENT_SERVER_VERSION\` — specific PyPI version (e.g., "${v}")`,
    );
    expect(agentsMd).toContain(
      `Default: released PyPI version \`${v}\` for agent-server SDK libraries`,
    );
  });

  it("scripts/dev-safe.mjs JSDoc example matches the current default", () => {
    const devSafe = read("scripts/dev-safe.mjs");
    expect(devSafe).toContain(
      `OH_AGENT_SERVER_VERSION: Specific PyPI version (e.g., "${v}")`,
    );
  });

  it("scripts/check-sdk-version-sync.mjs examples match the current default", () => {
    const src = read("scripts/check-sdk-version-sync.mjs");
    expect(src).toContain(`EXPECTED_SDK_VERSION=${v}`);
    expect(src).toContain(`"version": "${v}"`);
    expect(src).toContain(`"openhands-sdk>=${v},<2.0.0"`);
    expect(src).toContain(`"openhands-tools==${v}"`);
    expect(src).toContain(`"openhands-workspace (>=${v})"`);
    expect(src).toContain(
      `">=${v}", "==${v}", "(>=${v})", "~=${v}"`,
    );
  });

  it("scripts/check-acp-providers-sync.mjs --sdk-ref example matches the current default", () => {
    const src = read("scripts/check-acp-providers-sync.mjs");
    expect(src).toContain(`--sdk-ref v${v}`);
  });
});
