import { fireEvent, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders } from "test-utils";

const useAgentProfilesMock = vi.fn();
const useActiveConversationMock = vi.fn();
const useOptionalConversationIdMock = vi.fn();
const createConversationMutate = vi.fn();
const activateProfileMutate = vi.fn();

vi.mock("#/hooks/query/use-agent-profiles", () => ({
  useAgentProfiles: () => useAgentProfilesMock(),
}));

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

vi.mock("#/hooks/use-conversation-id", () => ({
  useOptionalConversationId: () => useOptionalConversationIdMock(),
}));

vi.mock("#/hooks/mutation/use-create-conversation", () => ({
  useCreateConversation: () => ({
    mutate: createConversationMutate,
    isPending: false,
  }),
}));

vi.mock("#/hooks/mutation/use-activate-agent-profile", () => ({
  useActivateAgentProfile: () => ({
    mutate: activateProfileMutate,
    isPending: false,
  }),
}));

// eslint-disable-next-line import/first
import { ChatInputProfilePicker } from "#/components/features/chat/components/chat-input-profile-picker";

const PROFILES = [
  { id: "id-default", name: "Default", agent_kind: "openhands" },
  { id: "id-codex", name: "Codex", agent_kind: "acp" },
];

describe("ChatInputProfilePicker", () => {
  beforeEach(() => {
    useAgentProfilesMock.mockReset();
    useActiveConversationMock.mockReset();
    useOptionalConversationIdMock.mockReset();
    createConversationMutate.mockReset();
    activateProfileMutate.mockReset();

    useAgentProfilesMock.mockReturnValue({
      data: { profiles: PROFILES, active_agent_profile_id: "id-default" },
      isLoading: false,
    });
    useActiveConversationMock.mockReturnValue({ data: undefined });
    useOptionalConversationIdMock.mockReturnValue({
      conversationId: undefined,
    });
  });

  it("renders nothing when there are no profiles", () => {
    useAgentProfilesMock.mockReturnValue({
      data: { profiles: [], active_agent_profile_id: null },
      isLoading: false,
    });

    const { container } = renderWithProviders(<ChatInputProfilePicker />);
    expect(container).toBeEmptyDOMElement();
  });

  it("labels the button with the launched profile inside a conversation", () => {
    useOptionalConversationIdMock.mockReturnValue({ conversationId: "c1" });
    useActiveConversationMock.mockReturnValue({
      data: { launched_profile: { profile_id: "id-codex", revision: 1 } },
    });

    renderWithProviders(<ChatInputProfilePicker />);

    expect(screen.getByTestId("chat-input-agent-profile")).toHaveTextContent(
      "Codex",
    );
  });

  it("starts a new conversation with the picked profile inside a conversation", () => {
    useOptionalConversationIdMock.mockReturnValue({ conversationId: "c1" });
    useActiveConversationMock.mockReturnValue({
      data: { launched_profile: { profile_id: "id-default", revision: 1 } },
    });

    renderWithProviders(<ChatInputProfilePicker />);
    fireEvent.click(screen.getByTestId("chat-input-agent-profile"));
    fireEvent.click(
      screen.getByTestId("chat-input-agent-profile-option-Codex"),
    );

    expect(createConversationMutate).toHaveBeenCalledTimes(1);
    expect(createConversationMutate.mock.calls[0][0]).toEqual({
      agentProfileId: "id-codex",
    });
    expect(activateProfileMutate).not.toHaveBeenCalled();
  });

  it("activates the picked profile on the home page (no conversation)", () => {
    useOptionalConversationIdMock.mockReturnValue({
      conversationId: undefined,
    });

    renderWithProviders(<ChatInputProfilePicker />);
    fireEvent.click(screen.getByTestId("chat-input-agent-profile"));
    fireEvent.click(
      screen.getByTestId("chat-input-agent-profile-option-Codex"),
    );

    expect(activateProfileMutate).toHaveBeenCalledWith("id-codex");
    expect(createConversationMutate).not.toHaveBeenCalled();
  });

  it("does not switch when the current profile is re-selected", () => {
    useOptionalConversationIdMock.mockReturnValue({ conversationId: "c1" });
    useActiveConversationMock.mockReturnValue({
      data: { launched_profile: { profile_id: "id-default", revision: 1 } },
    });

    renderWithProviders(<ChatInputProfilePicker />);
    fireEvent.click(screen.getByTestId("chat-input-agent-profile"));
    fireEvent.click(
      screen.getByTestId("chat-input-agent-profile-option-Default"),
    );

    expect(createConversationMutate).not.toHaveBeenCalled();
    expect(activateProfileMutate).not.toHaveBeenCalled();
  });

  it("links to the AgentProfile library in settings", () => {
    const { container } = renderWithProviders(<ChatInputProfilePicker />);
    fireEvent.click(screen.getByTestId("chat-input-agent-profile"));

    expect(
      container.ownerDocument.querySelector('a[href="/settings/agents"]'),
    ).not.toBeNull();
  });
});
