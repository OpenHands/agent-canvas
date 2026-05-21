import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import SettingsService from "#/api/settings-service/settings-service.api";
import {
  LLM_PROFILES_QUERY_KEYS,
  SETTINGS_QUERY_KEYS,
} from "#/hooks/query/query-keys";

interface SwitchLlmProfileVars {
  /**
   * When set, the conversation's running LLM is swapped via /switch_llm and
   * the user's global default profile is untouched. When null (home page),
   * the profile is activated globally instead.
   */
  conversationId: string | null;
  profileName: string;
}

/**
 * Switches the LLM profile. Per-conversation when called from inside a
 * conversation; globally activates the profile when called from the home
 * page. Invalidates the conversation query so consumers reading `llm_model`
 * pick up the swap, and the profile list so anything reading `active_profile`
 * stays in sync.
 */
export const useSwitchLlmProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conversationId, profileName }: SwitchLlmProfileVars) =>
      AgentServerConversationService.switchProfile(conversationId, profileName),
    onSuccess: (_data, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: LLM_PROFILES_QUERY_KEYS.all,
      });
      if (conversationId) {
        queryClient.invalidateQueries({
          queryKey: ["user", "conversation", conversationId],
        });
      } else {
        // Home-page activate path (same server endpoint as
        // useActivateLlmProfile): clear the SettingsService cache so the next
        // conversation-start reads the newly activated profile's LLM config
        // instead of the stale encrypted settings.
        SettingsService.invalidateCache();
        queryClient.invalidateQueries({
          queryKey: SETTINGS_QUERY_KEYS.personal(),
        });
      }
    },
    // Caller renders an inline message + handles error toast manually.
    meta: { disableToast: true },
  });
};
