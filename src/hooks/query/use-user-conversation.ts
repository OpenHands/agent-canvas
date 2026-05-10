/* eslint-disable @typescript-eslint/no-explicit-any */
import { Query, useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import { useActiveBackend } from "#/contexts/active-backend-context";

const FIVE_MINUTES = 1000 * 60 * 5;
const FIFTEEN_MINUTES = 1000 * 60 * 15;

type RefetchInterval = (
  query: Query<
    AppConversation | null,
    AxiosError<unknown, any>,
    AppConversation | null,
    (string | null)[]
  >,
) => number;

export const useUserConversation = (
  cid: string | null,
  refetchInterval?: RefetchInterval,
) => {
  const active = useActiveBackend();

  return useQuery({
    // Include the active backend identity so each (backend, org) pair
    // maintains its own per-conversation cache entry. Without this, a
    // local→cloud→local switch can leave a `null` cached value (from a
    // refetch that ran while the cloud backend was active) under the
    // shared cid key, which then makes the conversation route toast
    // "conversation not available or no permission" until the user
    // hard-refreshes the page. Mirrors `usePaginatedConversations`.
    queryKey: ["user", "conversation", cid, active.backend.id, active.orgId],
    queryFn: async () => {
      if (!cid) return null;

      // Use the V1 batch API endpoint to get a single conversation
      const results =
        await AgentServerConversationService.batchGetAppConversations([cid]);
      return results[0] ?? null;
    },
    enabled: !!cid && !cid.startsWith("task-"),
    retry: false,
    refetchInterval,
    staleTime: FIVE_MINUTES,
    gcTime: FIFTEEN_MINUTES,
  });
};
