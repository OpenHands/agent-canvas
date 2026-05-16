import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders } from "test-utils";

const useActiveConversationMock = vi.fn();

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

// eslint-disable-next-line import/first
import { ChatInputModel } from "#/components/features/chat/components/chat-input-model";

describe("ChatInputModel", () => {
  beforeEach(() => {
    useActiveConversationMock.mockReset();
  });

  it("renders the active conversation's llm_model when present", () => {
    useActiveConversationMock.mockReturnValue({
      data: {
        conversation_id: "test-conversation-id",
        llm_model: "openai/gpt-4o",
      },
    });

    renderWithProviders(<ChatInputModel />);

    const model = screen.getByTestId("chat-input-llm-model");
    expect(model).toBeInTheDocument();
    expect(model).toHaveTextContent("openai/gpt-4o");
    expect(model).toHaveAttribute("title", "openai/gpt-4o");
    expect(
      screen.queryByTestId("chat-input-llm-model-popover"),
    ).not.toBeInTheDocument();

    fireEvent.click(model);
    const popover = screen.getByTestId("chat-input-llm-model-popover");
    expect(popover).toHaveTextContent("openai/gpt-4o");
    const llmSettingsLink = screen.getByRole("link", {
      name: /LLM Settings|SETTINGS\$LLM_SETTINGS/,
    });
    expect(llmSettingsLink).toHaveAttribute("href", "/settings");
  });

  it("renders long model names in full on both the button and the popover", () => {
    // Arrange — reproduces the bug-report scenario where a 24-char model name
    // was previously rendered as "claude-son…" on the button and wrapped onto
    // two lines inside the popover.
    const longModel = "claude-sonnet-4-20250514";
    useActiveConversationMock.mockReturnValue({
      data: {
        conversation_id: "test-conversation-id",
        llm_model: longModel,
      },
    });

    renderWithProviders(<ChatInputModel />);

    // Act
    const button = screen.getByTestId("chat-input-llm-model");
    fireEvent.click(button);

    // Assert — button shows the full name (no truncation),
    // and the popover renders the same full string.
    expect(button).toHaveTextContent(longModel);
    expect(
      screen.getByTestId("chat-input-llm-model-popover"),
    ).toHaveTextContent(longModel);
  });

  it("renders nothing when llm_model is missing", () => {
    useActiveConversationMock.mockReturnValue({
      data: { conversation_id: "test-conversation-id" },
    });

    renderWithProviders(<ChatInputModel />);

    expect(
      screen.queryByTestId("chat-input-llm-model"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when there is no active conversation", () => {
    useActiveConversationMock.mockReturnValue({ data: undefined });

    renderWithProviders(<ChatInputModel />);

    expect(
      screen.queryByTestId("chat-input-llm-model"),
    ).not.toBeInTheDocument();
  });
});
