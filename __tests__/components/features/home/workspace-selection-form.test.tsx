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

  it("Add Workspaces opens Finder-like modal, navigates, and imports subfolders deduped on repeat", async () => {
    vi.spyOn(FilesService, "getHome").mockResolvedValue({ home: "/Users/me" });
    const searchSpy = vi
      .spyOn(FilesService, "searchSubdirs")
      .mockImplementation(async (path: string) => {
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
              { name: "repo3", path: "/Users/me/dev/repo3" },
            ],
            next_page_id: null,
          };
        }
        throw new Error(`unexpected path ${path}`);
      });

    // Pre-seed one workspace to verify dedup
    renderForm([
      { id: "/Users/me/dev/repo1", name: "repo1", path: "/Users/me/dev/repo1" },
    ]);
    const user = userEvent.setup();

    for (let i = 0; i < 2; i += 1) {
      await user.click(screen.getByTestId("workspace-dropdown"));
      const addButton = await screen.findByTestId("add-workspaces-button");
      await user.click(addButton);

      // Modal opens at home; dropdown menu is closed.
      await screen.findByTestId("folder-browser-modal");
      expect(
        screen.queryByTestId("add-workspaces-button"),
      ).not.toBeInTheDocument();

      // Navigate into "dev" then click "Use this folder"
      const devEntry = await screen.findByTestId("folder-browser-entry-dev");
      await user.click(devEntry);
      await screen.findByTestId("folder-browser-entry-repo2");
      await user.click(screen.getByTestId("folder-browser-use"));

      await waitFor(() =>
        expect(
          screen.queryByTestId("folder-browser-modal"),
        ).not.toBeInTheDocument(),
      );
    }

    const stored = useWorkspacesStore.getState().workspaces;
    expect(stored.map((w) => w.path).sort()).toEqual([
      "/Users/me/dev/repo1",
      "/Users/me/dev/repo2",
      "/Users/me/dev/repo3",
    ]);
    expect(searchSpy).toHaveBeenCalledWith("/Users/me/dev");
  });

  it("Launch creates a v1 conversation with the selected workspace path as working_dir", async () => {
    const workspaces: LocalWorkspace[] = [
      { id: "/Users/me/dev/repo1", name: "repo1", path: "/Users/me/dev/repo1" },
      { id: "/Users/me/dev/repo2", name: "repo2", path: "/Users/me/dev/repo2" },
    ];
    const createSpy = vi
      .spyOn(V1ConversationService, "createConversation")
      .mockResolvedValue(makeStartTask({ app_conversation_id: "conv-xyz" }));

    renderForm(workspaces);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("workspace-dropdown"));
    const items = await screen.findAllByText(/repo[12]/);
    await user.click(items.find((el) => el.textContent === "repo2")!);
    await user.click(screen.getByTestId("workspace-launch-button"));

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

  it("Launch button is disabled until a workspace is selected", async () => {
    renderForm([
      { id: "/Users/me/dev/repo1", name: "repo1", path: "/Users/me/dev/repo1" },
    ]);

    const launchButton = screen.getByTestId("workspace-launch-button");
    expect(launchButton).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("workspace-dropdown"));
    await user.click(await screen.findByText("repo1"));

    expect(launchButton).toBeEnabled();
  });
});
