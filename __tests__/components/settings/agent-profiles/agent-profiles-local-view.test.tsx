import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import type { AgentSettingsSaveControl } from "#/routes/agent-settings";
import { AgentProfilesLocalView } from "#/components/features/settings/agent-profiles/agent-profiles-local-view";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

// The embedded Agent settings form is stubbed to emit a caller-provided
// control, so the tests exercise the view's mapping to AgentProfileSaveInput.
let emitControl: AgentSettingsSaveControl | null = null;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/routes/agent-settings", () => ({
  __esModule: true,
  default: ({
    onSaveControlChange,
  }: {
    onSaveControlChange?: (c: AgentSettingsSaveControl) => void;
  }) => {
    useEffect(() => {
      if (emitControl) onSaveControlChange?.(emitControl);
    }, [onSaveControlChange]);
    return <div data-testid="mock-agent-settings" />;
  },
}));

vi.mock("#/components/features/settings/agent-profiles/agent-profiles-manager", () => ({
  AgentProfilesManager: ({ onAddProfile }: { onAddProfile?: () => void }) => (
    <button type="button" data-testid="add-agent-profile" onClick={onAddProfile}>
      add
    </button>
  ),
}));

const saveMutate = vi.fn().mockResolvedValue({ name: "x", message: "ok" });
vi.mock("#/hooks/mutation/use-save-agent-profile", () => ({
  useSaveAgentProfile: () => ({ mutateAsync: saveMutate }),
}));

const agentProfilesData = { profiles: [], active_agent_profile_id: null };
vi.mock("#/hooks/query/use-agent-profiles", () => ({
  useAgentProfiles: () => ({ data: agentProfilesData }),
}));

let llmProfilesData: {
  profiles: { name: string; model: string | null }[];
  active_profile: string | null;
};
vi.mock("#/hooks/query/use-llm-profiles", () => ({
  useLlmProfiles: () => ({ data: llmProfilesData }),
}));

vi.mock("#/contexts/settings-section-header-context", () => ({
  useSettingsSectionHeader: () => ({ setHideSectionHeader: vi.fn() }),
}));

vi.mock("#/utils/custom-toast-handlers");

vi.mock("#/api/agent-profiles-service/agent-profiles-service.api", () => ({
  __esModule: true,
  default: { getProfile: vi.fn(), renameProfile: vi.fn() },
}));

async function openCreateAndName(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByTestId("add-agent-profile"));
  await screen.findByTestId("mock-agent-settings");
  const input = screen.getByTestId("agent-profile-name-input");
  await user.clear(input);
  await user.type(input, name);
  return user;
}

describe("AgentProfilesLocalView save mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emitControl = null;
    llmProfilesData = {
      profiles: [{ name: "default", model: "gpt-5" }],
      active_profile: "default",
    };
  });

  it("saves an OpenHands profile with the selected llm_profile_ref", async () => {
    emitControl = {
      agentType: "openhands",
      isValid: true,
      buildAgentProfileFields: () => ({
        agent_kind: "openhands",
        enable_sub_agents: true,
      }),
      credentials: { isDirty: false, save: vi.fn(), reset: vi.fn() },
    };

    render(<AgentProfilesLocalView />);
    const user = await openCreateAndName("my-oh");
    await user.click(screen.getByTestId("save-agent-profile-btn"));

    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    expect(saveMutate).toHaveBeenCalledWith({
      name: "my-oh",
      profile: {
        agent_kind: "openhands",
        enable_sub_agents: true,
        llm_profile_ref: "default",
      },
    });
  });

  it("saves an ACP profile without an llm_profile_ref", async () => {
    emitControl = {
      agentType: "acp",
      isValid: true,
      buildAgentProfileFields: () => ({
        agent_kind: "acp",
        acp_server: "claude-code",
        acp_model: "claude-opus-4-8",
        acp_command: null,
        acp_args: null,
      }),
      credentials: { isDirty: false, save: vi.fn(), reset: vi.fn() },
    };

    render(<AgentProfilesLocalView />);
    const user = await openCreateAndName("my-claude");
    await user.click(screen.getByTestId("save-agent-profile-btn"));

    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    expect(saveMutate).toHaveBeenCalledWith({
      name: "my-claude",
      profile: {
        agent_kind: "acp",
        acp_server: "claude-code",
        acp_model: "claude-opus-4-8",
        acp_command: null,
        acp_args: null,
      },
    });
  });

  it("blocks an OpenHands save when no LLM profile is available", async () => {
    llmProfilesData = { profiles: [], active_profile: null };
    emitControl = {
      agentType: "openhands",
      isValid: true,
      buildAgentProfileFields: () => ({
        agent_kind: "openhands",
        enable_sub_agents: false,
      }),
      credentials: { isDirty: false, save: vi.fn(), reset: vi.fn() },
    };

    render(<AgentProfilesLocalView />);
    const user = await openCreateAndName("my-oh");
    await user.click(screen.getByTestId("save-agent-profile-btn"));

    await waitFor(() =>
      expect(displayErrorToast).toHaveBeenCalledWith(
        "SETTINGS$AGENT_PROFILE_LLM_REQUIRED",
      ),
    );
    expect(saveMutate).not.toHaveBeenCalled();
  });
});
