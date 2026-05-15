// @vitest-environment node
import { once } from "node:events";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

async function runCli(args: string[]) {
  const child = spawn(process.execPath, ["bin/agent-canvas.mjs", ...args], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const [code] = await once(child, "exit");
  return { code, output };
}

describe("agent-canvas CLI", () => {
  it("documents the openhands command and split service modes", async () => {
    const result = await runCli(["--help"]);

    expect(result.code).toBe(0);
    expect(result.output).toContain("openhands [options]");
    expect(result.output).toContain("openhands --backend-only");
    expect(result.output).toContain("openhands --frontend-only");
    expect(result.output).toContain("--backend-url");
    expect(result.output).toContain("PROJECT_PATH");
  });

  it("rejects mutually exclusive split modes before checking prerequisites", async () => {
    const result = await runCli(["--backend-only", "--frontend-only"]);

    expect(result.code).toBe(1);
    expect(result.output).toContain(
      "Choose only one of --backend-only or --frontend-only.",
    );
  });
});
