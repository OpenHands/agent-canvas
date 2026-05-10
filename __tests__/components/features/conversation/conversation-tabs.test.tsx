import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { ConversationTabs } from "#/components/features/conversation/conversation-tabs/conversation-tabs";
import { useConversationStore } from "#/stores/conversation-store";
import {
  ActiveBackendProvider,
} from "#/contexts/active-backend-context";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import {
  ACTIVE_BACKEND_STORAGE_KEY,
  BACKENDS_STORAGE_KEY,
} from "#/api/backend-registry/storage";
import type { Backend } from "#/api/backend-registry/types";

const TASK_CONVERSATION_ID = "task-ec03fb2ab8604517b24af632b058c2fd";
const REAL_CONVERSATION_ID = "conv-abc123";

let mockConversationId = TASK_CONVERSATION_ID;

vi.mock("#/hooks/use-conversation-id", () => ({
  useConversationId: () => ({ conversationId: mockConversationId }),
}));

let mockHasTaskList = false;
vi.mock("#/hooks/use-task-list", () => ({
  useTaskList: () => ({
    hasTaskList: mockHasTaskList,
    taskList: [],
  }),
}));

const createWrapper = (conversationId: string) => {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[`/conversations/${conversationId}`]}>
      <QueryClientProvider client={new QueryClient()}>
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
};

function seedActiveBackend(backend: Backend): void {
  localStorage.setItem(BACKENDS_STORAGE_KEY, JSON.stringify([backend]));
  localStorage.setItem(
    ACTIVE_BACKEND_STORAGE_KEY,
    JSON.stringify({ backendId: backend.id, orgId: null }),
  );
  __resetActiveStoreForTests();
}

