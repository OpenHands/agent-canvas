import React from "react";
import { OpenHandsEvent } from "#/types/agent-server/core";
import { EventMessage } from "./event-message";
import { usePlanPreviewEvents } from "./hooks/use-plan-preview-events";
import { groupEvents } from "./group-events";
import { EventGroup } from "./event-message-components/event-group";
import { ThoughtEventMessage } from "./event-message-components/thought-event-message";
// TODO: Implement microagent functionality for V1 when APIs support V1 event IDs
// import { AgentState } from "#/types/agent-state";
// import MemoryIcon from "#/icons/memory_icon.svg?react";

interface MessagesProps {
  messages: OpenHandsEvent[]; // UI events (actions replaced by observations)
  allEvents: OpenHandsEvent[]; // Full event history (for action lookup)
}

const getLastEventId = (events: OpenHandsEvent[]) => events.at(-1)?.id;

export const Messages: React.FC<MessagesProps> = React.memo(
  ({ messages, allEvents }) => {
    // Get the set of event IDs that should render PlanPreview
    // This ensures only one preview per user message "phase"
    const planPreviewEventIds = usePlanPreviewEvents(allEvents);

    // Fold consecutive action/observation events into collapsible groups so a
    // long sequence of tool calls doesn't dominate the chat scroll. Items that
    // can't be grouped (or that fall in a short run) are still rendered one by
    // one, identically to before. Agent thoughts attached to an action are
    // hoisted out as their own rendered item so they always show up in the
    // message pane and a thought between actions starts a fresh group.
    const renderedItems = React.useMemo(
      () => groupEvents(messages, undefined, allEvents),
      [messages, allEvents],
    );

    const renderEventMessage = (
      event: OpenHandsEvent,
      index: number,
      suppressThought: boolean,
    ) => (
      <EventMessage
        key={event.id}
        event={event}
        messages={allEvents}
        isLastMessage={messages.length - 1 === index}
        isInLast10Actions={messages.length - 1 - index < 10}
        planPreviewEventIds={planPreviewEventIds}
        suppressThought={suppressThought}
      />
    );

    return (
      <>
        {renderedItems.map((item) => {
          if (item.kind === "single") {
            // Thoughts for singles are also hoisted as their own "thought"
            // item, so suppress the inline render to avoid duplication.
            return renderEventMessage(item.event, item.index, true);
          }

          if (item.kind === "thought") {
            return (
              <ThoughtEventMessage
                key={`thought-${item.action.id}`}
                event={item.action}
              />
            );
          }

          const groupKey = item.events[0]?.id ?? `group-${item.startIndex}`;
          return (
            <EventGroup key={groupKey} events={item.events}>
              {item.events.map((event, offset) =>
                renderEventMessage(event, item.startIndex + offset, true),
              )}
            </EventGroup>
          );
        })}
      </>
    );
  },
  (prevProps, nextProps) =>
    prevProps.messages.length === nextProps.messages.length &&
    prevProps.allEvents.length === nextProps.allEvents.length &&
    getLastEventId(prevProps.messages) === getLastEventId(nextProps.messages) &&
    getLastEventId(prevProps.allEvents) === getLastEventId(nextProps.allEvents),
);

Messages.displayName = "Messages";
