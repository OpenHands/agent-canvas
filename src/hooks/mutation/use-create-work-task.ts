import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import WorkRuntimeService from "#/api/work-runtime-service/work-runtime-service.api";
import { isWorkManifestReady } from "#/types/work-manifest";

interface CreateWorkTaskVariables {
  query: string;
}

interface CreateWorkTaskResponse {
  task_id: string;
}

export function useCreateWorkTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["create-work-task"],
    mutationFn: async (
      variables: CreateWorkTaskVariables,
    ): Promise<CreateWorkTaskResponse> => {
      const manifest = await WorkRuntimeService.getManifest();
      if (!isWorkManifestReady(manifest)) {
        throw new Error("Work workspace is not configured");
      }

      const conversation =
        await AgentServerConversationService.createWorkConversation(
          variables.query,
          manifest,
        );

      return {
        task_id: conversation.app_conversation_id ?? conversation.id,
      };
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({
        queryKey: ["user", "conversations"],
      });
    },
  });
}
