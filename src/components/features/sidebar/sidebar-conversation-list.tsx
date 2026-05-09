import { ConversationPanel } from "#/components/features/conversation-panel/conversation-panel";
import { NewConversationButton } from "#/components/features/conversation-panel/new-conversation-button";

/**
 * Conversation list section rendered inside the sidebar nav. The list itself
 * scrolls independently from the rest of the nav, while the "+ New" trigger
 * stays pinned above it.
 */
export function SidebarConversationList() {
  return (
    <div className="hidden md:flex md:flex-col md:flex-1 md:min-h-0 gap-2 -mx-3">
      <div className="px-3">
        <NewConversationButton />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <ConversationPanel />
      </div>
    </div>
  );
}
