import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { useAutoRefreshFilesOnEdit } from "#/hooks/use-auto-refresh-files-on-edit";
import { useEventStore } from "#/stores/use-event-store";
import type { OHEvent } from "#/stores/use-event-store";
import { useWorkspaceMutationCounter } from "#/stores/use-workspace-mutation-counter";

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function makeObservationEvent(
  id: string,
  kind: string,
  command: string,
): OHEvent {
  return {
    id,
    timestamp: new Date(Date.now() + Number(id.replace(/\D/g, "")) * 1000)
      .toISOString(),
    source: "environment",
    tool_name: "str_replace_based_edit_tool",
    tool_call_id: `tc-${id}`,
    action_id: `act-${id}`,
    observation: {
      kind,
      command,
      path: "/workspace/project/foo.txt",
      old_content: null,
      new_content: "hello",
      output: "ok",
    },
  } as unknown as OHEvent;
}

describe("useAutoRefreshFilesOnEdit", () => {
  beforeEach(() => {
    act(() => {
      useEventStore.getState().clearEvents();
      // Reset the workspace mutation counter so per-test counter assertions
      // don't see ticks bled over from earlier tests.
      useWorkspaceMutationCounter.setState({ count: 0 });
    });
  });

  it("invalidates workspace queries when a mutating file editor observation arrives", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");

    renderHook(() => useAutoRefreshFilesOnEdit(), {
      wrapper: makeWrapper(client),
    });

    expect(spy).not.toHaveBeenCalled();

    act(() => {
      useEventStore
        .getState()
        .addEvent(
          makeObservationEvent("1", "FileEditorObservation", "str_replace"),
        );
    });

    const invalidatedKeys = spy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey[0],
    );
    expect(invalidatedKeys).toContain("workspace-files");
    expect(invalidatedKeys).toContain("workspace-file-content");
    expect(invalidatedKeys).toContain("file_changes");
  });

  it("ignores read-only `view` observations", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");

    renderHook(() => useAutoRefreshFilesOnEdit(), {
      wrapper: makeWrapper(client),
    });

    act(() => {
      useEventStore
        .getState()
        .addEvent(makeObservationEvent("1", "FileEditorObservation", "view"));
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it("ignores non-file observation kinds", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");

    renderHook(() => useAutoRefreshFilesOnEdit(), {
      wrapper: makeWrapper(client),
    });

    act(() => {
      useEventStore
        .getState()
        .addEvent(
          makeObservationEvent("1", "ExecuteBashObservation", "ls"),
        );
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it("bumps the workspace mutation counter on each mutating observation so iframes / images cache-bust", () => {
    const client = new QueryClient();

    renderHook(() => useAutoRefreshFilesOnEdit(), {
      wrapper: makeWrapper(client),
    });

    expect(useWorkspaceMutationCounter.getState().count).toBe(0);

    act(() => {
      useEventStore
        .getState()
        .addEvent(
          makeObservationEvent("1", "FileEditorObservation", "str_replace"),
        );
    });
    expect(useWorkspaceMutationCounter.getState().count).toBe(1);

    act(() => {
      useEventStore
        .getState()
        .addEvent(
          makeObservationEvent(
            "2",
            "StrReplaceEditorObservation",
            "create",
          ),
        );
    });
    expect(useWorkspaceMutationCounter.getState().count).toBe(2);
  });

  it("does NOT bump the workspace mutation counter for read-only / non-file observations", () => {
    const client = new QueryClient();

    renderHook(() => useAutoRefreshFilesOnEdit(), {
      wrapper: makeWrapper(client),
    });

    act(() => {
      useEventStore
        .getState()
        .addEvent(makeObservationEvent("1", "FileEditorObservation", "view"));
      useEventStore
        .getState()
        .addEvent(
          makeObservationEvent("2", "ExecuteBashObservation", "ls"),
        );
    });

    expect(useWorkspaceMutationCounter.getState().count).toBe(0);
  });

  it("still reacts to mutations that arrive out-of-order (older timestamp inserted between newer events)", () => {
    // Regression test for a bug where the hook used `events.slice(processedCount)`
    // to find new events. The event store re-sorts by timestamp on insert,
    // so a late-arriving older event lands *between* two newer ones and
    // the tail slice would miss it.
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");

    renderHook(() => useAutoRefreshFilesOnEdit(), {
      wrapper: makeWrapper(client),
    });

    // First, push two newer events. The id-numbers drive the timestamp,
    // so id "10" is later than id "5". Both land in the same effect run
    // (we coalesce — one bump per batch, not per event), so count goes
    // from 0 → 1.
    act(() => {
      useEventStore
        .getState()
        .addEvent(makeObservationEvent("10", "FileEditorObservation", "create"));
      useEventStore
        .getState()
        .addEvent(makeObservationEvent("20", "FileEditorObservation", "create"));
    });
    const callsAfterInitial = spy.mock.calls.length;
    expect(callsAfterInitial).toBeGreaterThan(0);
    const countAfterInitial = useWorkspaceMutationCounter.getState().count;
    expect(countAfterInitial).toBe(1);

    // Now insert an OLDER event (id "5" → earliest timestamp). The store
    // re-sorts so the events array becomes [e5, e10, e20]. The previous
    // "slice from index 2" approach would return [e20] only and miss e5
    // entirely — no invalidation, no cache-bust, stale iframe.
    act(() => {
      useEventStore
        .getState()
        .addEvent(makeObservationEvent("5", "FileEditorObservation", "create"));
    });

    // We should have invalidated again and bumped the counter exactly once
    // more for the late-arriving mutation (count: 1 → 2).
    expect(spy.mock.calls.length).toBeGreaterThan(callsAfterInitial);
    expect(useWorkspaceMutationCounter.getState().count).toBe(
      countAfterInitial + 1,
    );
  });

  it("does NOT deduplicate id-less events (every id-less arrival is a new event)", () => {
    // The event store explicitly allows events without ids (see
    // `getEventId` returning undefined). If our hook keyed dedup on
    // `event.id` naively, a single `undefined` entry in the Set would
    // swallow every subsequent id-less event — silently dropping real
    // mutations on the floor. This guard makes sure that doesn't happen.
    const client = new QueryClient();

    renderHook(() => useAutoRefreshFilesOnEdit(), {
      wrapper: makeWrapper(client),
    });

    // Three distinct id-less FileEditorObservation events (different
    // timestamps so the store treats them as ordered, not duplicates).
    const idlessEvent = (i: number): OHEvent =>
      ({
        // no `id` field at all → getEventId returns undefined
        timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        source: "environment",
        tool_name: "str_replace_based_edit_tool",
        tool_call_id: `tc-idless-${i}`,
        action_id: `act-idless-${i}`,
        observation: {
          kind: "FileEditorObservation",
          command: "create",
          path: `/workspace/project/foo${i}.txt`,
          old_content: null,
          new_content: "hello",
          output: "ok",
        },
      }) as unknown as OHEvent;

    act(() => {
      useEventStore.getState().addEvent(idlessEvent(1));
      useEventStore.getState().addEvent(idlessEvent(2));
      useEventStore.getState().addEvent(idlessEvent(3));
    });

    // The counter is the cleanest signal — one bump per useEffect tick
    // that found at least one new mutation. The three id-less events
    // arrive in sequence across three store updates (and therefore at
    // least three effect runs), so we expect three bumps. If the hook
    // were deduping on `undefined`, only the first effect run would
    // bump and the count would be stuck at 1.
    expect(useWorkspaceMutationCounter.getState().count).toBe(3);
  });

  it("dedupes numeric event ids the same way as string ids", () => {
    // The formal EventID type is `string`, but the event store carries
    // `Set<string | number>` defensively (use-event-store.ts:52) and
    // `getEventId` returns `string | number | undefined`. The hook's
    // processed-ids set is widened to match — a stray numeric id (legacy
    // payload, hand-crafted test event, …) must still dedup correctly.
    const client = new QueryClient();

    renderHook(() => useAutoRefreshFilesOnEdit(), {
      wrapper: makeWrapper(client),
    });

    const numericEvent: OHEvent = {
      id: 42 as unknown as string, // intentionally numeric at runtime
      timestamp: new Date(2026, 0, 1, 0, 0, 1).toISOString(),
      source: "environment",
      tool_name: "str_replace_based_edit_tool",
      tool_call_id: "tc-num",
      action_id: "act-num",
      observation: {
        kind: "FileEditorObservation",
        command: "create",
        path: "/workspace/project/foo.txt",
        old_content: null,
        new_content: "hello",
        output: "ok",
      },
    } as unknown as OHEvent;

    act(() => {
      useEventStore.getState().addEvent(numericEvent);
    });
    const afterFirst = useWorkspaceMutationCounter.getState().count;
    expect(afterFirst).toBe(1);

    // Re-adding the same numeric-id event must be a no-op for the
    // counter (store dedups on id; hook must too).
    act(() => {
      useEventStore.getState().addEvent({ ...numericEvent });
    });
    expect(useWorkspaceMutationCounter.getState().count).toBe(afterFirst);
  });

  it("only invalidates once per new event batch", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");

    const { rerender } = renderHook(() => useAutoRefreshFilesOnEdit(), {
      wrapper: makeWrapper(client),
    });

    act(() => {
      useEventStore
        .getState()
        .addEvent(makeObservationEvent("1", "FileEditorObservation", "create"));
    });

    const callsAfterFirst = spy.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // Re-render without adding new events — should not re-invalidate.
    rerender();
    expect(spy.mock.calls.length).toBe(callsAfterFirst);
  });
});
