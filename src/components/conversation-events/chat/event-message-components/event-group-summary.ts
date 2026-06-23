import { ActionEvent, OpenHandsEvent } from "#/types/agent-server/core";
import {
  isActionEvent,
  isObservationEvent,
} from "#/types/agent-server/type-guards";

/**
 * Format an elapsed duration (ms) as a compact, locale-agnostic label:
 * `12s`, `3m`, `3m 5s`. Sub-second values render as `0s` and are filtered
 * out by the caller.
 */
export const formatElapsed = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
};

/**
 * Elapsed time spanned by a group of events.
 *
 * Measures from the first event's timestamp to the last event's timestamp
 * once the group has settled. While the group is still running, the final
 * event is a pending action with no terminal timestamp, so we measure up to
 * `now` instead — this is what drives the live ticking counter.
 *
 * Returns 0 when timestamps are missing or unparseable so the caller can hide
 * the segment rather than render a misleading value.
 */
export const computeGroupElapsedMs = (
  events: OpenHandsEvent[],
  running: boolean,
  now: number,
): number => {
  if (events.length === 0) return 0;

  const start = Date.parse(events[0].timestamp);
  if (Number.isNaN(start)) return 0;

  const lastTimestamp = events[events.length - 1].timestamp;
  const end = running ? now : Date.parse(lastTimestamp);
  const resolvedEnd = Number.isNaN(end) ? now : end;

  return Math.max(0, resolvedEnd - start);
};

const isEditedFilePath = (action: ActionEvent): string | null => {
  const { action: payload } = action;
  if (
    (payload.kind === "FileEditorAction" ||
      payload.kind === "StrReplaceEditorAction") &&
    payload.command !== "view"
  ) {
    return payload.path;
  }
  return null;
};

const resolveAction = (
  event: OpenHandsEvent,
  allEvents: OpenHandsEvent[],
): ActionEvent | null => {
  if (isActionEvent(event)) {
    return event;
  }
  if (isObservationEvent(event)) {
    return (
      allEvents.find(
        (candidate): candidate is ActionEvent =>
          isActionEvent(candidate) && candidate.id === event.action_id,
      ) ?? null
    );
  }
  return null;
};

/**
 * Count the unique files mutated by a group of events.
 *
 * Each event is resolved back to its originating action (observations look up
 * their action in `allEvents`), and only non-`view` file-editor commands are
 * counted. Paths are deduped so editing the same file twice counts once.
 */
export const countChangedFiles = (
  events: OpenHandsEvent[],
  allEvents: OpenHandsEvent[],
): number => {
  const paths = new Set<string>();
  for (const event of events) {
    const action = resolveAction(event, allEvents);
    if (!action) continue;
    const path = isEditedFilePath(action);
    if (path) paths.add(path);
  }
  return paths.size;
};
