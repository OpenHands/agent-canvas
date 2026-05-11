import {
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import React from "react";
import { renderWithProviders } from "test-utils";
import { ConversationPanel } from "#/components/features/conversation-panel/conversation-panel";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import { ExecutionStatus } from "#/types/agent-server/core";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

// Mock the unified stop conversation hook
const mockStopConversationMutate = vi.fn();
vi.mock("#/hooks/mutation/use-unified-stop-conversation", () => ({
  useUnifiedPauseConversation: () => ({
    mutate: mockStopConversationMutate,
  }),
}));

// Helper to create complete AppConversation mock data
// Default timestamps use "now" so conversations are considered recent and
// rendered eagerly by the panel (which hides items older than ~1h by default).
const createMockConversation = (
  overrides: Partial<AppConversation> = {},
): AppConversation => ({
  id: "test-id",
  title: "Test Conversation",
  selected_repository: null,
  git_provider: null,
  selected_branch: null,
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  execution_status: ExecutionStatus.FINISHED,
  conversation_url: null,
  created_by_user_id: "user1",
  metrics: null,
  llm_model: null,
  trigger: null,
  pr_number: [],
  session_api_key: null,
  sandbox_id: null,
  sub_conversation_ids: [],
  ...overrides,
});

// Mock toast handlers to prevent unhandled rejection errors
vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: vi.fn(),
  displayErrorToast: vi.fn(),
  TOAST_OPTIONS: {},
}));

