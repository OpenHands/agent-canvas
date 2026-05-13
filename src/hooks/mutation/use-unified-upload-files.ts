import { useMutation } from "@tanstack/react-query";
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
      const { files } = variables;

      // Use conversation URL, session API key, and working directory
      return conversationUpload.mutateAsync({
        conversationUrl: conversation?.conversation_url,
        sessionApiKey: conversation?.session_api_key,
        files,
        workingDir: conversation?.workspace?.working_dir,
      });
    },
    meta: {
      disableToast: true,
    },
  });
};
