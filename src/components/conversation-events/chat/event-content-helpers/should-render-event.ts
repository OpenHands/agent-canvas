import { OpenHandsEvent } from "#/types/agent-server/core";
import {
  isActionEvent,
  isObservationEvent,
  isMessageEvent,
  isAgentErrorEvent,
  isConversationStateUpdateEvent,
  isHookExecutionEvent,
  isACPToolCallEvent,
} from "#/types/agent-server/type-guards";

export const shouldRenderEvent = (event: OpenHandsEvent) => {
  // Explicitly exclude system events that should not be rendered in chat
  if (isConversationStateUpdateEvent(event)) {
    return false;
  }

  // Render action events (with filtering)
  if (isActionEvent(event)) {
    // For V1, action is an object with kind property
    const actionType = event.action.kind;

    if (!actionType) {
      return false;
    }

    // Hide user commands from the chat interface
    if (actionType === "ExecuteBashAction" && event.source === "user") {
      return false;
    }

    // Hide PlanningFileEditorAction - handled separately with PlanPreview component
    if (actionType === "PlanningFileEditorAction") {
      return false;
    }

    // The model switch tool reuses the same inline model message UI as
    // `/model <profile>` once the observation arrives.
    if (actionType === "SwitchLLMAction") {
      return false;
    }

    return true;
  }

  // Render observation events
  if (isObservationEvent(event)) {
    // Successful model switches are rendered through ModelMessages so they
    // look identical to `/model <profile>` confirmations. Failed switches
    // still render as observations so the error remains visible in chat.
    if (
      event.observation.kind === "SwitchLLMObservation" &&
      !event.observation.is_error
    ) {
      return false;
    }

    return true;
  }

  // Render message events (user and assistant messages)
  if (isMessageEvent(event)) {
    return true;
  }

  // Render agent error events
  if (isAgentErrorEvent(event)) {
    return true;
  }

  // Render hook execution events
  if (isHookExecutionEvent(event)) {
    return true;
  }

  // Render ACP sub-agent tool call events only once they've reached a
  // terminal status. ACP servers stream multiple events per
  // ``tool_call_id`` as the call progresses (status flips
  // ``in_progress`` → ``completed`` / ``failed``); during streaming the
  // event's ``raw_input`` / ``raw_output`` / ``title`` may still be
  // partially populated, so rendering an in-flight event flashes a
  // half-formed card that then updates in place — visibly noisy.
  // ``null`` (older agent-server builds, before the field was required)
  // is also treated as in-flight: better to wait for the terminal event
  // than to render a card with no status. ``handleEventForUI`` already
  // replaces in place by ``tool_call_id``, so the terminal event lands
  // at the original position once it arrives.
  if (isACPToolCallEvent(event)) {
    return event.status === "completed" || event.status === "failed";
  }

  // Don't render any other event types (system events, etc.)
  return false;
};

export const hasUserEvent = (events: OpenHandsEvent[]) =>
  events.some((event) => event.source === "user");
