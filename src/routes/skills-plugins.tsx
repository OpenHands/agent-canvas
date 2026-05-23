import { useTranslation } from "react-i18next";
import { ExtensionsNavigation } from "#/components/features/skills/extensions-navigation";
import { I18nKey } from "#/i18n/declaration";
import { settingsLikeMainScrollClassName } from "#/utils/settings-like-page-layout-classes";

export default function SkillsPluginsScreen() {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid="skills-plugins-screen"
      className="flex h-full gap-4 md:gap-6 md:pl-8 lg:gap-10 lg:pl-10"
    >
      <ExtensionsNavigation />
      <main className={settingsLikeMainScrollClassName}>
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
