import type { OpenHandsEvent } from "#/types/agent-server/core";
import { isBrowserObservationEvent } from "#/types/agent-server/type-guards";

/**
 * Remove large payloads that are only needed transiently by side panels before
 * retaining conversation events in React Query/Zustand history.
 */
export function stripHeavyEventPayloads<T extends OpenHandsEvent>(event: T): T {
  if (!isBrowserObservationEvent(event) || !event.observation.screenshot_data) {
    return event;
  }

  return {
    ...event,
    observation: {
      ...event.observation,
      screenshot_data: null,
    },
  } as T;
}

export function stripHeavyEventPayloadsFromList<T extends OpenHandsEvent>(
  events: T[],
): T[] {
  return events.map(stripHeavyEventPayloads);
}
