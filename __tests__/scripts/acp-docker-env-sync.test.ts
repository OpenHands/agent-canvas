// @vitest-environment node
//
// Drift-detection: the examples/acp-docker quickstart must inherit its
// agent-server image from the single source of truth (config/defaults.json)
// instead of hardcoding a version that silently falls below the Canvas
// compatibility floor (compatibility.minimumAgentServer).
//
// Before this guard, examples/acp-docker/docker-compose.yml pinned
// `1.25.0-python` directly. When defaults.json bumped the compatibility floor
// to 1.28.0, the example default started rendering "Disconnected — requires
// 1.28.0 or newer". This test fails if the generator's pinned tag drifts from
// versions.agentServer, if the no-config compose fallback stops using
// `latest-python`, or if the pinned version ever falls below the floor.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  computeAgentServerImage,
  renderEnvLine,
  upsertEnvLine,
} from "../../scripts/gen-acp-docker-env.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf-8");
}

const config = JSON.parse(read("config/defaults.json")) as {
  images: { agentServer: string };
  versions: { agentServer: string };
  compatibility: { minimumAgentServer: string };
};

const pinnedImage = `${config.images.agentServer}:${config.versions.agentServer}-python`;

// Numeric-semver comparison. Throws (rather than silently comparing NaN) if a
// pin carries a non-numeric segment — these defaults.json fields are dotted
// numeric version pins, so a sha or pre-release tag landing here is a config
// error the floor check should surface loudly.
function parseSemver(v: string): number[] {
  if (!/^\d+(\.\d+)*$/.test(v)) {
    throw new Error(`expected a dotted numeric version, got "${v}"`);
  }
  return v.split(".").map(Number);
}

function gte(a: string, b: string): boolean {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db;
  }
  return true;
}

describe("examples/acp-docker stays in sync with config/defaults.json", () => {
  it("computeAgentServerImage derives the pinned SoT tag", () => {
    expect(computeAgentServerImage(config)).toBe(pinnedImage);
  });

  it("renders the AGENT_SERVER_IMAGE line with the pinned tag", () => {
    expect(renderEnvLine(config)).toBe(`AGENT_SERVER_IMAGE=${pinnedImage}`);
  });

  it("the pinned SoT version satisfies the Canvas compatibility floor", () => {
    expect(
      gte(config.versions.agentServer, config.compatibility.minimumAgentServer),
    ).toBe(true);
  });

  it("the no-config compose fallback uses the SoT registry with the latest-python tag", () => {
    const compose = read("examples/acp-docker/docker-compose.yml");
    const match = compose.match(/AGENT_SERVER_IMAGE:-([^}]+)\}/);
    expect(match?.[1]).toBe(`${config.images.agentServer}:latest-python`);
  });
});

describe("upsertEnvLine", () => {
  const line =
    "AGENT_SERVER_IMAGE=ghcr.io/openhands/agent-server:1.28.1-python";

  it("appends the line to an empty file", () => {
    expect(upsertEnvLine("", line)).toBe(`${line}\n`);
  });

  it("replaces an existing assignment in place, preserving other lines", () => {
    const existing =
      "SESSION_API_KEY=abc\n" +
      "AGENT_SERVER_IMAGE=ghcr.io/openhands/agent-server:1.25.0-python\n" +
      "CLAUDE_CODE_OAUTH_TOKEN=zzz\n";
    expect(upsertEnvLine(existing, line)).toBe(
      `SESSION_API_KEY=abc\n${line}\nCLAUDE_CODE_OAUTH_TOKEN=zzz\n`,
    );
  });

  it("is idempotent — re-running yields one assignment, unchanged content", () => {
    const once = upsertEnvLine("", line);
    expect(upsertEnvLine(once, line)).toBe(once);
    expect(once.match(/^AGENT_SERVER_IMAGE=/gm)?.length).toBe(1);
  });

  it("treats a commented template line as documentation and appends the real value", () => {
    // .env.example ships `# AGENT_SERVER_IMAGE=...` as a documented knob; after
    // `cp .env.example .env` the comment stays and the generator adds the value.
    const existing =
      "# AGENT_SERVER_IMAGE=ghcr.io/openhands/agent-server:latest-python\n";
    expect(upsertEnvLine(existing, line)).toBe(
      `${existing.trimEnd()}\n${line}\n`,
    );
  });

  it("throws rather than rewrite every line when given a keyless line", () => {
    expect(() => upsertEnvLine("FOO=bar\n", "novalue")).toThrow();
  });
});
