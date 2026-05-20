import { useMutation } from "@tanstack/react-query";
import { getAgentServerWorkingDir } from "#/api/agent-server-config";
import { resolveConversationUploadWorkingDir } from "#/api/workspace-upload-path";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useConversationUploadFiles } from "./use-conversation-upload-files";
import { FileUploadSuccessResponse } from "#/api/open-hands.types";

interface UnifiedUploadFilesVariables {
  conversationId: string;
  files: File[];
}

/**
 * Uploads files for the active agent-server conversation.
 */
export const useUnifiedUploadFiles = () => {
  const { data: conversation } = useActiveConversation();

  const conversationUpload = useConversationUploadFiles();

  return useMutation({
    mutationKey: ["unified-upload-files"],
    mutationFn: async (
      variables: UnifiedUploadFilesVariables,
    ): Promise<FileUploadSuccessResponse> => {
      const { conversationId, files } = variables;

      const workingDir = conversation?.workspace?.working_dir?.trim()
        ? conversation.workspace.working_dir.trim()
        : await resolveConversationUploadWorkingDir(
            conversationId,
            conversation,
          );

      return conversationUpload.mutateAsync({
        conversationUrl: conversation?.conversation_url,
        sessionApiKey: conversation?.session_api_key,
        workingDir: workingDir || getAgentServerWorkingDir(),
        files,
      });
    },
    meta: {
      disableToast: true,
    },
  });
};
