import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { MODAL_ICON_BUTTON_CLASS } from "#/components/shared/modals/modal-icon-button-class";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
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
    <ModalBackdrop
      onClose={onClose}
      aria-label={t(I18nKey.AUTOMATIONS$EMPTY_HOW_TO_CREATE_TITLE)}
    >
      <div
        data-testid="add-automation-modal"
        className="flex w-full max-w-lg flex-col rounded-xl border border-[var(--oh-border)] bg-base-secondary"
      >
        <header className="flex flex-shrink-0 items-start justify-between gap-4 px-6 pb-4 pt-6">
          <h2
            id="add-automation-modal-title"
            className="text-lg font-semibold text-white"
          >
            {t(I18nKey.AUTOMATIONS$EMPTY_HOW_TO_CREATE_TITLE)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={cn(MODAL_ICON_BUTTON_CLASS, "shrink-0")}
            data-testid="add-automation-modal-close"
            aria-label={t(I18nKey.BUTTON$CLOSE)}
          >
            <X size={20} aria-hidden />
          </button>
        </header>
        <div className="px-6 pb-6">
          <CreateInstructionsContent onLaunch={onClose} />
        </div>
      </div>
    </ModalBackdrop>
  );
}
