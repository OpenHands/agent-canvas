import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, vi, beforeEach, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceSelectionForm } from "../../../../src/components/features/home/workspace-selection-form";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { useWorkspacesStore } from "#/stores/workspaces-store";
import { LocalWorkspace } from "#/types/workspace";

const mockNavigate = vi.fn();
const mockUseIsCreatingConversation = vi.fn();

const { mockSearchSubdirectories, mockGetHome } = vi.hoisted(() => ({
  mockSearchSubdirectories: vi.fn(),
  mockGetHome: vi.fn(),
}));

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

vi.mock("@openhands/typescript-client/clients", async () => {
  const actual = await vi.importActual<
    typeof import("@openhands/typescript-client/clients")
  >("@openhands/typescript-client/clients");
  return {
    ...actual,
    FileClient: vi.fn(function FileClientMock() {
      return {
        searchSubdirectories: mockSearchSubdirectories,
        getHome: mockGetHome,
      };
    }),
  };
});

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

function renderForm(
  initialWorkspaces: LocalWorkspace[] = [],
  initialParents: { id: string; name: string; path: string }[] = [],
) {
  useWorkspacesStore.setState({
    workspaces: initialWorkspaces,
    workspaceParents: initialParents,
  });
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
    mockSearchSubdirectories.mockReset();
    mockGetHome.mockReset();
    mockUseIsCreatingConversation.mockReturnValue(false);
    mockGetHome.mockResolvedValue({ home: "/Users/me" });
    useWorkspacesStore.setState({ workspaces: [], workspaceParents: [] });
    // `useResolvedWorkspaces` always queries an implicit `/projects` parent
    // (the dev:docker mount point). Default it to empty so tests that don't
    // care about it don't hit a real network call. Tests that need specific
    // behavior can replace this with their own spy.
    mockSearchSubdirectories.mockResolvedValue({
      items: [],
      next_page_id: null,
    });
  });

  it("Add Workspace adds only the chosen folder (not its subfolders) and dedupes on repeat", async () => {
    mockGetHome.mockResolvedValue({ home: "/Users/me" });
    const searchSpy = mockSearchSubdirectories;

    mockSearchSubdirectories.mockImplementation(async (path: string) => {
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
    renderForm([{ id: "/Users/me/dev", name: "dev", path: "/Users/me/dev" }]);
    const user = userEvent.setup();

    // First pass: navigate into "dev" then click "Use this folder"
    await user.click(screen.getByTestId("workspace-dropdown"));
    await user.click(await screen.findByTestId("add-workspaces-button"));

    await screen.findByTestId("folder-browser-modal");
    expect(
      screen.queryByTestId("add-workspaces-button"),
    ).not.toBeInTheDocument();

    await user.click(await screen.findByTestId("folder-browser-entry-dev"));
    await screen.findByTestId("folder-browser-entry-repo2");
    await user.click(screen.getByTestId("folder-browser-use"));

    await waitFor(() =>
      expect(
        screen.queryByTestId("folder-browser-modal"),
      ).not.toBeInTheDocument(),
    );

    // The same /Users/me/dev folder should be deduped, not duplicated, and
    // its children should NOT have been imported as workspaces.
    expect(
      useWorkspacesStore
        .getState()
        .workspaces.map((w) => w.path)
        .sort(),
    ).toEqual(["/Users/me/dev"]);

    // Second pass: pick a child folder; it should be added as a single
    // workspace (still no recursion into its subfolders).
    await user.click(screen.getByTestId("workspace-dropdown"));
    await user.click(await screen.findByTestId("add-workspaces-button"));
    await screen.findByTestId("folder-browser-modal");
    await user.click(await screen.findByTestId("folder-browser-entry-dev"));
    await user.click(await screen.findByTestId("folder-browser-entry-repo1"));
    await user.click(screen.getByTestId("folder-browser-use"));

    await waitFor(() =>
      expect(
        screen.queryByTestId("folder-browser-modal"),
      ).not.toBeInTheDocument(),
    );

    expect(
      useWorkspacesStore
        .getState()
        .workspaces.map((w) => w.path)
        .sort(),
    ).toEqual(["/Users/me/dev", "/Users/me/dev/repo1"]);
    expect(searchSpy).toHaveBeenCalledWith("/Users/me/dev");
  });

  it("Manage Workspaces lets you remove individual workspaces and clears the current selection", async () => {
    const workspaces: LocalWorkspace[] = [
      { id: "/Users/me/dev/repo1", name: "repo1", path: "/Users/me/dev/repo1" },
      { id: "/Users/me/dev/repo2", name: "repo2", path: "/Users/me/dev/repo2" },
    ];
    renderForm(workspaces);
    const user = userEvent.setup();
    const launchButton = screen.getByTestId("workspace-launch-button");

    await user.click(screen.getByTestId("workspace-dropdown"));
    const dropdownMenu = await screen.findByTestId("workspace-dropdown-menu");
    await user.click(within(dropdownMenu).getByText("repo1"));
    expect(launchButton).toBeEnabled();

    await user.click(screen.getByTestId("workspace-dropdown"));
    await user.click(await screen.findByTestId("manage-workspaces-button"));

    await screen.findByTestId("manage-workspaces-modal");
    await user.click(screen.getByTestId("manage-workspaces-remove-repo1"));

    expect(useWorkspacesStore.getState().workspaces.map((w) => w.path)).toEqual(
      ["/Users/me/dev/repo1", "/Users/me/dev/repo2"],
    );

    await screen.findByTestId("confirmation-modal");
    await user.click(screen.getByTestId("confirm-button"));

    expect(useWorkspacesStore.getState().workspaces.map((w) => w.path)).toEqual(
      ["/Users/me/dev/repo2"],
    );
    expect(launchButton).toBeDisabled();

    await user.click(screen.getByTestId("manage-workspaces-done"));
    await waitFor(() =>
      expect(
        screen.queryByTestId("manage-workspaces-modal"),
      ).not.toBeInTheDocument(),
    );
  });

  it("Manage Workspaces button is hidden when there are no workspaces", async () => {
    renderForm([]);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("workspace-dropdown"));
    await screen.findByTestId("add-workspaces-button");
    expect(
      screen.queryByTestId("manage-workspaces-button"),
    ).not.toBeInTheDocument();
  });

  it("Implicit /projects parent surfaces workspaces automatically", async () => {
    const searchSpy = mockSearchSubdirectories;

    mockSearchSubdirectories.mockImplementation(async (path: string) => {
      if (path === "/projects") {
        return {
          items: [
            { name: "demo-app", path: "/projects/demo-app" },
            { name: "sample-tools", path: "/projects/sample-tools" },
          ],
          next_page_id: null,
        };
      }
      return { items: [], next_page_id: null };
    });

    renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("workspace-dropdown"));
    const dropdownMenu = await screen.findByTestId("workspace-dropdown-menu");
    await within(dropdownMenu).findByText("demo-app");
    await within(dropdownMenu).findByText("sample-tools");

    expect(searchSpy).toHaveBeenCalledWith("/projects");
  });

  it("Add Workspace starts at the docker /projects mount and can save nested folders", async () => {
    mockGetHome.mockResolvedValue({
      home: "/home/openhands",
      favorites: [{ label: "Downloads", path: "/home/openhands/Downloads" }],
      locations: [],
    });
    mockSearchSubdirectories.mockImplementation(async (path: string) => {
      if (path === "/projects") {
        return {
          items: [{ name: "demo-app", path: "/projects/demo-app" }],
          next_page_id: null,
        };
      }
      if (path === "/projects/demo-app") {
        return {
          items: [
            {
              name: "web-client",
              path: "/projects/demo-app/web-client",
            },
          ],
          next_page_id: null,
        };
      }
      if (path === "/projects/demo-app/web-client") {
        return { items: [], next_page_id: null };
      }
      return { items: [], next_page_id: null };
    });

    renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("workspace-dropdown"));
    await user.click(await screen.findByTestId("add-workspaces-button"));

    await screen.findByTestId("folder-browser-modal");
    expect(
      await screen.findByTestId("folder-browser-current-path"),
    ).toHaveTextContent("/projects");
    expect(
      await screen.findByTestId("folder-browser-sidebar-/projects"),
    ).toBeInTheDocument();
    await user.click(
      await screen.findByTestId("folder-browser-entry-demo-app"),
    );
    await user.click(
      await screen.findByTestId("folder-browser-entry-web-client"),
    );
    await user.click(screen.getByTestId("folder-browser-use"));

    await waitFor(() =>
      expect(
        screen.queryByTestId("folder-browser-modal"),
      ).not.toBeInTheDocument(),
    );
    expect(useWorkspacesStore.getState().workspaces.map((w) => w.path)).toEqual(
      ["/projects/demo-app/web-client"],
    );
  });

  it("A stored /projects parent suppresses the implicit duplicate query", async () => {
    const searchSpy = mockSearchSubdirectories.mockResolvedValue({
      items: [],
      next_page_id: null,
    });

    renderForm(
      [],
      [{ id: "custom-projects", name: "My Projects", path: "/projects" }],
    );

    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(1));
    expect(searchSpy).toHaveBeenCalledWith("/projects");
  });

  it("Launch creates a v1 conversation with the selected workspace path as working_dir", async () => {
    const workspaces: LocalWorkspace[] = [
      { id: "/Users/me/dev/repo1", name: "repo1", path: "/Users/me/dev/repo1" },
      { id: "/Users/me/dev/repo2", name: "repo2", path: "/Users/me/dev/repo2" },
    ];
    const createSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
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

  it("disables the workspace dropdown while parent workspaces are loading", async () => {
    mockSearchSubdirectories.mockReturnValue(new Promise(() => {}) as never);

    renderForm(
      [],
      [{ id: "/Users/me/dev", name: "dev", path: "/Users/me/dev" }],
    );

    await waitFor(() => {
      expect(screen.getByTestId("workspace-dropdown")).toBeDisabled();
    });
    expect(screen.getByTestId("workspace-status-message")).toBeInTheDocument();
  });

  it("Add all subdirectories saves a workspace parent and lists its children dynamically", async () => {
    mockGetHome.mockResolvedValue({ home: "/Users/me" });
    const searchSpy = mockSearchSubdirectories;

    mockSearchSubdirectories.mockImplementation(async (path: string) => {
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
    });

    renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("workspace-dropdown"));
    await user.click(await screen.findByTestId("add-workspaces-button"));

    await screen.findByTestId("folder-browser-modal");
    await user.click(await screen.findByTestId("folder-browser-entry-dev"));
    await screen.findByTestId("folder-browser-entry-repo1");

    // Click the "Add all subdirectories" button.
    await user.click(screen.getByTestId("folder-browser-add-all-subdirs"));

    await waitFor(() =>
      expect(
        screen.queryByTestId("folder-browser-modal"),
      ).not.toBeInTheDocument(),
    );

    // The directory itself becomes a workspace parent, not a workspace.
    expect(useWorkspacesStore.getState().workspaces).toEqual([]);
    expect(
      useWorkspacesStore.getState().workspaceParents.map((p) => p.path),
    ).toEqual(["/Users/me/dev"]);

    // ...and its subdirectories surface as workspaces dynamically.
    await user.click(screen.getByTestId("workspace-dropdown"));
    const dynamicDropdown = await screen.findByTestId(
      "workspace-dropdown-menu",
    );
    await within(dynamicDropdown).findByText("repo1");
    await within(dynamicDropdown).findByText("repo2");

    expect(searchSpy).toHaveBeenCalledWith("/Users/me/dev");
  });

  it("Removing a workspace parent stops listing its children", async () => {
    // Scope the mock to the user-added parent so the implicit `/projects`
    // parent (always queried by `useResolvedWorkspaces`) doesn't also get
    // these entries.
    const searchSpy = mockSearchSubdirectories;

    mockSearchSubdirectories.mockImplementation(async (path: string) => {
      if (path === "/Users/me/dev") {
        return {
          items: [
            { name: "repoA", path: "/Users/me/dev/repoA" },
            { name: "repoB", path: "/Users/me/dev/repoB" },
          ],
          next_page_id: null,
        };
      }
      return { items: [], next_page_id: null };
    });

    renderForm(
      [],
      [{ id: "/Users/me/dev", name: "dev", path: "/Users/me/dev" }],
    );

    const user = userEvent.setup();

    // Children should appear in the dropdown.
    await user.click(screen.getByTestId("workspace-dropdown"));
    const dropdownMenu = await screen.findByTestId("workspace-dropdown-menu");
    await within(dropdownMenu).findByText("repoA");
    await within(dropdownMenu).findByText("repoB");

    // Manage modal should expose a remove button for the parent.
    await user.click(screen.getByTestId("manage-workspaces-button"));
    await screen.findByTestId("manage-workspaces-modal");
    expect(
      screen.getByTestId("manage-workspaces-parent-row-dev"),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("manage-workspaces-remove-parent-dev"));

    expect(useWorkspacesStore.getState().workspaceParents).toEqual([
      { id: "/Users/me/dev", name: "dev", path: "/Users/me/dev" },
    ]);

    await screen.findByTestId("confirmation-modal");
    await user.click(screen.getByTestId("confirm-button"));

    expect(useWorkspacesStore.getState().workspaceParents).toEqual([]);
    expect(searchSpy).toHaveBeenCalledWith("/Users/me/dev");

    await user.click(screen.getByTestId("manage-workspaces-done"));
    await waitFor(() =>
      expect(
        screen.queryByTestId("manage-workspaces-modal"),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByTestId("workspace-dropdown"));
    const refreshedDropdown = await screen.findByTestId(
      "workspace-dropdown-menu",
    );
    expect(
      within(refreshedDropdown).queryByText("repoA"),
    ).not.toBeInTheDocument();
    expect(
      within(refreshedDropdown).queryByText("repoB"),
    ).not.toBeInTheDocument();
  });

  it("Add Workspace sidebar renders backend-provided favorites dynamically and navigates into them on click", async () => {
    // Arrange: backend reports a home with a custom favorite that did NOT
    // exist in the old hardcoded list (Documents / Desktop / Downloads).
    // This is the regression guard for the original 404-on-navigate bug.
    mockGetHome.mockResolvedValue({
      home: "/Users/me",
      favorites: [{ label: "projects", path: "/Users/me/projects" }],
      locations: [{ label: "/", path: "/" }],
    });
    const searchSpy = mockSearchSubdirectories;
    mockSearchSubdirectories.mockImplementation(async (path: string) => {
      if (path === "/Users/me/projects") {
        return {
          items: [{ name: "repo1", path: "/Users/me/projects/repo1" }],
          next_page_id: null,
        };
      }
      return { items: [], next_page_id: null };
    });

    renderForm();
    const user = userEvent.setup();

    // Act: open the modal and click the dynamic favorite.
    await user.click(screen.getByTestId("workspace-dropdown"));
    await user.click(await screen.findByTestId("add-workspaces-button"));
    await screen.findByTestId("folder-browser-modal");
    await user.click(
      await screen.findByTestId("folder-browser-sidebar-projects"),
    );

    // Assert: the dynamic favorite drove the navigation, and the previously
    // hardcoded names are no longer present in the sidebar.
    await screen.findByTestId("folder-browser-entry-repo1");
    expect(searchSpy).toHaveBeenCalledWith("/Users/me/projects");
    expect(
      screen.queryByTestId("folder-browser-sidebar-documents"),
    ).not.toBeInTheDocument();
  });
});
