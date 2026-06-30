import {
  ActionEvent,
  MessageEvent,
  OpenHandsEvent,
} from "#/types/agent-server/core";
import {
  isACPToolCallEvent,
  isActionEvent,
  isMessageEvent,
  isObservationEvent,
  isStreamingDeltaEvent,
} from "#/types/agent-server/type-guards";
import { StreamingDeltaEvent } from "#/types/agent-server/core/events/streaming-delta-event";

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

// The agent's pre-tool-call text, reconstructed the same way as
// `getAgentMessageText` (no separator) so it reconciles against the streamed
// `content` of the StreamingDeltaEvent that produced it.
const getAgentActionThoughtText = (event: ActionEvent): string =>
  event.thought
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("");

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
 * Reconcile the streaming delta(s) of the current turn when an INTERMEDIATE
 * (tool-calling) `ActionEvent` materializes.
 *
 * With `stream=true` an agent step streams its pre-tool-call text as
 * StreamingDeltaEvent `content`; that step then arrives as an `ActionEvent`
 * whose `thought` is the same text, which the chat hoists into its own message
 * (see `group-events.ts`). Without this reconciliation the text renders twice —
 * once from the leftover streaming delta and once from the hoisted thought
 * (issue #1534).
 *
 * Unlike a `FinishAction` / agent `MessageEvent` (handled by
 * `finalizeStreamingDeltasInPlace`, which keeps the delta and drops the final
 * event), the action must stay — it owns the tool call and the hoisted thought.
 * So the streamed text is cleared from the delta instead. The delta's
 * `reasoning_content` is preserved: for many models the streamed delta is the
 * only carrier of reasoning, so the collapsible "Thinking" section must survive
 * even when the action itself reports none. A delta left with neither content
 * nor reasoning is dropped entirely.
 *
 * Returns the updated array, or `null` when there is nothing to reconcile (no
 * current-turn content delta, or the streamed text doesn't match the thought).
 */
const supersedeStreamedThoughtWithAction = (
  action: ActionEvent,
  uiEvents: OpenHandsEvent[],
): OpenHandsEvent[] | null => {
  const thoughtText = getAgentActionThoughtText(action);
  if (!thoughtText) {
    return null;
  }

  const lastUserMessageIndex = findLastUserMessageIndex(uiEvents);
  const contentDeltas = uiEvents
    .map((uiEvent, index) => ({ uiEvent, index }))
    .filter(
      (item): item is { uiEvent: StreamingDeltaEvent; index: number } =>
        item.index > lastUserMessageIndex &&
        isStreamingDeltaEvent(item.uiEvent) &&
        (item.uiEvent.content?.length ?? 0) > 0,
    );

  if (contentDeltas.length === 0) {
    return null;
  }

  const streamingSegments = contentDeltas.map(
    ({ uiEvent }) => uiEvent.content ?? "",
  );
  const streamedText = streamingSegments.join("");

  // Only strip when the streamed text is actually what this action renders as
  // its thought, so unrelated streamed text is never hidden.
  const matched =
    thoughtText.startsWith(streamedText) ||
    findTextSegmentsInOrder(thoughtText, streamingSegments).matched;
  if (!matched) {
    return null;
  }

  const indexesToStrip = new Set(contentDeltas.map(({ index }) => index));
  const nextUiEvents: OpenHandsEvent[] = [];
  uiEvents.forEach((uiEvent, index) => {
    if (!indexesToStrip.has(index) || !isStreamingDeltaEvent(uiEvent)) {
      nextUiEvents.push(uiEvent);
      return;
    }
    // Keep the delta only while it still carries reasoning to render.
    if (uiEvent.reasoning_content) {
      nextUiEvents.push({ ...uiEvent, content: null });
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

  // Intermediate (non-finish) tool-calling action whose thought was streamed:
  // clear the now-duplicated text from the current turn's streaming delta so it
  // doesn't render alongside the action's hoisted thought (issue #1534). The
  // action still falls through to the normal append below — it owns the tool
  // call and the hoisted thought. ThinkAction is excluded: its thought renders
  // through its own collapsible codepath, not a hoisted thought, so there is no
  // duplicate to reconcile.
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
