import { useEffect } from "react";
import { useConversationId } from "#/hooks/use-conversation-id";
import { useUserConversation } from "./use-user-conversation";
import ConversationService from "#/api/conversation-service/conversation-service.api";

export const useActiveConversation = () => {
  const { conversationId } = useConversationId();

  // Task polling is handled by useTaskPolling hook
  const isTaskId = conversationId.startsWith("task-");
  const actualConversationId = isTaskId ? null : conversationId;

  const userConversation = useUserConversation(
    actualConversationId,
    // Poll at 3 s while the sandbox URL is absent (cloud sandbox starting after
    // navigate) so the WebSocket can connect as soon as the URL is available,
    // rather than waiting up to 30 s for the next normal refetch.
    (query) => {
      const data = query.state.data;
      if (data && !data.conversation_url) {
        return 3000;
      }
      return 30000;
    },
  );

  useEffect(() => {
    const conversation = userConversation.data;
    ConversationService.setCurrentConversation(conversation || null);
  }, [
    conversationId,
    userConversation.isFetched,
    userConversation?.data?.execution_status,
  ]);
  return userConversation;
};
