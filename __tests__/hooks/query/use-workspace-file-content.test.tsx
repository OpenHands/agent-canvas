import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { callCloudProxy } from "#/api/cloud/proxy";
import type { Backend } from "#/api/backend-registry/types";
import { useWorkspaceFileContent } from "#/hooks/query/use-workspace-file-content";
import { useWorkspaceMutationCounter } from "#/stores/use-workspace-mutation-counter";

const { downloadFileMock, fileClientMock } = vi.hoisted(() => {
  const downloadFile = vi.fn();
  return {
    downloadFileMock: downloadFile,
    fileClientMock: vi.fn(function FileClientMock() {
      return { downloadFile };
    }),
  };
});

vi.mock("@openhands/typescript-client/clients", () => ({
  FileClient: fileClientMock,
}));

vi.mock("#/api/agent-server-client-options", () => ({
  getAgentServerClientOptions: vi.fn(() => ({
    host: "https://agent.example.com",
    apiKey: "session-key",
    workingDir: "/workspace/project",
  })),
}));

vi.mock("#/api/cloud/proxy", () => ({
  callCloudProxy: vi.fn(),
}));

const cloudBackend: Backend = {
  id: "cloud-1",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "cloud-api-key",
  kind: "cloud",
};

const useActiveConversationMock = vi.fn();
vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

const useRuntimeIsReadyMock = vi.fn();
vi.mock("#/hooks/use-runtime-is-ready", () => ({
  useRuntimeIsReady: () => useRuntimeIsReadyMock(),
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = function WorkspaceFileContentTestWrapper({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
  return Wrapper;
}

describe("useWorkspaceFileContent", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:preview-url"),
    });
    window.localStorage.clear();
    __resetActiveStoreForTests();
    useWorkspaceMutationCounter.setState({ count: 0 });
    fileClientMock.mockClear();
    downloadFileMock.mockReset();
    vi.mocked(callCloudProxy).mockReset();
    useActiveConversationMock.mockReset();
    useRuntimeIsReadyMock.mockReset();
    useRuntimeIsReadyMock.mockReturnValue(true);
    useActiveConversationMock.mockReturnValue({
      data: {
        id: "conv-1",
        conversation_url: "https://agent.example.com/api/conversations/conv-1",
        session_api_key: "session-key",
        workspace: { working_dir: "/workspace/project/agent-canvas" },
      },
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    __resetActiveStoreForTests();
  });

  it("downloads selected files through the typed file API", async () => {
    downloadFileMock.mockResolvedValue(
      new TextEncoder().encode("# Hello").buffer,
    );

    const { result } = renderHook(
      () => useWorkspaceFileContent("docs/readme.md"),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(downloadFileMock).toHaveBeenCalledWith(
      "/workspace/project/agent-canvas/docs/readme.md",
    );
    expect(result.current.data).toMatchObject({
      kind: "text",
      text: "# Hello",
      staticUrl: "blob:preview-url",
      mimeType: "text/markdown",
    });
  });

  it("refetches selected file content after workspace mutations", async () => {
    downloadFileMock
      .mockResolvedValueOnce(new TextEncoder().encode("first").buffer)
      .mockResolvedValueOnce(new TextEncoder().encode("second").buffer);

    const { result } = renderHook(
      () => useWorkspaceFileContent("docs/readme.md"),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.data?.text).toBe("first"));

    act(() => {
      useWorkspaceMutationCounter.getState().bump();
    });

    await waitFor(() => expect(result.current.data?.text).toBe("second"));
    expect(downloadFileMock).toHaveBeenCalledTimes(2);
  });

  it("does not start a file request before a path is selected", async () => {
    renderHook(() => useWorkspaceFileContent(null), { wrapper: makeWrapper() });

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(fileClientMock).not.toHaveBeenCalled();
    expect(downloadFileMock).not.toHaveBeenCalled();
  });

  it("rejects traversal outside the workspace", async () => {
    const { result } = renderHook(() => useWorkspaceFileContent("../.env"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(downloadFileMock).not.toHaveBeenCalled();
    expect(result.current.error).toEqual(
      expect.objectContaining({
        message: "Workspace file path must stay inside the workspace",
      }),
    );
  });

  describe("cloud backend", () => {
    beforeEach(() => {
      setRegisteredBackends([cloudBackend]);
      setActiveSelection({ backendId: cloudBackend.id, orgId: null });
      useActiveConversationMock.mockReturnValue({
        data: {
          id: "conv-cloud",
          conversation_url:
            "https://runtime.example.com/api/conversations/conv-cloud",
          session_api_key: "cloud-session-key",
          workspace: { working_dir: "/workspace/project" },
        },
      });
    });

    it("fetches file content through callCloudProxy instead of FileClient", async () => {
      vi.mocked(callCloudProxy).mockResolvedValue(
        new Blob([new TextEncoder().encode("cloud file content")]),
      );

      const { result } = renderHook(
        () => useWorkspaceFileContent("src/app.ts"),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // FileClient must never be called directly for cloud conversations.
      expect(fileClientMock).not.toHaveBeenCalled();
      expect(downloadFileMock).not.toHaveBeenCalled();

      const proxyCall = vi.mocked(callCloudProxy).mock.calls[0][0];
      expect(proxyCall.method).toBe("GET");
      expect(proxyCall.path).toContain("/api/file/download");
      expect(proxyCall.path).toContain(
        encodeURIComponent("/workspace/project/src/app.ts"),
      );
      expect(proxyCall.authMode).toBe("session-api-key");
      expect(proxyCall.sessionApiKey).toBe("cloud-session-key");
      expect(proxyCall.responseType).toBe("blob");

      expect(result.current.data?.text).toBe("cloud file content");
    });
  });
});
