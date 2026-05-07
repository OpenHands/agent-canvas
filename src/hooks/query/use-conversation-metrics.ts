import { useQuery } from "@tanstack/react-query";
import V1ConversationService from "#/api/conversation-service/v1-conversation-service.api";
import { getCombinedMetrics } from "#/utils/conversation-metrics";
import type { V1MetricsSnapshot } from "#/api/conversation-service/v1-conversation-service.types";

export const useConversationMetrics = (
  conversationId: string | null | undefined,
  conversationUrl: string | null | undefined,
  sessionApiKey: string | null | undefined,
  enabled: boolean = true,
): {
  data: V1MetricsSnapshot | undefined;
  isLoading: boolean;
  error: unknown;
} => {
  const query = useQuery({
    queryKey: [
      "conversation-metrics",
      conversationId,
      conversationUrl,
      sessionApiKey,
    ],
    queryFn: async () => {
      if (!conversationId) throw new Error("Conversation ID is required");
      const conversationInfo =
        await V1ConversationService.getRuntimeConversation(
          conversationId,
          conversationUrl,
          sessionApiKey,
        );
      return getCombinedMetrics(conversationInfo);
    },
    enabled: enabled && !!conversationId && !!conversationUrl,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 30,
    retry: false,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
};
