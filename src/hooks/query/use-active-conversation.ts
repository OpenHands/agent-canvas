import { useEffect } from "react";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useUserConversation } from "./use-user-conversation";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import { isExecutionActive } from "#/utils/status";

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
    // Poll at 3 s while the sandbox URL is absent OR while the sandbox is
    // PAUSED. A paused sandbox still carries the old conversation_url (it isn't
    // cleared), so checking only for a missing URL would leave us on the slow
    // 30 s interval while the sandbox is waking up after a resume call.
    //
    // Also fast-poll while the conversation has no title yet but the agent is
    // still actively executing. The title is generated asynchronously shortly
    // after the conversation starts — by then conversation_url is already set,
    // so without this the header title would only refresh on the slow 30 s tick
    // (issue #1508). Gating on isExecutionActive bounds the fast poll to the
    // window where a title can still appear, so terminal/paused conversations
    // that never received a title don't poll at 3 s forever.
    (query) => {
      const data = query.state.data;
      if (
        data &&
        (!data.conversation_url ||
          data.sandbox_status === "PAUSED" ||
          (!data.title && isExecutionActive(data.execution_status)))
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
