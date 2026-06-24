import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

import {
  ConversationPanelFilterMenu,
  type ConversationPanelFilterMenuProps,
} from "#/components/features/conversation-panel/conversation-panel-filter-menu";

// ConversationPanelFilterMenu composes the extracted MenuHeading / MenuRow /
// MenuSeparator components. Rendering it open exercises all three through
// their real consumer, so these tests double as the regression guard for the
// extraction.
function renderFilterMenu(
  overrides: Partial<ConversationPanelFilterMenuProps> = {},
) {
  const props: ConversationPanelFilterMenuProps = {
    filterMenuOpen: true,
    setFilterMenuOpen: vi.fn(),
    menuRef: createRef<HTMLDivElement>(),
    backendKind: "local",
    organizeMode: "grouped",
    setOrganizeMode: vi.fn(),
    conversationSort: "created",
    setConversationSort: vi.fn(),
    repoFilter: "all",
    setRepoFilter: vi.fn(),
    repoOptions: [],
    projectFilter: "all",
    setProjectFilter: vi.fn(),
    projectOptions: [],
    showProjectScope: false,
    onManageProjects: vi.fn(),
    threadScope: "all",
    setThreadScope: vi.fn(),
    ownerScope: "all",
    setOwnerScope: vi.fn(),
    showOwnerScope: true,
    sourceScope: "all",
    setSourceScope: vi.fn(),
    showSourceScope: true,
    showOlderConversations: false,
    toggleShowOlderConversations: vi.fn(),
    showRepoBranchMetadata: false,
    toggleShowRepoBranchMetadata: vi.fn(),
    showLlmProfiles: false,
    toggleShowLlmProfiles: vi.fn(),
    showHoverMetadata: false,
    toggleShowHoverMetadata: vi.fn(),
    totalConversationsCount: 5,
    onRequestDeleteAll: vi.fn(),
    ...overrides,
  };
  render(<ConversationPanelFilterMenu {...props} />);
  return props;
}

describe("ConversationPanelFilterMenu", () => {
  it("renders the section headings and rows while open", () => {
    // Arrange + Act
    renderFilterMenu({ filterMenuOpen: true });

    // Assert: a MenuHeading and representative MenuRows are present.
    expect(
      screen.getByTestId("older-conversations-filter-menu"),
    ).toBeInTheDocument();
    expect(screen.getByText("CONVERSATION_PANEL$GROUP_BY")).toBeInTheDocument();
    expect(
      screen.getByTestId("toggle-older-conversations"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("delete-all-conversations")).toBeInTheDocument();
  });

  it("renders the repo filter only when more than one repo is present", async () => {
    const user = userEvent.setup();
    const props = renderFilterMenu({
      filterMenuOpen: true,
      repoOptions: [
        { id: "ws:/projects/spotwise-ui", label: "spotwise-ui", count: 3 },
        {
          id: "ws:/projects/internal-spotty",
          label: "internal-spotty",
          count: 1,
        },
      ],
    });

    expect(screen.getByTestId("repo-filter-all")).toBeInTheDocument();
    const repoRow = screen.getByTestId("repo-filter-ws:/projects/spotwise-ui");
    expect(repoRow).toBeInTheDocument();

    await user.click(repoRow);
    expect(props.setRepoFilter).toHaveBeenCalledWith(
      "ws:/projects/spotwise-ui",
    );
    expect(props.setFilterMenuOpen).toHaveBeenCalledWith(false);
  });

  it("hides the repo filter when only one repo is present", () => {
    renderFilterMenu({
      filterMenuOpen: true,
      repoOptions: [{ id: "ws:/projects/only", label: "only", count: 2 }],
    });
    expect(screen.queryByTestId("repo-filter-all")).not.toBeInTheDocument();
  });

  it("runs a row's action and closes the menu when the row is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const props = renderFilterMenu({ filterMenuOpen: true });

    // Act
    await user.click(screen.getByTestId("toggle-llm-profiles"));

    // Assert
    expect(props.toggleShowLlmProfiles).toHaveBeenCalledTimes(1);
    expect(props.setFilterMenuOpen).toHaveBeenCalledWith(false);
  });

  it("disables the delete-all row when there are no conversations", () => {
    // Arrange + Act
    renderFilterMenu({ filterMenuOpen: true, totalConversationsCount: 0 });

    // Assert
    expect(screen.getByTestId("delete-all-conversations")).toBeDisabled();
  });

  it("sets the owner scope when a Mine/All row is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const props = renderFilterMenu({ filterMenuOpen: true, ownerScope: "all" });

    // Act
    await user.click(screen.getByTestId("owner-scope-mine"));

    // Assert
    expect(props.setOwnerScope).toHaveBeenCalledWith("mine");
    expect(props.setFilterMenuOpen).toHaveBeenCalledWith(false);
  });

  it("hides the owner facet when no current-user identity is known", () => {
    // Arrange + Act
    renderFilterMenu({ filterMenuOpen: true, showOwnerScope: false });

    // Assert
    expect(screen.queryByTestId("owner-scope-mine")).not.toBeInTheDocument();
    expect(screen.queryByTestId("owner-scope-all")).not.toBeInTheDocument();
  });

  it("sets the source scope when a source row is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const props = renderFilterMenu({
      filterMenuOpen: true,
      sourceScope: "all",
    });

    // Act
    await user.click(screen.getByTestId("source-scope-hermes"));

    // Assert
    expect(props.setSourceScope).toHaveBeenCalledWith("hermes");
    expect(props.setFilterMenuOpen).toHaveBeenCalledWith(false);
  });

  it("hides the source facet when no Hermes sessions are present", () => {
    // Arrange + Act
    renderFilterMenu({ filterMenuOpen: true, showSourceScope: false });

    // Assert
    expect(screen.queryByTestId("source-scope-hermes")).not.toBeInTheDocument();
    expect(screen.queryByTestId("source-scope-app")).not.toBeInTheDocument();
  });

  it("renders the project selection rows only when projects exist", async () => {
    const user = userEvent.setup();
    const props = renderFilterMenu({
      filterMenuOpen: true,
      showProjectScope: true,
      projectOptions: [
        {
          slug: "billing",
          label: "Spotwise Billing",
          count: 2,
          inRegistry: true,
        },
      ],
    });

    expect(screen.getByTestId("project-filter-all")).toBeInTheDocument();
    const projectRow = screen.getByTestId("project-filter-billing");
    await user.click(projectRow);
    expect(props.setProjectFilter).toHaveBeenCalledWith("billing");
    expect(props.setFilterMenuOpen).toHaveBeenCalledWith(false);
  });

  it("hides the project selection rows but keeps Manage projects when none exist", async () => {
    const user = userEvent.setup();
    const props = renderFilterMenu({
      filterMenuOpen: true,
      showProjectScope: false,
    });

    // No selection rows...
    expect(screen.queryByTestId("project-filter-all")).not.toBeInTheDocument();
    // ...but the create/manage entry point is always reachable.
    const manage = screen.getByTestId("manage-projects");
    await user.click(manage);
    expect(props.onManageProjects).toHaveBeenCalledTimes(1);
  });
});
