import { useQuery } from "@tanstack/react-query";
import { loadSkillsForConversation } from "#/api/agent-server-adapter";
import { useConversationId } from "../use-conversation-id";
import { useActiveConversation } from "./use-active-conversation";

export const useConversationSkills = () => {
  const { conversationId } = useConversationId();
  const activeConversation = useActiveConversation().data;
  const executionStatus = activeConversation?.execution_status;

  return useQuery({
    queryKey: ["conversation", conversationId, "skills", activeConversation],
    queryFn: async () => {
      if (!conversationId) {
        throw new Error("No conversation ID provided");
      }

      const data = await loadSkillsForConversation(activeConversation);
      return data.skills;
    },
    enabled: !!executionStatus,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15, // 15 minutes
  });
};
