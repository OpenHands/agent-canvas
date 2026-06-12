import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import XMarkIcon from "#/icons/x-mark.svg?react";
import { modalTitleLgMediumClassName } from "#/utils/modal-classes";

interface CancelRunModalProps {
  isOpen: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CancelRunModal({
  isOpen,
  isPending,
  onConfirm,
  onCancel,
}: CancelRunModalProps) {
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
      <div className="relative w-full max-w-sm rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-6">
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 text-muted hover:text-foreground"
          aria-label="Close"
        >
          <XMarkIcon className="size-5" />
        </button>

        <h2 className={modalTitleLgMediumClassName}>
          {t(I18nKey.AUTOMATIONS$DETAIL$CANCEL_RUN)}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {t(I18nKey.AUTOMATIONS$DETAIL$CANCEL_CONFIRM)}
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-[var(--oh-border)] px-4 py-2 text-sm text-white hover:bg-surface-raised"
          >
            {t(I18nKey.AUTOMATIONS$CANCEL)}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-lg bg-danger px-4 py-2 text-sm text-white hover:bg-danger/80 disabled:opacity-50"
          >
            {isPending
              ? "Cancelling..."
              : t(I18nKey.AUTOMATIONS$DETAIL$CANCEL_RUN)}
          </button>
        </div>
      </div>
    </div>
  );
}
