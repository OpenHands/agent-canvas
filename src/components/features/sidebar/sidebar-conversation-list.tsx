import { ConversationPanel } from "#/components/features/conversation-panel/conversation-panel";
import { useSidebarCollapsed } from "./sidebar-collapse-context";

/**
 * Conversation list section rendered inside the sidebar nav. The list itself
 * scrolls independently from the rest of the nav.
 *
 * In the collapsed sidebar variant the list reduces each row to a status
 * indicator + hover-preview.
 *
 * Stays within the aside's horizontal padding so row hovers (group headers,
 * conversation cards) align with {@link SidebarNavLink} items above.
 */
export function SidebarConversationList() {
  const collapsed = useSidebarCollapsed();

  if (collapsed) {
    return null;
  }

  return (
    <div className="hidden md:flex md:flex-col md:flex-1 md:min-h-0">
      {/* Avoid overflow-hidden here: ConversationPanel's header uses `-mx-2` to
          full-bleed the scroll divider to the aside edges; clipping would inset
          the border. Scrolling stays contained on the panel's inner list. */}
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <ConversationPanel />
      </div>
    </div>
  );
}
