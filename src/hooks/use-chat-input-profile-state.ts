import { useCallback } from "react";
import { useIsMutating } from "@tanstack/react-query";
import type { AgentProfileSummary } from "#/api/agent-profiles-service/agent-profiles-service.api";
import { useAgentProfiles } from "#/hooks/query/use-agent-profiles";
import {
  useActivateAgentProfile,
  ACTIVATE_AGENT_PROFILE_MUTATION_KEY,
} from "#/hooks/mutation/use-activate-agent-profile";

export interface ChatInputProfileState {
  profiles: AgentProfileSummary[];
  /** id of the active profile the next conversation will launch from. */
  currentProfileId: string | null;
  currentProfileName: string | null;
  isLoading: boolean;
  isSwitching: boolean;
  /** Activate a profile so the next conversation launches from it. */
  selectProfile: (profile: AgentProfileSummary) => void;
}

/**
 * Backs the home chat-input AgentProfile picker. This picker is only rendered
 * on the home screen — inside a conversation the chat input shows the
 * in-conversation LLM-profile picker (OpenHands) or model picker (ACP) instead
 * (see `chat-input-actions.tsx` `pickerKind`). So selecting a profile here
 * simply activates it as the launch default; `useCreateConversation` reads the
 * active profile when the next conversation starts.
 */
export function useChatInputProfileState(): ChatInputProfileState {
  const { data: agentProfiles, isLoading } = useAgentProfiles();
  const activateProfile = useActivateAgentProfile();
  // Observe the activation globally by mutation key so the picker button (a
  // separate hook instance from the menu that fires it) disables correctly
  // while a switch is in flight (#1571).
  const isSwitching =
    useIsMutating({ mutationKey: ACTIVATE_AGENT_PROFILE_MUTATION_KEY }) > 0;

  const profiles = agentProfiles?.profiles ?? [];
  const currentProfileId = agentProfiles?.active_agent_profile_id ?? null;
  const currentProfileName =
    profiles.find((p) => p.id != null && p.id === currentProfileId)?.name ??
    null;

  const selectProfile = useCallback(
    (profile: AgentProfileSummary) => {
      if (!profile.id || profile.id === currentProfileId) return;
      activateProfile.mutate(profile.id);
    },
    [currentProfileId, activateProfile],
  );

  return {
    profiles,
    currentProfileId,
    currentProfileName,
    isLoading,
    isSwitching,
    selectProfile,
  };
}
