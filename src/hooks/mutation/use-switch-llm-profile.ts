import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";

interface SwitchLlmProfileVars {
  conversationId: string;
  profileName: string;
}

/**
 * Switches the conversation's active LLM profile via the backend.
 * Invalidates the conversation query so anything reading the model picks up
 * the new value.
 */
export const useSwitchLlmProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conversationId, profileName }: SwitchLlmProfileVars) =>
      AgentServerConversationService.switchProfile(conversationId, profileName),
    onSuccess: (_data, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: ["user", "conversation", conversationId],
      });
    },
    // Caller renders an inline message + handles error toast manually.
    meta: { disableToast: true },
  });
};
