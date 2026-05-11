import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConversationTabsContextMenu } from "#/components/features/conversation/conversation-tabs/conversation-tabs-context-menu";
import { useConversationStore } from "#/stores/conversation-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import {
  ACTIVE_BACKEND_STORAGE_KEY,
  BACKENDS_STORAGE_KEY,
} from "#/api/backend-registry/storage";
import type { Backend } from "#/api/backend-registry/types";

const CONVERSATION_ID = "conv-abc123";

vi.mock("#/hooks/use-conversation-id", () => ({
  useConversationId: () => ({ conversationId: CONVERSATION_ID }),
}));

let mockHasTaskList = false;
vi.mock("#/hooks/use-task-list", () => ({
  useTaskList: () => ({
    hasTaskList: mockHasTaskList,
    taskList: [],
  }),
}));

function seedActiveBackend(backend: Backend): void {
  localStorage.setItem(BACKENDS_STORAGE_KEY, JSON.stringify([backend]));
  localStorage.setItem(
    ACTIVE_BACKEND_STORAGE_KEY,
    JSON.stringify({ backendId: backend.id, orgId: null }),
  );
  __resetActiveStoreForTests();
}

describe("ConversationTabsContextMenu", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetActiveStoreForTests();
    mockHasTaskList = false;
    useConversationStore.setState({
      selectedTab: "files",
      isRightPanelShown: true,
      hasRightPanelToggled: true,
    });
  });

  it("should render nothing when isOpen is false", () => {
    const { container } = render(
      <ConversationTabsContextMenu isOpen={false} onClose={vi.fn()} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("should render all default tabs when open", () => {
    render(<ConversationTabsContextMenu isOpen={true} onClose={vi.fn()} />);

    // Default active backend is local, so the Code (vscode) entry is hidden.
    const expectedTabs = [
      "COMMON$PLANNER",
      "COMMON$FILES",
      "COMMON$TERMINAL",
      "COMMON$BROWSER",
    ];
    for (const tab of expectedTabs) {
      expect(screen.getByText(tab)).toBeInTheDocument();
    }
  });

  it("should show the Code entry when the active backend is cloud", () => {
    // Arrange
    seedActiveBackend({
      id: "cloud-test",
      name: "Cloud Test",
      host: "https://app.example.com",
      apiKey: "secret",
      kind: "cloud",
    });

    // Act
    render(
      <ActiveBackendProvider>
        <ConversationTabsContextMenu isOpen={true} onClose={vi.fn()} />
      </ActiveBackendProvider>,
    );

    // Assert
    expect(screen.getByText("COMMON$CODE")).toBeInTheDocument();
  });

  it("should re-pin a tab when clicking an unpinned tab", async () => {
    const user = userEvent.setup();

    render(<ConversationTabsContextMenu isOpen={true} onClose={vi.fn()} />);

    const terminalItem = screen.getByText("COMMON$TERMINAL");

    // Unpin
    await user.click(terminalItem);
    let storedState = JSON.parse(
      localStorage.getItem(`conversation-state-${CONVERSATION_ID}`)!,
    );
    expect(storedState.unpinnedTabs).toContain("terminal");

    // Re-pin
    await user.click(terminalItem);
    storedState = JSON.parse(
      localStorage.getItem(`conversation-state-${CONVERSATION_ID}`)!,
    );
    expect(storedState.unpinnedTabs).not.toContain("terminal");
  });

  it("should switch to another pinned tab when unpinning the currently active tab", async () => {
    const user = userEvent.setup();

    render(<ConversationTabsContextMenu isOpen={true} onClose={vi.fn()} />);

    // Initially selected tab is "files"
    expect(useConversationStore.getState().selectedTab).toBe("files");

    // Unpin the active "files" tab
    await user.click(screen.getByText("COMMON$FILES"));

    // Panel should still be shown
    const storeState = useConversationStore.getState();
    expect(storeState.hasRightPanelToggled).toBe(true);

    // Should have switched to another pinned tab (planner is first in list)
    expect(storeState.selectedTab).toBe("planner");

    // Verify the files tab was unpinned
    const storedState = JSON.parse(
      localStorage.getItem(`conversation-state-${CONVERSATION_ID}`)!,
    );
    expect(storedState.unpinnedTabs).toContain("files");
    // Selected tab should be persisted as the new tab
    expect(storedState.selectedTab).toBe("planner");
  });

  it("should not close the right panel when unpinning a non-active tab", async () => {
    const user = userEvent.setup();

    render(<ConversationTabsContextMenu isOpen={true} onClose={vi.fn()} />);

    await user.click(screen.getByText("COMMON$TERMINAL"));

    const storeState = useConversationStore.getState();
    expect(storeState.hasRightPanelToggled).toBe(true);
  });

  describe("with tasklist", () => {
    beforeEach(() => {
      mockHasTaskList = true;
    });

    it("should show tasklist in context menu when hasTaskList is true", () => {
      render(<ConversationTabsContextMenu isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByText("COMMON$TASK_LIST")).toBeInTheDocument();
    });
  });
});
