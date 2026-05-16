import { useTranslation } from "react-i18next";
import { ExtensionsNavigation } from "#/components/features/skills/extensions-navigation";
import { I18nKey } from "#/i18n/declaration";

export default function SkillsPluginsScreen() {
  const { t } = useTranslation("openhands");

  return (
    <div data-testid="skills-plugins-screen" className="flex h-full gap-10">
      <ExtensionsNavigation />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto custom-scrollbar-always pr-[14px] pt-8 pb-12">
        <div className="mx-auto w-full min-w-0 max-w-[800px]">
          <div className="mb-4 min-w-0 space-y-1">
            <h2 className="text-xl font-semibold leading-6 text-foreground">
              {t(I18nKey.SETTINGS$PLUGINS_TITLE)}
            </h2>
            <div className="max-w-2xl text-sm text-tertiary-light">
              {t(I18nKey.SETTINGS$PLUGINS_DESCRIPTION)}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
