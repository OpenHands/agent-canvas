import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { LLM_PROFILES_QUERY_KEYS } from "#/hooks/query/query-keys";

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
      }
    },
    // Caller renders an inline message + handles error toast manually.
    meta: { disableToast: true },
  });
};
