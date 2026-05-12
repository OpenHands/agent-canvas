import React from "react";
import { useTranslation } from "react-i18next";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useSettings } from "#/hooks/query/use-settings";
import { useSkills } from "#/hooks/query/use-skills";
import { ExtensionsNavigation } from "#/components/features/skills/extensions-navigation";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

function SkillsSettingsScreen() {
  const { t } = useTranslation("openhands");

  const { mutate: saveSettings } = useSaveSettings();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: skills, isLoading: skillsLoading } = useSkills();

  // Local state: set of skill names the user has toggled off
  const [disabledSet, setDisabledSet] = React.useState<Set<string>>(new Set());
  const [hasHydratedInitialSettings, setHasHydratedInitialSettings] =
    React.useState(false);

  // Sync local state with server settings when data first arrives
  React.useEffect(() => {
    if (settings?.disabled_skills) {
      setDisabledSet(new Set(settings.disabled_skills));
      setHasHydratedInitialSettings(true);
    }
  }, [settings?.disabled_skills]);

  const handleToggle = (skillName: string, enabled: boolean) => {
    setDisabledSet((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.delete(skillName);
      } else {
        next.add(skillName);
      }
      return next;
    });
  };

  // Auto-save skill toggles once initial settings are loaded.
  React.useEffect(() => {
    if (!hasHydratedInitialSettings) {
      return;
    }

    saveSettings(
      { disabled_skills: Array.from(disabledSet) },
      {
        onError: (error) => {
          const errorMessage = retrieveAxiosErrorMessage(error);
          displayErrorToast(errorMessage || t(I18nKey.ERROR$GENERIC));
        },
      },
    );
  }, [disabledSet, hasHydratedInitialSettings, saveSettings, t]);

  const isLoading = settingsLoading || skillsLoading || !settings;

  return (
    <div
      data-testid="skills-settings-screen"
      className="flex h-full gap-10"
    >
      <ExtensionsNavigation />
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-auto custom-scrollbar-always pr-[14px] pt-8">
        <div className="max-w-5xl flex flex-col gap-8">
        <div className="min-w-0 space-y-1 mb-4">
          <h2 className="text-xl font-semibold leading-6 text-foreground">
            Skills
          </h2>
          <div className="max-w-2xl text-sm text-tertiary-light">
            Discover skills to add to your workspace. Open a card for prompts,
            curl, and install flows. Search from the sidebar to filter the list.
            Enable or disable default skills. Disabled skills will not be loaded
            into agent context.
          </div>
        </div>

        <div className="flex-1">
          {isLoading && (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-8 w-64 rounded bg-tertiary animate-pulse"
                />
              ))}
            </div>
          )}

          {!isLoading && (!skills || skills.length === 0) && (
            <p className="text-sm text-tertiary">
              {t(I18nKey.SETTINGS$SKILLS_NO_SKILLS)}
            </p>
          )}

          {!isLoading && skills && skills.length > 0 && (
            <div className="flex flex-col gap-3">
              {skills.map((skill) => (
                <div
                  key={skill.name}
                  className="flex flex-col gap-2 rounded-xl border border-tertiary bg-base-secondary p-4 transition-colors hover:border-primary/60 hover:bg-base-tertiary/30"
                >
                  <SettingsSwitch
                    testId={`skill-toggle-${skill.name}`}
                    isToggled={!disabledSet.has(skill.name)}
                    onToggle={(enabled) => handleToggle(skill.name, enabled)}
                    togglePosition="right"
                  >
                    {skill.name}
                  </SettingsSwitch>
                  {skill.triggers && skill.triggers.length > 0 && (
                    <span className="text-xs text-neutral-500">
                      {t(I18nKey.SETTINGS$SKILLS_TRIGGERS, {
                        triggers: skill.triggers.join(", "),
                        interpolation: { escapeValue: false },
                      })}
                    </span>
                  )}
                  <span className="text-xs text-neutral-500">
                    {skill.source} / {skill.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        </div>
      </div>
    </div>
  );
}

export default SkillsSettingsScreen;
