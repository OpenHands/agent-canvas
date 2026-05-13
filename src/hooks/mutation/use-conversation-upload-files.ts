import { useMutation } from "@tanstack/react-query";
import { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { FileUploadSuccessResponse } from "#/api/open-hands.types";

interface UploadFilesVariables {
  conversationUrl: string | null | undefined;
  sessionApiKey: string | null | undefined;
  files: File[];
  workingDir?: string | null;
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
      const { conversationUrl, sessionApiKey, files, workingDir } = variables;

      // Resolve the upload directory: use the conversation's current
      // working directory when available, falling back to /workspace.
      const uploadDir = workingDir?.replace(/\/+$/, "") || "/workspace";

      // Upload all files in parallel
      const uploadPromises = files.map(async (file) => {
        const filePath = `${uploadDir}/${file.name}`;
        try {
          await new RemoteWorkspace(
            getAgentServerClientOptions({ conversationUrl, sessionApiKey }),
          ).fileUpload(file, filePath);
          return { success: true as const, fileName: file.name, filePath };
        } catch (error) {
          return {
            success: false as const,
            fileName: file.name,
            filePath,
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
