import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    useWorkspaceMutationCounter.setState({ count: 0 });
    fileClientMock.mockClear();
    downloadFileMock.mockReset();
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
});
