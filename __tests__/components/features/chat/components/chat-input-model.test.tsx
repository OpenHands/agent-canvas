import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders } from "test-utils";

const useActiveConversationMock = vi.fn();
const useSettingsMock = vi.fn();

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => useSettingsMock(),
}));

import { ChatInputModel } from "#/components/features/chat/components/chat-input-model";

describe("ChatInputModel", () => {
  beforeEach(() => {
    useActiveConversationMock.mockReset();
    useSettingsMock.mockReset();
    useSettingsMock.mockReturnValue({ data: undefined });
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
    expect(model).toHaveTextContent("openai/gpt…");
    expect(model).toHaveAttribute("title", "openai/gpt-4o");
    expect(
      screen.queryByTestId("chat-input-llm-model-popover"),
    ).not.toBeInTheDocument();

    fireEvent.click(model);
    const popover = screen.getByTestId("chat-input-llm-model-popover");
    expect(popover).toHaveTextContent("openai/gpt-4o");
    const llmSettingsLink = screen.getByRole("link", {
      name: /LLM Profiles|SETTINGS\$LLM_PROFILES|LLM Settings|SETTINGS\$LLM_SETTINGS/,
    });
    expect(llmSettingsLink).toHaveAttribute("href", "/settings");
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

  it("falls back to the user's default model from settings when there is no active conversation", () => {
    // Arrange — home page render: no conversation yet, but the user has
    // a default model configured. The switcher should still show.
    useActiveConversationMock.mockReturnValue({ data: undefined });
    useSettingsMock.mockReturnValue({
      data: { llm_model: "anthropic/claude-sonnet-4-20250514" },
    });

    renderWithProviders(<ChatInputModel />);

    const model = screen.getByTestId("chat-input-llm-model");
    expect(model).toHaveTextContent("anthropic/…");
    expect(model).toHaveAttribute(
      "title",
      "anthropic/claude-sonnet-4-20250514",
    );
  });

  it("renders nothing when neither the conversation nor settings provide an llm_model", () => {
    useActiveConversationMock.mockReturnValue({ data: undefined });
    useSettingsMock.mockReturnValue({ data: undefined });

    renderWithProviders(<ChatInputModel />);

    expect(
      screen.queryByTestId("chat-input-llm-model"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing for ACP conversations and does NOT fall back to settings.llm_model", () => {
    // The ACP subprocess owns its model (via ``acp_model``); ``llm_model``
    // is null on the conversation by design. The previous fallback to
    // ``settings.llm_model`` would have resurrected the user's *default*
    // OpenHands model on, say, a Claude-Code conversation — visibly
    // wrong (the link goes to /settings, which is itself disabled for
    // ACP) and silently lies about what model is actually running.
    useActiveConversationMock.mockReturnValue({
      data: {
        conversation_id: "test-conversation-id",
        agent_kind: "acp",
        llm_model: null,
      },
    });
    useSettingsMock.mockReturnValue({
      data: { llm_model: "anthropic/claude-sonnet-4-20250514" },
    });

    renderWithProviders(<ChatInputModel />);

    expect(
      screen.queryByTestId("chat-input-llm-model"),
    ).not.toBeInTheDocument();
  });
});
