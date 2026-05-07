import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import ExclamationCircleIcon from "#/icons/exclamation-circle.svg?react";
import { BackLink } from "./back-link";

export function NotFoundState() {
  const { t } = useTranslation("openhands");

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <ExclamationCircleIcon className="size-12 text-neutral-400" />
      <p className="mt-4 text-sm font-medium text-neutral-200">
        {t(I18nKey.AUTOMATIONS$DETAIL$NOT_FOUND_TITLE)}
      </p>
      <p className="mt-2 text-sm text-neutral-400">
        {t(I18nKey.AUTOMATIONS$DETAIL$NOT_FOUND_MESSAGE)}
      </p>
      <div className="mt-6">
        <BackLink />
      </div>
    </div>
  );
}
