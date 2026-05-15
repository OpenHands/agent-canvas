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

  // Render ACP sub-agent tool call events — suppress in_progress (empty args)
  // so the card only appears once fully populated.
  if (isACPToolCallEvent(event)) {
    return event.status !== "in_progress";
  }

  // Don't render any other event types (system events, etc.)
  return false;
};

export const hasUserEvent = (events: OpenHandsEvent[]) =>
  events.some((event) => event.source === "user");
