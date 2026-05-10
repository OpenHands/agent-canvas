import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useEventStore, type OHEvent } from "#/stores/use-event-store";

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

  // Only react to events we haven't seen yet. We compare against the last
  // processed array length rather than tracking individual ids — the store
  // is append-only (sort-on-insert happens but ids stay unique), so this
  // is a cheap conservative bound.
  const processedCountRef = useRef(0);

  useEffect(() => {
    const newEvents = events.slice(processedCountRef.current);
    processedCountRef.current = events.length;

    if (!newEvents.some(isFileMutationObservation)) return;

    queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
    queryClient.invalidateQueries({ queryKey: ["workspace-file-content"] });
    queryClient.invalidateQueries({ queryKey: ["file_changes"] });
  }, [events, queryClient]);
}
