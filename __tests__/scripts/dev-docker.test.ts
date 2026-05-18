// @vitest-environment node
// These tests load `scripts/dev-docker.mjs`, which constructs file:// URLs
// relative to its own location via `new URL("../tools", import.meta.url)`.
// jsdom's URL constructor ignores file:// base URLs (it falls back to its
// document base, e.g. http://localhost:3000/), breaking that resolution;
// the Node environment has the standard WHATWG URL behavior that honors
// the file:// base.
import { describe, expect, it } from "vitest";

import {
  CONTAINER_HOME_DIR,
  CONTAINER_OPENHANDS_DIR,
  CONTAINER_WORKSPACES_DIR,
  getDockerHomeTmpfsArgs,
  getDockerUserArgs,
  getHostDockerUserSpec,
  getProjectsPathDockerArgs,
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

  it("mounts a writable, executable tmpfs home for the mapped host user", () => {
    // `exec` is critical: docker's --tmpfs default is rw,noexec,nosuid,nodev,
    // which breaks stdio MCP servers that exec binaries cached under ~/.npm
    // (e.g. `npx -y @modelcontextprotocol/server-github`). We keep `nosuid`
    // and `nodev` as defense-in-depth -- $HOME has no business hosting
    // setuid binaries or device nodes -- but the `noexec` default has to go.
    expect(getDockerHomeTmpfsArgs("1000:1000")).toEqual([
      "--tmpfs",
      "/home/openhands:exec,nosuid,nodev,uid=1000,gid=1000,mode=700",
    ]);
    expect(getDockerHomeTmpfsArgs(null)).toEqual([]);
  });
});

describe("getProjectsPathDockerArgs", () => {
  it("uses PROJECTS_PATH for the /projects bind mount", () => {
    expect(
      getProjectsPathDockerArgs({ PROJECTS_PATH: "/host/projects" }),
    ).toEqual(["-v", "/host/projects:/projects"]);
  });

  it("does not read the old PROJECT_PATH name", () => {
    expect(getProjectsPathDockerArgs({ PROJECT_PATH: "/host/projects" })).toEqual(
      [],
    );
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
