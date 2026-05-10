import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithProviders, useParamsMock } from "test-utils";
import { SUGGESTIONS } from "#/utils/suggestions";
import { ChatInterface } from "#/components/features/chat/chat-interface";
import {
  useConversationId,
  useOptionalConversationId,
} from "#/hooks/use-conversation-id";
import { useErrorMessageStore } from "#/stores/error-message-store";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";
import { useConfig } from "#/hooks/query/use-config";
import { useGetTrajectory } from "#/hooks/mutation/use-get-trajectory";
import { useUnifiedUploadFiles } from "#/hooks/mutation/use-unified-upload-files";
import type { MessageEvent } from "#/types/agent-server/core";
import { useEventStore } from "#/stores/use-event-store";
import { useAgentState } from "#/hooks/use-agent-state";
import { AgentState } from "#/types/agent-state";

vi.mock("#/hooks/query/use-config");
vi.mock("#/hooks/mutation/use-get-trajectory");
vi.mock("#/hooks/mutation/use-unified-upload-files");
vi.mock("#/hooks/use-conversation-id", () => ({
  useConversationId: vi.fn(),
  useOptionalConversationId: vi.fn(),
}));

vi.mock("#/hooks/use-user-providers", () => ({
  useUserProviders: () => ({
    providers: [],
  }),
}));

vi.mock("#/hooks/use-conversation-name-context-menu", () => ({
  useConversationNameContextMenu: () => ({
    isOpen: false,
    contextMenuRef: { current: null },
    handleContextMenu: vi.fn(),
    handleClose: vi.fn(),
    handleRename: vi.fn(),
    handleDelete: vi.fn(),
  }),
}));

vi.mock("#/hooks/use-agent-state", () => ({
  useAgentState: vi.fn(() => ({
    curAgentState: AgentState.AWAITING_USER_INPUT,
  })),
}));

// Helper function to render with Router context
const renderChatInterfaceWithRouter = () =>
  renderWithProviders(
    <MemoryRouter>
      <ChatInterface />
    </MemoryRouter>,
  );

// Helper function to render with QueryClientProvider and Router (for newer tests)
const renderWithQueryClient = (
  ui: React.ReactElement,
  queryClient: QueryClient,
  route = "/test-conversation-id",
) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/:conversationId" element={ui} />
          <Route path="/" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  useParamsMock.mockReturnValue({ conversationId: "test-conversation-id" });
  vi.mocked(useConversationId).mockReturnValue({
    conversationId: "test-conversation-id",
  });
  vi.mocked(useOptionalConversationId).mockReturnValue({
    conversationId: "test-conversation-id",
  });
});

describe("ChatInterface - Chat Suggestions", () => {
  // Create a new QueryClient for each test
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    useOptimisticUserMessageStore.setState({
      optimisticUserMessage: null,
    });

    useErrorMessageStore.setState({
      errorMessage: null,
    });

    (useConfig as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {},
    });
    (useGetTrajectory as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isLoading: false,
    });
    (
      useUnifiedUploadFiles as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      mutateAsync: vi
        .fn()
        .mockResolvedValue({ skipped_files: [], uploaded_files: [] }),
      isLoading: false,
    });
  });

  test("should hide chat suggestions when there is a user message", () => {
    const mockUserEvent: MessageEvent = {
      id: "msg-1",
      timestamp: "2025-07-01T00:00:00Z",
      source: "user",
      llm_message: {
        role: "user",
        content: [{ type: "text", text: "Hello" }],
      },
      activated_microagents: [],
      extended_content: [],
    };

    useEventStore.setState({
      events: [mockUserEvent],
      eventIds: new Set(["msg-1"]),
      uiEvents: [mockUserEvent],
    });

    renderWithQueryClient(<ChatInterface />, queryClient);

    // Check if ChatSuggestions is not rendered with user events
    expect(screen.queryByTestId("chat-suggestions")).not.toBeInTheDocument();
  });

  test("should hide chat suggestions when there is an optimistic user message", () => {
    useOptimisticUserMessageStore.setState({
      optimisticUserMessage: "Optimistic message",
    });

    renderWithQueryClient(<ChatInterface />, queryClient);

    // Check if ChatSuggestions is not rendered with optimistic user message
    expect(screen.queryByTestId("chat-suggestions")).not.toBeInTheDocument();
  });
});

