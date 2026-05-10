import { describe, expect, it } from "vitest";

import { CONTAINER_WORKSPACES_DIR } from "../../scripts/dev-docker.mjs";

describe("CONTAINER_WORKSPACES_DIR", () => {
  it("points at the dockerized agent-server's in-container persistence dir so the working_dir the GUI sends is one the container can mkdir (regression guard for the host-path leak that caused 500 on POST /api/conversations)", () => {
    expect(CONTAINER_WORKSPACES_DIR).toBe(
      "/home/openhands/.openhands/agent-canvas/workspaces",
    );
  });
});
