import { IoLockClosed } from "react-icons/io5";
import { Tooltip } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { NavigationLink } from "#/components/shared/navigation-link";
import { I18nKey } from "#/i18n/declaration";

export function SecurityLock() {
  const { t } = useTranslation();

  return (
    <Tooltip
      content={
        <div className="max-w-xs p-2">
          {t(I18nKey.SETTINGS$CONFIRMATION_MODE_LOCK_TOOLTIP)}
        </div>
      }
      placement="top"
    >
      <NavigationLink
        to="/settings"
        className="mr-2 cursor-pointer hover:opacity-80 transition-all"
        aria-label={t(I18nKey.SETTINGS$TITLE)}
      >
        <IoLockClosed size={20} />
      </NavigationLink>
    </Tooltip>
  );
}
