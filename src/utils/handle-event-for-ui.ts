import { MessageEvent, OpenHandsEvent } from "#/types/agent-server/core";
import {
  isACPToolCallEvent,
  isActionEvent,
  isMessageEvent,
  isObservationEvent,
  isStreamingDeltaEvent,
} from "#/types/agent-server/type-guards";
import { StreamingDeltaEvent } from "#/types/agent-server/core/events/streaming-delta-event";

const mergeStreamingDeltaEvent = (
  incoming: StreamingDeltaEvent,
  existing: StreamingDeltaEvent,
): StreamingDeltaEvent => ({
  ...incoming,
  content: `${existing.content ?? ""}${incoming.content ?? ""}` || null,
  reasoning_content:
    `${existing.reasoning_content ?? ""}${incoming.reasoning_content ?? ""}` ||
    null,
});

const appendContentToStreamingDeltaEvent = (
  existing: StreamingDeltaEvent,
  content: string,
): StreamingDeltaEvent => ({
  ...existing,
  content: `${existing.content ?? ""}${content}` || null,
});

const findLastUserMessageIndex = (events: OpenHandsEvent[]): number => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (isMessageEvent(event) && event.source === "user") {
      return index;
    }
  }
  return -1;
};

const getAgentMessageText = (event: MessageEvent): string =>
  event.llm_message.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("\n");

const getFinalAgentText = (event: OpenHandsEvent): string | null => {
  if (isActionEvent(event) && event.action.kind === "FinishAction") {
    return event.action.message;
  }

  if (isMessageEvent(event) && event.source === "agent") {
    return getAgentMessageText(event);
  }

  return null;
};

const findTextSegmentsInOrder = (
  text: string,
  segments: string[],
): { matched: boolean; lastMatchEnd: number } => {
  let searchStart = 0;
  let lastMatchEnd = 0;

  for (const segment of segments) {
    const index = text.indexOf(segment, searchStart);
    if (index === -1) {
      return { matched: false, lastMatchEnd };
    }
    lastMatchEnd = index + segment.length;
    searchStart = lastMatchEnd;
  }

  return { matched: true, lastMatchEnd };
};

const finalizeStreamingDeltasInPlace = (
  finalEvent: OpenHandsEvent,
  uiEvents: OpenHandsEvent[],
): OpenHandsEvent[] | null => {
  const lastUserMessageIndex = findLastUserMessageIndex(uiEvents);
  const currentTurnStreamingDeltaIndexes = uiEvents
    .map((uiEvent, index) => ({ uiEvent, index }))
    .filter(
      ({ uiEvent, index }) =>
        index > lastUserMessageIndex && isStreamingDeltaEvent(uiEvent),
    )
    .map(({ index }) => index);

  if (currentTurnStreamingDeltaIndexes.length === 0) {
    return null;
  }

  const finalText = getFinalAgentText(finalEvent);
  const streamingSegments = currentTurnStreamingDeltaIndexes
    .map((index) => uiEvents[index])
    .filter(isStreamingDeltaEvent)
    .map((uiEvent) => uiEvent.content ?? "")
    .filter((content) => content.length > 0);

  if (!finalText || streamingSegments.length === 0) {
    return null;
  }

  const nextUiEvents = [...uiEvents];
  const streamedText = streamingSegments.join("");
  let unstreamedSuffix = "";

  if (finalText.startsWith(streamedText)) {
    unstreamedSuffix = finalText.slice(streamedText.length);
  } else {
    const match = findTextSegmentsInOrder(finalText, streamingSegments);
    if (!match.matched) {
      return null;
    }
    unstreamedSuffix = finalText.slice(match.lastMatchEnd);
  }

  const lastDeltaIndex =
    currentTurnStreamingDeltaIndexes[
      currentTurnStreamingDeltaIndexes.length - 1
    ];
  const lastDelta = nextUiEvents[lastDeltaIndex];
  if (unstreamedSuffix && isStreamingDeltaEvent(lastDelta)) {
    nextUiEvents[lastDeltaIndex] = appendContentToStreamingDeltaEvent(
      lastDelta,
      unstreamedSuffix,
    );
  }

  return nextUiEvents;
};

/**
 * Handles adding an event to the UI events array
 * Replaces actions with observations when they arrive (so UI shows observation instead of action)
 * Exception: ThinkAction is NOT replaced because the thought content is in the action, not in the observation
 *
 * ACPToolCallEvent dedup: multiple events share a ``tool_call_id`` as an ACP
 * tool call progresses (in_progress → completed / failed). Collapse them to
 * the latest state at the original position so the card updates in place.
 */
export const handleEventForUI = (
  event: OpenHandsEvent,
  uiEvents: OpenHandsEvent[],
): OpenHandsEvent[] => {
  const newUiEvents = [...uiEvents];

  if (isStreamingDeltaEvent(event)) {
    if (event.content === null && event.reasoning_content === null) {
      return newUiEvents;
    }

    const lastIndex = newUiEvents.length - 1;
    const lastEvent = newUiEvents[lastIndex];
    if (lastEvent && isStreamingDeltaEvent(lastEvent)) {
      newUiEvents[lastIndex] = mergeStreamingDeltaEvent(event, lastEvent);
      return newUiEvents;
    }

    newUiEvents.push(event);
    return newUiEvents;
  }

  if (
    (isActionEvent(event) && event.action.kind === "FinishAction") ||
    (isMessageEvent(event) && event.source === "agent")
  ) {
    const finalizedUiEvents = finalizeStreamingDeltasInPlace(
      event,
      newUiEvents,
    );
    if (finalizedUiEvents) {
      return finalizedUiEvents;
    }
  }

  if (isACPToolCallEvent(event)) {
    const existingIndex = newUiEvents.findIndex(
      (uiEvent) =>
        isACPToolCallEvent(uiEvent) &&
        uiEvent.tool_call_id === event.tool_call_id,
    );
    if (existingIndex !== -1) {
      newUiEvents[existingIndex] = event;
    } else {
      newUiEvents.push(event);
    }
    return newUiEvents;
  }

  if (isObservationEvent(event)) {
    // Don't add ThinkObservation at all - we keep the ThinkAction instead
    // The thought content is in the action, not the observation
    if (event.observation.kind === "ThinkObservation") {
      return newUiEvents;
    }

    // Don't add FinishObservation at all - we keep the FinishAction instead
    // Both contain the same message content, so we only need to display one
    // This also prevents duplicate messages when events arrive out of order due to React batching
    if (event.observation.kind === "FinishObservation") {
      return newUiEvents;
    }

    // Find and replace the corresponding action from uiEvents
    const actionIndex = newUiEvents.findIndex(
      (uiEvent) => uiEvent.id === event.action_id,
    );
    if (actionIndex !== -1) {
      newUiEvents[actionIndex] = event;
    } else {
      // Action not found in uiEvents, just add the observation
      newUiEvents.push(event);
    }
  } else {
    // For non-observation events, just add them to uiEvents
    newUiEvents.push(event);
  }

  return newUiEvents;
};
