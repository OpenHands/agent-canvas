import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatMessage } from "#/components/features/chat/chat-message";

describe("ChatMessage", () => {
  it("should render a user message", () => {
    render(<ChatMessage type="user" message="Hello, World!" />);
    expect(screen.getByTestId("user-message")).toBeInTheDocument();
    expect(screen.getByText("Hello, World!")).toBeInTheDocument();
  });

  it("should support code syntax highlighting", () => {
    const code = "```js\nconsole.log('Hello, World!')\n```";
    render(<ChatMessage type="user" message={code} />);

    // SyntaxHighlighter breaks the code blocks into "tokens"
    expect(screen.getByText("console")).toBeInTheDocument();
    expect(screen.getByText("log")).toBeInTheDocument();
    expect(screen.getByText("'Hello, World!'")).toBeInTheDocument();
  });

  it("should render the copy to clipboard button when the user hovers over the message", async () => {
    const user = userEvent.setup();
    render(<ChatMessage type="user" message="Hello, World!" />);
    const message = screen.getByText("Hello, World!");

    expect(screen.getByTestId("copy-to-clipboard")).not.toBeVisible();

    await user.hover(message);

    expect(screen.getByTestId("copy-to-clipboard")).toBeVisible();
  });

  it("should copy content to clipboard", async () => {
    const user = userEvent.setup();
    render(<ChatMessage type="user" message="Hello, World!" />);
    const copyToClipboardButton = screen.getByTestId("copy-to-clipboard");

    await user.click(copyToClipboardButton);

    await waitFor(() =>
      expect(navigator.clipboard.readText()).resolves.toBe("Hello, World!"),
    );
  });

  it("should render a component passed as a prop", () => {
    const customComponentText = "Custom Component";
    function Component() {
      return <div data-testid="custom-component">{customComponentText}</div>;
    }
    render(
      <ChatMessage type="user" message="Hello, World">
        <Component />
      </ChatMessage>,
    );
    expect(screen.getByTestId("custom-component")).toBeInTheDocument();
  });

  it("should apply correct styles to inline code", () => {
    render(
      <ChatMessage type="agent" message="Here is some `inline code` text" />,
    );
    const codeElement = screen.getByText("inline code");

    expect(codeElement.tagName.toLowerCase()).toBe("code");
    expect(codeElement.closest("article")).not.toBeNull();
  });

  it("truncates long sent user messages to three lines with view more on hover", async () => {
    const longMessage = `${"Here's a long message. ".repeat(40)}`.trim();
    render(<ChatMessage type="user" message={longMessage} />);

    expect(
      screen.getByTestId("chat-message-truncation-gradient"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("chat-message-view-more")).toHaveClass(
      "opacity-0",
    );

    fireEvent.mouseEnter(screen.getByTestId("user-message"));
    expect(screen.getByTestId("chat-message-view-more")).toHaveClass(
      "opacity-100",
    );

    fireEvent.click(screen.getByTestId("chat-message-expand"));
    expect(
      screen.queryByTestId("chat-message-truncation-gradient"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("chat-message-view-more"),
    ).not.toBeInTheDocument();
  });

  it("does not issue a cross-component update warning when measuring truncation", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const longMessage = `${"Here's a long message. ".repeat(40)}`.trim();

    try {
      render(<ChatMessage type="user" message={longMessage} />);

      expect(
        screen.getByTestId("chat-message-truncation-gradient"),
      ).toBeInTheDocument();

      const consoleOutput = errorSpy.mock.calls
        .flat()
        .map((part) => String(part))
        .join("\n");
      expect(consoleOutput).not.toContain(
        "Cannot update a component (`ChatMessage`) while rendering a different component (`UserMessageBody`)",
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
