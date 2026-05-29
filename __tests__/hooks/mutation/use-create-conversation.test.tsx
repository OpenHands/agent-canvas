import type React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import {
  writeStoredActiveBackend,
  writeStoredBackends,
} from "#/api/backend-registry/storage";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import i18n, { OPENHANDS_I18N_NAMESPACE } from "#/i18n";
import { I18nKey } from "#/i18n/declaration";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { SuggestedTask } from "#/utils/types";

vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({
    trackConversationCreated: vi.fn(),
  }),
}));

const ORIGINAL_LOCATION = window.location;

function mockWindowLocation(url: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url),
  });
}

function queryClientWrapper({
  includeActiveBackendProvider = false,
}: {
  includeActiveBackendProvider?: boolean;
} = {}) {
  const queryClient = new QueryClient();

  return function Wrapper({ children }: { children: React.ReactNode }) {
    const content = includeActiveBackendProvider ? (
      <ActiveBackendProvider>{children}</ActiveBackendProvider>
    ) : (
      children
    );

    return (
      <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
    );
  };
}

describe("useCreateConversation", () => {
  beforeEach(() => {
    mockWindowLocation("http://127.0.0.1:3001/");
    window.localStorage.clear();
    __resetActiveStoreForTests();
    i18n.addResourceBundle(
      "en",
      OPENHANDS_I18N_NAMESPACE,
      {
        [I18nKey.ERROR$AGENT_SERVER_CORS]:
          "Agent Canvas could not reach the agent server.\n\nFrontend origin: {{frontendOrigin}}\nBackend: {{backendOrigin}}\n\nRestart `agent-server` with `OH_ALLOW_CORS_ORIGINS='[\"{{frontendOrigin}}\"]'`.",
      },
      true,
      true,
    );
    i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: ORIGINAL_LOCATION,
    });
    __resetActiveStoreForTests();
  });

  it("passes suggested tasks to the V1 create conversation API", async () => {
    const createConversationSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
      .mockResolvedValue({
        id: "task-id",
        created_by_user_id: null,
        status: "READY",
        detail: null,
        app_conversation_id: null,
        agent_server_url: "http://agent-server.local",
        request: {
          initial_message: {
            role: "user",
            content: [{ type: "text", text: "Please address the comments" }],
          },
          processors: [],
          llm_model: null,
          selected_repository: null,
          selected_branch: null,
          git_provider: "github",
          suggested_task: null,
          title: null,
          trigger: null,
          pr_number: [],
          parent_conversation_id: null,
          agent_type: "default",
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    const { result } = renderHook(() => useCreateConversation(), {
      wrapper: queryClientWrapper(),
    });

    const suggestedTask: SuggestedTask = {
      git_provider: "github",
      issue_number: 42,
      repo: "owner/repo",
      title: "Resolve comments",
      task_type: "UNRESOLVED_COMMENTS",
    };

    await result.current.mutateAsync({
      query: "Please address the comments",
      repository: {
        name: "owner/repo",
        gitProvider: "github",
        branch: "main",
      },
      conversationInstructions: "Focus on review comments",
      suggestedTask,
    });

    await waitFor(() => {
      expect(createConversationSpy).toHaveBeenCalledWith(
        "Please address the comments",
        "Focus on review comments",
        undefined,
        {
          selected_repository: "owner/repo",
          selected_branch: "main",
          git_provider: "github",
        },
        undefined,
        undefined,
        undefined,
      );
    });
  });

  it("invalidates the conversation list and start-tasks queries on success", async () => {
    vi.spyOn(AgentServerConversationService, "createConversation").mockResolvedValue(
      {
        id: "task-id",
        created_by_user_id: null,
        status: "READY",
        detail: null,
        app_conversation_id: "conv-1",
        agent_server_url: "http://agent-server.local",
        request: {
          initial_message: null,
          processors: [],
          llm_model: null,
          selected_repository: null,
          selected_branch: null,
          git_provider: "github",
          suggested_task: null,
          title: null,
          trigger: null,
          pr_number: [],
          parent_conversation_id: null,
          agent_type: "default",
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    );

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateConversation(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await result.current.mutateAsync({});

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["user", "conversations"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["start-tasks"],
      });
    });
  });

  it("turns a cross-origin fetch failure into a readable CORS error", async () => {
    const backend = {
      id: "local-agent-server",
      name: "Local agent server",
      host: "http://127.0.0.1:8000",
      apiKey: "",
      kind: "local" as const,
    };
    writeStoredBackends([backend]);
    writeStoredActiveBackend({ backendId: backend.id });
    __resetActiveStoreForTests();

    vi.spyOn(
      AgentServerConversationService,
      "createConversation",
    ).mockRejectedValue(new Error("Request failed: Failed to fetch"));

    const { result } = renderHook(() => useCreateConversation(), {
      wrapper: queryClientWrapper({ includeActiveBackendProvider: true }),
    });

    await expect(result.current.mutateAsync({ query: "hello" })).rejects.toThrow(
      "Agent Canvas could not reach the agent server.\n\nFrontend origin: http://127.0.0.1:3001\nBackend: http://127.0.0.1:8000\n\nRestart `agent-server` with `OH_ALLOW_CORS_ORIGINS='[\"http://127.0.0.1:3001\"]'`.",
    );
  });
});
