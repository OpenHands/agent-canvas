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

function gte(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
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

  it("the no-config compose fallback uses latest-python (never below the floor)", () => {
    const compose = read("examples/acp-docker/docker-compose.yml");
    const match = compose.match(/AGENT_SERVER_IMAGE:-([^}]+)\}/);
    expect(match?.[1]).toBe("ghcr.io/openhands/agent-server:latest-python");
  });
});
