import i18n from "i18next";
import { consumePendingTaskAttachments } from "#/stores/pending-task-attachments-store";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { sendMessageWithAttachments } from "#/utils/send-message-with-attachments";

/**
 * Sends attachments queued during cloud start-task provisioning once the
 * real conversation UUID is available.
 */
export async function flushPendingTaskAttachments(
  taskId: string,
  conversationId: string,
): Promise<void> {
  const pending = consumePendingTaskAttachments(taskId);
  if (!pending) {
    return;
  }

  try {
    const sent = await sendMessageWithAttachments({
      conversationId,
      content: pending.content,
      images: pending.images,
      files: pending.files,
      imagesMarkedUploadAsFile: pending.imagesMarkedUploadAsFile,
      t: i18n.getFixedT(null, "openhands"),
    });

    useOptimisticUserMessageStore.getState().enqueuePendingMessage({
      conversationId,
      text: sent.text,
      content: sent.content,
      imageUrls: sent.imageUrls,
      fileUrls: sent.fileUrls,
      timestamp: sent.timestamp,
    });
  } catch (error) {
    displayErrorToast(error instanceof Error ? error.message : null);
    throw error;
  }
}
