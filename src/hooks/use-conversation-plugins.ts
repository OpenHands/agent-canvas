import { useMemo } from "react";
import { getStoredConversationMetadata } from "#/api/conversation-metadata-store";
import type { PluginSpec } from "#/api/conversation-service/agent-server-conversation-service.types";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";

/**
 * Plugins explicitly attached to the active conversation at creation, read from
 * client-side conversation metadata. Empty when none are attached or when used
 * outside a conversation route. The agent-server doesn't return a live
 * conversation's loaded plugins, so this is the available source today.
 */
export function useConversationPlugins(): PluginSpec[] {
  const { conversationId } = useOptionalConversationId();
  return useMemo(() => {
    if (!conversationId) return [];
    return getStoredConversationMetadata(conversationId)?.plugins ?? [];
  }, [conversationId]);
}
