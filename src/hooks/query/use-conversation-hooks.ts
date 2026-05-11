import { useQuery } from "@tanstack/react-query";
import type { HookEvent } from "#/api/conversation-service/agent-server-conversation-service.types";
import { useConversationId } from "../use-conversation-id";
import { AgentState } from "#/types/agent-state";
import { useAgentState } from "#/hooks/use-agent-state";

export const useConversationHooks = () => {
  const { conversationId } = useConversationId();
  const { curAgentState } = useAgentState();
  return useQuery({
    queryKey: ["conversation", conversationId, "hooks"],
    queryFn: async () => {
      if (!conversationId) {
        throw new Error("No conversation ID provided");
      }

      return [] as HookEvent[];
    },
    enabled:
      !!conversationId &&
      curAgentState !== AgentState.LOADING &&
      curAgentState !== AgentState.INIT,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15, // 15 minutes
  });
};
