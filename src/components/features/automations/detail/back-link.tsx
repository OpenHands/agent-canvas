import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { NavigationLink } from "#/components/shared/navigation-link";
import ChevronLeftIcon from "#/icons/chevron-left.svg?react";

export function BackLink() {
  const { t } = useTranslation("openhands");

  return (
    <NavigationLink
      to="/automations"
      className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-200"
    >
      <ChevronLeftIcon className="size-4" />
      {t(I18nKey.AUTOMATIONS$DETAIL$BACK_TO_LIST)}
    </NavigationLink>
  );
}
