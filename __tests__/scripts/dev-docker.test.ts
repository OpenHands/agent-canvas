import { describe, expect, it } from "vitest";

import {
  CONTAINER_HOME_DIR,
  CONTAINER_OPENHANDS_DIR,
  CONTAINER_WORKSPACES_DIR,
  getDockerHomeTmpfsArgs,
  getDockerUserArgs,
  getHostDockerUserSpec,
  isDockerPermissionDenied,
} from "../../scripts/dev-docker.mjs";

describe("CONTAINER_WORKSPACES_DIR", () => {
  it("points at the dockerized agent-server's in-container persistence dir so the working_dir the GUI sends is one the container can mkdir (regression guard for the host-path leak that caused 500 on POST /api/conversations)", () => {
    expect(CONTAINER_WORKSPACES_DIR).toBe(
      "/home/openhands/.openhands/agent-canvas/workspaces",
    );
  });
});

describe("docker host user", () => {
  it("uses the current host uid/gid when the platform exposes them", () => {
    if (
      typeof process.getuid !== "function" ||
      typeof process.getgid !== "function"
    ) {
      expect(getHostDockerUserSpec()).toBeNull();
      return;
    }

    expect(getHostDockerUserSpec()).toBe(
      `${process.getuid()}:${process.getgid()}`,
    );
  });

  it("keeps docker persistence under the standard agent home", () => {
    expect(CONTAINER_HOME_DIR).toBe("/home/openhands");
    expect(CONTAINER_OPENHANDS_DIR).toBe("/home/openhands/.openhands");
  });

  it("adds --user when a host uid/gid is available", () => {
    expect(getDockerUserArgs("1000:1000")).toEqual(["--user", "1000:1000"]);
    expect(getDockerUserArgs(null)).toEqual([]);
  });

  it("mounts a writable tmpfs home for the mapped host user", () => {
    expect(getDockerHomeTmpfsArgs("1000:1000")).toEqual([
      "--tmpfs",
      "/home/openhands:uid=1000,gid=1000,mode=700",
    ]);
    expect(getDockerHomeTmpfsArgs(null)).toEqual([]);
  });
});

describe("isDockerPermissionDenied", () => {
  it("detects Linux docker socket permission failures", () => {
    expect(
      isDockerPermissionDenied(
        "permission denied while trying to connect to the docker API at unix:///var/run/docker.sock",
      ),
    ).toBe(true);
  });

  it("does not treat a missing daemon as a permission failure", () => {
    expect(
      isDockerPermissionDenied(
        "failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running",
      ),
    ).toBe(false);
  });
});
