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
    // Poll at 3 s while the sandbox URL is absent OR while the sandbox is
    // PAUSED. A paused sandbox still carries the old conversation_url (it isn't
    // cleared), so checking only for a missing URL would leave us on the slow
    // 30 s interval while the sandbox is waking up after a resume call.
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
  ]);
  return userConversation;
};
