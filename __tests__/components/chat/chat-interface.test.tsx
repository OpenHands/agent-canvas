import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  test,
  vi,
} from "vitest";
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

describe('ChatInterface - Status Indicator', () => {
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

    expect(screen.queryByTestId("chat-status-indicator")).not.toBeInTheDocument();
  });
});
