import { ActionEvent, OpenHandsEvent } from "#/types/agent-server/core";
import { ThinkingBlock } from "#/types/agent-server/core/base/event";
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

/**
 * Extracts extended thinking / reasoning content from an `ActionEvent`.
 *
 * Prefers `reasoning_content` (a plain string produced by many reasoning
 * models). Falls back to the text from `thinking_blocks` (Anthropic
 * extended thinking). Returns an empty string when neither is available.
 */
export const getReasoningContent = (action: ActionEvent): string => {
  if (action.reasoning_content) {
    return action.reasoning_content;
  }

  if (action.thinking_blocks?.length) {
    return action.thinking_blocks
      .filter((b): b is ThinkingBlock => b.type === "thinking")
      .map((b) => b.thinking)
      .join("\n\n");
  }

  return "";
};

export const hasNonEmptyThought = (action: ActionEvent): boolean =>
  getActionThoughtText(action).trim().length > 0;

/**
 * Splits an inline `<think>…</think>` reasoning block out of assistant
 * message content.
 *
 * Some models stream their chain-of-thought as an inline `<think>` block
 * inside the regular `content` instead of the dedicated `reasoning_content`
 * field. litellm extracts that block when a completion is NOT streamed, but
 * raw streamed deltas keep it inline — so a streamed OpenHands message would
 * otherwise render the reasoning as visible message text. This routes the
 * reasoning to the same collapsible "thinking" section used for
 * `reasoning_content`.
 *
 * Returns the extracted `reasoning` (joined across blocks) and the remaining
 * `message`. When there is no `<think>` block the content is returned
 * unchanged as `message`, so this is a safe no-op for normal messages. An
 * unclosed `<think>` (mid-stream) is treated as reasoning in full, so partial
 * thinking never leaks into the message bubble.
 */
export const splitInlineThink = (
  content: string,
): { reasoning: string; message: string } => {
  const OPEN = "<think>";
  const CLOSE = "</think>";
  if (!content.includes(OPEN)) {
    return { reasoning: "", message: content };
  }

  const reasoning: string[] = [];
  let message = "";
  let rest = content;

  while (rest.length > 0) {
    const open = rest.indexOf(OPEN);
    if (open === -1) {
      message += rest;
      break;
    }
    message += rest.slice(0, open);
    const afterOpen = rest.slice(open + OPEN.length);
    const close = afterOpen.indexOf(CLOSE);
    if (close === -1) {
      // Unclosed block: still streaming — everything left is reasoning.
      reasoning.push(afterOpen);
      break;
    }
    reasoning.push(afterOpen.slice(0, close));
    rest = afterOpen.slice(close + CLOSE.length);
  }

  return {
    reasoning: reasoning.join("\n\n").trim(),
    message: message.trim(),
  };
};

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
