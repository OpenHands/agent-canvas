import { useConversationAttention } from "#/hooks/use-conversation-attention";

/**
 * Renders nothing — exists only to run `useConversationAttention` inside the
 * navigation provider (so it sees the active conversation id and a working
 * `navigate`). Mounted once in the root layout.
 */
export function ConversationAttentionNotifier() {
  useConversationAttention();
  return null;
}
