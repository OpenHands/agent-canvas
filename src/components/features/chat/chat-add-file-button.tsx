import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

export interface ChatAddFileButtonProps {
  handleFileIconClick: () => void;
  disabled?: boolean;
}

export function ChatAddFileButton({
  handleFileIconClick,
  disabled = false,
}: ChatAddFileButtonProps) {
  const { t } = useTranslation("openhands");

  return (
    <button
      type="button"
      className={cn(
        "relative shrink-0 size-6 rounded-full transition-colors",
        disabled
          ? "cursor-not-allowed text-[var(--oh-text-subtle)]"
          : "cursor-pointer text-[var(--oh-muted)] hover:text-white hover:bg-white/10",
      )}
      aria-label={t(I18nKey.CHAT_INTERFACE$ADD_FILE)}
      data-testid="paperclip-icon"
      onClick={handleFileIconClick}
      disabled={disabled}
    >
      <span className="flex h-full w-full items-center justify-center">
        <Plus className="h-[13px] w-[13px] shrink-0" strokeWidth={2} />
      </span>
    </button>
  );
}
