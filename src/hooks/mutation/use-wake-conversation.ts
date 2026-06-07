import { useMutation, useQueryClient } from "@tanstack/react-query";
import { wakeRecycledCloudConversation } from "#/api/cloud/conversation-service.api";

/**
 * Wake a recycled (STOPPED/MISSING) cloud conversation by re-provisioning its
 * sandbox under the same conversation id. For ACP this triggers native
 * session/load resume on the backend (#1126); for the UI it just needs to
 * kick off the start task and then let the active-conversation poll pick up the
 * new `conversation_url` once the fresh sandbox is RUNNING. Invalidating the
 * conversation queries drops the cached MISSING/archived view so the chat
 * reconnects automatically.
 */
export const useWakeConversation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { conversationId: string }) =>
      wakeRecycledCloudConversation(variables.conversationId),
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
