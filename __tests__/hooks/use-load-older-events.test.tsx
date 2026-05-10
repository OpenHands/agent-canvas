import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useLoadOlderEvents } from "#/hooks/use-load-older-events";
import EventService from "#/api/event-service/event-service.api";
import { useUserConversation } from "#/hooks/query/use-user-conversation";
import { useEventStore } from "#/stores/use-event-store";
import { INITIAL_HISTORY_PAGE_SIZE } from "#/hooks/query/use-conversation-history";
import type { Conversation } from "#/api/open-hands.types";
import type { OpenHandsEvent } from "#/types/agent-server/core";
import type { EventSearchPage } from "#/api/event-service/event-service.types";

vi.mock("#/api/open-hands-axios", () => ({ openHands: { get: vi.fn() } }));
vi.mock("#/api/event-service/event-service.api");
vi.mock("#/hooks/query/use-user-conversation");

function makeConversation(): Conversation {
  // Cast: `useUserConversation` actually returns an `AppConversation` whose
  // event-host URL lives on `conversation_url` (not the `Conversation.url`
  // declared above). We mirror that shape here so the hook's call to
  // `conversation.conversation_url` resolves.
  return {
    conversation_id: "conv-test",
    title: "Test Conversation",
    selected_repository: null,
    selected_branch: null,
    git_provider: null,
    last_updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    status: "RUNNING",
    runtime_status: null,
    url: null,
    conversation_url: "https://example.com/conv-test",
    session_api_key: "secret",
    conversation_version: "V1",
  } as unknown as Conversation;
}

function makeEvent(id: string, timestamp: string): OpenHandsEvent {
  return { id, timestamp } as unknown as OpenHandsEvent;
}

function makePage(
  items: OpenHandsEvent[],
  nextPageId: string | null = null,
): EventSearchPage<OpenHandsEvent> {
  return { items, next_page_id: nextPageId };
}

