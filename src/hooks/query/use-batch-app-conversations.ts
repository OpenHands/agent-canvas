import { useQuery } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";

export const useBatchAppConversations = (ids: string[]) => {
  const active = useActiveBackend();

  return useQuery({
    // Backend-keyed so cross-backend switches do not return another
    // backend's cached results. Same invariant as
    // `useUserConversation` and `usePaginatedConversations`.
    queryKey: [
      "v1-batch-get-app-conversations",
      ids,
      active.backend.id,
      active.orgId,
    ],
    queryFn: () => AgentServerConversationService.batchGetAppConversations(ids),
    enabled: ids.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15, // 15 minutes
  });
};
