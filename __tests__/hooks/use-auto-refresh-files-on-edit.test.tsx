import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { useAutoRefreshFilesOnEdit } from "#/hooks/use-auto-refresh-files-on-edit";
import { useEventStore } from "#/stores/use-event-store";
import type { OHEvent } from "#/stores/use-event-store";

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
