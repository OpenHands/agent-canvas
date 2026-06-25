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
    function Component() {
      return <div data-testid="custom-component">Custom Component</div>;
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

    expect(screen.getByTestId("chat-message-truncation-gradient")).toBeInTheDocument();
    expect(screen.getByTestId("chat-message-view-more")).toHaveClass("opacity-0");

    fireEvent.mouseEnter(screen.getByTestId("user-message"));
    expect(screen.getByTestId("chat-message-view-more")).toHaveClass("opacity-100");

    fireEvent.click(screen.getByTestId("chat-message-expand"));
    expect(screen.queryByTestId("chat-message-truncation-gradient")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-message-view-more")).not.toBeInTheDocument();
  });

  it("shows a stop control for a sending user message and calls onStop when clicked", () => {
    const onStop = vi.fn();
    render(
      <ChatMessage
        type="user"
        message="Working on it"
        pendingStatus="sending"
        onStop={onStop}
      />,
    );

    expect(screen.getByTestId("chat-message-sending")).toBeInTheDocument();
    const stopButton = screen.getByTestId("chat-message-stop");

    // The stop control only becomes interactive once the bubble is hovered.
    fireEvent.mouseEnter(screen.getByTestId("user-message"));
    fireEvent.click(stopButton);

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("renders a literal angle-bracket user message as visible text", () => {
    // Regression: user messages were rendered with raw-HTML parsing enabled,
    // so a message like "<something>" was parsed as an unknown HTML tag and
    // dropped by rehype-sanitize — leaving an empty bubble that looked like
    // nothing was sent. User input must render literally.
    const { container } = render(
      <ChatMessage type="user" message="<something>" />,
    );

    expect(screen.getByTestId("user-message")).toBeInTheDocument();
    // The angle-bracket text must survive verbatim...
    expect(container.textContent).toContain("<something>");
    // ...and must NOT have been parsed into an element.
    expect(container.querySelector("something")).toBeNull();
  });

  it("renders literal angle-bracket text in a sending user message", () => {
    // The pending/sending bubble renders through a different branch than the
    // settled message, so it gets its own guard.
    const { container } = render(
      <ChatMessage type="user" message="<something>" pendingStatus="sending" />,
    );

    expect(container.textContent).toContain("<something>");
    expect(container.querySelector("something")).toBeNull();
  });

  it("still parses inline HTML for agent messages", () => {
    // The fix is scoped to user input: agent output keeps raw-HTML parsing so
    // allowed inline tags (badges, <mark>, <details>, …) continue to render.
    const { container } = render(
      <ChatMessage type="agent" message="Hello <mark>world</mark>" />,
    );

    expect(container.querySelector("mark")?.textContent).toBe("world");
  });
});
