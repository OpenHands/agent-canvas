import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import XMarkIcon from "#/icons/x-mark.svg?react";
import { CreateInstructionsContent } from "./create-instructions";

interface AddAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddAutomationModal({
  isOpen,
  onClose,
}: AddAutomationModalProps) {
  const { t } = useTranslation("openhands");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        role="presentation"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-automation-modal-title"
        data-testid="add-automation-modal"
        className="relative w-full max-w-2xl rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)]"
      >
        <div className="flex items-start justify-between gap-4 px-4 pt-4">
          <h2
            id="add-automation-modal-title"
            className="text-sm font-medium text-content"
          >
            {t(I18nKey.AUTOMATIONS$EMPTY_HOW_TO_CREATE_TITLE)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-muted hover:text-foreground"
            aria-label={t(I18nKey.BUTTON$CLOSE)}
          >
            <XMarkIcon className="size-5" />
          </button>
        </div>
        <div className="px-4 pb-4">
          <CreateInstructionsContent />
        </div>
      </div>
    </div>
  );
}
