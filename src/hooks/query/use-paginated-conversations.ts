import { useInfiniteQuery } from "@tanstack/react-query";
import V1ConversationService from "#/api/conversation-service/v1-conversation-service.api";
import { useIsAuthed } from "./use-is-authed";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { V1AppConversationPage } from "#/api/conversation-service/v1-conversation-service.types";

export const usePaginatedConversations = (limit: number = 20) => {
  const { data: userIsAuthenticated } = useIsAuthed();
  const active = useActiveBackend();

  return useInfiniteQuery({
    // Include the active backend identity so each (backend, org) pair
    // maintains its own paginated cache. Switching backends naturally
    // produces a new query and a fresh fetch — without it the previous
    // backend's conversations stay visible for staleTime.
    queryKey: [
      "user",
      "conversations",
      "paginated",
      limit,
      active.backend.id,
      active.orgId,
    ],
    queryFn: async ({ pageParam }) => {
      const result = await V1ConversationService.searchConversations(
        limit,
        pageParam,
      );

      return result;
    },
    enabled: !!userIsAuthenticated,
    getNextPageParam: (lastPage: V1AppConversationPage) =>
      lastPage.next_page_id,
    initialPageParam: undefined as string | undefined,
    // Poll every 10s so titles, execution status, and timestamps stay fresh
    // without requiring the user to refresh. React Query refetches in the
    // background without flipping `isFetching` to a hard loading state, so
    // the list updates silently.
    refetchInterval: 10_000,
  });
};
