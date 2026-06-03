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

  // Render ACP sub-agent tool call events at every lifecycle stage. The SDK
  // now persists exactly two events per ``tool_call_id`` — one early
  // ``started`` event (``pending`` / ``in_progress``) and one terminal
  // (``completed`` / ``failed``) event — the action->observation pair for a
  // tool call. The ``started`` event renders the card as "running" (no check
  // mark; see ``getACPToolCallResult``) and ``handleEventForUI`` replaces it
  // in place by ``tool_call_id`` once the terminal event arrives, mirroring
  // how an ObservationEvent supersedes its ActionEvent. The old terminal-only
  // gate existed because the source fanned out one cumulative-output frame per
  // ``ToolCallProgress``, which flashed half-formed cards mid-stream; that
  // fan-out is gone, so the running card is now a single clean event.
  if (isACPToolCallEvent(event)) {
    return true;
  }

  // Don't render any other event types (system events, etc.)
  return false;
};

export const hasUserEvent = (events: OpenHandsEvent[]) =>
  events.some((event) => event.source === "user");
