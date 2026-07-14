import { useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { SearchInput } from "#/components/features/automations/search-input";
import { RecommendedAutomationsLauncher } from "#/components/features/automations/recommended-automations-launcher";

export default function AutomationsTemplates() {
  const { t } = useTranslation("openhands");
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="min-h-full">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-content">
            {t(I18nKey.AUTOMATIONS$TEMPLATES_TITLE)}
          </h1>
          <p className="text-sm text-muted">
            {t(I18nKey.AUTOMATIONS$TEMPLATES_SUBTITLE)}
          </p>
        </div>

        <div className="mt-6">
          <SearchInput value={searchQuery} onChange={setSearchQuery} />
        </div>

        <div className="mt-6">
          <RecommendedAutomationsLauncher query={searchQuery} />
        </div>
      </div>
    </div>
  );
}
