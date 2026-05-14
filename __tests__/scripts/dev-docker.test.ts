import { describe, expect, it } from "vitest";

import {
  CONTAINER_WORKSPACES_DIR,
  isDockerPermissionDenied,
} from "../../scripts/dev-docker.mjs";

describe("CONTAINER_WORKSPACES_DIR", () => {
  it("points at the dockerized agent-server's in-container persistence dir so the working_dir the GUI sends is one the container can mkdir (regression guard for the host-path leak that caused 500 on POST /api/conversations)", () => {
    expect(CONTAINER_WORKSPACES_DIR).toBe(
      "/home/openhands/.openhands/agent-canvas/workspaces",
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
