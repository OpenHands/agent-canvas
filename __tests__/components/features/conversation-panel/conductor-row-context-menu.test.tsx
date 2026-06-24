import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import { ConductorRowContextMenu } from "#/components/features/conversation-panel/conversation-card/conductor-row-context-menu";

function setup(
  overrides: Partial<React.ComponentProps<typeof ConductorRowContextMenu>> = {},
) {
  const props = {
    style: {},
    onClose: vi.fn(),
    isUnread: false,
    onToggleUnread: vi.fn(),
    isPinned: false,
    onTogglePin: vi.fn(),
    isMuted: false,
    onToggleMute: vi.fn(),
    statusOverride: null,
    onSetStatus: vi.fn(),
    onClearStatus: vi.fn(),
    onRename: vi.fn(),
    isArchived: false,
    onToggleArchive: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  renderWithProviders(<ConductorRowContextMenu {...props} />);
  return props;
}

describe("ConductorRowContextMenu", () => {
  it("renders the conductor row actions", () => {
    setup();
    expect(screen.getByTestId("conductor-row-mark-unread")).toBeInTheDocument();
    expect(screen.getByTestId("conductor-row-pin")).toBeInTheDocument();
    expect(screen.getByTestId("conductor-row-mute")).toBeInTheDocument();
    expect(screen.getByTestId("conductor-row-set-status")).toBeInTheDocument();
    expect(screen.getByTestId("conductor-row-rename")).toBeInTheDocument();
    expect(screen.getByTestId("conductor-row-archive")).toBeInTheDocument();
    expect(screen.getByTestId("conductor-row-delete")).toBeInTheDocument();
  });

  it("toggles mute and closes the menu", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByTestId("conductor-row-mute"));
    expect(props.onToggleMute).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("opens the status submenu and sets a status", async () => {
    const user = userEvent.setup();
    const props = setup();

    expect(
      screen.queryByTestId("conductor-row-status-submenu"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId("conductor-row-set-status"));
    expect(
      screen.getByTestId("conductor-row-status-submenu"),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("conductor-row-status-done"));
    expect(props.onSetStatus).toHaveBeenCalledWith("done");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("clears a status override from the submenu", async () => {
    const user = userEvent.setup();
    const props = setup({ statusOverride: "done" });

    await user.click(screen.getByTestId("conductor-row-set-status"));
    await user.click(screen.getByTestId("conductor-row-status-clear"));
    expect(props.onClearStatus).toHaveBeenCalled();
  });

  it("invokes pin and archive handlers", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByTestId("conductor-row-pin"));
    expect(props.onTogglePin).toHaveBeenCalled();

    await user.click(screen.getByTestId("conductor-row-archive"));
    expect(props.onToggleArchive).toHaveBeenCalled();
  });
});
