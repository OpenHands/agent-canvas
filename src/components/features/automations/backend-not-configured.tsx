import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import ExclamationCircleIcon from "#/icons/exclamation-circle.svg?react";

interface BackendUnavailableProps {
  onRetry: () => void;
}

export function BackendUnavailable({ onRetry }: BackendUnavailableProps) {
  const { t } = useTranslation("openhands");

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <ExclamationCircleIcon className="size-12 text-[var(--oh-warning)]" />
      <h2 className="mt-4 text-lg font-semibold text-content">
        {t(I18nKey.AUTOMATIONS$BACKEND_UNAVAILABLE_TITLE)}
      </h2>
      <p className="mt-2 text-sm text-muted text-center max-w-md">
        {t(I18nKey.AUTOMATIONS$BACKEND_UNAVAILABLE_MESSAGE)}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-lg border border-[var(--oh-border)] px-4 py-2 text-sm text-white hover:bg-surface-raised"
      >
        {t(I18nKey.AUTOMATIONS$BACKEND_UNAVAILABLE_RETRY)}
      </button>
    </div>
  );
}

// Keep old export name for backward compatibility
export { BackendUnavailable as BackendNotConfigured };
