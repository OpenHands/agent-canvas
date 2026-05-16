import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatAddFileButton } from "#/components/features/chat/chat-add-file-button";
import { I18nKey } from "#/i18n/declaration";

describe("ChatAddFileButton", () => {
  it("uses the translated aria-label key instead of a hardcoded string", () => {
    render(<ChatAddFileButton handleFileIconClick={vi.fn()} />);

    const button = screen.getByTestId("paperclip-icon");
    expect(button).toHaveAttribute("aria-label", I18nKey.CHAT_INTERFACE$ADD_FILE);
    expect(button).not.toHaveAttribute("aria-label", "Add file");
  });

  it("invokes handleFileIconClick when clicked", async () => {
    const user = userEvent.setup();
    const handleFileIconClick = vi.fn();

    render(<ChatAddFileButton handleFileIconClick={handleFileIconClick} />);

    await user.click(
      screen.getByLabelText(I18nKey.CHAT_INTERFACE$ADD_FILE),
    );
    expect(handleFileIconClick).toHaveBeenCalledTimes(1);
  });

  it("disables the button and suppresses clicks when disabled", async () => {
    const user = userEvent.setup();
    const handleFileIconClick = vi.fn();

    render(
      <ChatAddFileButton
        handleFileIconClick={handleFileIconClick}
        disabled
      />,
    );

    const button = screen.getByTestId("paperclip-icon");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "aria-label",
      I18nKey.CHAT_INTERFACE$ADD_FILE,
    );

    await user.click(button);
    expect(handleFileIconClick).not.toHaveBeenCalled();
  });
});
