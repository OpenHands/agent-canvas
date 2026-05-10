import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "test-utils";
import { PendingUserMessages } from "#/components/features/chat/pending-user-messages";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";

const mockSend = vi.fn();
vi.mock("#/hooks/use-send-message", () => ({
  useSendMessage: () => ({ send: mockSend }),
}));

describe("PendingUserMessages", () => {
  beforeEach(() => {
    mockSend.mockReset();
    useOptimisticUserMessageStore.setState({ pendingMessages: [] });
  });

  afterEach(() => {
    useOptimisticUserMessageStore.setState({ pendingMessages: [] });
  });

  it("renders nothing when the queue is empty", () => {
    const { container } = render(<PendingUserMessages />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each queued message with the faded 'sending' treatment", () => {
    useOptimisticUserMessageStore.getState().enqueuePendingMessage({
      text: "first message",
    });
    useOptimisticUserMessageStore.getState().enqueuePendingMessage({
      text: "second message",
    });

    renderWithProviders(<PendingUserMessages />);

    const messages = screen.getAllByTestId("user-message");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toHaveTextContent("first message");
    expect(messages[1]).toHaveTextContent("second message");
    messages.forEach((message) => {
      expect(message).toHaveAttribute("data-pending-status", "sending");
      expect(message.className).toMatch(/opacity-60/);
    });
    expect(screen.getAllByTestId("chat-message-sending")).toHaveLength(2);
  });

  it("shows an error state with a retry link when the message is in 'error'", () => {
    const id = useOptimisticUserMessageStore
      .getState()
      .enqueuePendingMessage({ text: "broken message" });
    useOptimisticUserMessageStore
      .getState()
      .markPendingMessageError(id, "Server unavailable");

    renderWithProviders(<PendingUserMessages />);

    const message = screen.getByTestId("user-message");
    expect(message).toHaveAttribute("data-pending-status", "error");
    expect(screen.getByTestId("chat-message-error")).toBeInTheDocument();
    expect(screen.getByTestId("chat-message-retry")).toBeInTheDocument();
  });

  it("re-sends and flips back to 'sending' when retry is clicked", async () => {
    mockSend.mockResolvedValueOnce({ queued: false });
    const id = useOptimisticUserMessageStore
      .getState()
      .enqueuePendingMessage({ text: "retry me" });
    useOptimisticUserMessageStore
      .getState()
      .markPendingMessageError(id, "Server unavailable");

    renderWithProviders(<PendingUserMessages />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("chat-message-retry"));

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "message",
        args: expect.objectContaining({ content: "retry me" }),
      }),
    );

    await waitFor(() => {
      const [entry] =
        useOptimisticUserMessageStore.getState().pendingMessages;
      expect(entry.status).toBe("sending");
      expect(entry.errorMessage).toBeUndefined();
    });
  });

  it("flips back to 'error' if the retry attempt also fails", async () => {
    mockSend.mockRejectedValueOnce(new Error("still broken"));
    const id = useOptimisticUserMessageStore
      .getState()
      .enqueuePendingMessage({ text: "retry me" });
    useOptimisticUserMessageStore
      .getState()
      .markPendingMessageError(id, "Server unavailable");

    renderWithProviders(<PendingUserMessages />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("chat-message-retry"));

    await waitFor(() => {
      const [entry] =
        useOptimisticUserMessageStore.getState().pendingMessages;
      expect(entry.status).toBe("error");
      expect(entry.errorMessage).toBe("still broken");
    });
  });
});
