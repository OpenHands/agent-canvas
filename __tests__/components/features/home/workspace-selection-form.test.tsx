import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, vi, beforeEach, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { WorkspaceSelectionForm } from "../../../../src/components/features/home/workspace-selection-form";
import WorkspacesService from "#/api/workspaces-service/workspaces-service.api";
import { LocalWorkspace, LocalWorkspaceParent } from "#/types/workspace";

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

function renderForm({
  workspaces = [],
  workspaceParents = [],
}: {
  workspaces?: LocalWorkspace[];
  workspaceParents?: LocalWorkspaceParent[];
} = {}) {
  vi.spyOn(WorkspacesService, "listWorkspaces").mockResolvedValue({
    workspaces,
    workspaceParents,
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

describe("WorkspaceSelectionForm (server-backed workspaces)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSearchSubdirectories.mockReset();
    mockGetHome.mockReset();
    mockUseIsCreatingConversation.mockReturnValue(false);
    mockGetHome.mockResolvedValue({ home: "/Users/me" });
    // useResolvedWorkspaces always queries an implicit `/projects` parent in
    // dev mode — return empty so it doesn't influence tests that don't care.
    mockSearchSubdirectories.mockResolvedValue({
      items: [],
      next_page_id: null,
    });
  });

  it("renders workspaces returned by the agent-server in the dropdown", async () => {
    // Arrange
    renderForm({
      workspaces: [
        {
          id: "/Users/me/dev/repo1",
          name: "repo1",
          path: "/Users/me/dev/repo1",
        },
      ],
    });
    const user = userEvent.setup();

    // Act
    await user.click(await screen.findByTestId("workspace-dropdown"));
    const menu = await screen.findByTestId("workspace-dropdown-menu");

    // Assert
    expect(await within(menu).findByText("repo1")).toBeInTheDocument();
  });

  it("Add Workspace dispatches addWorkspaces to the agent-server", async () => {
    // Arrange
    const addSpy = vi
      .spyOn(WorkspacesService, "addWorkspaces")
      .mockResolvedValue({ workspaces: [], workspaceParents: [] });
    mockSearchSubdirectories.mockImplementation(async (path: string) => {
      if (path === "/Users/me") {
        return {
          items: [{ name: "dev", path: "/Users/me/dev" }],
          next_page_id: null,
        };
      }
      return { items: [], next_page_id: null };
    });
    renderForm();
    const user = userEvent.setup();

    // Act
    await user.click(await screen.findByTestId("workspace-dropdown"));
    await user.click(await screen.findByTestId("add-workspaces-button"));
    await screen.findByTestId("folder-browser-modal");
    await user.click(await screen.findByTestId("folder-browser-entry-dev"));
    await user.click(screen.getByTestId("folder-browser-use"));

    // Assert
    await waitFor(() => expect(addSpy).toHaveBeenCalledTimes(1));
    expect(addSpy).toHaveBeenCalledWith([
      { id: "/Users/me/dev", name: "dev", path: "/Users/me/dev" },
    ]);
  });

  it("Remove Workspace dispatches removeWorkspace to the agent-server", async () => {
    // Arrange
    const removeSpy = vi
      .spyOn(WorkspacesService, "removeWorkspace")
      .mockResolvedValue();
    renderForm({
      workspaces: [
        {
          id: "/Users/me/dev/repo1",
          name: "repo1",
          path: "/Users/me/dev/repo1",
        },
      ],
    });
    const user = userEvent.setup();

    // Act
    await user.click(await screen.findByTestId("workspace-dropdown"));
    await user.click(await screen.findByTestId("manage-workspaces-button"));
    await screen.findByTestId("manage-workspaces-modal");
    await user.click(screen.getByTestId("manage-workspaces-remove-repo1"));
    await screen.findByTestId("confirmation-modal");
    await user.click(screen.getByTestId("confirm-button"));

    // Assert
    await waitFor(() => expect(removeSpy).toHaveBeenCalledTimes(1));
    expect(removeSpy).toHaveBeenCalledWith("/Users/me/dev/repo1");
  });

  it("Add all subdirectories dispatches addWorkspaceParents to the agent-server", async () => {
    // Arrange
    const addParentsSpy = vi
      .spyOn(WorkspacesService, "addWorkspaceParents")
      .mockResolvedValue({ workspaces: [], workspaceParents: [] });
    mockSearchSubdirectories.mockImplementation(async (path: string) => {
      if (path === "/Users/me") {
        return {
          items: [{ name: "dev", path: "/Users/me/dev" }],
          next_page_id: null,
        };
      }
      return { items: [], next_page_id: null };
    });
    renderForm();
    const user = userEvent.setup();

    // Act
    await user.click(await screen.findByTestId("workspace-dropdown"));
    await user.click(await screen.findByTestId("add-workspaces-button"));
    await screen.findByTestId("folder-browser-modal");
    await user.click(await screen.findByTestId("folder-browser-entry-dev"));
    await user.click(screen.getByTestId("folder-browser-add-all-subdirs"));

    // Assert
    await waitFor(() => expect(addParentsSpy).toHaveBeenCalledTimes(1));
    expect(addParentsSpy).toHaveBeenCalledWith([
      { id: "/Users/me/dev", name: "dev", path: "/Users/me/dev" },
    ]);
  });
});
