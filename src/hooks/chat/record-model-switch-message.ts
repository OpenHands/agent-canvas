import { getLastRenderableEventId } from "#/hooks/chat/model-command-event-anchor";
import { useModelStore } from "#/stores/model-store";

export function recordModelSwitchMessage(
  conversationId: string,
  profileName: string,
  anchorEventId: string | null = getLastRenderableEventId(),
) {
  useModelStore
    .getState()
    .recordSwitch(conversationId, anchorEventId, profileName);
}
