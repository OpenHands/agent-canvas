import { ConversationPanel } from "#/components/features/conversation-panel/conversation-panel";
import { useSidebarCollapsed } from "./sidebar-collapse-context";
import { cn } from "#/utils/utils";

/**
 * Conversation list section rendered inside the sidebar nav. The list itself
 * scrolls independently from the rest of the nav.
 *
 * In the collapsed sidebar variant the list reduces each row to a status
 * indicator + hover-preview.
 */
export function SidebarConversationList() {
  const collapsed = useSidebarCollapsed();

  if (collapsed) {
    return null;
  }

  return (
    <div
      className={cn("hidden md:flex md:flex-col md:flex-1 md:min-h-0", "-mx-2")}
    >
      <div className="flex-1 min-h-0 overflow-hidden w-full">
        <ConversationPanel />
      </div>
    </div>
  );
}
