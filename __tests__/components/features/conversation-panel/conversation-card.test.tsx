import { screen, within } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  test,
  vi,
} from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "test-utils";
import { formatTimeDelta } from "#/utils/format-time-delta";
import { ConversationCard } from "#/components/features/conversation-panel/conversation-card/conversation-card";
import { clickOnEditButton } from "./utils";
import { ConversationCardActions } from "#/components/features/conversation-panel/conversation-card/conversation-card-actions";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

// We'll use the actual i18next implementation but override the translation function

// Mock the t function to return our custom translations
vi.mock("react-i18next", async () => {
  const actual = await vi.importActual("react-i18next");
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const translations: Record<string, string> = {
          CONVERSATION$CREATED: "Created",
          CONVERSATION$AGO: "ago",
          CONVERSATION$UPDATED: "Updated",
          COMMON$NO_REPOSITORY: "No repository",
          CONVERSATION$ACP_AGENT_GENERIC: "ACP",
        };
        return translations[key] || key;
      },
      i18n: {
        changeLanguage: () => new Promise(() => {}),
      },
    }),
  };
});

describe("ConversationCard", () => {
  const onClick = vi.fn();
  const onDelete = vi.fn();
  const onChangeTitle = vi.fn();

  beforeAll(() => {
    vi.stubGlobal("window", {
      open: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { origin: "http://localhost:3000" },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("should render the conversation card", () => {
    renderWithProviders(
      <ConversationCard
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
      />,
    );

    const card = screen.getByTestId("conversation-card");

    within(card).getByText("Conversation 1");

    // Use a regex to match the time part since it might have whitespace
    const timeRegex = new RegExp(
      formatTimeDelta(new Date("2021-10-01T12:00:00Z")),
    );
    expect(card).toHaveTextContent(timeRegex);
  });

  it("should render the selectedRepository if available", () => {
    const { rerender } = renderWithProviders(
      <ConversationCard
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
      />,
    );

    expect(
      screen.queryByTestId("conversation-card-selected-repository"),
    ).not.toBeInTheDocument();

    rerender(
      <ConversationCard
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={{
          selected_repository: "org/selectedRepository",
          selected_branch: "main",
          git_provider: "github",
        }}
        lastUpdatedAt="2021-10-01T12:00:00Z"
      />,
    );

    screen.getByTestId("conversation-card-selected-repository");
  });

  it("renders the workspace folder name when no repository is selected", () => {
    renderWithProviders(
      <ConversationCard
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
        workspaceWorkingDir="/workspace/project/agent-canvas"
      />,
    );

    expect(screen.getByText("agent-canvas")).toBeInTheDocument();
    expect(
      screen.getByTitle("/workspace/project/agent-canvas"),
    ).toBeInTheDocument();
  });

  it("handles Windows workspace paths and falls back when the path is empty", () => {
    const { rerender } = renderWithProviders(
      <ConversationCard
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
        workspaceWorkingDir="C:\\Users\\me\\repo"
      />,
    );

    expect(screen.getByText("repo")).toBeInTheDocument();

    rerender(
      <ConversationCard
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
        workspaceWorkingDir="   "
      />,
    );

    expect(screen.getByText("No repository")).toBeInTheDocument();
  });

  it("should toggle a context menu when clicking the ellipsis button", async () => {
    const user = userEvent.setup();
    const onContextMenuToggle = vi.fn();
    const { rerender } = renderWithProviders(
      <ConversationCard
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
        contextMenuOpen={false}
        onContextMenuToggle={onContextMenuToggle}
      />,
    );

    // The closed state is observable via the `data-context-menu-open` attr
    // on the conversation-card root; visual hiding is a CSS consequence
    // covered by the Playwright snapshot suite.
    expect(screen.getByTestId("conversation-card")).toHaveAttribute(
      "data-context-menu-open",
      "false",
    );

    const ellipsisButton = screen.getByTestId("ellipsis-button");
    await user.click(ellipsisButton);

    expect(onContextMenuToggle).toHaveBeenCalledWith(true);

    // Simulate context menu being opened by parent
    rerender(
      <ConversationCard
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
        contextMenuOpen
        onContextMenuToggle={onContextMenuToggle}
      />,
    );

    screen.getByTestId("context-menu");

    await user.click(ellipsisButton);

    expect(onContextMenuToggle).toHaveBeenCalledWith(false);
  });

  it("should call onDelete when the delete button is clicked", async () => {
    const user = userEvent.setup();
    const onContextMenuToggle = vi.fn();
    renderWithProviders(
      <ConversationCard
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
        contextMenuOpen
        onContextMenuToggle={onContextMenuToggle}
      />,
    );

    const menu = screen.getByTestId("context-menu");
    const deleteButton = within(menu).getByTestId("delete-button");

    await user.click(deleteButton);

    expect(onDelete).toHaveBeenCalled();
    expect(onContextMenuToggle).toHaveBeenCalledWith(false);
  });

  test("clicking the selectedRepository should not trigger the onClick handler", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ConversationCard
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={{
          selected_repository: "org/selectedRepository",
          selected_branch: "main",
          git_provider: "github",
        }}
        lastUpdatedAt="2021-10-01T12:00:00Z"
      />,
    );

    const selectedRepository = screen.getByTestId(
      "conversation-card-selected-repository",
    );
    await user.click(selectedRepository);

    expect(onClick).not.toHaveBeenCalled();
  });

  test("conversation title should call onChangeTitle when changed and blurred", async () => {
    const user = userEvent.setup();
    let menuOpen = true;
    const onContextMenuToggle = vi.fn((isOpen: boolean) => {
      menuOpen = isOpen;
    });
    const { rerender } = renderWithProviders(
      <ConversationCard
        onDelete={onDelete}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
        onChangeTitle={onChangeTitle}
        contextMenuOpen={menuOpen}
        onContextMenuToggle={onContextMenuToggle}
      />,
    );

    await clickOnEditButton(user);

    // Re-render with updated state
    rerender(
      <ConversationCard
        onDelete={onDelete}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
        onChangeTitle={onChangeTitle}
        contextMenuOpen={menuOpen}
        onContextMenuToggle={onContextMenuToggle}
      />,
    );

    const title = screen.getByTestId("conversation-card-title");

    expect(title).toBeEnabled();
    // Context menu should be closed after edit button is clicked.
    expect(screen.getByTestId("conversation-card")).toHaveAttribute(
      "data-context-menu-open",
      "false",
    );
    // expect to be focused
    expect(document.activeElement).toBe(title);

    await user.clear(title);
    await user.type(title, "New Conversation Name   ");
    await user.tab();

    expect(onChangeTitle).toHaveBeenCalledWith("New Conversation Name");
  });

  it("should not call onChange title", async () => {
    const user = userEvent.setup();
    const onContextMenuToggle = vi.fn();
    renderWithProviders(
      <ConversationCard
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
        contextMenuOpen
        onContextMenuToggle={onContextMenuToggle}
      />,
    );

    await clickOnEditButton(user);

    const title = screen.getByTestId("conversation-card-title");

    await user.clear(title);
    await user.tab();

    expect(onChangeTitle).not.toBeCalled();
  });

  test("clicking the title should trigger the onClick handler", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ConversationCard
        onClick={onClick}
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
      />,
    );

    const title = screen.getByTestId("conversation-card-title");
    await user.click(title);

    expect(onClick).toHaveBeenCalled();
  });

  test("clicking the title should not trigger the onClick handler if edit mode", async () => {
    const user = userEvent.setup();
    const onContextMenuToggle = vi.fn();
    renderWithProviders(
      <ConversationCard
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
        contextMenuOpen
        onContextMenuToggle={onContextMenuToggle}
      />,
    );

    await clickOnEditButton(user);

    const title = screen.getByTestId("conversation-card-title");
    await user.click(title);

    expect(onClick).not.toHaveBeenCalled();
  });

  test("clicking the delete button should not trigger the onClick handler", async () => {
    const user = userEvent.setup();
    const onContextMenuToggle = vi.fn();
    renderWithProviders(
      <ConversationCard
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
        contextMenuOpen
        onContextMenuToggle={onContextMenuToggle}
      />,
    );

    const menu = screen.getByTestId("context-menu");
    const deleteButton = within(menu).getByTestId("delete-button");

    await user.click(deleteButton);

    expect(onClick).not.toHaveBeenCalled();
  });

  it("should not display the edit or delete options if the handler is not provided", async () => {
    const onContextMenuToggle = vi.fn();
    const { rerender } = renderWithProviders(
      <ConversationCard
        onClick={onClick}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
        contextMenuOpen
        onContextMenuToggle={onContextMenuToggle}
      />,
    );

    const menu = await screen.findByTestId("context-menu");
    expect(within(menu).queryByTestId("edit-button")).toBeInTheDocument();
    expect(within(menu).queryByTestId("delete-button")).not.toBeInTheDocument();

    rerender(
      <ConversationCard
        onClick={onClick}
        onDelete={onDelete}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
        contextMenuOpen
        onContextMenuToggle={onContextMenuToggle}
      />,
    );

    const newMenu = await screen.findByTestId("context-menu");
    expect(
      within(newMenu).queryByTestId("edit-button"),
    ).not.toBeInTheDocument();
    expect(within(newMenu).queryByTestId("delete-button")).toBeInTheDocument();
  });

  it("should not render the ellipsis button if there are no actions", () => {
    const { rerender } = renderWithProviders(
      <ConversationCard
        onClick={onClick}
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
      />,
    );

    expect(screen.getByTestId("ellipsis-button")).toBeInTheDocument();

    rerender(
      <ConversationCard
        onClick={onClick}
        onDelete={onDelete}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
      />,
    );

    expect(screen.getByTestId("ellipsis-button")).toBeInTheDocument();

    rerender(
      <ConversationCard
        onClick={onClick}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
      />,
    );

    expect(screen.queryByTestId("ellipsis-button")).not.toBeInTheDocument();
  });

  it("should not render the llm model in the conversation card", () => {
    renderWithProviders(
      <ConversationCard
        onDelete={onDelete}
        onChangeTitle={onChangeTitle}
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
      />,
    );

    expect(
      screen.queryByTestId("conversation-card-llm-model"),
    ).not.toBeInTheDocument();
  });

  it("renders the status dot in the header when executionStatus is provided", () => {
    renderWithProviders(
      <ConversationCard
        title="Conversation 1"
        selectedRepository={null}
        lastUpdatedAt="2021-10-01T12:00:00Z"
        executionStatus={ExecutionStatus.RUNNING}
      />,
    );

    expect(
      screen.getByTestId("conversation-status-working"),
    ).toBeInTheDocument();
  });

  const statusTable: [ExecutionStatus, boolean][] = [
    [ExecutionStatus.RUNNING, true],
    [ExecutionStatus.IDLE, true],
    [ExecutionStatus.FINISHED, true],
    [ExecutionStatus.WAITING_FOR_CONFIRMATION, true],
    [ExecutionStatus.ERROR, false],
    [ExecutionStatus.STUCK, false],
    [ExecutionStatus.PAUSED, false],
  ];

  it.each(statusTable)(
    "should toggle stop button visibility correctly for execution status",
    (executionStatus, shouldShow) => {
      renderWithProviders(
        <ConversationCardActions
          contextMenuOpen={true}
          onContextMenuToggle={vi.fn()}
          onStop={vi.fn()}
          executionStatus={executionStatus}
        />,
      );

      const stopButton = screen.queryByTestId("stop-button");

      if (shouldShow) {
        expect(stopButton).toBeInTheDocument();
      } else {
        expect(stopButton).not.toBeInTheDocument();
      }
    },
  );

  describe("stop button label by active backend", () => {
    const cloudBackend: Backend = {
      id: "prod",
      name: "Production",
      host: "https://app.all-hands.dev",
      apiKey: "bearer-token",
      kind: "cloud",
    };

    afterEach(() => {
      __resetActiveStoreForTests();
    });

    it("uses COMMON$STOP_CONVERSATION on a local backend", () => {
      // Default active backend (no provider, no registered backends) is the
      // bundled local backend.
      renderWithProviders(
        <ConversationCardActions
          contextMenuOpen={true}
          onContextMenuToggle={vi.fn()}
          onStop={vi.fn()}
          executionStatus={ExecutionStatus.RUNNING}
        />,
      );

      expect(screen.getByTestId("stop-button")).toHaveTextContent(
        "COMMON$STOP_CONVERSATION",
      );
    });

    it("uses COMMON$CLOSE_CONVERSATION_STOP_RUNTIME on a cloud backend", () => {
      setRegisteredBackends([cloudBackend]);
      setActiveSelection({ backendId: cloudBackend.id });

      renderWithProviders(
        <ActiveBackendProvider>
          <ConversationCardActions
            contextMenuOpen={true}
            onContextMenuToggle={vi.fn()}
            onStop={vi.fn()}
            executionStatus={ExecutionStatus.RUNNING}
          />
        </ActiveBackendProvider>,
      );

      expect(screen.getByTestId("stop-button")).toHaveTextContent(
        "COMMON$CLOSE_CONVERSATION_STOP_RUNTIME",
      );
    });
  });

  describe("ACP agent badge", () => {
    it("renders the resolved display name for a known ACP server", () => {
      // ``claude-code`` resolves through the ACP_PROVIDERS registry to the
      // human display name "Claude Code". The badge always renders for
      // ACP conversations — it's identity info, not gated by the LLM-
      // profile preference.
      renderWithProviders(
        <ConversationCard
          title="Conversation 1"
          selectedRepository={null}
          lastUpdatedAt="2021-10-01T12:00:00Z"
          agentKind="acp"
          acpServer="claude-code"
        />,
      );

      const badge = screen.getByTestId("conversation-card-acp-badge");
      expect(badge).toHaveTextContent("Claude Code");
    });

    it("falls back to the generic 'ACP' label when the server key is unknown", () => {
      // The Custom-command preset uses ``acp_server: "custom"`` (and
      // future ACP servers Canvas's registry doesn't know about look the
      // same here) — the resolver returns null and the chip shows the
      // generic ``CONVERSATION$ACP_AGENT_GENERIC`` translation.
      renderWithProviders(
        <ConversationCard
          title="Conversation 1"
          selectedRepository={null}
          lastUpdatedAt="2021-10-01T12:00:00Z"
          agentKind="acp"
          acpServer="custom"
        />,
      );

      const badge = screen.getByTestId("conversation-card-acp-badge");
      expect(badge).toHaveTextContent("ACP");
    });

    it("falls back to the generic 'ACP' label when the server key is null", () => {
      // ACP conversations missing the ``acpserver`` tag (older clients,
      // raw API writes) still get a chip — the goal is "this is an ACP
      // conversation" first, exact provider second.
      renderWithProviders(
        <ConversationCard
          title="Conversation 1"
          selectedRepository={null}
          lastUpdatedAt="2021-10-01T12:00:00Z"
          agentKind="acp"
          acpServer={null}
        />,
      );

      const badge = screen.getByTestId("conversation-card-acp-badge");
      expect(badge).toHaveTextContent("ACP");
    });

    it("does not render the badge for OpenHands conversations", () => {
      // The OpenHands rendering path must be untouched — even if a stray
      // ``acp_server`` value somehow reaches the prop, the chip stays
      // hidden because ``agentKind !== "acp"``.
      renderWithProviders(
        <ConversationCard
          title="Conversation 1"
          selectedRepository={null}
          lastUpdatedAt="2021-10-01T12:00:00Z"
          agentKind="openhands"
          acpServer="claude-code"
        />,
      );

      expect(
        screen.queryByTestId("conversation-card-acp-badge"),
      ).not.toBeInTheDocument();
    });
  });
});
