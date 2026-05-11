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

    const result = await workspace.gitChanges("/workspace/project", {
      ref: "HEAD",
    });

    expect(getMock).toHaveBeenCalledWith("/api/git/changes", {
      params: {
        path: "/workspace/project",
        ref: "HEAD",
      },
    });
    expect(result).toEqual([]);
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

    const result = await workspace.gitDiff("/workspace/project/file.ts", {
      ref: "HEAD",
    });

    expect(getMock).toHaveBeenCalledWith("/api/git/diff", {
      params: {
        path: "/workspace/project/file.ts",
        ref: "HEAD",
      },
    });
    expect(result).toEqual({ diff: "diff content" });
  });
});
