import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { patchConversationInCache } from "#/hooks/mutation/conversation-mutation-utils";
import type { WorkOptionalToolId } from "#/types/work-tools";
import { withWorkEnabledOptionalToolIds } from "#/utils/work-conversations";

interface UpdateWorkConversationToolsInput {
  conversationId: string;
  enabledOptionalToolIds: WorkOptionalToolId[];
  conversationUrl?: string | null;
  sessionApiKey?: string | null;
  existingTags?: Record<string, string> | null;
}

export function useUpdateWorkConversationTools() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateWorkConversationToolsInput) =>
      AgentServerConversationService.updateWorkConversationTools(
        input.conversationId,
        input.enabledOptionalToolIds,
        {
          conversationUrl: input.conversationUrl,
          sessionApiKey: input.sessionApiKey,
          existingTags: input.existingTags,
        },
      ),
    onSuccess: (result, input) => {
      const conversationId =
        result.conversationId !== input.conversationId
          ? result.conversationId
          : input.conversationId;
      patchConversationInCache(queryClient, conversationId, {
        tags: withWorkEnabledOptionalToolIds(
          input.existingTags,
          input.enabledOptionalToolIds,
        ),
      });
      if (result.appliedVia === "recreate") {
        queryClient.invalidateQueries({ queryKey: ["user", "conversations"] });
      }
    },
  });
}
