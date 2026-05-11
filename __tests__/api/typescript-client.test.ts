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

  it("omits git ref when runtime git changes options are not provided", async () => {
    const workspace = createRemoteWorkspace({
      host: "http://agent.example.com",
      apiKey: "session-key",
      workingDir: "/workspace/project",
    });
    const getMock = vi
      .spyOn(workspace.client, "get")
      .mockResolvedValue(httpResponse([]));

    const result = await workspace.gitChanges("/workspace/project");

    expect(getMock).toHaveBeenCalledWith("/api/git/changes", {
      params: {
        path: "/workspace/project",
      },
    });
    expect(result).toEqual([]);
  });

  it("omits git ref when runtime git changes options are empty", async () => {
    const workspace = createRemoteWorkspace({
      host: "http://agent.example.com",
      apiKey: "session-key",
      workingDir: "/workspace/project",
    });
    const getMock = vi
      .spyOn(workspace.client, "get")
      .mockResolvedValue(httpResponse([]));

    const result = await workspace.gitChanges("/workspace/project", {});

    expect(getMock).toHaveBeenCalledWith("/api/git/changes", {
      params: {
        path: "/workspace/project",
      },
    });
    expect(result).toEqual([]);
  });

  it("rejects empty git ref options for runtime git changes", async () => {
    const workspace = createRemoteWorkspace({
      host: "http://agent.example.com",
      apiKey: "session-key",
      workingDir: "/workspace/project",
    });

    await expect(
      workspace.gitChanges("/workspace/project", { ref: "" }),
    ).rejects.toThrow("ref must be a non-empty string.");
    await expect(
      workspace.gitChanges("/workspace/project", {
        ref: null as unknown as string,
      }),
    ).rejects.toThrow("ref must be a non-empty string.");
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

  it("omits git ref when runtime git diff options are not provided", async () => {
    const workspace = createRemoteWorkspace({
      host: "http://agent.example.com",
      apiKey: "session-key",
      workingDir: "/workspace/project",
    });
    const getMock = vi
      .spyOn(workspace.client, "get")
      .mockResolvedValue(httpResponse({ diff: "diff content" }));

    const result = await workspace.gitDiff("/workspace/project/file.ts");

    expect(getMock).toHaveBeenCalledWith("/api/git/diff", {
      params: {
        path: "/workspace/project/file.ts",
      },
    });
    expect(result).toEqual({ diff: "diff content" });
  });

  it("omits git ref when runtime git diff options are empty", async () => {
    const workspace = createRemoteWorkspace({
      host: "http://agent.example.com",
      apiKey: "session-key",
      workingDir: "/workspace/project",
    });
    const getMock = vi
      .spyOn(workspace.client, "get")
      .mockResolvedValue(httpResponse({ diff: "diff content" }));

    const result = await workspace.gitDiff("/workspace/project/file.ts", {});

    expect(getMock).toHaveBeenCalledWith("/api/git/diff", {
      params: {
        path: "/workspace/project/file.ts",
      },
    });
    expect(result).toEqual({ diff: "diff content" });
  });

  it("rejects empty git ref options for runtime git diff", async () => {
    const workspace = createRemoteWorkspace({
      host: "http://agent.example.com",
      apiKey: "session-key",
      workingDir: "/workspace/project",
    });

    await expect(
      workspace.gitDiff("/workspace/project/file.ts", { ref: "" }),
    ).rejects.toThrow("ref must be a non-empty string.");
    await expect(
      workspace.gitDiff("/workspace/project/file.ts", {
        ref: null as unknown as string,
      }),
    ).rejects.toThrow("ref must be a non-empty string.");
  });

  it("rejects empty runtime workspace parameters", async () => {
    const workspace = createRemoteWorkspace({
      host: "http://agent.example.com",
      apiKey: "session-key",
      workingDir: "/workspace/project",
    });

    await expect(workspace.gitChanges("")).rejects.toThrow(
      "path must be a non-empty string.",
    );
    await expect(workspace.gitDiff("")).rejects.toThrow(
      "path must be a non-empty string.",
    );
    await expect(workspace.startWorkspaceSession("")).rejects.toThrow(
      "conversationId must be a non-empty string.",
    );
  });

  it("starts a workspace session through the runtime auth endpoint", async () => {
    const workspace = createRemoteWorkspace({
      host: "http://agent.example.com",
      apiKey: "session-key",
      workingDir: "/workspace/project",
    });
    const postMock = vi
      .spyOn(workspace.client, "post")
      .mockResolvedValue(httpResponse("workspace-session-url"));

    const result = await workspace.startWorkspaceSession("conversation-id");

    expect(postMock).toHaveBeenCalledWith("/api/auth/workspace-session", {
      conversation_id: "conversation-id",
    });
    expect(result).toBe("workspace-session-url");
  });
});
