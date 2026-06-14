import { useCallback } from "react";
import { useTranslation } from "react-i18next";

export type ChatAttachmentUploadOptions = {
  fromPaste?: boolean;
};
import { isFileImage } from "#/utils/is-file-image";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import {
  formatFileValidationError,
  validateFiles,
} from "#/utils/file-validation";
import { processFiles, processImages } from "#/utils/file-processing";
import { useConversationStore } from "#/stores/conversation-store";
import { I18nKey } from "#/i18n/declaration";

/**
 * Shared attachment pipeline for home and conversation chat inputs.
 */
export function useChatAttachmentUpload() {
  const { t } = useTranslation("openhands");
  const {
    images,
    files,
    addImages,
    addFiles,
    addFileLoading,
    removeFileLoading,
    addImageLoading,
    removeImageLoading,
    markImagesAsPasted,
  } = useConversationStore();

  const handleUpload = useCallback(
    async (selectedFiles: File[], _options?: ChatAttachmentUploadOptions) => {
      const validation = validateFiles(selectedFiles, [...images, ...files]);

      if (!validation.isValid) {
        displayErrorToast(formatFileValidationError(validation, t));
        return;
      }

      const validFiles = selectedFiles.filter((f) => !isFileImage(f));
      const validImages = selectedFiles.filter((f) => isFileImage(f));

      if (validImages.length > 0) {
        markImagesAsPasted(validImages.map((image) => image.name));
      }

      validFiles.forEach((file) => addFileLoading(file.name));
      validImages.forEach((image) => addImageLoading(image.name));

      try {
        const [fileResults, imageResults] = await Promise.all([
          processFiles(validFiles),
          processImages(validImages),
        ]);

        if (fileResults.successful.length > 0) {
          addFiles(fileResults.successful);
          fileResults.successful.forEach((file) =>
            removeFileLoading(file.name),
          );
        }

        if (imageResults.successful.length > 0) {
          addImages(imageResults.successful);
          imageResults.successful.forEach((image) =>
            removeImageLoading(image.name),
          );
        }

        fileResults.failed.forEach(({ file, error }) => {
          removeFileLoading(file.name);
          displayErrorToast(
            t(I18nKey.CHAT_INTERFACE$FAILED_TO_PROCESS_FILE, {
              name: file.name,
              error: error.message,
            }),
          );
        });

        imageResults.failed.forEach(({ file, error }) => {
          removeImageLoading(file.name);
          displayErrorToast(
            t(I18nKey.CHAT_INTERFACE$FAILED_TO_PROCESS_IMAGE, {
              name: file.name,
              error: error.message,
            }),
          );
        });
      } catch {
        validFiles.forEach((file) => removeFileLoading(file.name));
        validImages.forEach((image) => removeImageLoading(image.name));
        displayErrorToast(t(I18nKey.CHAT_INTERFACE$FILE_PROCESSING_UNEXPECTED));
      }
    },
    [
      images,
      files,
      t,
      addImages,
      addFiles,
      addFileLoading,
      removeFileLoading,
      addImageLoading,
      removeImageLoading,
      markImagesAsPasted,
    ],
  );

  return { handleUpload };
}
