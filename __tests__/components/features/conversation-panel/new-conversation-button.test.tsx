import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { NewConversationButton } from "#/components/features/conversation-panel/new-conversation-button";
import { useWorkspacesStore } from "#/stores/workspaces-store";

vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({
    trackConversationCreated: vi.fn(),
  }),
}));

vi.mock(
  "#/components/features/home/workspace-dropdown/folder-browser-modal",
  () => ({
    FolderBrowserModal: ({ isOpen }: { isOpen: boolean }) =>
      isOpen ? <div data-testid="folder-browser-modal" /> : null,
  }),
);

vi.mock(
  "#/components/features/home/workspace-dropdown/manage-workspaces-modal",
  () => ({
    ManageWorkspacesModal: ({ isOpen }: { isOpen: boolean }) =>
      isOpen ? <div data-testid="manage-workspaces-modal" /> : null,
  }),
);

const makeStartTask = (conversationId: string) => ({
  id: "task-id",
  created_by_user_id: null,
  status: "READY" as const,
  detail: null,
  app_conversation_id: conversationId,
  agent_server_url: "http://agent-server.local",
  request: {
    initial_message: null,
    processors: [],
    llm_model: null,
    selected_repository: null,
    selected_branch: null,
    git_provider: "github" as const,
    suggested_task: null,
    title: null,
    trigger: null,
    pr_number: [],
    parent_conversation_id: null,
    agent_type: "default" as const,
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

describe("NewConversationButton", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useWorkspacesStore.getState().clearAll();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    useWorkspacesStore.getState().clearAll();
  });

  it("toggles the popover and dismisses it on outside click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewConversationButton />);

    await user.click(screen.getByTestId("new-conversation-button"));
    expect(screen.getByTestId("new-conversation-popover")).toBeInTheDocument();

    await user.click(document.body);
    await waitFor(() => {
      expect(
        screen.queryByTestId("new-conversation-popover"),
      ).not.toBeInTheDocument();
    });
  });

  it("dismisses the popover on Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewConversationButton />);

    await user.click(screen.getByTestId("new-conversation-button"));
    expect(screen.getByTestId("new-conversation-popover")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByTestId("new-conversation-popover"),
      ).not.toBeInTheDocument();
    });
  });

  it("launches a conversation for the selected workspace", async () => {
    useWorkspacesStore.getState().addWorkspaces([
      {
        id: "/workspace/project/repo1",
        name: "repo1",
        path: "/workspace/project/repo1",
      },
    ]);
    const navigate = vi.fn();
    const createSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
      .mockResolvedValue(makeStartTask("conv-123"));

    const user = userEvent.setup();
    renderWithProviders(<NewConversationButton />, {
      navigation: { navigate, currentPath: "/conversations" },
    });

    await user.click(screen.getByTestId("new-conversation-button"));
    await user.click(screen.getByRole("button", { name: "repo1" }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        null,
        "/workspace/project/repo1",
        undefined,
        undefined,
      );
    });
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/conversations/conv-123");
    });
  });

  it("disables launch actions while a conversation is being created", async () => {
    useWorkspacesStore.getState().addWorkspaces([
      {
        id: "/workspace/project/repo1",
        name: "repo1",
        path: "/workspace/project/repo1",
      },
    ]);
    vi.spyOn(AgentServerConversationService, "createConversation").mockImplementation(
      () => new Promise(() => {}),
    );

    const user = userEvent.setup();
    renderWithProviders(<NewConversationButton />);

    await user.click(screen.getByTestId("new-conversation-button"));
    await user.click(screen.getByTestId("launch-no-workspace"));

    await waitFor(() => {
      expect(screen.getByTestId("launch-no-workspace")).toBeDisabled();
      expect(screen.getByTestId("launch-workspace")).toBeDisabled();
    });
  });

  it("keeps the popover open while the add workspace modal is open", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewConversationButton />);

    await user.click(screen.getByTestId("new-conversation-button"));
    await user.click(screen.getByTestId("add-workspaces-button"));

    expect(screen.getByTestId("folder-browser-modal")).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.getByTestId("new-conversation-popover")).toBeInTheDocument();
  });

  it("keeps the popover open while the manage workspaces modal is open", async () => {
    useWorkspacesStore.getState().addWorkspaces([
      {
        id: "/workspace/project/repo1",
        name: "repo1",
        path: "/workspace/project/repo1",
      },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<NewConversationButton />);

    await user.click(screen.getByTestId("new-conversation-button"));
    await user.click(screen.getByTestId("manage-workspaces-button"));

    expect(screen.getByTestId("manage-workspaces-modal")).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.getByTestId("new-conversation-popover")).toBeInTheDocument();
  });

  it("applies the pointer-cursor affordance to every interactive popover item", async () => {
    useWorkspacesStore.getState().addWorkspaces([
      {
        id: "/workspace/project/repo1",
        name: "repo1",
        path: "/workspace/project/repo1",
      },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<NewConversationButton />);

    await user.click(screen.getByTestId("new-conversation-button"));

    for (const testId of [
      "launch-no-workspace",
      "launch-workspace",
      "add-workspaces-button",
      "manage-workspaces-button",
    ]) {
      expect(screen.getByTestId(testId)).toHaveClass("cursor-pointer");
    }
  });

  it("keeps the popover open when conversation creation fails", async () => {
    const navigate = vi.fn();
    const createSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
      .mockRejectedValue(new Error("create failed"));

    const user = userEvent.setup();
    renderWithProviders(<NewConversationButton />, {
      navigation: { navigate, currentPath: "/conversations" },
    });

    await user.click(screen.getByTestId("new-conversation-button"));
    await user.click(screen.getByTestId("launch-no-workspace"));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId("launch-no-workspace")).not.toBeDisabled();
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByTestId("new-conversation-popover")).toBeInTheDocument();
  });
});
