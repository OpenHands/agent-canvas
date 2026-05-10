import { useActiveBackend } from "#/contexts/active-backend-context";

import { CloudNewConversationButton } from "./new-conversation-button-cloud";
import { LocalNewConversationButton } from "./new-conversation-button-local";

/**
 * Sidebar "+ New Conversation" trigger.
 *
 * The popover content depends on the active backend: local backends operate
 * on workspace folders so we surface the workspace picker, while cloud
 * backends operate on git repositories so we surface a repository picker.
 */
export function NewConversationButton() {
  const isCloud = useActiveBackend().backend.kind === "cloud";

  if (isCloud) return <CloudNewConversationButton />;
  return <LocalNewConversationButton />;
}
