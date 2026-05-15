import { shouldRenderEvent } from "#/components/conversation-events/chat/event-content-helpers/should-render-event";
import { useEventStore } from "#/stores/use-event-store";

export const getLastRenderableEventId = (): string | null => {
  const last = useEventStore
    .getState()
    .uiEvents.filter(shouldRenderEvent)
    .at(-1);

  return last && "id" in last ? String(last.id) : null;
};
