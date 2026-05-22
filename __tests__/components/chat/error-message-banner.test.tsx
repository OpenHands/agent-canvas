import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorMessageBanner } from "#/components/features/chat/error-message-banner";

describe("ErrorMessageBanner", () => {
  it("calls onDismiss when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(
      <ErrorMessageBanner
        message="Something went wrong"
        onDismiss={onDismiss}
      />,
    );

    await user.click(screen.getByTestId("error-message-banner-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry when the retry button is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <ErrorMessageBanner
        message="Unable to connect to server"
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByTestId("error-message-banner-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("uses greyscale theme tokens instead of red error styling", () => {
    render(<ErrorMessageBanner message="Something went wrong" />);

    const banner = screen.getByTestId("error-message-banner");
    expect(banner.className).toContain("border-[var(--oh-border)]");
    expect(banner.className).toContain("bg-[var(--oh-surface-raised)]");
    expect(banner.className).not.toContain("#FF0006");
    expect(banner.className).not.toContain("#4A0709");
  });

  it("shows a View More / View Less toggle for long messages", async () => {
    const user = userEvent.setup();
    const longMessage = "a".repeat(400);

    render(<ErrorMessageBanner message={longMessage} />);

    const toggle = screen.getByTestId("error-message-banner-toggle");
    expect(toggle).toHaveTextContent("COMMON$VIEW_MORE");

    await user.click(toggle);
    expect(toggle).toHaveTextContent("COMMON$VIEW_LESS");
  });
});
