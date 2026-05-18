// @vitest-environment node
import { EventEmitter } from "node:events";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { spawnMock, spawnSyncMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  spawnSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  spawnSync: spawnSyncMock,
}));

describe("setup-server Docker backend", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    spawnSyncMock.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === "inspect") {
        return { status: 1, stdout: Buffer.from("") };
      }
      return { status: 0, stdout: Buffer.from("") };
    });
    spawnMock.mockReturnValue(Object.assign(new EventEmitter(), { kill: vi.fn() }));
  });

  it("mounts canvas tools and exposes them on the container Python path", async () => {
    const {
      startDockerBackend,
      CONTAINER_CANVAS_TOOLS_DIR,
      HOST_CANVAS_TOOLS_DIR,
    } = await import("../../scripts/setup-server.mjs");

    startDockerBackend("/Users/test/project", {
      sessionApiKey: "session-key",
    });

    expect(spawnMock).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining([
        "-v",
        `${HOST_CANVAS_TOOLS_DIR}:${CONTAINER_CANVAS_TOOLS_DIR}:ro`,
        "-e",
        `OH_EXTRA_PYTHON_PATH=${CONTAINER_CANVAS_TOOLS_DIR}`,
        "-e",
        "OH_SESSION_API_KEYS_0=session-key",
      ]),
      expect.any(Object),
    );
  });
});
