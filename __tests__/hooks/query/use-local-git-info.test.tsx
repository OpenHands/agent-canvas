import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import { useLocalGitInfo } from "#/hooks/query/use-local-git-info";

const useActiveBackendMock = vi.fn();
vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => useActiveBackendMock(),
}));

const useActiveConversationMock = vi.fn();
vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

const useRuntimeIsReadyMock = vi.fn();
vi.mock("#/hooks/use-runtime-is-ready", () => ({
  useRuntimeIsReady: () => useRuntimeIsReadyMock(),
}));

const executeCommandSpy = vi.spyOn(AgentServerRuntimeService, "executeCommand");

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function LocalGitInfoTestWrapper({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

const makeBackend = (kind: "local" | "cloud") => ({
  backend: {
    id: "backend-id",
    name: kind === "local" ? "Local" : "Production",
    host:
      kind === "local" ? "http://127.0.0.1:8000" : "https://app.all-hands.dev",
    apiKey: "test-key",
    kind,
  },
  orgId: null,
});

const conversationWithoutRepo = {
  id: "conv-1",
  conversation_url: "https://runtime.example.com/api/conversations/conv-1",
  session_api_key: "session-key",
  workspace: { working_dir: "/workspace/project" },
  selected_repository: null,
  git_provider: null,
  selected_branch: null,
};

describe("useLocalGitInfo", () => {
  beforeEach(() => {
    useActiveBackendMock.mockReset();
    useActiveConversationMock.mockReset();
    useRuntimeIsReadyMock.mockReset();
    executeCommandSpy.mockReset();

    useRuntimeIsReadyMock.mockReturnValue(true);
    useActiveConversationMock.mockReturnValue({
      data: conversationWithoutRepo,
    });
    executeCommandSpy.mockResolvedValue({
      exit_code: 0,
      stdout: "git@github.com:acme/widgets.git\n",
      stderr: "",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not call executeCommand on a cloud backend even when conversation metadata is incomplete", async () => {
    // Arrange
    useActiveBackendMock.mockReturnValue(makeBackend("cloud"));

    // Act
    const { result } = renderHook(() => useLocalGitInfo(), {
      wrapper: makeWrapper(),
    });

    // Assert: query stays disabled (no fetch, no data); bash endpoint not driven.
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(executeCommandSpy).not.toHaveBeenCalled();
  });

  it("probes git metadata via executeCommand on a local backend when conversation metadata is incomplete", async () => {
    // Arrange
    useActiveBackendMock.mockReturnValue(makeBackend("local"));
    executeCommandSpy
      .mockResolvedValueOnce({
        exit_code: 0,
        stdout: "git@github.com:acme/widgets.git\n",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exit_code: 0,
        stdout: "main\n",
        stderr: "",
      });

    // Act
    const { result } = renderHook(() => useLocalGitInfo(), {
      wrapper: makeWrapper(),
    });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(executeCommandSpy).toHaveBeenCalledWith(
      conversationWithoutRepo.conversation_url,
      conversationWithoutRepo.session_api_key,
      "git remote get-url origin",
      "/workspace/project",
      10,
    );
    expect(result.current.data).toMatchObject({
      repository: "acme/widgets",
      branch: "main",
    });
  });
});
