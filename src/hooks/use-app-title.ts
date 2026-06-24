import { useUserConversation } from "#/hooks/query/use-user-conversation";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { getAgentStateEmoji } from "#/utils/agent-state-emoji";
import { useNavigation } from "#/context/navigation-context";

const APP_TITLE = "OpenHands";

export const useAppTitle = () => {
  // Read conversationId from the shared navigation context rather than a
  // `useParams` router subscription (equivalent value; one fewer router hook).
  const { conversationId } = useNavigation();
  const { data: conversation } = useUserConversation(conversationId ?? null);
  const liveExecutionStatus = useConversationStateStore(
    (state) => state.execution_status,
  );

  const conversationTitle = conversation?.title;
  const baseTitle =
    conversationId && conversationTitle
      ? `${conversationTitle} | ${APP_TITLE}`
      : APP_TITLE;

  if (!conversationId) {
    return baseTitle;
  }

  const executionStatus =
    liveExecutionStatus ?? conversation?.execution_status ?? null;
  const emoji = getAgentStateEmoji(executionStatus);

  return emoji ? `${emoji} ${baseTitle}` : baseTitle;
};
