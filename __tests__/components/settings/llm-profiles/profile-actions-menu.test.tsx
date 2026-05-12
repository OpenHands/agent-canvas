import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ProfileActionsMenu } from "#/components/features/settings/llm-profiles/profile-actions-menu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "BUTTON$EDIT": "Edit",
        "BUTTON$RENAME": "Rename",
        "BUTTON$DELETE": "Delete",
      };
      return translations[key] || key;
    },
  }),
}));

describe("ProfileActionsMenu", () => {
  it("renders Edit, Rename, and Delete buttons", () => {
    render(
      <ProfileActionsMenu
        menuId="test-menu-id"
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("profile-action-edit")).toHaveTextContent("Edit");
    expect(screen.getByTestId("profile-action-rename")).toHaveTextContent("Rename");
    expect(screen.getByTestId("profile-action-delete")).toHaveTextContent("Delete");
  });

  it("calls onEdit and onClose when Edit is clicked", async () => {
    const user = userEvent.setup();
    const handleEdit = vi.fn();
    const handleClose = vi.fn();

    render(
      <ProfileActionsMenu
        menuId="test-menu-id"
        onEdit={handleEdit}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onClose={handleClose}
      />,
    );

    await user.click(screen.getByTestId("profile-action-edit"));

    expect(handleEdit).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onRename and onClose when Rename is clicked", async () => {
    const user = userEvent.setup();
    const handleRename = vi.fn();
    const handleClose = vi.fn();

    render(
      <ProfileActionsMenu
        menuId="test-menu-id"
        onEdit={vi.fn()}
        onRename={handleRename}
        onDelete={vi.fn()}
        onClose={handleClose}
      />,
    );

    await user.click(screen.getByTestId("profile-action-rename"));

    expect(handleRename).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onDelete and onClose when Delete is clicked", async () => {
    const user = userEvent.setup();
    const handleDelete = vi.fn();
    const handleClose = vi.fn();

    render(
      <ProfileActionsMenu
        menuId="test-menu-id"
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={handleDelete}
        onClose={handleClose}
      />,
    );

    await user.click(screen.getByTestId("profile-action-delete"));

    expect(handleDelete).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking outside the menu", () => {
    const handleClose = vi.fn();

    render(
      <div>
        <div data-testid="outside">Outside</div>
        <ProfileActionsMenu
        menuId="test-menu-id"
          onEdit={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onClose={handleClose}
        />
      </div>,
    );

    fireEvent.mouseDown(screen.getByTestId("outside"));

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const handleClose = vi.fn();

    render(
      <ProfileActionsMenu
        menuId="test-menu-id"
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onClose={handleClose}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose for other keys", () => {
    const handleClose = vi.fn();

    render(
      <ProfileActionsMenu
        menuId="test-menu-id"
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onClose={handleClose}
      />,
    );

    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.keyDown(document, { key: "ArrowDown" });

    expect(handleClose).not.toHaveBeenCalled();
  });

  it("has correct accessibility attributes", () => {
    render(
      <ProfileActionsMenu
        menuId="test-menu-id"
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const menu = screen.getByRole("menu");
    expect(menu).toHaveAttribute("aria-orientation", "vertical");

    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems).toHaveLength(3);
  });

  it("Delete button has red text styling", () => {
    render(
      <ProfileActionsMenu
        menuId="test-menu-id"
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const deleteButton = screen.getByTestId("profile-action-delete");
    expect(deleteButton).toHaveClass("text-red-400");
  });

  it("does not call onClose when clicking inside the menu container", () => {
    const handleClose = vi.fn();

    render(
      <ProfileActionsMenu
        menuId="test-menu-id"
        onEdit={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onClose={handleClose}
      />,
    );

    const menu = screen.getByRole("menu");
    fireEvent.mouseDown(menu);

    expect(handleClose).not.toHaveBeenCalled();
  });
});
