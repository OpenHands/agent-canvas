import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

export function EmptyState() {
  const { t } = useTranslation("openhands");

  return (
    <div className="rounded-md p-4 text-center">
      <p className="text-[var(--oh-muted)]">
        {t(I18nKey.CONVERSATION$NO_METRICS)}
      </p>
    </div>
  );
}
