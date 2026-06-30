import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { SuggestedTask } from "#/utils/types";
import {
  getStoredConversationMetadata,
  removeStoredConversationMetadata,
} from "#/api/conversation-metadata-store";

vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({
    trackConversationCreated: vi.fn(),
  }),
}));

// The hook stamps the active LLM profile onto the conversation (#1082).
// Mock it so the captured value is deterministic — the real hook fires a
// query the global MSW layer would answer non-deterministically under test
// timing.
const { useLlmProfilesMock } = vi.hoisted(() => ({
  useLlmProfilesMock: vi.fn(() => ({ data: { active_profile: null } })),
}));
vi.mock("#/hooks/query/use-llm-profiles", () => ({
  useLlmProfiles: () => useLlmProfilesMock(),
}));

// The hook defaults new local conversations to the active AgentProfile (#3727).
// Default: no active profile, so a plain create stays on the legacy path.
const { useAgentProfilesMock } = vi.hoisted(() => ({
  useAgentProfilesMock: vi.fn(() => ({ data: undefined })),
}));
vi.mock("#/hooks/query/use-agent-profiles", () => ({
  useAgentProfiles: () => useAgentProfilesMock(),
}));

describe("useCreateConversation", () => {
  afterEach(() => {
    // Restore the default (no active AgentProfile) so the override below
    // doesn't leak into the other create-call assertions.
    useAgentProfilesMock.mockReturnValue({ data: undefined } as never);
    removeStoredConversationMetadata("conv-with-plugins");
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
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>
          {children}
        </QueryClientProvider>
      ),
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
        undefined,
      );
    });
  });

  it("launches new local conversations from the active AgentProfile (#3727)", async () => {
    useAgentProfilesMock.mockReturnValue({
      data: { profiles: [], active_agent_profile_id: "profile-abc" },
    } as never);
    const createConversationSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
      .mockResolvedValue({
        id: "task-id",
        app_conversation_id: "conv-1",
        agent_server_url: "http://agent-server.local",
      } as never);

    const { result } = renderHook(() => useCreateConversation(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>
          {children}
        </QueryClientProvider>
      ),
    });

    await result.current.mutateAsync({ query: "hello" });

    await waitFor(() => {
      // sandboxId (#9) is undefined; the active profile id rides as #10.
      const call = createConversationSpy.mock.lastCall;
      expect(call?.[8]).toBeUndefined();
      expect(call?.[9]).toBe("profile-abc");
    });
  });

  it("invalidates the conversation list and start-tasks queries on success", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "createConversation",
    ).mockResolvedValue({
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
    });

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateConversation(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
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

  it("persists explicitly-attached plugins (coordinates only) to conversation metadata at creation", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "createConversation",
    ).mockResolvedValue({
      id: "task-id",
      created_by_user_id: null,
      status: "READY",
      detail: null,
      app_conversation_id: "conv-with-plugins",
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
    });

    const { result } = renderHook(() => useCreateConversation(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>
          {children}
        </QueryClientProvider>
      ),
    });

    await result.current.mutateAsync({
      plugins: [
        {
          source: "github:o/a",
          ref: null,
          repo_path: "plugins/a",
          parameters: { token: "secret" },
        },
      ],
    });

    await waitFor(() =>
      expect(
        getStoredConversationMetadata("conv-with-plugins")?.plugins,
      ).toEqual([{ source: "github:o/a", ref: null, repo_path: "plugins/a" }]),
    );
  });
});
