import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useEventStore, type OHEvent } from "#/stores/use-event-store";
import { useWorkspaceMutationCounter } from "#/stores/use-workspace-mutation-counter";

// `kind` values we treat as a file-mutation observation.
const FILE_EDIT_OBSERVATION_KINDS = new Set([
  "FileEditorObservation",
  "StrReplaceEditorObservation",
  "PlanningFileEditorObservation",
]);

// Commands on the str-replace-editor family that don't change anything on
// disk. We don't want to invalidate caches for those.
const READ_ONLY_COMMANDS = new Set(["view"]);

function isFileMutationObservation(event: OHEvent): boolean {
  // ObservationEvents have `source: "environment"` and an `observation`
  // field — narrow to that shape without pulling in the whole event union.
  const obs = (event as { observation?: { kind?: string; command?: string } })
    .observation;
  if (!obs || typeof obs.kind !== "string") return false;
  if (!FILE_EDIT_OBSERVATION_KINDS.has(obs.kind)) return false;
  if (obs.command && READ_ONLY_COMMANDS.has(obs.command)) return false;
  return true;
}

/**
 * Watches the conversation event stream and invalidates the workspace file
 * queries whenever the agent commits a file-editor mutation (create / edit /
 * insert / undo_edit). This keeps the Files tab's list, content view and
 * diff view in sync with what the agent has actually written to disk,
 * without requiring the user to click refresh manually.
 *
 * Mount this hook inside any component that should drive auto-refresh —
 * the Files tab is the obvious caller. Multiple mounts are safe because
 * React Query coalesces overlapping invalidations.
 */
export function useAutoRefreshFilesOnEdit(): void {
  const queryClient = useQueryClient();
  const events = useEventStore((state) => state.events);
  const bumpWorkspaceMutationCounter = useWorkspaceMutationCounter(
    (state) => state.bump,
  );

  // Track which event ids we've already reacted to. The event store
  // re-sorts on insert when out-of-order events arrive (an older event
  // can land *between* two newer ones already in the array), so we
  // cannot rely on a `slice(processedCount)` trick — that would miss a
  // late-arriving older event because the array length grew but the
  // tail we just diffed didn't contain it. Using a Set of ids is
  // O(events) per render in the worst case but small in practice and
  // immune to reordering.
  //
  // Type matches the event store's own dedup set (`Set<string | number>`
  // in `use-event-store.ts`). The formal `EventID` type is `string`, but
  // `getEventId` returns `string | number | undefined`, and we mirror
  // that tolerance here so a stray numeric id (legacy server payload,
  // hand-crafted test event, …) doesn't sneak past dedup. Events with
  // *no* id are not added to the set at all — adding `undefined` once
  // would cause every subsequent id-less event (which is a *different*
  // event) to be silently skipped.
  const processedIdsRef = useRef<Set<string | number>>(new Set());

  useEffect(() => {
    const newMutationEvents: OHEvent[] = [];
    for (const event of events) {
      const id: string | number | undefined =
        "id" in event ? event.id : undefined;
      // Id-less events are always treated as "new" — there is nothing to
      // key on, so dedup would be wrong (it'd swallow the 2nd / 3rd / Nth
      // ID-less event by collapsing them under a single `undefined` key).
      if (id !== undefined) {
        if (processedIdsRef.current.has(id)) continue;
        processedIdsRef.current.add(id);
      }
      if (isFileMutationObservation(event)) newMutationEvents.push(event);
    }

    if (newMutationEvents.length === 0) return;

    queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
    queryClient.invalidateQueries({ queryKey: ["workspace-file-content"] });
    queryClient.invalidateQueries({ queryKey: ["file_changes"] });
    // Force iframes / <img> tags pointing at the static workspace
    // fileserver to re-fetch. Without this they happily keep showing the
    // stale (browser-cached) bytes even after the agent has rewritten the
    // file on disk — e.g. tweaking style.css would silently have no
    // visible effect on the rendered index.html until the user reloaded
    // the whole canvas.
    bumpWorkspaceMutationCounter();
  }, [events, queryClient, bumpWorkspaceMutationCounter]);
}
