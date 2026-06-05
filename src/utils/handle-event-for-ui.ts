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
  ...existing,
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

// Join text blocks WITHOUT a separator: streaming deltas concatenate content
// tokens directly with no separator between LLM content blocks, so using "\n"
// here would cause startsWith/findTextSegmentsInOrder to miss when reconciling
// a multi-block MessageEvent against the already-rendered streaming delta.
const getAgentMessageText = (event: MessageEvent): string =>
  event.llm_message.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("");

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
  // Only the regular `content` field participates in reconciliation.
  // Reasoning-only deltas (those that carry only `reasoning_content`) produce
  // an empty streamingSegments list, causing the function to return null so
  // the finalEvent is appended normally.  This is intentional: reasoning
  // content renders in its own collapsed bubble and never overlaps with the
  // assistant's regular message text in `FinishAction.message`.
  const contentStreamingDeltas = currentTurnStreamingDeltaIndexes
    .map((index) => ({ event: uiEvents[index], index }))
    .filter(
      (item): item is { event: StreamingDeltaEvent; index: number } =>
        isStreamingDeltaEvent(item.event) &&
        (item.event.content?.length ?? 0) > 0,
    );
  const streamingSegments = contentStreamingDeltas.map(
    ({ event }) => event.content ?? "",
  );

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

  const lastDeltaIndex = contentStreamingDeltas.at(-1)?.index;
  const lastDelta =
    lastDeltaIndex === undefined ? undefined : nextUiEvents[lastDeltaIndex];
  if (
    unstreamedSuffix &&
    lastDeltaIndex !== undefined &&
    lastDelta &&
    isStreamingDeltaEvent(lastDelta)
  ) {
    nextUiEvents[lastDeltaIndex] = appendContentToStreamingDeltaEvent(
      lastDelta,
      unstreamedSuffix,
    );
  }

  // Intentionally return nextUiEvents WITHOUT appending finalEvent.
  // The last content-bearing streaming delta (possibly extended with
  // unstreamedSuffix above) becomes the canonical final rendered bubble for
  // this turn. Appending finalEvent here would display the assistant message
  // twice.
  return nextUiEvents;
};

/**
 * Handles adding an event to the UI events array
 * Replaces actions with observations when they arrive (so UI shows observation instead of action)
 * Exception: ThinkAction is NOT replaced because the thought content is in the action, not in the observation
 *
 * ACPToolCallEvent merge: the SDK emits two events per ``tool_call_id`` — an
 * early ``started`` event (``pending`` / ``in_progress``) and one terminal
 * (completed / failed) event, the action->observation pair for a tool call.
 * Replace the started entry in place with the terminal one so a single card
 * updates from running to its result, exactly like an observation superseding
 * its action below.
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
      // The reconciled streaming delta intentionally replaces this final event
      // for rendering. Today streamed agent responses only render text and
      // reasoning content; if final-event metadata such as activated
      // microagents becomes meaningful for streamed responses, add a rendered
      // wrapper that carries both the stable delta identity and that metadata.
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