describe("ChatInterface - Empty state", () => {
  it.todo("should render suggestions if empty");

  it("should render the default suggestions", () => {
    renderChatInterfaceWithRouter();

    const suggestions = screen.getByTestId("chat-suggestions");
    const repoSuggestions = Object.keys(SUGGESTIONS.repo);

    // check that there are at most 4 suggestions displayed
    const displayedSuggestions = within(suggestions).getAllByRole("button");
    expect(displayedSuggestions.length).toBeLessThanOrEqual(4);

    // Check that each displayed suggestion is one of the repo suggestions
    displayedSuggestions.forEach((suggestion) => {
      expect(repoSuggestions).toContain(suggestion.textContent);
    });
  });
});

describe("ChatInterface - Scroll-up loads older events", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    useOptimisticUserMessageStore.setState({ optimisticUserMessage: null });
    useErrorMessageStore.setState({ errorMessage: null });

    (useConfig as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {},
    });
    (useGetTrajectory as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isLoading: false,
    });
    (
      useUnifiedUploadFiles as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      mutateAsync: vi.fn(),
      isLoading: false,
    });
  });

  afterEach(() => {
    useEventStore.setState({
      events: [],
      eventIds: new Set(),
      uiEvents: [],
    });
    vi.clearAllMocks();
  });

  it("calls EventService.searchEvents with timestamp__lt when the user scrolls to the top", async () => {
    // Seed the store with one renderable user message so the chat actually
    // renders Messages and creates a scroll context.
    const seedEvent: MessageEvent = {
      id: "msg-seed",
      timestamp: "2025-07-01T00:00:00Z",
      source: "user",
      llm_message: {
        role: "user",
        content: [{ type: "text", text: "Existing message" }],
      },
      activated_microagents: [],
      extended_content: [],
    };
    useEventStore.setState({
      events: [seedEvent],
      eventIds: new Set(["msg-seed"]),
      uiEvents: [seedEvent],
    });

    // Mock the conversation lookup so useLoadOlderEvents has a URL to call.
    const useUserConversationModule =
      await import("#/hooks/query/use-user-conversation");
    vi.spyOn(useUserConversationModule, "useUserConversation").mockReturnValue({
      data: {
        conversation_id: "test-conversation-id",
        conversation_url: "https://example.com",
        session_api_key: "k",
        conversation_version: "V1",
      },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<
      typeof useUserConversationModule.useUserConversation
    >);

    const eventServiceModule =
      await import("#/api/event-service/event-service.api");
    const searchSpy = vi
      .spyOn(eventServiceModule.default, "searchEvents")
      .mockResolvedValue({
        items: [],
        next_page_id: null,
      });

    renderWithQueryClient(<ChatInterface />, queryClient);

    // The scroll container is the outer div with the custom scrollbar class.
    const scrollContainer = document.querySelector(
      ".custom-scrollbar-always",
    ) as HTMLElement | null;
    expect(scrollContainer).not.toBeNull();

    // Simulate the user being scrolled near the top. JSDOM's default
    // `scrollTop`/`scrollHeight` are non-writable getters; redefine them
    // as plain writable properties so the auto-scroll-to-bottom effect
    // (which assigns `dom.scrollTop = dom.scrollHeight`) doesn't throw.
    Object.defineProperty(scrollContainer!, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(scrollContainer!, "scrollHeight", {
      configurable: true,
      writable: true,
      value: 5000,
    });

    scrollContainer!.dispatchEvent(new Event("scroll", { bubbles: true }));

    // Allow the async loadOlder() to fire.
    await new Promise((r) => {
      setTimeout(r, 0);
    });

    expect(searchSpy).toHaveBeenCalledWith(
      "test-conversation-id",
      "https://example.com",
      "k",
      expect.objectContaining({
        sortOrder: "TIMESTAMP_DESC",
        timestampLt: "2025-07-01T00:00:00Z",
      }),
    );
  });

  it("shows an error banner if loading older events fails", async () => {
    const seedEvent: MessageEvent = {
      id: "msg-seed",
      timestamp: "2025-07-01T00:00:00Z",
      source: "user",
      llm_message: {
        role: "user",
        content: [{ type: "text", text: "Existing message" }],
      },
      activated_microagents: [],
      extended_content: [],
    };
    useEventStore.setState({
      events: [seedEvent],
      eventIds: new Set(["msg-seed"]),
      uiEvents: [seedEvent],
    });

    const useUserConversationModule =
      await import("#/hooks/query/use-user-conversation");
    vi.spyOn(useUserConversationModule, "useUserConversation").mockReturnValue({
      data: {
        conversation_id: "test-conversation-id",
        conversation_url: "https://example.com",
        session_api_key: "k",
        conversation_version: "V1",
      },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<
      typeof useUserConversationModule.useUserConversation
    >);

    const eventServiceModule =
      await import("#/api/event-service/event-service.api");
    vi.spyOn(eventServiceModule.default, "searchEvents").mockRejectedValue(
      new Error("Older events request failed"),
    );

    renderWithQueryClient(<ChatInterface />, queryClient);

    const scrollContainer = document.querySelector(
      ".custom-scrollbar-always",
    ) as HTMLElement | null;
    expect(scrollContainer).not.toBeNull();

    Object.defineProperty(scrollContainer!, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(scrollContainer!, "scrollHeight", {
      configurable: true,
      writable: true,
      value: 5000,
    });

    scrollContainer!.dispatchEvent(new Event("scroll", { bubbles: true }));

    expect(
      await screen.findByText("Older events request failed"),
    ).toBeInTheDocument();
  });

  it("renders renderable agent events even when the loaded window has no user message (so the user has something to scroll up from)", () => {
    // Simulate the lazy-loaded "50 most recent" window landing in the
    // store with only agent / environment events — the original user
    // prompt is older than this window.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentAction: any = {
      id: "act-1",
      timestamp: "2025-07-01T00:00:10Z",
      source: "agent",
      kind: "ActionEvent",
      action: {
        kind: "ExecuteBashAction",
        command: "ls",
      },
      tool_name: "terminal",
      tool_call_id: "call-1",
      tool_call: {
        id: "call-1",
        name: "terminal",
        arguments: { command: "ls" },
      },
      llm_response_id: "resp-1",
      thought: [],
      reasoning_content: "",
      thinking_blocks: [],
    };

    useEventStore.setState({
      events: [agentAction],
      eventIds: new Set(["act-1"]),
      uiEvents: [agentAction],
    });

    renderWithQueryClient(<ChatInterface />, queryClient);

    // The scroll container exists (so the user can scroll up to load older).
    const scrollContainer = document.querySelector(
      ".custom-scrollbar-always",
    ) as HTMLElement | null;
    expect(scrollContainer).not.toBeNull();

    // ChatSuggestions should NOT take over the chat area when agent
    // actions are present in the loaded window.
    expect(screen.queryByTestId("chat-suggestions")).not.toBeInTheDocument();

    // The Messages list should be rendered (the bug was that it was
    // gated on `conversationUserEventsExist` and stayed hidden here,
    // leaving a blank chat with nothing to scroll).
    expect(scrollContainer!.children.length).toBeGreaterThan(0);
  });
});

describe("ChatInterface - Status Indicator", () => {
  it("should render ChatStatusIndicator when agent is not awaiting user input / conversation is NOT ready", () => {
    vi.mocked(useAgentState).mockReturnValue({
      curAgentState: AgentState.LOADING,
    });

    renderChatInterfaceWithRouter();

    expect(screen.getByTestId("chat-status-indicator")).toBeInTheDocument();
  });

  it("should NOT render ChatStatusIndicator when agent is awaiting user input / conversation is ready", () => {
    vi.mocked(useAgentState).mockReturnValue({
      curAgentState: AgentState.AWAITING_USER_INPUT,
    });

    renderChatInterfaceWithRouter();

    expect(
      screen.queryByTestId("chat-status-indicator"),
    ).not.toBeInTheDocument();
  });
});
