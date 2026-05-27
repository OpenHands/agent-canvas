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

  it("renders an ACP conversation model and links to Agent settings", () => {
    useActiveConversationMock.mockReturnValue({
      data: {
        conversation_id: "test-conversation-id",
        agent_kind: "acp",
        acp_server: "claude-code",
        llm_model: "claude-sonnet-4-6",
      },
    });

    renderWithProviders(<ChatInputModel />);

    const model = screen.getByTestId("chat-input-llm-model");
    // ACP surfaces show the provider's human label (matching the conversation
    // list chip), resolved from ``acp_server`` + the raw ``acp_model`` id.
    expect(model).toHaveAttribute("title", "Claude Sonnet 4.6");
    fireEvent.click(model);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/settings/agent");
  });

  it("does not fall back to the OpenHands settings model for active ACP conversations", () => {
    useActiveConversationMock.mockReturnValue({
      data: {
        conversation_id: "test-conversation-id",
        agent_kind: "acp",
        llm_model: null,
      },
    });
    useSettingsMock.mockReturnValue({
      data: { llm_model: "openai/gpt-4o" },
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

  it("uses the ACP settings model on the home page when ACP is active", () => {
    useActiveConversationMock.mockReturnValue({ data: undefined });
    useSettingsMock.mockReturnValue({
      data: {
        llm_model: "openai/gpt-4o",
        agent_settings: {
          agent_kind: "acp",
          acp_model: "gemini-2.5-pro",
        },
      },
    });

    renderWithProviders(<ChatInputModel />);

    const model = screen.getByTestId("chat-input-llm-model");
    expect(model).toHaveAttribute("title", "gemini-2.5-pro");
    fireEvent.click(model);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/settings/agent");
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

  it("shows the provider default on the home page when ACP is the default agent and no model is saved", () => {
    // Home-screen gating: no active conversation and no saved ``acp_model``.
    // The next-created conversation will inherit the provider's
    // ``default_model`` (see buildConfiguredAcpAgentSettings), so the picker
    // shows that same default — matching what the runtime will actually
    // start. Picker links to /settings/agent (not /settings) since
    // ``settings.llm_model`` doesn't apply to ACP.
    useActiveConversationMock.mockReturnValue({ data: undefined });
    useSettingsMock.mockReturnValue({
      data: {
        agent_settings: { agent_kind: "acp", acp_server: "claude-code" },
        // settings.llm_model is set (user has an OpenHands default
        // configured), but agent_kind=acp suppresses it.
        llm_model: "anthropic/claude-sonnet-4-20250514",
      },
    });

    renderWithProviders(<ChatInputModel />);

    const model = screen.getByTestId("chat-input-llm-model");
    // Claude Code's registered default (``claude-opus-4-7``), shown as its
    // human label to match the conversation list chip. See CLAUDE_MODELS in
    // acp-providers.ts.
    expect(model).toHaveAttribute("title", "Claude Opus 4.7");
    fireEvent.click(model);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/settings/agent");
  });
});
