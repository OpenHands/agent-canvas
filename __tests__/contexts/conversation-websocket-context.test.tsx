import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createUserMessageEvent } from "test-utils";
import { ConversationWebSocketProvider } from "#/contexts/conversation-websocket-context";
import { useEventStore } from "#/stores/use-event-store";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";
import { useUserConversation } from "#/hooks/query/use-user-conversation";
import EventService from "#/api/event-service/event-service.api";
import type { MessageEvent } from "#/types/agent-server/core";

// Keep the units under test real (the provider, `useConversationHistory`, the
// event store). Only the network is stubbed: the WebSocket transport and the
// REST service the history query depends on.
vi.mock("#/hooks/use-websocket", () => ({
  useWebSocket: vi.fn(() => ({ socket: null, reconnect: vi.fn() })),
}));
vi.mock("#/hooks/query/use-user-conversation", () => ({
  useUserConversation: vi.fn(),
}));

const AGENT_REPLY_ID = "evt-agent-reply";

// An agent reply that streamed in over the WebSocket *after* the initial REST
// history page — i.e. it lives only in the event store, never in the cached
// history page. This is the class of event the old code dropped on re-entry.
const makeAgentReply = (): MessageEvent => ({
  id: AGENT_REPLY_ID,
  timestamp: new Date(Date.now() + 1000).toISOString(),
  source: "agent",
  llm_message: { role: "assistant", content: [{ type: "text", text: "Hi!" }] },
  activated_microagents: [],
  extended_content: [],
});

const eventIds = () => useEventStore.getState().events.map((event) => event.id);

describe("ConversationWebSocketProvider — conversation-scoped event store", () => {
  let queryClient: QueryClient;

  const renderProvider = (conversationId: string) =>
    render(
      <QueryClientProvider client={queryClient}>
        <ConversationWebSocketProvider
          conversationId={conversationId}
          conversationUrl={null}
        >
          <div />
        </ConversationWebSocketProvider>
      </QueryClientProvider>,
    );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    useEventStore.setState({
      events: [],
      eventIds: new Set(),
      uiEvents: [],
      loadedConversationId: null,
    });
    useOptimisticUserMessageStore.setState({ pendingMessages: [] });

    vi.mocked(useUserConversation).mockReturnValue({
      data: { conversation_url: "http://localhost/api", session_api_key: null },
    } as ReturnType<typeof useUserConversation>);

    // The cached REST history page ends at the user's message — a fresh page
    // per conversation so we can detect cross-conversation leakage.
    vi.spyOn(EventService, "searchEvents").mockImplementation(
      async (conversationId: string) => ({
        items: [createUserMessageEvent(`user-msg-${conversationId}`)],
        next_page_id: null,
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("clears the previous conversation's events when switching conversations", async () => {
    // Arrange + Act: open conversation A.
    const { rerender } = renderProvider("conv-a");
    await waitFor(() => expect(eventIds()).toEqual(["user-msg-conv-a"]));

    // Act: switch to conversation B.
    rerender(
      <QueryClientProvider client={queryClient}>
        <ConversationWebSocketProvider conversationId="conv-b" conversationUrl={null}>
          <div />
        </ConversationWebSocketProvider>
      </QueryClientProvider>,
    );

    // Assert: B's history replaced A's — A did not leak into B.
    await waitFor(() => expect(eventIds()).toEqual(["user-msg-conv-b"]));
  });

  it("keeps events that arrived after history when re-entering the same conversation", async () => {
    // Arrange: open conversation A, then receive an agent reply over the socket
    // that is not part of the cached REST history page.
    const { unmount } = renderProvider("conv-a");
    await waitFor(() => expect(eventIds()).toEqual(["user-msg-conv-a"]));
    act(() => {
      useEventStore.getState().addEvent(makeAgentReply());
    });

    // Act: leave (e.g. to Settings) and return to the same conversation.
    unmount();
    renderProvider("conv-a");

    // Assert: both the user message and the streamed reply survive re-entry.
    await waitFor(() =>
      expect(eventIds()).toEqual(["user-msg-conv-a", AGENT_REPLY_ID]),
    );
  });
});
