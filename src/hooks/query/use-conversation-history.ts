import { useQuery } from "@tanstack/react-query";
import EventService from "#/api/event-service/event-service.api";
import { useUserConversation } from "#/hooks/query/use-user-conversation";
import type { OpenHandsEvent } from "#/types/agent-server/core";

/**
 * Number of events to load on the initial REST history fetch and on each
 * subsequent "scroll-up" page. The agent server caps `limit` at 100.
 */
export const INITIAL_HISTORY_PAGE_SIZE = 50;

export interface ConversationHistoryPage {
  /** Events in chronological (oldest → newest) order. */
  events: OpenHandsEvent[];
  /** True when the server has more events older than this page. */
  hasMore: boolean;
  /** Optional `next_page_id` from the server for keyset pagination. */
  nextPageId: string | null;
}

/**
 * Loads the most recent conversation events via REST. The server query is
 * sorted `TIMESTAMP_DESC` so we can request just the tail of the conversation;
 * we reverse the result to chronological order before handing it to callers.
 *
 * Older events are loaded on demand by `useLoadOlderEvents` once the user
 * scrolls up. The WebSocket then connects with `resend_mode='since'` using
 * the latest event's timestamp so we don't re-receive history we already have.
 */
export const useConversationHistory = (conversationId?: string) => {
  const { data: conversation } = useUserConversation(conversationId ?? null);

  return useQuery<ConversationHistoryPage>({
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
      if (!conversationId) {
        return { events: [], hasMore: false, nextPageId: null };
      }

      const page = await EventService.searchEvents(
        conversationId,
        conversation?.conversation_url ?? null,
        conversation?.session_api_key ?? null,
        {
          limit: INITIAL_HISTORY_PAGE_SIZE,
          sortOrder: "TIMESTAMP_DESC",
        },
      );

      if (!Array.isArray(page.items)) {
        throw new Error(
          "Invalid conversation history response: expected page.items to be an array.",
        );
      }

      // Reverse so callers can append in chronological order.
      const events = [...page.items].reverse();
      return {
        events,
        hasMore:
          !!page.next_page_id || page.items.length >= INITIAL_HISTORY_PAGE_SIZE,
        nextPageId: page.next_page_id ?? null,
      };
    },
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000, // 30 minutes — survive navigation away and back (AC5)
  });
};
