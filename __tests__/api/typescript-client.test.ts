import { describe, expect, it, vi } from "vitest";

import { createRemoteWorkspace } from "#/api/typescript-client";

vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: () => ({
    backend: {
      kind: "local",
      host: "http://127.0.0.1:18000",
      apiKey: "default-key",
    },
  }),
  getEffectiveLocalBackend: () => ({
    kind: "local",
    host: "http://127.0.0.1:18000",
    apiKey: "default-key",
  }),
}));

vi.mock("#/api/agent-server-config", () => ({
  getAgentServerWorkingDir: () => "/workspace/project",
}));

function httpResponse<T>(data: T) {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
  };
}

describe("createRemoteWorkspace", () => {
  it("passes git ref options to the runtime git changes endpoint", async () => {
    const workspace = createRemoteWorkspace({
      host: "http://agent.example.com",
      apiKey: "session-key",
      workingDir: "/workspace/project",
    });
    const getMock = vi
      .spyOn(workspace.client, "get")
      .mockResolvedValue(httpResponse([]));

    await workspace.gitChanges("/workspace/project", { ref: "HEAD" });

    expect(getMock).toHaveBeenCalledWith("/api/git/changes", {
      params: {
        path: "/workspace/project",
        ref: "HEAD",
      },
    });
  });

  it("passes git ref options to the runtime git diff endpoint", async () => {
    const workspace = createRemoteWorkspace({
      host: "http://agent.example.com",
      apiKey: "session-key",
      workingDir: "/workspace/project",
    });
    const getMock = vi
      .spyOn(workspace.client, "get")
      .mockResolvedValue(httpResponse({ diff: "diff content" }));

    await workspace.gitDiff("/workspace/project/file.ts", {
      ref: "HEAD",
    });

    expect(getMock).toHaveBeenCalledWith("/api/git/diff", {
      params: {
        path: "/workspace/project/file.ts",
        ref: "HEAD",
      },
    });
  });

  it("normalizes workspace-session responses into a trailing-slash base URL", async () => {
    const workspace = createRemoteWorkspace({
      host: "http://agent.example.com",
      apiKey: "session-key",
      workingDir: "/workspace/project",
    });
    vi.spyOn(workspace.client, "post").mockResolvedValue(
      httpResponse({
        base_url: "/api/conversations/conv-1/workspace",
      }),
    );

    await expect(workspace.startWorkspaceSession("conv-1")).resolves.toBe(
      "http://agent.example.com/api/conversations/conv-1/workspace/",
    );
  });
});
