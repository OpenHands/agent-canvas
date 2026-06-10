import {
  ConversationClient,
  SettingsClient,
} from "@openhands/typescript-client/clients";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";

/**
 * The metadata that USED to live in `conversation-metadata-store` localStorage
 * (and was tested against that store here) now rides on the
 * `POST /api/conversations` payload's `tags` field. These tests assert that
 * wire shape directly — the localStorage shim is deprecated, and the
 * agent-server is the canonical source. See `agent-server-adapter.ts`
 * (AGENT_CANVAS_METADATA_TAG_KEYS) and SDK PR #3621.
 */
const lastCreatePayload = (): Record<string, unknown> => {
  const calls = mockHttpPost.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][1] as Record<string, unknown>;
};

const tagsFromLastCreate = (): Record<string, string> | undefined => {
  const payload = lastCreatePayload();
  return payload.tags as Record<string, string> | undefined;
};

const {
  mockHttpPost,
  mockConversationClient,
  mockSettingsClient,
  mockGetSettings,
  mockGetSettingsForConversation,
  mockUseLlmProfiles,
} = vi.hoisted(() => ({
  mockHttpPost: vi.fn(),
  mockConversationClient: vi.fn(),
  mockSettingsClient: vi.fn(),
  mockGetSettings: vi.fn(),
  mockGetSettingsForConversation: vi.fn(),
  mockUseLlmProfiles: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", async () => {
  const actual = await vi.importActual<
    typeof import("@openhands/typescript-client/clients")
  >("@openhands/typescript-client/clients");
  return {
    ...actual,
    ConversationClient: vi.fn(function ConversationClientMock() {
      return mockConversationClient();
    }),
    SettingsClient: vi.fn(function SettingsClientMock() {
      return mockSettingsClient();
    }),
    VSCodeClient: vi.fn(function VSCodeClientMock() {
      return { getUrl: vi.fn() };
    }),
  };
});

vi.mock("#/api/agent-server-config", () => ({
  DEFAULT_WORKING_DIR: "workspace/project",
  getAgentServerBaseUrl: vi.fn(() => "http://localhost:54928"),
  getBakedSessionApiKey: vi.fn(() => "test-session-key"),
  getAgentServerSessionApiKey: vi.fn(() => "test-session-key"),
  getAgentServerWorkingDir: vi.fn(() => "/workspace/project/agent-canvas"),
  buildConversationWorkingDir: vi.fn(
    (id: string) => `/state/workspaces/${id.replace(/-/g, "")}`,
  ),
  getConfiguredWorkerUrls: vi.fn(() => []),
  shouldLoadPublicSkills: vi.fn(() => true),
  syncBakedSessionApiKey: vi.fn(),
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

vi.mock("#/hooks/query/use-llm-profiles", () => ({
  useLlmProfiles: () => mockUseLlmProfiles(),
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
    mockUseLlmProfiles.mockReset();
    // Default: no active profile, so metadata is written only for repo/
    // workspace attachments (as before). Individual tests override this.
    mockUseLlmProfiles.mockReturnValue({ data: { active_profile: null } });
    mockHttpPost.mockReset();
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
    mockConversationClient.mockReset();
    vi.mocked(ConversationClient).mockClear();
    vi.mocked(SettingsClient).mockClear();
    mockConversationClient.mockReturnValue({
      createConversation: async (payload: unknown) => {
        const response = await mockHttpPost("/api/conversations", payload);
        return response.data;
      },
    });
    mockSettingsClient.mockReturnValue({
      listSecrets: vi.fn().mockResolvedValue({ secrets: [] }),
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

  it("sends selected repo/branch/provider tags on POST /api/conversations", async () => {
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

    expect(tagsFromLastCreate()).toEqual({
      selected_repository: "octocat/hello-world",
      selected_branch: "main",
      git_provider: "github",
    });
  });

  it("sends the selected_workspace tag when only a workspace (no repo) is attached", async () => {
    const { result } = renderHook(() => useCreateConversation(), { wrapper });

    result.current.mutate({
      query: "poke at this repo",
      workingDir: "/home/me/code/some-project",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // `useHasAttachedSource` reads `selected_workspace` from server tags
    // to default the Files tab to diff view even when no repo was picked.
    expect(tagsFromLastCreate()).toEqual({
      selected_workspace: "/home/me/code/some-project",
    });
  });

  it("omits the tags field entirely when neither a repository nor a workspace is attached", async () => {
    const { result } = renderHook(() => useCreateConversation(), { wrapper });

    result.current.mutate({ query: "scratch session" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // No metadata + no ACP server → buildStartConversationRequest leaves
    // `tags` off the wire entirely (same shape as the original behaviour).
    expect(lastCreatePayload().tags).toBeUndefined();
  });

  it("stamps the active_profile tag even when no repo or workspace is attached (#1082)", async () => {
    mockUseLlmProfiles.mockReturnValue({
      data: { active_profile: "team-default" },
    });

    const { result } = renderHook(() => useCreateConversation(), { wrapper });

    result.current.mutate({ query: "scratch session" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(tagsFromLastCreate()).toEqual({
      active_profile: "team-default",
    });
  });
});
