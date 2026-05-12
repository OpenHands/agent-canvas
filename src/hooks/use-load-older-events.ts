import React from "react";
import EventService from "#/api/event-service/event-service.api";
import { useUserConversation } from "#/hooks/query/use-user-conversation";
import { useEventStore } from "#/stores/use-event-store";
import { INITIAL_HISTORY_PAGE_SIZE } from "#/hooks/query/use-conversation-history";
import { useActiveBackend } from "#/contexts/active-backend-context";
import type { OpenHandsEvent } from "#/types/agent-server/core";

const getEventTimestamp = (event: OpenHandsEvent): string | undefined =>
  "timestamp" in event ? event.timestamp : undefined;

interface UseLoadOlderEventsResult {
  /** True while a "load older" request is in flight. */
  isLoading: boolean;
  /**
   * Whether the server may have more events older than what we currently
   * have in the store. Starts `true` and flips to `false` after the server
   * returns a short page (i.e. it ran out of older events).
   */
  hasMore: boolean;
  /** Trigger one more older-events page. Resolves when the page is merged. */
  loadOlder: () => Promise<void>;
}

/**
 * REST-side companion to `useConversationHistory`: paginates older events
 * (`timestamp < oldest known`) into the event store on demand. Used by the
 * chat scroll handler to lazily backfill history when the user scrolls up.
 *
 * Cloud-mode caveat: REST-side older-event pagination is **disabled** for
 * cloud backends. The SaaS app-server's `search_events` 500s when called
 * with `timestamp__lt` / `timestamp__gte` (compares stored event.timestamp
 * `str` against the parsed `datetime` and raises `TypeError`). Until the
 * server-side bug at `openhands/app_server/event/event_service_base.py`
 * (lines ~101–103) is fixed, the hook reports `hasMore: false` from first
 * render and `loadOlder` is a no-op for cloud — matching the OpenHands
 * cloud frontend, which never paginates older events either.
 */
export const useLoadOlderEvents = (
  conversationId?: string | null,
): UseLoadOlderEventsResult => {
  const { data: conversation } = useUserConversation(conversationId ?? null);
  const addEvents = useEventStore((state) => state.addEvents);
  const isCloud = useActiveBackend().backend.kind === "cloud";

  const [isLoading, setIsLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(!isCloud);
  const isLoadingRef = React.useRef(false);
  const hasMoreRef = React.useRef(!isCloud);

  // Reset the pagination cursor whenever we switch conversations or
  // backends. Cloud backends never have more older events to fetch via
  // REST (see top-of-file comment), so `hasMore` settles to `false`.
  React.useEffect(() => {
    hasMoreRef.current = !isCloud;
    isLoadingRef.current = false;
    setHasMore(!isCloud);
    setIsLoading(false);
  }, [conversationId, isCloud]);

  const loadOlder = React.useCallback(async () => {
    if (isCloud) return;
    if (!conversationId || isLoadingRef.current || !hasMoreRef.current) {
      return;
    }

    const { events } = useEventStore.getState();
    const oldest = events[0];

    // No anchor yet — defer until the initial REST load has populated the
    // store (avoids fetching twice with the same `TIMESTAMP_DESC` window).
    if (!oldest) return;

    const oldestTimestamp = getEventTimestamp(oldest);
    if (!oldestTimestamp) {
      hasMoreRef.current = false;
      setHasMore(false);
      throw new Error(
        "Unable to load older events because the oldest loaded event has no timestamp.",
      );
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    try {
      const page = await EventService.searchEvents(
        conversationId,
        conversation?.conversation_url ?? null,
        conversation?.session_api_key ?? null,
        {
          limit: INITIAL_HISTORY_PAGE_SIZE,
          sortOrder: "TIMESTAMP_DESC",
          timestampLt: oldestTimestamp,
        },
      );

      if (!Array.isArray(page.items)) {
        throw new Error(
          "Invalid older-events response: expected page.items to be an array.",
        );
      }

      const older = [...page.items].reverse();
      if (older.length > 0) {
        addEvents(older);
      }
      // Stop once the server signals there are no more pages, OR — for
      // servers that don't fill in `next_page_id` for filtered queries —
      // when we get back a short page.
      const exhausted =
        !page.next_page_id || page.items.length < INITIAL_HISTORY_PAGE_SIZE;
      if (exhausted) {
        hasMoreRef.current = false;
        setHasMore(false);
      }
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [
    conversationId,
    conversation?.conversation_url,
    conversation?.session_api_key,
    addEvents,
    isCloud,
  ]);

  return { isLoading, hasMore, loadOlder };
};