describe("ConversationTabs localStorage behavior", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetActiveStoreForTests();
    vi.resetAllMocks();
    mockConversationId = TASK_CONVERSATION_ID;
    mockHasTaskList = false;
    useConversationStore.setState({
      selectedTab: null,
      isRightPanelShown: false,
      hasRightPanelToggled: false,
    });
  });

  describe("task-prefixed conversation IDs", () => {
    it("should not create localStorage entries for task-prefixed conversation IDs", () => {
      render(<ConversationTabs />, {
        wrapper: createWrapper(TASK_CONVERSATION_ID),
      });

      expect(
        localStorage.getItem(`conversation-state-${TASK_CONVERSATION_ID}`),
      ).toBeNull();
    });
  });

  describe("consolidated localStorage key", () => {
    it("should use a single consolidated key for tab state", async () => {
      mockConversationId = REAL_CONVERSATION_ID;
      const user = userEvent.setup();

      render(<ConversationTabs />, {
        wrapper: createWrapper(REAL_CONVERSATION_ID),
      });

      const changesTab = screen.getByTestId("conversation-tab-editor");
      await user.click(changesTab);

      const consolidatedKey = `conversation-state-${REAL_CONVERSATION_ID}`;
      const storedState = localStorage.getItem(consolidatedKey);
      expect(storedState).not.toBeNull();

      const parsed = JSON.parse(storedState!);
      expect(parsed).toHaveProperty("selectedTab");
      expect(parsed).toHaveProperty("rightPanelShown");
      expect(parsed).toHaveProperty("unpinnedTabs");
    });
  });

  describe("hook integration", () => {
    it("should open panel and select tab when clicking a tab while panel is closed", async () => {
      mockConversationId = REAL_CONVERSATION_ID;
      const user = userEvent.setup();

      // Arrange: Panel is closed, no tab selected
      useConversationStore.setState({
        selectedTab: null,
        isRightPanelShown: false,
        hasRightPanelToggled: false,
      });

      render(<ConversationTabs />, {
        wrapper: createWrapper(REAL_CONVERSATION_ID),
      });

      // Act: Click the terminal tab
      const terminalTab = screen.getByTestId("conversation-tab-terminal");
      await user.click(terminalTab);

      // Assert: Panel should be open and terminal tab selected
      expect(useConversationStore.getState().selectedTab).toBe("terminal");
      expect(useConversationStore.getState().hasRightPanelToggled).toBe(true);

      // Verify localStorage was updated
      const storedState = JSON.parse(
        localStorage.getItem(`conversation-state-${REAL_CONVERSATION_ID}`)!,
      );
      expect(storedState.selectedTab).toBe("terminal");
      expect(storedState.rightPanelShown).toBe(true);
    });

    it("should close panel when clicking the same active tab", async () => {
      mockConversationId = REAL_CONVERSATION_ID;
      const user = userEvent.setup();

      // Arrange: Panel is open with editor tab selected
      useConversationStore.setState({
        selectedTab: "editor",
        isRightPanelShown: true,
        hasRightPanelToggled: true,
      });

      render(<ConversationTabs />, {
        wrapper: createWrapper(REAL_CONVERSATION_ID),
      });

      // Act: Click the editor tab again
      const editorTab = screen.getByTestId("conversation-tab-editor");
      await user.click(editorTab);

      // Assert: Panel should be closed
      expect(useConversationStore.getState().hasRightPanelToggled).toBe(false);

      // Verify localStorage was updated
      const storedState = JSON.parse(
        localStorage.getItem(`conversation-state-${REAL_CONVERSATION_ID}`)!,
      );
      expect(storedState.rightPanelShown).toBe(false);
    });

    it("should switch to different tab when clicking another tab while panel is open", async () => {
      mockConversationId = REAL_CONVERSATION_ID;
      const user = userEvent.setup();

      // Arrange: Panel is open with editor tab selected
      useConversationStore.setState({
        selectedTab: "editor",
        isRightPanelShown: true,
        hasRightPanelToggled: true,
      });

      render(<ConversationTabs />, {
        wrapper: createWrapper(REAL_CONVERSATION_ID),
      });

      // Act: Click the browser tab
      const browserTab = screen.getByTestId("conversation-tab-browser");
      await user.click(browserTab);

      // Assert: Browser tab should be selected, panel still open
      expect(useConversationStore.getState().selectedTab).toBe("browser");
      expect(useConversationStore.getState().hasRightPanelToggled).toBe(true);

      // Verify localStorage was updated
      const storedState = JSON.parse(
        localStorage.getItem(`conversation-state-${REAL_CONVERSATION_ID}`)!,
      );
      expect(storedState.selectedTab).toBe("browser");
    });
  });

  describe("vscode tab visibility by backend kind", () => {
    beforeEach(() => {
      mockConversationId = REAL_CONVERSATION_ID;
    });

    it("should hide the vscode tab when the active backend is local", () => {
      // Arrange: active backend is local (default behavior)
      seedActiveBackend({
        id: "local-test",
        name: "Local Test",
        host: "http://localhost:8000",
        apiKey: "",
        kind: "local",
      });

      // Act
      render(<ConversationTabs />, {
        wrapper: createWrapper(REAL_CONVERSATION_ID),
      });

      // Assert
      expect(
        screen.queryByTestId("conversation-tab-vscode"),
      ).not.toBeInTheDocument();
    });

    it("should show the vscode tab when the active backend is cloud", () => {
      // Arrange: active backend is cloud
      seedActiveBackend({
        id: "cloud-test",
        name: "Cloud Test",
        host: "https://app.example.com",
        apiKey: "secret",
        kind: "cloud",
      });

      // Act
      render(<ConversationTabs />, {
        wrapper: createWrapper(REAL_CONVERSATION_ID),
      });

      // Assert
      expect(
        screen.getByTestId("conversation-tab-vscode"),
      ).toBeInTheDocument();
    });
  });

  describe("tasklist tab", () => {
    beforeEach(() => {
      mockConversationId = REAL_CONVERSATION_ID;
      mockHasTaskList = true;
    });

    it("should show tasklist tab when hasTaskList is true", () => {
      render(<ConversationTabs />, {
        wrapper: createWrapper(REAL_CONVERSATION_ID),
      });

      expect(
        screen.getByTestId("conversation-tab-tasklist"),
      ).toBeInTheDocument();
    });

    it("should select tasklist tab when clicked", async () => {
      const user = userEvent.setup();

      render(<ConversationTabs />, {
        wrapper: createWrapper(REAL_CONVERSATION_ID),
      });

      const tasklistTab = screen.getByTestId("conversation-tab-tasklist");
      await user.click(tasklistTab);

      const { selectedTab, hasRightPanelToggled } =
        useConversationStore.getState();
      expect(selectedTab).toBe("tasklist");
      expect(hasRightPanelToggled).toBe(true);
    });
  });
});
