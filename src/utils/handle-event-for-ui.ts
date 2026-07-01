import {
  ActionEvent,
  ImageContent,
  OpenHandsEvent,
  TextContent,
} from "#/types/agent-server/core";
import {
  isACPToolCallEvent,
  isActionEvent,
  isMessageEvent,
  isObservationEvent,
  isStreamingDeltaEvent,
} from "#/types/agent-server/type-guards";
import { StreamingDeltaEvent } from "#/types/agent-server/core/events/streaming-delta-event";
import { getReasoningContent } from "#/components/conversation-events/chat/event-thought-helpers";

export const mergeStreamingDeltaEvent = (
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
// a multi-block message/thought against the already-rendered streaming delta.
const joinTextBlocks = (blocks: (TextContent | ImageContent)[]): string =>
  blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

const getFinalAgentText = (event: OpenHandsEvent): string | null => {
  if (isActionEvent(event) && event.action.kind === "FinishAction") {
    return event.action.message;
  }

  if (isMessageEvent(event) && event.source === "agent") {
    return joinTextBlocks(event.llm_message.content);
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

// Content-bearing streaming deltas of the current turn (after the last user
// message). Reasoning-only deltas are excluded: reasoning renders in its own
// collapsed bubble and never overlaps the message text being reconciled.
const getCurrentTurnContentDeltas = (
  uiEvents: OpenHandsEvent[],
): { event: StreamingDeltaEvent; index: number }[] => {
  const lastUserMessageIndex = findLastUserMessageIndex(uiEvents);
  return uiEvents
    .map((event, index) => ({ event, index }))
    .filter(
      (item): item is { event: StreamingDeltaEvent; index: number } =>
        item.index > lastUserMessageIndex &&
        isStreamingDeltaEvent(item.event) &&
        (item.event.content?.length ?? 0) > 0,
    );
};

// The current step's streaming delta(s): the trailing run at the end of
// `uiEvents`. Earlier steps' deltas are separated by their observations, so
// this never folds an earlier step's delta into the current one.
const getTrailingContentDeltas = (
  uiEvents: OpenHandsEvent[],
): { event: StreamingDeltaEvent; index: number }[] => {
  const deltas: { event: StreamingDeltaEvent; index: number }[] = [];
  for (let index = uiEvents.length - 1; index >= 0; index -= 1) {
    const event = uiEvents[index];
    if (!isStreamingDeltaEvent(event)) {
      break;
    }
    if ((event.content?.length ?? 0) > 0) {
      deltas.unshift({ event, index });
    }
  }
  return deltas;
};

// Whether the streamed `segments` (in order) reconcile against `targetText`.
// `lastMatchEnd` is the offset past the matched text, so callers can recover
// any not-yet-streamed suffix. The SDK strips the finalized text, so it may
// lack trailing whitespace the model streamed; the match tolerates that by
// also trying the trailing-trimmed streamed text.
const matchStreamedSegments = (
  targetText: string,
  segments: string[],
): { matched: boolean; lastMatchEnd: number } => {
  const streamedText = segments.join("");
  for (const candidate of [streamedText, streamedText.trimEnd()]) {
    if (candidate && targetText.startsWith(candidate)) {
      return { matched: true, lastMatchEnd: candidate.length };
    }
  }
  // Segments may be interleaved with not-yet-streamed text; locate them in
  // order, trimming the last segment's trailing whitespace.
  const lastIndex = segments.length - 1;
  const searchSegments = segments.map((segment, index) =>
    index === lastIndex ? segment.trimEnd() : segment,
  );
  return findTextSegmentsInOrder(targetText, searchSegments);
};

const finalizeStreamingDeltasInPlace = (
  finalEvent: OpenHandsEvent,
  uiEvents: OpenHandsEvent[],
): OpenHandsEvent[] | null => {
  const contentStreamingDeltas = getCurrentTurnContentDeltas(uiEvents);
  if (contentStreamingDeltas.length === 0) {
    return null;
  }

  const finalText = getFinalAgentText(finalEvent);
  if (!finalText) {
    return null;
  }

  const streamingSegments = contentStreamingDeltas.map(
    ({ event }) => event.content ?? "",
  );
  const { matched, lastMatchEnd } = matchStreamedSegments(
    finalText,
    streamingSegments,
  );
  if (!matched) {
    return null;
  }

  const nextUiEvents = [...uiEvents];
  const unstreamedSuffix = finalText.slice(lastMatchEnd);

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
 * Reconcile the current turn's streaming delta when an intermediate
 * (tool-calling) `ActionEvent` arrives. With `stream=true` the step's
 * pre-tool-call text is streamed as delta `content`, then the action's
 * `thought` repeats it and the chat hoists that into its own message (see
 * `group-events.ts`), so the text would render twice (issue #1534).
 *
 * Unlike `finalizeStreamingDeltasInPlace` (which drops the final event and
 * keeps the delta), the action must stay — it owns the tool call. So the
 * streamed text is cleared from the delta instead, and the delta is kept only
 * to carry reasoning the action itself lacks (for many models the delta is the
 * sole reasoning carrier), otherwise dropped.
 *
 * Only the current step's trailing delta run is considered. Returns the updated
 * array, or `null` when there is nothing to reconcile.
 */
const supersedeStreamedThoughtWithAction = (
  action: ActionEvent,
  uiEvents: OpenHandsEvent[],
): OpenHandsEvent[] | null => {
  const thoughtText = joinTextBlocks(action.thought);
  if (!thoughtText) {
    return null;
  }

  const contentDeltas = getTrailingContentDeltas(uiEvents);
  if (contentDeltas.length === 0) {
    return null;
  }

  const streamingSegments = contentDeltas.map(
    ({ event }) => event.content ?? "",
  );

  // Only strip when the streamed text is the action's rendered thought.
  if (!matchStreamedSegments(thoughtText, streamingSegments).matched) {
    return null;
  }

  // Keeping the delta's reasoning would duplicate the action's own "Thinking".
  const actionRendersReasoning = getReasoningContent(action).trim().length > 0;
  const indexesToStrip = new Set(contentDeltas.map(({ index }) => index));
  const nextUiEvents: OpenHandsEvent[] = [];
  uiEvents.forEach((event, index) => {
    if (!indexesToStrip.has(index) || !isStreamingDeltaEvent(event)) {
      nextUiEvents.push(event);
      return;
    }
    // Keep the delta only to render reasoning the action itself lacks.
    if (!actionRendersReasoning && event.reasoning_content) {
      nextUiEvents.push({ ...event, content: null });
    }
  });

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

  // Intermediate tool-calling action whose thought was streamed: clear the
  // duplicated text from the delta (issue #1534). ThinkAction is excluded — its
  // thought renders through its own collapsible, not a hoisted thought.
  if (
    isActionEvent(event) &&
    event.action.kind !== "FinishAction" &&
    event.action.kind !== "ThinkAction"
  ) {
    const reconciledUiEvents = supersedeStreamedThoughtWithAction(
      event,
      newUiEvents,
    );
    if (reconciledUiEvents) {
      reconciledUiEvents.push(event);
      return reconciledUiEvents;
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
