import { ConversationPanel } from "#/components/features/conversation-panel/conversation-panel";
import { useSidebarCollapsed } from "./sidebar-collapse-context";

/**
 * Conversation list section rendered inside the sidebar nav. The list itself
 * scrolls independently from the rest of the nav.
 *
 * In the collapsed sidebar variant the list reduces each row to a status
 * indicator + hover-preview.
 *
 * On desktop the aside uses `pr-0` so this list is full width to the rail;
 * nav links above keep their own horizontal padding.
 */
export function SidebarConversationList() {
  const collapsed = useSidebarCollapsed();

  if (collapsed) {
    return null;
  }

  return (
    <div className="hidden md:flex md:flex-col md:flex-1 md:min-h-0">
      {/* Avoid overflow-hidden here: ConversationPanel's header uses `-ml-2` +
          `w-[calc(100%+0.5rem)]` to full-bleed the divider with `md:pr-0` on
          the aside; clipping would inset the border. Scroll stays on the inner
          list. */}
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <ConversationPanel />
      </div>
    </div>
  );
}
