import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import ExclamationCircleIcon from "#/icons/exclamation-circle.svg?react";

interface ErrorStateProps {
  onRetry: () => void;
}

export function ErrorState({ onRetry }: ErrorStateProps) {
  const { t } = useTranslation("openhands");

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <ExclamationCircleIcon className="size-12 text-red-400" />
      <p className="mt-4 text-sm text-neutral-400">
        {t(I18nKey.AUTOMATIONS$ERROR_TITLE)}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-lg border border-neutral-600 px-4 py-2 text-sm text-white hover:bg-neutral-700"
      >
        {t(I18nKey.AUTOMATIONS$ERROR_RETRY)}
      </button>
    </div>
  );
}
