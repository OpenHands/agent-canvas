import { ActionEvent, OpenHandsEvent } from "#/types/agent-server/core";
import {
  isActionEvent,
  isObservationEvent,
} from "#/types/agent-server/type-guards";

/**
 * Returns the displayable thought text of an `ActionEvent`, or an empty
 * string if the event has no usable thought content.
 *
 * Mirrors the logic used by `ThoughtEventMessage` so callers stay in sync
 * with what gets rendered.
 */
export const getActionThoughtText = (action: ActionEvent): string =>
  action.thought
    .filter((t) => t.type === "text")
    .map((t) => t.text)
    .join("\n");

export const hasNonEmptyThought = (action: ActionEvent): boolean =>
  getActionThoughtText(action).trim().length > 0;

/**
 * Find the `ActionEvent` whose thought should be rendered alongside the
 * given UI event. For an `ActionEvent` the thought belongs to itself; for
 * an `ObservationEvent` we look up the matching action in `allEvents`.
 *
 * `ThinkAction` is intentionally excluded because its thought IS the
 * action body and is rendered through a separate codepath.
 */
export const getThoughtSourceAction = (
  event: OpenHandsEvent,
  allEvents: OpenHandsEvent[],
): ActionEvent | null => {
  if (isActionEvent(event)) {
    if (event.action.kind === "ThinkAction") return null;
    return hasNonEmptyThought(event) ? event : null;
  }

  if (isObservationEvent(event)) {
    const action = allEvents.find(
      (e): e is ActionEvent => isActionEvent(e) && e.id === event.action_id,
    );
    if (!action) return null;
    if (action.action.kind === "ThinkAction") return null;
    return hasNonEmptyThought(action) ? action : null;
  }

  return null;
};
