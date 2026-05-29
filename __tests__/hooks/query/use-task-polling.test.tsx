import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import type { AppConversationStartTask } from "#/api/conversation-service/agent-server-conversation-service.types";
import { NavigationProvider } from "#/context/navigation-context";
import { useTaskPolling } from "#/hooks/query/use-task-polling";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";
import {
  consumePendingTaskDraft,
  getConversationState,
  setPendingTaskDraft,
} from "#/utils/conversation-local-storage";
import { resetPendingTaskMessageLinkState } from "#/utils/pending-task-message-link";

vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({
    default: {
      getStartTask: vi.fn(),
    },
  }),
);

const readyTask: AppConversationStartTask = {
  id: "123",
  created_by_user_id: "user-1",
  status: "READY",
  detail: null,
  app_conversation_id: "conversation-1",
  agent_server_url: null,
  request: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("useTaskPolling", () => {
  let queryClient: QueryClient;
  const navigate = vi.fn();

  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    return function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <NavigationProvider
            value={{
              currentPath: "/conversations/task-123",
              conversationId: "task-123",
              isNavigating: false,
              navigate,
            }}
          >
            {children}
          </NavigationProvider>
        </QueryClientProvider>
      );
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetPendingTaskMessageLinkState();
    useOptimisticUserMessageStore.setState({ pendingMessages: [] });
  });

  afterEach(() => {
    queryClient?.clear();
    localStorage.clear();
  });

  it("moves pending task drafts onto the real conversation before redirecting", async () => {
    vi.mocked(AgentServerConversationService.getStartTask).mockResolvedValue(
      readyTask,
    );
    setPendingTaskDraft("123", "Create this automation draft");

    const { result } = renderHook(() => useTaskPolling(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.taskStatus).toBe("READY"));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/conversations/conversation-1", {
        replace: true,
      });
    });

    expect(getConversationState("conversation-1").draftMessage).toBe(
      "Create this automation draft",
    );
    expect(consumePendingTaskDraft("123")).toBeNull();
    expect(AgentServerConversationService.getStartTask).toHaveBeenCalledWith(
      "123",
    );
  });

  it("reassigns optimistic pending messages on the real conversation route", async () => {
    vi.mocked(AgentServerConversationService.getStartTask).mockResolvedValue(
      readyTask,
    );
    useOptimisticUserMessageStore.getState().enqueuePendingMessage({
      conversationId: "task-123",
      text: "hello from home",
    });

    const createWrapperForConversation = (conversationId: string) => {
      queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      return function Wrapper({ children }: { children: React.ReactNode }) {
        return (
          <QueryClientProvider client={queryClient}>
            <NavigationProvider
              value={{
                currentPath: `/conversations/${conversationId}`,
                conversationId,
                isNavigating: false,
                navigate,
              }}
            >
              {children}
            </NavigationProvider>
          </QueryClientProvider>
        );
      };
    };

    renderHook(() => useTaskPolling(), {
      wrapper: createWrapperForConversation("task-123"),
    });

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/conversations/conversation-1", {
        replace: true,
      });
    });

    renderHook(() => useTaskPolling(), {
      wrapper: createWrapperForConversation("conversation-1"),
    });

    await waitFor(() => {
      const pending = useOptimisticUserMessageStore.getState().pendingMessages;
      expect(pending).toHaveLength(1);
      expect(pending[0].conversationId).toBe("conversation-1");
      expect(pending[0].text).toBe("hello from home");
    });
  });
});
