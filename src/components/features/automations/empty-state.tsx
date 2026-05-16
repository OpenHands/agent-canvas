import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import DatabaseIcon from "#/icons/database.svg?react";
import { CreateInstructions } from "./create-instructions";

export function EmptyState() {
  const { t } = useTranslation("openhands");

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <DatabaseIcon className="size-12 text-muted" />
      <p className="mt-4 text-sm text-muted">{t(I18nKey.AUTOMATIONS$EMPTY)}</p>

      {/* How to create section */}
      <div className="mt-8 flex justify-center">
        <CreateInstructions />
      </div>
    </div>
  );
}
