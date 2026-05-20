// @vitest-environment node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("agent-canvas CLI", () => {
  it("shows usage info in --help output", async () => {
    const child = spawn(process.execPath, ["bin/agent-canvas.mjs", "--help"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const [code] = await once(child, "exit");

    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("@openhands/agent-canvas");
    expect(stdout).toContain("USAGE:");
    expect(stdout).toContain("--help");
  });
});
