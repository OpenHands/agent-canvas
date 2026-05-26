import { useMutation } from "@tanstack/react-query";
import { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import {
  buildWorkspaceUploadPath,
  getSafeUploadFileName,
} from "#/api/workspace-upload-path";
import { FileUploadSuccessResponse } from "#/api/open-hands.types";

interface UploadFilesVariables {
  conversationUrl: string | null | undefined;
  sessionApiKey: string | null | undefined;
  workingDir: string;
  files: File[];
}

/**
 * Hook to upload multiple files in parallel to V1 conversations
 * Uploads files concurrently using Promise.allSettled and aggregates results
 *
 * @returns Mutation hook with mutateAsync function
 */
export const useConversationUploadFiles = () =>
  useMutation({
    mutationKey: ["v1-upload-files"],
    mutationFn: async (
      variables: UploadFilesVariables,
    ): Promise<FileUploadSuccessResponse> => {
      const { conversationUrl, sessionApiKey, workingDir, files } = variables;

      const uploadPromises = files.map(async (file) => {
        try {
          const safeName = getSafeUploadFileName(file.name);
          const filePath = buildWorkspaceUploadPath(file.name, workingDir);
          await new RemoteWorkspace(
            getAgentServerClientOptions({
              conversationUrl,
              sessionApiKey,
              workingDir,
            }),
          ).fileUpload(file, filePath);
          return { success: true as const, fileName: safeName, filePath };
        } catch (error) {
          return {
            success: false as const,
            fileName: file.name,
            filePath: buildWorkspaceUploadPath(file.name, workingDir),
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      });

      // Wait for all uploads to complete (both successful and failed)
      const results = await Promise.allSettled(uploadPromises);

      // Aggregate the results
      const uploadedFiles: string[] = [];
      const skippedFiles: { name: string; reason: string }[] = [];

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          if (result.value.success) {
            // Return the absolute file path for V1
            uploadedFiles.push(result.value.filePath);
          } else {
            skippedFiles.push({
              name: result.value.fileName,
              reason: result.value.error,
            });
          }
        } else {
          // Promise was rejected (shouldn't happen since we catch errors above)
          skippedFiles.push({
            name: "unknown",
            reason: result.reason?.message || "Upload failed",
          });
        }
      });

      return {
        uploaded_files: uploadedFiles,
        skipped_files: skippedFiles,
      };
    },
    meta: {
      disableToast: true,
    },
  });