describe("ConversationPanel", () => {
  const onCloseMock = vi.fn();
  const RouterStub = createRoutesStub([
    {
      Component: () => <ConversationPanel onClose={onCloseMock} />,
      path: "/",
    },
    {
      // Add route to prevent "No routes matched location" warning
      Component: () => null,
      path: "/conversations/:conversationId",
    },
  ]);

  const renderConversationPanel = (
    options?: Parameters<typeof renderWithProviders>[1],
  ) => renderWithProviders(<RouterStub />, options);

  beforeAll(() => {
    vi.mock("react-router", async (importOriginal) => ({
      ...(await importOriginal<typeof import("react-router")>()),
      Link: ({ children }: React.PropsWithChildren) => children,
      useNavigate: vi.fn(() => vi.fn()),
      useLocation: vi.fn(() => ({ pathname: "/conversation" })),
      useParams: vi.fn(() => ({ conversationId: "2" })),
    }));
  });

  const mockConversations: AppConversation[] = [
    createMockConversation({ id: "1", title: "Conversation 1" }),
    createMockConversation({ id: "2", title: "Conversation 2" }),
    createMockConversation({ id: "3", title: "Conversation 3" }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockStopConversationMutate.mockClear();
    // Setup default mock for searchConversations
    vi.spyOn(
      AgentServerConversationService,
      "searchConversations",
    ).mockResolvedValue({
      items: [...mockConversations],
      next_page_id: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should render the conversations", async () => {
    renderConversationPanel();
    const cards = await screen.findAllByTestId("conversation-card");

    // NOTE that we filter out conversations that don't have a created_at property
    // (mock data has 4 conversations, but only 3 have a created_at property)
    expect(cards).toHaveLength(3);
  });

  it("should display an empty state when there are no conversations", async () => {
    const searchConversationsSpy = vi.spyOn(
      AgentServerConversationService,
      "searchConversations",
    );
    searchConversationsSpy.mockResolvedValue({
      items: [],
      next_page_id: null,
    });

    renderConversationPanel();

    const emptyState = await screen.findByText("CONVERSATION$NO_CONVERSATIONS");
    expect(emptyState).toBeInTheDocument();
  });

  it("should not display the empty state when there are no conversations and the panel is compact", async () => {
    const searchConversationsSpy = vi.spyOn(
      AgentServerConversationService,
      "searchConversations",
    );
    searchConversationsSpy.mockResolvedValue({
      items: [],
      next_page_id: null,
    });

    const CompactRouterStub = createRoutesStub([
      {
        Component: () => <ConversationPanel compact />,
        path: "/",
      },
      {
        Component: () => null,
        path: "/conversations/:conversationId",
      },
    ]);

    renderWithProviders(<CompactRouterStub />);

    const skeletons = await screen.findAllByTestId(
      "conversation-card-skeleton",
    );
    await waitForElementToBeRemoved(skeletons);

    expect(
      screen.queryByText("CONVERSATION$NO_CONVERSATIONS"),
    ).not.toBeInTheDocument();
  });

  it("should handle an error when fetching conversations", async () => {
    const searchConversationsSpy = vi.spyOn(
      AgentServerConversationService,
      "searchConversations",
    );
    searchConversationsSpy.mockRejectedValue(
      new Error("Failed to fetch conversations"),
    );

    renderConversationPanel();

    const error = await screen.findByText("Failed to fetch conversations");
    expect(error).toBeInTheDocument();
  });

  it("should cancel deleting a conversation", async () => {
    const user = userEvent.setup();
    renderConversationPanel();

    let cards = await screen.findAllByTestId("conversation-card");
    // Delete button should not be visible initially (context menu is closed)
    // The context menu is always in the DOM but hidden by CSS classes on the parent div
    const contextMenuParent = within(cards[0]).queryByTestId(
      "context-menu",
    )?.parentElement;
    if (contextMenuParent) {
      expect(contextMenuParent).toHaveClass("opacity-0", "invisible");
    }

    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);
    const deleteButton = within(cards[0]).getByTestId("delete-button");

    // Click the first delete button
    await user.click(deleteButton);

    // Cancel the deletion
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    expect(
      screen.queryByRole("button", { name: /cancel/i }),
    ).not.toBeInTheDocument();

    // Ensure the conversation is not deleted
    cards = await screen.findAllByTestId("conversation-card");
    expect(cards).toHaveLength(3);
  });

  it("should delete a conversation", async () => {
    const user = userEvent.setup();
    const mockData: AppConversation[] = [
      createMockConversation({ id: "1", title: "Conversation 1" }),
      createMockConversation({ id: "2", title: "Conversation 2" }),
      createMockConversation({ id: "3", title: "Conversation 3" }),
    ];

    const searchConversationsSpy = vi.spyOn(
      AgentServerConversationService,
      "searchConversations",
    );
    searchConversationsSpy.mockImplementation(async () => ({
      items: mockData,
      next_page_id: null,
    }));

    const deleteConversationSpy = vi.spyOn(
      AgentServerConversationService,
      "deleteConversation",
    );
    deleteConversationSpy.mockImplementation(async (id: string) => {
      const index = mockData.findIndex((conv) => conv.id === id);
      if (index !== -1) {
        mockData.splice(index, 1);
      }
    });

    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");
    // Initially shows 3 conversations (no filtering)
    expect(cards).toHaveLength(3);

    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);
    const deleteButton = within(cards[0]).getByTestId("delete-button");

    // Click the first delete button
    await user.click(deleteButton);

    // Confirm the deletion
    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await user.click(confirmButton);

    // Verify modal is closed after confirmation
    expect(
      screen.queryByRole("button", { name: /confirm/i }),
    ).not.toBeInTheDocument();
  });

  it("should call onClose after clicking a card", async () => {
    const user = userEvent.setup();
    renderConversationPanel();
    const cards = await screen.findAllByTestId("conversation-card");
    const firstCard = cards[1];

    await user.click(firstCard);

    expect(onCloseMock).toHaveBeenCalledOnce();
  });

  it("should refetch data on rerenders", async () => {
    const user = userEvent.setup();
    const searchConversationsSpy = vi.spyOn(
      AgentServerConversationService,
      "searchConversations",
    );
    searchConversationsSpy.mockResolvedValue({
      items: [...mockConversations],
      next_page_id: null,
    });

    function PanelWithToggle() {
      const [isOpen, setIsOpen] = React.useState(true);
      return (
        <>
          <button type="button" onClick={() => setIsOpen((prev) => !prev)}>
            Toggle
          </button>
          {isOpen && <ConversationPanel onClose={onCloseMock} />}
        </>
      );
    }

    const MyRouterStub = createRoutesStub([
      {
        Component: PanelWithToggle,
        path: "/",
      },
    ]);

    renderWithProviders(<MyRouterStub />);

    const toggleButton = screen.getByText("Toggle");

    // Initial render
    const cards = await screen.findAllByTestId("conversation-card");
    expect(cards).toHaveLength(3);

    // Toggle off
    await user.click(toggleButton);
    expect(screen.queryByTestId("conversation-card")).not.toBeInTheDocument();

    // Toggle on
    await user.click(toggleButton);
    const newCards = await screen.findAllByTestId("conversation-card");
    expect(newCards).toHaveLength(3);
  });

  it("keeps invalid timestamps recent and only shows load more after expanding older conversations", async () => {
    const now = Date.now();
    const minutesAgo = (minutes: number) =>
      new Date(now - minutes * 60 * 1000).toISOString();

    const user = userEvent.setup();
    const searchConversationsSpy = vi.spyOn(
      AgentServerConversationService,
      "searchConversations",
    );
    searchConversationsSpy.mockReset();
    searchConversationsSpy
      .mockResolvedValueOnce({
        items: [
          createMockConversation({
            id: "recent",
            title: "Recent Conversation",
            updated_at: minutesAgo(59),
          }),
          createMockConversation({
            id: "invalid",
            title: "Invalid Timestamp",
            updated_at: "invalid-date",
          }),
          createMockConversation({
            id: "missing",
            title: "Missing Timestamp",
            updated_at: undefined as unknown as string,
          }),
          createMockConversation({
            id: "older",
            title: "Older Conversation",
            updated_at: minutesAgo(61),
          }),
        ],
        next_page_id: "page-2",
      })
      .mockResolvedValueOnce({
        items: [
          createMockConversation({
            id: "paged",
            title: "Paged Conversation",
            updated_at: minutesAgo(30),
          }),
        ],
        next_page_id: null,
      });

    renderConversationPanel();

    expect(await screen.findByText("Recent Conversation")).toBeInTheDocument();
    expect(screen.getByText("Invalid Timestamp")).toBeInTheDocument();
    expect(screen.getByText("Missing Timestamp")).toBeInTheDocument();
    expect(screen.queryByText("Older Conversation")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("older-conversations-summary"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("load-more-conversations"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId("toggle-older-conversations"));

    expect(await screen.findByText("Older Conversation")).toBeInTheDocument();

    await user.click(screen.getByTestId("load-more-conversations"));

    await waitFor(() => {
      expect(searchConversationsSpy).toHaveBeenCalledWith(20, "page-2");
    });
    expect(await screen.findByText("Paged Conversation")).toBeInTheDocument();
  });

  it("should cancel stopping a conversation", async () => {
    const user = userEvent.setup();

    // Create mock data with a RUNNING conversation
    const mockRunningConversations: AppConversation[] = [
      createMockConversation({
        id: "1",
        title: "Running Conversation",
        execution_status: ExecutionStatus.RUNNING,
      }),
      createMockConversation({
        id: "2",
        title: "Starting Conversation",
        execution_status: ExecutionStatus.RUNNING,
      }),
      createMockConversation({
        id: "3",
        title: "Stopped Conversation",
        execution_status: ExecutionStatus.PAUSED,
      }),
    ];

    const searchConversationsSpy = vi.spyOn(
      AgentServerConversationService,
      "searchConversations",
    );
    searchConversationsSpy.mockResolvedValue({
      items: mockRunningConversations,
      next_page_id: null,
    });

    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");
    expect(cards).toHaveLength(3);

    // Click ellipsis on the first card (RUNNING status)
    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);

    // Stop button should be available for RUNNING conversation
    const stopButton = within(cards[0]).getByTestId("stop-button");
    expect(stopButton).toBeInTheDocument();

    // Click the stop button
    await user.click(stopButton);

    // Cancel the stopping action
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    expect(
      screen.queryByRole("button", { name: /cancel/i }),
    ).not.toBeInTheDocument();

    // Ensure the conversation status hasn't changed
    const updatedCards = await screen.findAllByTestId("conversation-card");
    expect(updatedCards).toHaveLength(3);
  });

  it("should stop a conversation", async () => {
    const user = userEvent.setup();

    const mockData: AppConversation[] = [
      createMockConversation({
        id: "1",
        title: "Conversation 1",
        execution_status: ExecutionStatus.RUNNING,
      }),
      createMockConversation({
        id: "2",
        title: "Conversation 2",
        execution_status: ExecutionStatus.FINISHED,
      }),
      createMockConversation({
        id: "3",
        title: "Conversation 3",
        execution_status: ExecutionStatus.FINISHED,
      }),
    ];

    const searchConversationsSpy = vi.spyOn(
      AgentServerConversationService,
      "searchConversations",
    );
    searchConversationsSpy.mockImplementation(async () => ({
      items: mockData,
      next_page_id: null,
    }));

    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");
    // Component shows all 3 conversations (no filtering by status)
    expect(cards).toHaveLength(3);

    // Click ellipsis on the first card (RUNNING status)
    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);

    const stopButton = within(cards[0]).getByTestId("stop-button");

    // Click the stop button
    await user.click(stopButton);

    // Confirm the stopping action
    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await user.click(confirmButton);

    expect(
      screen.queryByRole("button", { name: /confirm/i }),
    ).not.toBeInTheDocument();

    // Verify the mutation was called
    expect(mockStopConversationMutate).toHaveBeenCalledWith({
      conversationId: "1",
    });
    expect(mockStopConversationMutate).toHaveBeenCalledTimes(1);
  });

  it("should only show stop button for STARTING or RUNNING conversations", async () => {
    const user = userEvent.setup();

    const mockMixedStatusConversations: AppConversation[] = [
      createMockConversation({
        id: "1",
        title: "Running Conversation",
        execution_status: ExecutionStatus.RUNNING,
      }),
      createMockConversation({
        id: "2",
        title: "Starting Conversation",
        execution_status: ExecutionStatus.RUNNING,
      }),
      createMockConversation({
        id: "3",
        title: "Stopped Conversation",
        execution_status: ExecutionStatus.PAUSED,
      }),
    ];

    const searchConversationsSpy = vi.spyOn(
      AgentServerConversationService,
      "searchConversations",
    );
    searchConversationsSpy.mockResolvedValue({
      items: mockMixedStatusConversations,
      next_page_id: null,
    });

    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");
    expect(cards).toHaveLength(3);

    // Test RUNNING conversation - should show stop button
    const runningEllipsisButton = within(cards[0]).getByTestId(
      "ellipsis-button",
    );
    await user.click(runningEllipsisButton);

    expect(within(cards[0]).getByTestId("stop-button")).toBeInTheDocument();

    // Click outside to close the menu
    await user.click(document.body);

    // Wait for context menu to close (check CSS classes on parent div)
    await waitFor(() => {
      const contextMenuParent = within(cards[0]).queryByTestId(
        "context-menu",
      )?.parentElement;
      if (contextMenuParent) {
        expect(contextMenuParent).toHaveClass("opacity-0", "invisible");
      }
    });

    // Test STARTING conversation - should show stop button
    const startingEllipsisButton = within(cards[1]).getByTestId(
      "ellipsis-button",
    );
    await user.click(startingEllipsisButton);

    expect(within(cards[1]).getByTestId("stop-button")).toBeInTheDocument();

    // Click outside to close the menu
    await user.click(document.body);

    // Wait for context menu to close (check CSS classes on parent div)
    await waitFor(() => {
      const contextMenuParent = within(cards[1]).queryByTestId(
        "context-menu",
      )?.parentElement;
      if (contextMenuParent) {
        expect(contextMenuParent).toHaveClass("opacity-0", "invisible");
      }
    });

    // Test STOPPED conversation - should NOT show stop button
    const stoppedEllipsisButton = within(cards[2]).getByTestId(
      "ellipsis-button",
    );
    await user.click(stoppedEllipsisButton);

    expect(
      within(cards[2]).queryByTestId("stop-button"),
    ).not.toBeInTheDocument();
  });

  it("should show edit button in context menu", async () => {
    const user = userEvent.setup();
    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");
    expect(cards).toHaveLength(3);

    // Click ellipsis to open context menu
    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);

    // Edit button should be visible within the first card's context menu
    const editButton = within(cards[0]).getByTestId("edit-button");
    expect(editButton).toBeInTheDocument();
    expect(editButton).toHaveTextContent("BUTTON$RENAME");
  });

  it("should enter edit mode when edit button is clicked", async () => {
    const user = userEvent.setup();
    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");

    // Click ellipsis to open context menu
    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);

    // Click edit button within the first card's context menu
    const editButton = within(cards[0]).getByTestId("edit-button");
    await user.click(editButton);

    // Should find input field instead of title text
    const titleInput = within(cards[0]).getByTestId("conversation-card-title");
    expect(titleInput).toBeInTheDocument();
    expect(titleInput.tagName).toBe("INPUT");
    expect(titleInput).toHaveValue("Conversation 1");
    expect(titleInput).toHaveFocus();
  });

  it("should successfully update conversation title", async () => {
    const user = userEvent.setup();

    // Mock the updateConversationTitle API call
    const updateConversationTitleSpy = vi.spyOn(
      AgentServerConversationService,
      "updateConversationTitle",
    );
    updateConversationTitleSpy.mockResolvedValue(
      createMockConversation({ id: "1", title: "Updated Title" }),
    );

    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");

    // Enter edit mode
    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);

    const editButton = within(cards[0]).getByTestId("edit-button");
    await user.click(editButton);

    // Edit the title
    const titleInput = within(cards[0]).getByTestId("conversation-card-title");
    await user.clear(titleInput);
    await user.type(titleInput, "Updated Title");

    // Blur the input to save
    await user.tab();

    // Verify API call was made with correct parameters
    expect(updateConversationTitleSpy).toHaveBeenCalledWith(
      "1",
      "Updated Title",
    );
  });

  it("should save title when Enter key is pressed", async () => {
    const user = userEvent.setup();

    const updateConversationTitleSpy = vi.spyOn(
      AgentServerConversationService,
      "updateConversationTitle",
    );
    updateConversationTitleSpy.mockResolvedValue(
      createMockConversation({ id: "1", title: "Updated Title" }),
    );

    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");

    // Enter edit mode
    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);

    const editButton = within(cards[0]).getByTestId("edit-button");
    await user.click(editButton);

    // Edit the title and press Enter
    const titleInput = within(cards[0]).getByTestId("conversation-card-title");
    await user.clear(titleInput);
    await user.type(titleInput, "Title Updated via Enter");
    await user.keyboard("{Enter}");

    // Verify API call was made
    expect(updateConversationTitleSpy).toHaveBeenCalledWith(
      "1",
      "Title Updated via Enter",
    );
  });

  it("should trim whitespace from title", async () => {
    const user = userEvent.setup();

    const updateConversationTitleSpy = vi.spyOn(
      AgentServerConversationService,
      "updateConversationTitle",
    );
    updateConversationTitleSpy.mockResolvedValue(
      createMockConversation({ id: "1", title: "Updated Title" }),
    );

    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");

    // Enter edit mode
    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);

    const editButton = within(cards[0]).getByTestId("edit-button");
    await user.click(editButton);

    // Edit the title with extra whitespace
    const titleInput = within(cards[0]).getByTestId("conversation-card-title");
    await user.clear(titleInput);
    await user.type(titleInput, "   Trimmed Title   ");
    await user.tab();

    // Verify API call was made with trimmed title
    expect(updateConversationTitleSpy).toHaveBeenCalledWith(
      "1",
      "Trimmed Title",
    );
  });

  it("should revert to original title when empty", async () => {
    const user = userEvent.setup();

    const updateConversationTitleSpy = vi.spyOn(
      AgentServerConversationService,
      "updateConversationTitle",
    );
    updateConversationTitleSpy.mockResolvedValue(
      createMockConversation({ id: "1", title: "Updated Title" }),
    );

    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");

    // Enter edit mode
    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);

    const editButton = within(cards[0]).getByTestId("edit-button");
    await user.click(editButton);

    // Clear the title completely
    const titleInput = within(cards[0]).getByTestId("conversation-card-title");
    await user.clear(titleInput);
    await user.tab();

    // Verify API was not called
    expect(updateConversationTitleSpy).not.toHaveBeenCalled();
  });

  it("should handle API error when updating title", async () => {
    const user = userEvent.setup();

    const updateConversationTitleSpy = vi.spyOn(
      AgentServerConversationService,
      "updateConversationTitle",
    );
    updateConversationTitleSpy.mockRejectedValue(new Error("API Error"));
    // Provide return type for mock

    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");

    // Enter edit mode
    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);

    const editButton = within(cards[0]).getByTestId("edit-button");
    await user.click(editButton);

    // Edit the title
    const titleInput = within(cards[0]).getByTestId("conversation-card-title");
    await user.clear(titleInput);
    await user.type(titleInput, "Failed Update");
    await user.tab();

    // Verify API call was made
    expect(updateConversationTitleSpy).toHaveBeenCalledWith(
      "1",
      "Failed Update",
    );

    // Wait for error handling
    await waitFor(() => {
      expect(updateConversationTitleSpy).toHaveBeenCalled();
    });
  });

  it("should close context menu when edit button is clicked", async () => {
    const user = userEvent.setup();
    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");

    // Click ellipsis to open context menu
    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);

    // Verify context menu is open within the first card
    const contextMenu = within(cards[0]).getByTestId("context-menu");
    expect(contextMenu).toBeInTheDocument();

    // Click edit button within the first card's context menu
    const editButton = within(cards[0]).getByTestId("edit-button");
    await user.click(editButton);

    // Wait for context menu to close after edit button click (check CSS classes on parent div)
    await waitFor(() => {
      const contextMenuParent = within(cards[0]).queryByTestId(
        "context-menu",
      )?.parentElement;
      if (contextMenuParent) {
        expect(contextMenuParent).toHaveClass("opacity-0", "invisible");
      }
    });
  });

  it("should not call API when title is unchanged", async () => {
    const user = userEvent.setup();

    const updateConversationTitleSpy = vi.spyOn(
      AgentServerConversationService,
      "updateConversationTitle",
    );
    updateConversationTitleSpy.mockResolvedValue(
      createMockConversation({ id: "1", title: "Updated Title" }),
    );

    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");

    // Enter edit mode
    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);

    const editButton = within(cards[0]).getByTestId("edit-button");
    await user.click(editButton);

    // Don't change the title, just blur
    await user.tab();

    // Verify API was NOT called with the same title (since handleConversationTitleChange will always be called)
    expect(updateConversationTitleSpy).not.toHaveBeenCalledWith("1", {
      title: "Conversation 1",
    });
  });

  it("should handle special characters in title", async () => {
    const user = userEvent.setup();

    const updateConversationTitleSpy = vi.spyOn(
      AgentServerConversationService,
      "updateConversationTitle",
    );
    updateConversationTitleSpy.mockResolvedValue(
      createMockConversation({ id: "1", title: "Updated Title" }),
    );

    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");

    // Enter edit mode
    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);

    const editButton = within(cards[0]).getByTestId("edit-button");
    await user.click(editButton);

    // Edit the title with special characters
    const titleInput = within(cards[0]).getByTestId("conversation-card-title");
    await user.clear(titleInput);
    await user.type(titleInput, "Special @#$%^&*()_+ Characters");
    await user.tab();

    // Verify API call was made with special characters
    expect(updateConversationTitleSpy).toHaveBeenCalledWith(
      "1",
      "Special @#$%^&*()_+ Characters",
    );
  });

  it("should close delete modal when clicking backdrop", async () => {
    const user = userEvent.setup();
    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");

    // Open context menu and click delete
    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);
    const deleteButton = within(cards[0]).getByTestId("delete-button");
    await user.click(deleteButton);

    // Modal should be visible
    expect(
      screen.getByRole("button", { name: /confirm/i }),
    ).toBeInTheDocument();

    // Click the backdrop (the dark overlay behind the modal)
    const backdrop = document.querySelector(".bg-black.opacity-60");
    expect(backdrop).toBeInTheDocument();
    await user.click(backdrop!);

    // Modal should be closed
    expect(
      screen.queryByRole("button", { name: /confirm/i }),
    ).not.toBeInTheDocument();
  });

  it("should close stop modal when clicking backdrop", async () => {
    const user = userEvent.setup();

    // Create mock data with a RUNNING conversation
    const mockRunningConversations: AppConversation[] = [
      createMockConversation({
        id: "1",
        title: "Running Conversation",
        execution_status: ExecutionStatus.RUNNING,
      }),
      createMockConversation({
        id: "2",
        title: "Starting Conversation",
        execution_status: ExecutionStatus.RUNNING,
      }),
      createMockConversation({
        id: "3",
        title: "Stopped Conversation",
        execution_status: ExecutionStatus.PAUSED,
      }),
    ];

    vi.spyOn(
      AgentServerConversationService,
      "searchConversations",
    ).mockResolvedValue({
      items: mockRunningConversations,
      next_page_id: null,
    });

    renderConversationPanel();

    const cards = await screen.findAllByTestId("conversation-card");

    // Open context menu and click stop
    const ellipsisButton = within(cards[0]).getByTestId("ellipsis-button");
    await user.click(ellipsisButton);
    const stopButton = within(cards[0]).getByTestId("stop-button");
    await user.click(stopButton);

    // Modal should be visible
    expect(
      screen.getByRole("button", { name: /confirm/i }),
    ).toBeInTheDocument();

    // Click the backdrop
    const backdrop = document.querySelector(".bg-black.opacity-60");
    expect(backdrop).toBeInTheDocument();
    await user.click(backdrop!);

    // Modal should be closed
    expect(
      screen.queryByRole("button", { name: /confirm/i }),
    ).not.toBeInTheDocument();
  });

  describe("older conversations cutoff", () => {
    const recentIso = () => new Date().toISOString();
    const olderIso = () =>
      new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    it("hides conversations older than 1h behind a summary line", async () => {
      vi.spyOn(
        AgentServerConversationService,
        "searchConversations",
      ).mockResolvedValue({
        items: [
          createMockConversation({
            id: "recent",
            title: "Recent",
            updated_at: recentIso(),
          }),
          createMockConversation({
            id: "old1",
            title: "Old 1",
            updated_at: olderIso(),
          }),
          createMockConversation({
            id: "old2",
            title: "Old 2",
            updated_at: olderIso(),
          }),
        ],
        next_page_id: null,
      });

      renderConversationPanel();

      const cards = await screen.findAllByTestId("conversation-card");
      expect(cards).toHaveLength(1);
      expect(within(cards[0]).getByText("Recent")).toBeInTheDocument();

      const summary = screen.getByTestId("older-conversations-summary");
      expect(summary).toHaveTextContent("2");
      expect(summary).toHaveTextContent("CONVERSATION$N_OLDER_CONVERSATIONS");
      expect(
        within(summary).getByTestId("toggle-older-conversations"),
      ).toHaveTextContent("CONVERSATION$SHOW_ALL");
      expect(
        within(summary).getByTestId("delete-older-conversations"),
      ).toHaveTextContent("CONVERSATION$DELETE_ALL");
    });

    it("does not render the summary when no conversations are older than 1h", async () => {
      vi.spyOn(
        AgentServerConversationService,
        "searchConversations",
      ).mockResolvedValue({
        items: [
          createMockConversation({
            id: "recent1",
            title: "Recent 1",
            updated_at: recentIso(),
          }),
          createMockConversation({
            id: "recent2",
            title: "Recent 2",
            updated_at: recentIso(),
          }),
        ],
        next_page_id: null,
      });

      renderConversationPanel();

      await screen.findAllByTestId("conversation-card");
      expect(
        screen.queryByTestId("older-conversations-summary"),
      ).not.toBeInTheDocument();
    });

    it("toggles older conversations visibility via the show-all link", async () => {
      const user = userEvent.setup();
      vi.spyOn(
        AgentServerConversationService,
        "searchConversations",
      ).mockResolvedValue({
        items: [
          createMockConversation({
            id: "recent",
            title: "Recent",
            updated_at: recentIso(),
          }),
          createMockConversation({
            id: "old1",
            title: "Old 1",
            updated_at: olderIso(),
          }),
        ],
        next_page_id: null,
      });

      renderConversationPanel();

      let cards = await screen.findAllByTestId("conversation-card");
      expect(cards).toHaveLength(1);

      const toggle = screen.getByTestId("toggle-older-conversations");
      expect(toggle).toHaveTextContent("CONVERSATION$SHOW_ALL");
      await user.click(toggle);

      cards = await screen.findAllByTestId("conversation-card");
      expect(cards).toHaveLength(2);
      expect(toggle).toHaveTextContent("CONVERSATION$HIDE");

      await user.click(toggle);
      cards = await screen.findAllByTestId("conversation-card");
      expect(cards).toHaveLength(1);
    });

    it("delete-all confirms then deletes every older conversation", async () => {
      const user = userEvent.setup();
      const deleteSpy = vi
        .spyOn(AgentServerConversationService, "deleteConversation")
        .mockResolvedValue();

      vi.spyOn(
        AgentServerConversationService,
        "searchConversations",
      ).mockResolvedValue({
        items: [
          createMockConversation({
            id: "recent",
            title: "Recent",
            updated_at: recentIso(),
          }),
          createMockConversation({
            id: "old1",
            title: "Old 1",
            updated_at: olderIso(),
          }),
          createMockConversation({
            id: "old2",
            title: "Old 2",
            updated_at: olderIso(),
          }),
        ],
        next_page_id: null,
      });

      renderConversationPanel();
      await screen.findAllByTestId("conversation-card");

      await user.click(screen.getByTestId("delete-older-conversations"));

      const confirmButton = await screen.findByRole("button", {
        name: /confirm/i,
      });
      expect(confirmButton).toBeInTheDocument();

      await user.click(confirmButton);

      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalledTimes(2);
      });
      expect(deleteSpy).toHaveBeenCalledWith("old1");
      expect(deleteSpy).toHaveBeenCalledWith("old2");
    });

    it("shows an error toast and still navigates away when the active older conversation was deleted successfully", async () => {
      const user = userEvent.setup();
      const navigate = vi.fn();
      const deleteSpy = vi
        .spyOn(AgentServerConversationService, "deleteConversation")
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("delete failed"));

      vi.spyOn(
        AgentServerConversationService,
        "searchConversations",
      ).mockResolvedValue({
        items: [
          createMockConversation({
            id: "recent",
            title: "Recent",
            updated_at: recentIso(),
          }),
          createMockConversation({
            id: "old1",
            title: "Old 1",
            updated_at: olderIso(),
          }),
          createMockConversation({
            id: "old2",
            title: "Old 2",
            updated_at: olderIso(),
          }),
        ],
        next_page_id: null,
      });

      renderConversationPanel({
        navigation: { conversationId: "old1", navigate },
      });
      await screen.findAllByTestId("conversation-card");

      await user.click(screen.getByTestId("delete-older-conversations"));
      await user.click(await screen.findByRole("button", { name: /confirm/i }));

      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalledTimes(2);
      });
      expect(deleteSpy).toHaveBeenNthCalledWith(1, "old1");
      expect(deleteSpy).toHaveBeenNthCalledWith(2, "old2");
      expect(displayErrorToast).toHaveBeenCalledWith(
        "1 conversation could not be deleted.",
      );
      expect(navigate).toHaveBeenCalledWith("/conversations");
    });

    it("does not navigate away when the active older conversation fails to delete", async () => {
      const user = userEvent.setup();
      const navigate = vi.fn();
      const deleteSpy = vi
        .spyOn(AgentServerConversationService, "deleteConversation")
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("delete failed"));

      vi.spyOn(
        AgentServerConversationService,
        "searchConversations",
      ).mockResolvedValue({
        items: [
          createMockConversation({
            id: "recent",
            title: "Recent",
            updated_at: recentIso(),
          }),
          createMockConversation({
            id: "old1",
            title: "Old 1",
            updated_at: olderIso(),
          }),
          createMockConversation({
            id: "old2",
            title: "Old 2",
            updated_at: olderIso(),
          }),
        ],
        next_page_id: null,
      });

      renderConversationPanel({
        navigation: { conversationId: "old2", navigate },
      });
      await screen.findAllByTestId("conversation-card");

      await user.click(screen.getByTestId("delete-older-conversations"));
      await user.click(await screen.findByRole("button", { name: /confirm/i }));

      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalledTimes(2);
      });
      expect(deleteSpy).toHaveBeenNthCalledWith(1, "old1");
      expect(deleteSpy).toHaveBeenNthCalledWith(2, "old2");
      expect(displayErrorToast).toHaveBeenCalledWith(
        "1 conversation could not be deleted.",
      );
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe("active conversation highlight", () => {
    it("marks the currently active conversation with data-active=true", async () => {
      vi.spyOn(
        AgentServerConversationService,
        "searchConversations",
      ).mockResolvedValue({
        items: [
          createMockConversation({ id: "1", title: "Conversation 1" }),
          createMockConversation({ id: "2", title: "Conversation 2" }),
          createMockConversation({ id: "3", title: "Conversation 3" }),
        ],
        next_page_id: null,
      });

      renderWithProviders(<RouterStub />, {
        navigation: { conversationId: "2", currentPath: "/conversations/2" },
      });

      const cards = await screen.findAllByTestId("conversation-card");
      expect(cards).toHaveLength(3);
      expect(cards[0]).toHaveAttribute("data-active", "false");
      expect(cards[1]).toHaveAttribute("data-active", "true");
      expect(cards[2]).toHaveAttribute("data-active", "false");
    });

    it("renders no active card when no conversation is selected", async () => {
      vi.spyOn(
        AgentServerConversationService,
        "searchConversations",
      ).mockResolvedValue({
        items: [createMockConversation({ id: "1", title: "Conversation 1" })],
        next_page_id: null,
      });

      renderWithProviders(<RouterStub />, {
        navigation: { conversationId: null, currentPath: "/" },
      });

      const cards = await screen.findAllByTestId("conversation-card");
      expect(cards[0]).toHaveAttribute("data-active", "false");
    });
  });

  describe("load-more link", () => {
    const recentIso = () => new Date().toISOString();
    const olderIso = () =>
      new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    it("shows a load-more link when there is a next page and no older conversations are hidden", async () => {
      vi.spyOn(
        AgentServerConversationService,
        "searchConversations",
      ).mockResolvedValue({
        items: [
          createMockConversation({
            id: "recent",
            title: "Recent",
            updated_at: recentIso(),
          }),
        ],
        next_page_id: "page-2",
      });

      renderConversationPanel();

      await screen.findAllByTestId("conversation-card");
      const loadMore = await screen.findByTestId("load-more-conversations");
      expect(loadMore).toHaveTextContent("CONVERSATION$LOAD_MORE");
    });

    it("hides the load-more link while older conversations are hidden", async () => {
      vi.spyOn(
        AgentServerConversationService,
        "searchConversations",
      ).mockResolvedValue({
        items: [
          createMockConversation({
            id: "recent",
            title: "Recent",
            updated_at: recentIso(),
          }),
          createMockConversation({
            id: "old1",
            title: "Old 1",
            updated_at: olderIso(),
          }),
        ],
        next_page_id: "page-2",
      });

      renderConversationPanel();

      await screen.findAllByTestId("conversation-card");
      // Older conversations are present and collapsed → no load-more.
      expect(
        screen.queryByTestId("load-more-conversations"),
      ).not.toBeInTheDocument();

      // After expanding "show all", the link reappears.
      const user = userEvent.setup();
      await user.click(screen.getByTestId("toggle-older-conversations"));
      expect(
        await screen.findByTestId("load-more-conversations"),
      ).toBeInTheDocument();
    });

    it("fetches the next page when the load-more link is clicked", async () => {
      const user = userEvent.setup();
      const searchSpy = vi
        .spyOn(AgentServerConversationService, "searchConversations")
        .mockResolvedValueOnce({
          items: [
            createMockConversation({
              id: "recent",
              title: "Recent",
              updated_at: recentIso(),
            }),
          ],
          next_page_id: "page-2",
        })
        .mockResolvedValueOnce({
          items: [
            createMockConversation({
              id: "page2-1",
              title: "Page 2 Conversation",
              updated_at: recentIso(),
            }),
          ],
          next_page_id: null,
        });

      renderConversationPanel();

      const loadMore = await screen.findByTestId("load-more-conversations");
      await user.click(loadMore);

      await waitFor(() => {
        expect(searchSpy).toHaveBeenCalledTimes(2);
      });

      // After the second page resolves, the link disappears (no more pages).
      await waitFor(() => {
        expect(
          screen.queryByTestId("load-more-conversations"),
        ).not.toBeInTheDocument();
      });
    });
  });
});
