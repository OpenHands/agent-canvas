import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

interface ActiveStatusBadgeProps {
  active: boolean;
}

export function ActiveStatusBadge({ active }: ActiveStatusBadgeProps) {
  const { t } = useTranslation("openhands");

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
        active
          ? "bg-success/20 text-success"
          : "bg-neutral-700 text-neutral-400"
      }`}
    >
      {active
        ? t(I18nKey.AUTOMATIONS$DETAIL$ACTIVE)
        : t(I18nKey.AUTOMATIONS$DETAIL$INACTIVE)}
    </span>
  );
}
