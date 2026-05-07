import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import XMarkIcon from "#/icons/x-mark.svg?react";

interface DeleteConfirmationModalProps {
  automationName: string;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmationModal({
  automationName,
  isOpen,
  onConfirm,
  onCancel,
}: DeleteConfirmationModalProps) {
  const { t } = useTranslation("openhands");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        role="presentation"
      />
      <div className="relative w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-800 p-6">
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 text-neutral-400 hover:text-white"
          aria-label="Close"
        >
          <XMarkIcon className="size-5" />
        </button>

        <h2 className="text-lg font-semibold text-white">
          {t(I18nKey.AUTOMATIONS$DELETE_CONFIRM_TITLE)}
        </h2>
        <p className="mt-2 text-sm text-neutral-400">
          {t(I18nKey.AUTOMATIONS$DELETE_CONFIRM_MESSAGE, {
            name: automationName,
          })}
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          >
            {t(I18nKey.AUTOMATIONS$CANCEL)}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
          >
            {t(I18nKey.AUTOMATIONS$DELETE)}
          </button>
        </div>
      </div>
    </div>
  );
}
