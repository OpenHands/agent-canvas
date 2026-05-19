import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders } from "test-utils";

const useLlmProfilesMock = vi.fn();
const useActiveConversationMock = vi.fn();
const useSettingsMock = vi.fn();
const useSwitchLlmProfileAndLogMock = vi.fn();
const useOptionalConversationIdMock = vi.fn();

vi.mock("#/hooks/query/use-llm-profiles", () => ({
  useLlmProfiles: () => useLlmProfilesMock(),
}));

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => useSettingsMock(),
}));

vi.mock("#/hooks/mutation/use-switch-llm-profile-and-log", () => ({
  useSwitchLlmProfileAndLog: () => useSwitchLlmProfileAndLogMock(),
}));

vi.mock("#/hooks/use-conversation-id", () => ({
  useOptionalConversationId: () => useOptionalConversationIdMock(),
}));

import { SwitchProfileButton } from "#/components/features/chat/switch-profile-button";

const profiles = [
  {
    name: "haiku",
    model: "anthropic/claude-haiku",
    base_url: null,
    api_key_set: true,
  },
  { name: "gpt", model: "openai/gpt-4o", base_url: null, api_key_set: true },
];

describe("SwitchProfileButton", () => {
  const switchAndLog = vi.fn();

  beforeEach(() => {
    switchAndLog.mockReset();
    useLlmProfilesMock.mockReset();
    useActiveConversationMock.mockReset();
    useSettingsMock.mockReset();
    useSwitchLlmProfileAndLogMock.mockReset();
    useOptionalConversationIdMock.mockReset();

    useLlmProfilesMock.mockReturnValue({
      data: { profiles, active_profile: "haiku" },
    });
    useActiveConversationMock.mockReturnValue({ data: undefined });
    useSettingsMock.mockReturnValue({ data: undefined });
    useSwitchLlmProfileAndLogMock.mockReturnValue({
      switchAndLog,
      isPending: false,
    });
    useOptionalConversationIdMock.mockReturnValue({ conversationId: "conv-1" });
  });

  it("renders nothing when no profiles are available", () => {
    useLlmProfilesMock.mockReturnValue({
      data: { profiles: [], active_profile: null },
    });

    renderWithProviders(<SwitchProfileButton />);

    expect(
      screen.queryByTestId("switch-profile-button"),
    ).not.toBeInTheDocument();
  });

  it("labels the button with the user-level active profile on the home page (no conversation)", () => {
    useOptionalConversationIdMock.mockReturnValue({ conversationId: null });

    renderWithProviders(<SwitchProfileButton />);

    expect(screen.getByTestId("switch-profile-button")).toHaveTextContent(
      "haiku",
    );
  });

  it("calls switchAndLog with null conversationId when clicked from the home page", () => {
    useOptionalConversationIdMock.mockReturnValue({ conversationId: null });

    renderWithProviders(<SwitchProfileButton />);
    fireEvent.click(screen.getByTestId("switch-profile-button"));
    fireEvent.click(screen.getByTestId("switch-profile-option-gpt"));

    expect(switchAndLog).toHaveBeenCalledWith(null, "gpt");
  });

  it("calls switchAndLog with the conversation id when clicked from inside a conversation", () => {
    renderWithProviders(<SwitchProfileButton />);
    fireEvent.click(screen.getByTestId("switch-profile-button"));
    fireEvent.click(screen.getByTestId("switch-profile-option-gpt"));

    expect(switchAndLog).toHaveBeenCalledWith("conv-1", "gpt");
  });

  it("no-ops when the user clicks the already-active profile", () => {
    renderWithProviders(<SwitchProfileButton />);
    fireEvent.click(screen.getByTestId("switch-profile-button"));
    fireEvent.click(screen.getByTestId("switch-profile-option-haiku"));

    expect(switchAndLog).not.toHaveBeenCalled();
  });

  it("disables the button while a switch is in flight", () => {
    useSwitchLlmProfileAndLogMock.mockReturnValue({
      switchAndLog,
      isPending: true,
    });

    renderWithProviders(<SwitchProfileButton />);

    expect(screen.getByTestId("switch-profile-button")).toBeDisabled();
  });

  it("renders nothing for ACP conversations even when profiles exist", () => {
    // ACPAgent conversations route prompts to a CLI subprocess whose model is
    // set via ``acp_model`` in Settings → Agent, not by the LLM-profile
    // picker. Letting the user "switch the LLM" here would silently no-op
    // against the running subprocess — confusing UX. The button hides; the
    // user's path is the ACP model field on the agent settings page.
    useActiveConversationMock.mockReturnValue({
      data: {
        id: "conv-1",
        agent_kind: "acp",
        llm_model: null,
      },
    });

    renderWithProviders(<SwitchProfileButton />);

    expect(
      screen.queryByTestId("switch-profile-button"),
    ).not.toBeInTheDocument();
  });

  it("hides the picker on the home page when ACP is the default agent", () => {
    // Home-screen gating: there's no active conversation, so the
    // per-conversation ``agent_kind`` check can't catch this case.
    // Fall back to ``settings.agent_settings.agent_kind`` — that's the
    // kind the next-created conversation will inherit, and showing
    // the LLM picker for it would silently no-op once the user starts
    // chatting. Mirrors the ACP nav gating elsewhere in the app.
    useActiveConversationMock.mockReturnValue({ data: undefined });
    useSettingsMock.mockReturnValue({
      data: {
        agent_settings: { agent_kind: "acp", acp_server: "claude-code" },
      },
    });

    renderWithProviders(<SwitchProfileButton />);

    expect(
      screen.queryByTestId("switch-profile-button"),
    ).not.toBeInTheDocument();
  });
});
