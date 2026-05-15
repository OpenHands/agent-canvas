import { useTranslation } from "react-i18next";
import { ExtensionsNavigation } from "#/components/features/skills/extensions-navigation";
import { I18nKey } from "#/i18n/declaration";

export default function SkillsPluginsScreen() {
  const { t } = useTranslation("openhands");

  return (
    <div data-testid="skills-plugins-screen" className="flex h-full gap-10">
      <ExtensionsNavigation />
      <section className="flex-1 min-w-0 overflow-auto custom-scrollbar-always pr-[14px] pt-8">
        <div className="min-w-0 space-y-1 mb-4">
          <h2 className="text-xl font-semibold leading-6 text-foreground">
            {t(I18nKey.SETTINGS$PLUGINS_TITLE)}
          </h2>
          <div className="max-w-2xl text-sm text-tertiary-light">
            {t(I18nKey.SETTINGS$PLUGINS_DESCRIPTION)}
          </div>
        </div>
      </section>
    </div>
  );
}
