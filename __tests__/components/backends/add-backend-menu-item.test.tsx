import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddBackendMenuItem } from "#/components/features/backends/add-backend-menu-item";

describe("AddBackendMenuItem", () => {
  it("calls onOpen when clicked and does not render the modal itself", async () => {
    const onOpen = vi.fn();
    render(<AddBackendMenuItem onOpen={onOpen} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("add-backend-menu-item"));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("add-backend-modal")).not.toBeInTheDocument();
  });
});
