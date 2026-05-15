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
});
