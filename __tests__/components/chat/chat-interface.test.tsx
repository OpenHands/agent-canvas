import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  test,
  vi,
} from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
import { useLoadOlderEvents } from "#/hooks/use-load-older-events";
import { AgentState } from "#/types/agent-state";
import { useConversationStore } from "#/stores/conversation-store";
import { act } from "@testing-library/react";

const mockSend = vi.fn();
vi.mock("#/hooks/use-send-message", () => ({
  useSendMessage: () => ({ send: mockSend }),
}));

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

vi.mock("#/hooks/use-load-older-events", () => ({
  useLoadOlderEvents: vi.fn(),
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
  // Default: pagination disabled (hasMore=false) so unrelated tests don't
  // accidentally trigger loadOlder via the on-mount auto-trigger effect.
  // Tests that exercise pagination override this.
  vi.mocked(useLoadOlderEvents).mockReturnValue({
    isLoading: false,
    hasMore: false,
    loadOlder: vi.fn().mockResolvedValue(undefined),
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
      pendingMessages: [],
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
    useOptimisticUserMessageStore.getState().enqueuePendingMessage({
      conversationId: "test-conversation-id",
      text: "Optimistic message",
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

    useOptimisticUserMessageStore.setState({ pendingMessages: [] });
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

  // Helper: install a controllable mock of useLoadOlderEvents and seed the
  // store with one renderable user message so the chat mounts a scroll area.
  const setupPaginationTest = () => {
    const loadOlder = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useLoadOlderEvents).mockReturnValue({
      isLoading: false,
      hasMore: true,
      loadOlder,
    });
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
    return loadOlder;
  };

  // The auto-scroll-to-bottom hook schedules a rAF that does
  // `dom.scrollTop = dom.scrollHeight`, which clobbers any value we set
  // here before the test's event fires. Pin `scrollTop` as a stable
  // getter so those assignments are no-ops.
  const setScrollMetrics = (
    el: HTMLElement,
    metrics: { scrollTop: number; scrollHeight: number; clientHeight: number },
  ) => {
    Object.defineProperty(el, "scrollTop", {
      configurable: true,
      get: () => metrics.scrollTop,
      set: () => {
        /* swallow assignments from auto-scroll-to-bottom */
      },
    });
    Object.defineProperty(el, "scrollHeight", {
      configurable: true,
      writable: true,
      value: metrics.scrollHeight,
    });
    Object.defineProperty(el, "clientHeight", {
      configurable: true,
      writable: true,
      value: metrics.clientHeight,
    });
  };

  it("calls loadOlder when the user scrolls near the top", async () => {
    const loadOlder = setupPaginationTest();
    renderWithQueryClient(<ChatInterface />, queryClient);

    const scrollContainer = document.querySelector(
      ".custom-scrollbar-always",
    ) as HTMLElement | null;
    expect(scrollContainer).not.toBeNull();

    // Pretend the user just scrolled near the top of an overflowing list.
    setScrollMetrics(scrollContainer!, {
      scrollTop: 0,
      scrollHeight: 5000,
      clientHeight: 800,
    });
    // Drop any on-mount auto-trigger so we exclusively assert the scroll path.
    await new Promise((r) => {
      setTimeout(r, 0);
    });
    loadOlder.mockClear();

    fireEvent.scroll(scrollContainer!);

    await new Promise((r) => {
      setTimeout(r, 0);
    });

    expect(loadOlder).toHaveBeenCalledTimes(1);
  });

  it("auto-loads older events when the chat content does not overflow the viewport", async () => {
    // No overflow ⇒ no scrollbar ⇒ user can't trigger loadOlder by
    // scrolling. The component must auto-trigger via useEffect.
    const loadOlder = setupPaginationTest();
    renderWithQueryClient(<ChatInterface />, queryClient);

    // Allow the on-mount auto-trigger useEffect to fire.
    await new Promise((r) => {
      setTimeout(r, 0);
    });

    expect(loadOlder).toHaveBeenCalled();
  });

  it("loads older events when the user wheels up while pinned at scrollTop=0", async () => {
    // Overscroll-at-top: scrollTop is already 0 so the browser does not
    // dispatch a scroll event. Wheel handler must catch this.
    const loadOlder = setupPaginationTest();
    renderWithQueryClient(<ChatInterface />, queryClient);

    const scrollContainer = document.querySelector(
      ".custom-scrollbar-always",
    ) as HTMLElement | null;
    expect(scrollContainer).not.toBeNull();

    // Plenty of scrollable content overhead so the no-overflow branch
    // doesn't claim the call — we want to exercise the wheel path.
    setScrollMetrics(scrollContainer!, {
      scrollTop: 0,
      scrollHeight: 10000,
      clientHeight: 800,
    });

    // Let any on-mount auto-trigger settle.
    await new Promise((r) => {
      setTimeout(r, 0);
    });
    loadOlder.mockClear();

    // User is pinned at the top and wheels upward — no scroll event
    // would fire here in a real browser.
    fireEvent.wheel(scrollContainer!, { deltaY: -100 });

    await new Promise((r) => {
      setTimeout(r, 0);
    });

    expect(loadOlder).toHaveBeenCalledTimes(1);
  });

  it("shows an error banner if loading older events fails", async () => {
    // This test exercises the real useLoadOlderEvents (so a rejected
    // searchEvents propagates through to the chat's error banner).
    // Override the global mock with the actual implementation.
    const actualLoadOlderModule = await vi.importActual<
      typeof import("#/hooks/use-load-older-events")
    >("#/hooks/use-load-older-events");
    vi.mocked(useLoadOlderEvents).mockImplementation(
      actualLoadOlderModule.useLoadOlderEvents,
    );

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

describe("ChatInterface - Pending message queue", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    mockSend.mockReset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    useOptimisticUserMessageStore.setState({ pendingMessages: [] });
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
      mutateAsync: vi
        .fn()
        .mockResolvedValue({ skipped_files: [], uploaded_files: [] }),
      isLoading: false,
    });
    useEventStore.setState({
      events: [],
      eventIds: new Set(),
      uiEvents: [],
    });
  });

  afterEach(() => {
    useOptimisticUserMessageStore.setState({ pendingMessages: [] });
  });

  function submitMessage(text: string) {
    // The chat input is a contenteditable div; the conversation store exposes
    // `submittedMessage` which CustomChatInput watches and forwards to the
    // ChatInterface's `onSubmit` handler. Driving that store directly is the
    // most reliable way to simulate "the user pressed send" in jsdom.
    act(() => {
      useConversationStore.setState({ submittedMessage: text });
    });
  }

  function renderInterface() {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/test-conversation-id"]}>
          <Routes>
            <Route path=":conversationId" element={<ChatInterface />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("shows the message in 'sending' state immediately when submitted", async () => {
    let resolveSend: ((value: unknown) => void) | undefined;
    mockSend.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );

    renderInterface();
    submitMessage("hello world");

    const pendingMessage = await screen.findByTestId("user-message");
    expect(pendingMessage).toHaveTextContent("hello world");
    expect(pendingMessage).toHaveAttribute("data-pending-status", "sending");
    expect(screen.getByTestId("chat-message-sending")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-message-retry")).not.toBeInTheDocument();

    resolveSend?.({ queued: false });
  });

  it("flips the message to 'error' with a retry link when send rejects", async () => {
    mockSend.mockRejectedValue(new Error("network down"));

    renderInterface();
    submitMessage("hello");

    await waitFor(() => {
      expect(screen.getByTestId("user-message")).toHaveAttribute(
        "data-pending-status",
        "error",
      );
    });
    expect(screen.getByTestId("chat-message-error")).toBeInTheDocument();
    expect(screen.getByTestId("chat-message-retry")).toBeInTheDocument();
  });

  it("queues multiple submitted messages, each with its own pending entry", async () => {
    mockSend.mockResolvedValue({ queued: false });

    renderInterface();
    submitMessage("first");
    submitMessage("second");

    await waitFor(() => {
      expect(screen.getAllByTestId("user-message")).toHaveLength(2);
    });
    const messages = screen.getAllByTestId("user-message");
    expect(messages[0]).toHaveTextContent("first");
    expect(messages[1]).toHaveTextContent("second");
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
