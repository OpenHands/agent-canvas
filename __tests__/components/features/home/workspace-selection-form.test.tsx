import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, vi, beforeEach, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { WorkspaceSelectionForm } from "../../../../src/components/features/home/workspace-selection-form";
import V1ConversationService from "#/api/conversation-service/v1-conversation-service.api";
import FilesService from "#/api/files-service/files-service.api";
import { useWorkspacesStore } from "#/stores/workspaces-store";
import { LocalWorkspace } from "#/types/workspace";

const mockNavigate = vi.fn();
const mockUseIsCreatingConversation = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({
    currentPath: "/",
    conversationId: null,
    isNavigating: false,
    navigate: mockNavigate,
  }),
}));

vi.mock("#/hooks/use-is-creating-conversation", () => ({
  useIsCreatingConversation: () => mockUseIsCreatingConversation(),
}));

vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({
    trackConversationCreated: vi.fn(),
    trackLoginButtonClick: vi.fn(),
  }),
}));

mockUseIsCreatingConversation.mockReturnValue(false);

function makeStartTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-abc",
    created_by_user_id: null,
    status: "READY",
    detail: null,
    app_conversation_id: "conv-abc",
    agent_server_url: "http://agent-server.local",
    request: { initial_message: undefined, plugins: null },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as never;
}

function renderForm(initialWorkspaces: LocalWorkspace[] = []) {
  useWorkspacesStore.setState({ workspaces: initialWorkspaces });
  return render(<WorkspaceSelectionForm />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        {children}
      </QueryClientProvider>
    ),
  });
}

describe("WorkspaceSelectionForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockUseIsCreatingConversation.mockReturnValue(false);
    useWorkspacesStore.setState({ workspaces: [] });
  });

  it("shows empty message when no workspaces are added", () => {
    renderForm();
    expect(screen.getByText("HOME$NO_WORKSPACES")).toBeInTheDocument();
  });

  it("renders workspace list and allows direct launch by clicking an item", async () => {
    const workspaces: LocalWorkspace[] = [
      { id: "/Users/me/dev/repo1", name: "repo1", path: "/Users/me/dev/repo1" },
      { id: "/Users/me/dev/repo2", name: "repo2", path: "/Users/me/dev/repo2" },
    ];
    const createSpy = vi
      .spyOn(V1ConversationService, "createConversation")
      .mockResolvedValue(makeStartTask({ app_conversation_id: "conv-xyz" }));

    renderForm(workspaces);
    const user = userEvent.setup();

    // Both workspaces are visible in the list
    expect(screen.getByTestId("workspace-item-repo1")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-item-repo2")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-item-repo1")).toHaveAttribute(
      "title",
      "repo1\n/Users/me/dev/repo1",
    );
    expect(screen.getByTestId("workspace-item-repo1")).toHaveTextContent(
      "repo1",
    );
    expect(screen.getByTestId("workspace-item-repo1")).toHaveTextContent(
      "HOME$LOCAL_FOLDER_TOOLTIP",
    );
    expect(screen.getByTestId("workspace-item-repo1")).toHaveTextContent(
      "/Users/me/dev/repo1",
    );
    expect(
      screen.getByTestId("workspace-item-repo1"),
    ).not.toHaveTextContent("HOME$LOCAL_FOLDER_TOOLTIP ·");
    expect(screen.getByText("/Users/me/dev/repo1")).toHaveAttribute(
      "title",
      "/Users/me/dev/repo1",
    );

    // Click repo2 to launch
    await user.click(screen.getByTestId("workspace-item-repo2"));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      null,
      "/Users/me/dev/repo2",
      undefined,
      undefined,
    );
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/conversations/conv-xyz"),
    );
  });

  it("Add Folder opens modal and adds the current folder (not subdirs)", async () => {
    vi.spyOn(FilesService, "getHome").mockResolvedValue({ home: "/Users/me" });
    vi.spyOn(FilesService, "searchSubdirs").mockImplementation(
      async (path: string) => {
        if (path === "/Users/me") {
          return {
            items: [{ name: "dev", path: "/Users/me/dev" }],
            next_page_id: null,
          };
        }
        if (path === "/Users/me/dev") {
          return {
            items: [
              { name: "repo1", path: "/Users/me/dev/repo1" },
              { name: "repo2", path: "/Users/me/dev/repo2" },
            ],
            next_page_id: null,
          };
        }
        throw new Error(`unexpected path ${path}`);
      },
    );

    renderForm();
    const user = userEvent.setup();

    // Open the folder browser
    await user.click(screen.getByTestId("add-workspace-button"));
    await screen.findByTestId("folder-browser-modal");

    // Navigate into "dev"
    const devEntry = await screen.findByTestId("folder-browser-entry-dev");
    await user.click(devEntry);
    await screen.findByTestId("folder-browser-entry-repo1");

    // Click "Add this folder" — adds /Users/me/dev, not its children
    await user.click(screen.getByTestId("folder-browser-add"));

    await waitFor(() =>
      expect(
        screen.queryByTestId("folder-browser-modal"),
      ).not.toBeInTheDocument(),
    );

    const stored = useWorkspacesStore.getState().workspaces;
    expect(stored).toHaveLength(1);
    expect(stored[0].path).toBe("/Users/me/dev");
    expect(stored[0].name).toBe("dev");
  });

  it("can remove a workspace from the list", async () => {
    renderForm([
      { id: "/Users/me/dev/repo1", name: "repo1", path: "/Users/me/dev/repo1" },
    ]);
    const user = userEvent.setup();

    expect(screen.getByTestId("workspace-item-repo1")).toBeInTheDocument();

    await user.click(screen.getByTestId("workspace-remove-repo1"));

    expect(useWorkspacesStore.getState().workspaces).toHaveLength(0);
  });
});
