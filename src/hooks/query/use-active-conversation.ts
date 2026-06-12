import { useEffect } from "react";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useUserConversation } from "./use-user-conversation";
import ConversationService from "#/api/conversation-service/conversation-service.api";

export const useActiveConversation = () => {
  // Optional: the chat input renders on the home page too (no conversation
  // route yet). The user-conversation query is gated on a real id below.
  const { conversationId } = useOptionalConversationId();

  // Task polling is handled by useTaskPolling hook
  const isTaskId = !!conversationId && conversationId.startsWith("task-");
  const actualConversationId =
    !conversationId || isTaskId ? null : conversationId;

  const userConversation = useUserConversation(
    actualConversationId,
    (query) => {
      const data = query.state.data;
      if (
        data &&
        (!data.conversation_url || data.sandbox_status === "PAUSED")
      ) {
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
    userConversation?.data?.selected_branch,
  ]);
  return userConversation;
};
