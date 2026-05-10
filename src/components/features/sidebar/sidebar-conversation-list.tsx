import { ConversationPanel } from "#/components/features/conversation-panel/conversation-panel";
import { NewConversationButton } from "#/components/features/conversation-panel/new-conversation-button";
import { useSidebarCollapsed } from "./sidebar-collapse-context";
import { cn } from "#/utils/utils";

/**
 * Conversation list section rendered inside the sidebar nav. The list itself
 * scrolls independently from the rest of the nav, while the "+ New" trigger
 * stays pinned above it.
 *
 * In the collapsed sidebar variant the list reduces each row to a status
 * indicator + hover-preview, and the new-conversation button collapses to a
 * "+" icon.
 */
export function SidebarConversationList() {
  const collapsed = useSidebarCollapsed();
  return (
    <div
      className={cn(
        "hidden md:flex md:flex-col md:flex-1 md:min-h-0 gap-2",
        collapsed ? "items-center -mx-1" : "-mx-3",
      )}
    >
      <div className={cn("w-full", collapsed ? "px-1" : "px-3")}>
        <NewConversationButton compact={collapsed} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden w-full">
        <ConversationPanel compact={collapsed} />
      </div>
    </div>
  );
}
