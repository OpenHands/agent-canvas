import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { getStoredConversationMetadata } from "#/api/conversation-metadata-store";

const {
  mockHttpPost,
  mockCreateHttpClient,
  mockGetSettings,
  mockGetSettingsForConversation,
} = vi.hoisted(() => ({
  mockHttpPost: vi.fn(),
  mockCreateHttpClient: vi.fn(),
  mockGetSettings: vi.fn(),
  mockGetSettingsForConversation: vi.fn(),
}));

vi.mock("#/api/typescript-client", () => ({
  createHttpClient: mockCreateHttpClient,
  createRemoteWorkspace: vi.fn(),
  createVSCodeClient: vi.fn(),
}));

vi.mock("#/api/agent-server-config", () => ({
  DEFAULT_WORKING_DIR: "workspace/project",
  getAgentServerBaseUrl: vi.fn(() => "http://localhost:54928"),
  getAgentServerSessionApiKey: vi.fn(() => null),
  getAgentServerWorkingDir: vi.fn(() => "/workspace/project/agent-canvas"),
  buildConversationWorkingDir: vi.fn(
    (id: string) => `/state/workspaces/${id.replace(/-/g, "")}`,
  ),
  getConfiguredWorkerUrls: vi.fn(() => []),
  shouldLoadPublicSkills: vi.fn(() => true),
}));

vi.mock("#/api/settings-service/settings-service.api", () => ({
  default: {
    getSettings: mockGetSettings,
    getSettingsForConversation: mockGetSettingsForConversation,
  },
}));

vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({ trackConversationCreated: vi.fn() }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
};

describe("useCreateConversation persists selected repository metadata", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockHttpPost.mockReset();
    mockCreateHttpClient.mockReset();
    mockGetSettings.mockReset();
    mockGetSettingsForConversation.mockReset();
    mockGetSettings.mockResolvedValue({
      agent_settings: { llm: { model: "gpt-4o" } },
      conversation_settings: {},
    });
    mockGetSettingsForConversation.mockResolvedValue({
      agentSettings: { llm: { model: "gpt-4o" } },
      conversationSettings: {},
      secretsEncrypted: true,
    });
    mockCreateHttpClient.mockReturnValue({
      get: vi.fn(),
      post: mockHttpPost,
      patch: vi.fn(),
      delete: vi.fn(),
    });
    mockHttpPost.mockResolvedValue({
      data: {
        id: "conv-new",
        created_at: "2026-05-05T00:00:00Z",
        updated_at: "2026-05-05T00:00:00Z",
      },
    });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("stores the selected repo/branch/provider in the metadata store after a successful create", async () => {
    const { result } = renderHook(() => useCreateConversation(), { wrapper });

    result.current.mutate({
      query: "ship it",
      repository: {
        name: "octocat/hello-world",
        gitProvider: "github",
        branch: "main",
      },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getStoredConversationMetadata("conv-new")).toEqual({
      selected_repository: "octocat/hello-world",
      selected_branch: "main",
      git_provider: "github",
      selected_workspace: null,
    });
  });

  it("stores the selected workspace path when only a workspace (no repo) is attached", async () => {
    const { result } = renderHook(() => useCreateConversation(), { wrapper });

    result.current.mutate({
      query: "poke at this repo",
      workingDir: "/home/me/code/some-project",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // We persist the workspace path so `useHasAttachedSource` can default
    // the Files tab to diff view even when no repo was picked.
    expect(getStoredConversationMetadata("conv-new")).toEqual({
      selected_repository: null,
      selected_branch: null,
      git_provider: null,
      selected_workspace: "/home/me/code/some-project",
    });
  });

  it("does not write metadata when neither a repository nor a workspace is attached", async () => {
    const { result } = renderHook(() => useCreateConversation(), { wrapper });

    result.current.mutate({ query: "scratch session" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getStoredConversationMetadata("conv-new")).toBeNull();
  });
});
