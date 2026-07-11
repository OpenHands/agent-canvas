import { spawn } from "node:child_process";
import { once } from "node:events";
import { describe, expect, it } from "vitest";

import {
  getProcessTreeSpawnOptions,
  isProcessRunning,
} from "../../scripts/dev-process-utils.mjs";

describe("dev process utils", () => {
  it("treats a signaled but unexited process as still running", () => {
    expect(
      isProcessRunning({
        exitCode: null,
        signalCode: null,
        killed: true,
      }),
    ).toBe(true);
  });

  it("treats exited or signaled processes as stopped", () => {
    expect(isProcessRunning({ exitCode: 0, signalCode: null })).toBe(false);
    expect(isProcessRunning({ exitCode: null, signalCode: "SIGTERM" })).toBe(
      false,
    );
  });

  it("sets detached mode according to the platform for process-group cleanup", () => {
    expect(getProcessTreeSpawnOptions({ cwd: "/tmp" })).toMatchObject({
      cwd: "/tmp",
      detached: process.platform !== "win32",
    });
  });

  it("passes shell metacharacters to services as literal arguments", async () => {
    const constraint = "agent-client-protocol<0.11";
    const child = spawn(
      process.execPath,
      ["-e", "process.stdout.write(process.argv[1])", constraint],
      getProcessTreeSpawnOptions({
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    const [exitCode] = await once(child, "exit");

    expect(exitCode).toBe(0);
    expect(stdout).toBe(constraint);
  });
});