describe("useLoadOlderEvents", () => {
  let queryClient: QueryClient;
  let wrapper: ({
    children,
  }: {
    children: React.ReactNode;
  }) => React.ReactElement;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    wrapper = ({ children }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      );

    // Reset event store between tests so prior tests don't leak state.
    act(() => {
      useEventStore.getState().clearEvents();
    });

    vi.mocked(useUserConversation).mockReturnValue({
      data: makeConversation(),
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it("does nothing while the store has no anchor (REST hasn't seeded yet)", async () => {
    const spy = vi.spyOn(EventService, "searchEvents");
    const { result } = renderHook(() => useLoadOlderEvents("conv-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.loadOlder();
    });

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.hasMore).toBe(true);
  });

  it("paginates older events using timestamp__lt of the oldest known event", async () => {
    // Seed the store with a single recent event so the hook has an anchor.
    const recent = makeEvent("evt-recent", "2024-06-01T00:00:00Z");
    act(() => {
      useEventStore.getState().addEvent(recent);
    });

    const olderPage = [
      makeEvent("evt-older-1", "2024-05-01T00:00:00Z"),
      makeEvent("evt-older-2", "2024-05-15T00:00:00Z"),
    ];
    const spy = vi
      .spyOn(EventService, "searchEvents")
      .mockResolvedValue(makePage(olderPage, null));

    const { result } = renderHook(() => useLoadOlderEvents("conv-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.loadOlder();
    });

    expect(spy).toHaveBeenCalledWith(
      "conv-1",
      "https://example.com/conv-test",
      "secret",
      {
        limit: INITIAL_HISTORY_PAGE_SIZE,
        sortOrder: "TIMESTAMP_DESC",
        timestampLt: "2024-06-01T00:00:00Z",
      },
    );

    // Older events landed in the store, in chronological order.
    expect(useEventStore.getState().events.map((e) => (e as any).id)).toEqual([
      "evt-older-1",
      "evt-older-2",
      "evt-recent",
    ]);

    // Server returned a short page → no more pages to load.
    await waitFor(() => {
      expect(result.current.hasMore).toBe(false);
    });
  });

  it("keeps paginating while the server keeps returning full pages", async () => {
    act(() => {
      useEventStore
        .getState()
        .addEvent(makeEvent("evt-recent", "2024-06-01T00:00:00Z"));
    });

    const fullPage: OpenHandsEvent[] = Array.from(
      { length: INITIAL_HISTORY_PAGE_SIZE },
      (_, i) =>
        makeEvent(
          `evt-page1-${i}`,
          // Descending timestamps within the page so newest-first works.
          new Date(2024, 4, 30 - i).toISOString(),
        ),
    );

    vi.spyOn(EventService, "searchEvents").mockResolvedValue(
      makePage(fullPage, "next-page"),
    );

    const { result } = renderHook(() => useLoadOlderEvents("conv-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.loadOlder();
    });

    // Full page + next_page_id present → still has more.
    expect(result.current.hasMore).toBe(true);
  });

  it("coalesces repeated loadOlder calls while a page request is already in flight", async () => {
    act(() => {
      useEventStore
        .getState()
        .addEvent(makeEvent("evt-recent", "2024-06-01T00:00:00Z"));
    });

    let resolvePage!: (page: EventSearchPage<OpenHandsEvent>) => void;
    const pendingPage = new Promise<EventSearchPage<OpenHandsEvent>>(
      (resolve) => {
        resolvePage = resolve;
      },
    );

    const spy = vi
      .spyOn(EventService, "searchEvents")
      .mockReturnValue(pendingPage);

    const { result } = renderHook(() => useLoadOlderEvents("conv-1"), {
      wrapper,
    });

    let firstLoad!: Promise<void>;
    let secondLoad!: Promise<void>;
    await act(async () => {
      firstLoad = result.current.loadOlder();
      secondLoad = result.current.loadOlder();
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolvePage(makePage([makeEvent("evt-older", "2024-05-01T00:00:00Z")], null));
      await Promise.all([firstLoad, secondLoad]);
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("cleans up loading state and rethrows when the page request fails", async () => {
    act(() => {
      useEventStore
        .getState()
        .addEvent(makeEvent("evt-recent", "2024-06-01T00:00:00Z"));
    });

    vi.spyOn(EventService, "searchEvents").mockRejectedValue(
      new Error("request failed"),
    );

    const { result } = renderHook(() => useLoadOlderEvents("conv-1"), {
      wrapper,
    });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.loadOlder();
      } catch (error) {
        thrown = error;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("request failed");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasMore).toBe(true);
  });

  it("throws a descriptive error when searchEvents returns malformed items", async () => {
    act(() => {
      useEventStore
        .getState()
        .addEvent(makeEvent("evt-recent", "2024-06-01T00:00:00Z"));
    });

    vi.spyOn(EventService, "searchEvents").mockResolvedValue({
      items: { bad: true },
      next_page_id: null,
    } as unknown as EventSearchPage<OpenHandsEvent>);

    const { result } = renderHook(() => useLoadOlderEvents("conv-1"), {
      wrapper,
    });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.loadOlder();
      } catch (error) {
        thrown = error;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      "Invalid older-events response: expected page.items to be an array.",
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasMore).toBe(true);
  });




  it("stops paginating and throws when the oldest loaded event is missing a timestamp", async () => {
    act(() => {
      useEventStore
        .getState()
        .addEvent({ id: "evt-missing-ts" } as OpenHandsEvent);
    });

    const spy = vi.spyOn(EventService, "searchEvents");
    const { result } = renderHook(() => useLoadOlderEvents("conv-1"), {
      wrapper,
    });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.loadOlder();
      } catch (error) {
        thrown = error;
      }
    });

    expect(spy).not.toHaveBeenCalled();
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain(
      "oldest loaded event has no timestamp",
    );
    await waitFor(() => {
      expect(result.current.hasMore).toBe(false);
    });
  });
});
