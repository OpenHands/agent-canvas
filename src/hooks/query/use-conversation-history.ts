import { useQuery } from "@tanstack/react-query";
import EventService from "#/api/event-service/event-service.api";
import { useUserConversation } from "#/hooks/query/use-user-conversation";

export const useConversationHistory = (conversationId?: string) => {
  const { data: conversation } = useUserConversation(conversationId ?? null);

  return useQuery({
    queryKey: [
      "conversation-history",
      conversationId,
      // Include the conversation's host + key so a backend swap (or a
      // re-provisioned cloud sandbox with a new URL) re-fetches.
      conversation?.conversation_url ?? null,
      conversation?.session_api_key ?? null,
    ],
    enabled: !!conversationId && !!conversation,
    queryFn: async () => {
      if (!conversationId) return [];

      // Forward the conversation's owning host + session key so cloud
      // conversations hit their cloud sandbox instead of falling back
      // to the bundled local agent-server.
      return EventService.searchEvents(
        conversationId,
        100,
        conversation?.conversation_url ?? null,
        conversation?.session_api_key ?? null,
      );
    },
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000, // 30 minutes — survive navigation away and back (AC5)
  });
};
