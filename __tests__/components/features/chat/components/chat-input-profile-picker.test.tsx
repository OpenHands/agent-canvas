import { fireEvent, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders } from "test-utils";

const useAgentProfilesMock = vi.fn();
const activateProfileMutate = vi.fn();

vi.mock("#/hooks/query/use-agent-profiles", () => ({
  useAgentProfiles: () => useAgentProfilesMock(),
}));

vi.mock("#/hooks/mutation/use-activate-agent-profile", () => ({
  useActivateAgentProfile: () => ({
    mutate: activateProfileMutate,
    isPending: false,
  }),
  ACTIVATE_AGENT_PROFILE_MUTATION_KEY: ["activate-agent-profile"],
}));

import { ChatInputProfilePicker } from "#/components/features/chat/components/chat-input-profile-picker";

const PROFILES = [
  { id: "id-default", name: "Default", agent_kind: "openhands" },
  { id: "id-codex", name: "Codex", agent_kind: "acp" },
];

// The picker is home-only (a running conversation shows the LLM-profile / model
// picker instead), so selecting a profile activates it as the launch default.
describe("ChatInputProfilePicker", () => {
  beforeEach(() => {
    useAgentProfilesMock.mockReset();
    activateProfileMutate.mockReset();

    useAgentProfilesMock.mockReturnValue({
      data: { profiles: PROFILES, active_agent_profile_id: "id-default" },
      isLoading: false,
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

  it("labels the button with the active profile", () => {
    renderWithProviders(<ChatInputProfilePicker />);
    expect(screen.getByTestId("chat-input-agent-profile")).toHaveTextContent(
      "Default",
    );
  });

  it("activates the picked profile", () => {
    renderWithProviders(<ChatInputProfilePicker />);
    fireEvent.click(screen.getByTestId("chat-input-agent-profile"));
    fireEvent.click(
      screen.getByTestId("chat-input-agent-profile-option-Codex"),
    );

    expect(activateProfileMutate).toHaveBeenCalledWith("id-codex");
  });

  it("does not activate when the active profile is re-selected", () => {
    renderWithProviders(<ChatInputProfilePicker />);
    fireEvent.click(screen.getByTestId("chat-input-agent-profile"));
    fireEvent.click(
      screen.getByTestId("chat-input-agent-profile-option-Default"),
    );

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
