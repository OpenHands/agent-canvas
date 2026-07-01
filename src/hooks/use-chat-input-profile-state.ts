import { useCallback } from "react";
import type { AgentProfileSummary } from "#/api/agent-profiles-service/agent-profiles-service.api";
import { useNavigation } from "#/context/navigation-context";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useAgentProfiles } from "#/hooks/query/use-agent-profiles";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useActivateAgentProfile } from "#/hooks/mutation/use-activate-agent-profile";

export interface ChatInputProfileState {
  profiles: AgentProfileSummary[];
  /** id of the profile the current surface is running / defaulting to. */
  currentProfileId: string | null;
  currentProfileName: string | null;
  /** True inside a conversation (selecting starts a NEW one), false on home. */
  isInConversation: boolean;
  isLoading: boolean;
  isSwitching: boolean;
  /**
   * Apply a profile. Inside a conversation this starts a NEW conversation
   * launched from the profile (no live in-conversation switch); on home it
   * activates the profile so the next conversation launches from it.
   */
  selectProfile: (profile: AgentProfileSummary) => void;
}

export function useChatInputProfileState(): ChatInputProfileState {
  const { navigate } = useNavigation();
  const { conversationId } = useOptionalConversationId();
  const { data: conversation } = useActiveConversation();
  const { data: agentProfiles, isLoading } = useAgentProfiles();
  const createConversation = useCreateConversation();
  const activateProfile = useActivateAgentProfile();

  const profiles = agentProfiles?.profiles ?? [];
  const isInConversation = Boolean(conversationId);

  // In a conversation the "current" profile is strictly the one stamped at
  // launch (#3784 provenance); on home it's the active pointer that the next
  // conversation will launch from.
  const currentProfileId = isInConversation
    ? (conversation?.launched_profile?.profile_id ?? null)
    : (agentProfiles?.active_agent_profile_id ?? null);
  const currentProfileName =
    profiles.find((p) => p.id != null && p.id === currentProfileId)?.name ??
    null;

  const selectProfile = useCallback(
    (profile: AgentProfileSummary) => {
      if (!profile.id || profile.id === currentProfileId) return;
      if (isInConversation) {
        createConversation.mutate(
          { agentProfileId: profile.id },
          {
            onSuccess: (data) =>
              navigate(`/conversations/${data.conversation_id}`),
          },
        );
      } else {
        activateProfile.mutate(profile.id);
      }
    },
    [
      currentProfileId,
      isInConversation,
      createConversation,
      activateProfile,
      navigate,
    ],
  );

  return {
    profiles,
    currentProfileId,
    currentProfileName,
    isInConversation,
    isLoading,
    isSwitching: createConversation.isPending || activateProfile.isPending,
    selectProfile,
  };
}
