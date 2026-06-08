import { useMutation, useQueryClient } from "@tanstack/react-query";
import { wakeRecycledCloudConversation } from "#/api/cloud/conversation-service.api";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

/**
 * Wake a recycled (STOPPED/MISSING) cloud conversation by re-provisioning its
 * sandbox under the same conversation id. For ACP this triggers bootstrap-prompt
 * resume on the backend (OpenHands#14640) — the agent continues from the durable
 * event store. Invalidating the conversation queries drops the cached
 * MISSING/archived view; the active-conversation poll then picks up the new
 * `conversation_url` once the fresh sandbox is RUNNING and the chat reconnects.
 */
export const useWakeConversation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: {
      conversationId: string;
      conversation?: AppConversation | null;
    }) =>
      wakeRecycledCloudConversation(variables.conversationId, {
        selected_repository:
          variables.conversation?.selected_repository ?? null,
        selected_branch: variables.conversation?.selected_branch ?? null,
        git_provider: variables.conversation?.git_provider ?? null,
      }),
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["user", "conversation", variables.conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["user", "conversations"] });
      queryClient.invalidateQueries({
        queryKey: ["v1-batch-get-app-conversations"],
      });
    },
  });
};
