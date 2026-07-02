import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateAgentProfileModal } from "#/components/features/settings/agent-profiles/create-agent-profile-modal";

describe("CreateAgentProfileModal", () => {
  it("renders an OpenHands and an ACP choice when open", () => {
    render(
      <CreateAgentProfileModal isOpen onClose={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.getByTestId("create-agent-kind-openhands")).toBeInTheDocument();
    expect(screen.getByTestId("create-agent-kind-acp")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <CreateAgentProfileModal
        isOpen={false}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("create-agent-kind-openhands"),
    ).not.toBeInTheDocument();
  });

  it("calls onSelect with the chosen kind", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <CreateAgentProfileModal isOpen onClose={vi.fn()} onSelect={onSelect} />,
    );

    await user.click(screen.getByTestId("create-agent-kind-acp"));
    expect(onSelect).toHaveBeenCalledWith("acp");

    await user.click(screen.getByTestId("create-agent-kind-openhands"));
    expect(onSelect).toHaveBeenCalledWith("openhands");
  });

  it("calls onClose from the cancel action", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <CreateAgentProfileModal isOpen onClose={onClose} onSelect={vi.fn()} />,
    );
    await user.click(screen.getByTestId("create-agent-cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
