import type { TFunction } from "i18next";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import type { SendMessageRequest } from "#/api/conversation-service/agent-server-conversation-service.types";
import { convertImageToBase64 } from "#/utils/convert-image-to-base-64";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { validateFiles } from "#/utils/file-validation";

export interface SendMessageWithAttachmentsResult {
  text: string;
  content: string;
  imageUrls: string[];
  fileUrls: string[];
  timestamp: string;
}

export async function sendMessageWithAttachments(options: {
  conversationId: string;
  content: string;
  images: File[];
  files: File[];
  uploadImagesAsFiles: boolean;
  t: TFunction;
}): Promise<SendMessageWithAttachmentsResult> {
  const { conversationId, content, images, files, uploadImagesAsFiles, t } =
    options;

  const imagesToEmbed = uploadImagesAsFiles ? [] : images;
  const filesToUpload = uploadImagesAsFiles ? [...files, ...images] : files;

  const validation = validateFiles([...imagesToEmbed, ...filesToUpload]);
  if (!validation.isValid) {
    throw new Error(validation.errorMessage ?? "Invalid attachments");
  }

  const imageUrls = await Promise.all(
    imagesToEmbed.map((image) => convertImageToBase64(image)),
  );

  const { skipped_files: skippedFiles, uploaded_files: uploadedFiles } =
    filesToUpload.length > 0
      ? await ConversationService.uploadFiles(conversationId, filesToUpload)
      : { skipped_files: [], uploaded_files: [] };

  skippedFiles.forEach((file) => displayErrorToast(file.reason));

  const filePrompt = `${t("CHAT_INTERFACE$AUGMENTED_PROMPT_FILES_TITLE")}: ${uploadedFiles.join("\n\n")}`;
  const prompt =
    uploadedFiles.length > 0 ? `${content}\n\n${filePrompt}` : content;

  const timestamp = new Date().toISOString();

  const messageContent: SendMessageRequest = {
    role: "user",
    content: [{ type: "text", text: prompt }],
  };

  if (imageUrls.length > 0) {
    messageContent.content.push({
      type: "image",
      image_urls: imageUrls,
    });
  }

  await AgentServerConversationService.sendMessage(
    conversationId,
    messageContent,
  );

  return {
    text: content,
    content: prompt,
    imageUrls,
    fileUrls: uploadedFiles,
    timestamp,
  };
}
