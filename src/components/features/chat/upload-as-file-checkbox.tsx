import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useConversationStore } from "#/stores/conversation-store";

export function UploadAsFileCheckbox() {
  const { t } = useTranslation("openhands");
  const { uploadImagesAsFiles, setUploadImagesAsFiles } =
    useConversationStore();

  return (
    <label
      htmlFor="upload-images-as-files-checkbox"
      className="flex items-center gap-2 text-xs text-[var(--oh-muted)] cursor-pointer select-none whitespace-nowrap"
    >
      <input
        id="upload-images-as-files-checkbox"
        data-testid="upload-images-as-files-checkbox"
        type="checkbox"
        checked={uploadImagesAsFiles}
        onChange={(e) => setUploadImagesAsFiles(e.target.checked)}
        className="h-3.5 w-3.5 flex-shrink-0"
      />
      <span>{t(I18nKey.CHAT_INTERFACE$UPLOAD_IMAGES_AS_FILES)}</span>
    </label>
  );
}
