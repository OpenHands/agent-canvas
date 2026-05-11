import React from "react";
import { useTranslation } from "react-i18next";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useSettings } from "#/hooks/query/use-settings";
import { useSkills } from "#/hooks/query/use-skills";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { I18nKey } from "#/i18n/declaration";
import { Typography } from "#/ui/typography";
import InfoCircleIcon from "#/icons/info-circle.svg?react";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

function SkillsSettingsScreen() {
  const { t } = useTranslation("openhands");

  const { mutate: saveSettings, isPending } = useSaveSettings();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: skills, isLoading: skillsLoading } = useSkills();

  // Local state: set of skill names the user has toggled off
  const [disabledSet, setDisabledSet] = React.useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = React.useState(false);

  // Sync local state with server settings when data first arrives
  React.useEffect(() => {
    if (settings?.disabled_skills) {
      setDisabledSet(new Set(settings.disabled_skills));
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
    setHasChanges(true);
  };

  const handleSave = () => {
    saveSettings(
      { disabled_skills: Array.from(disabledSet) },
      {
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
          setHasChanges(false);
        },
        onError: (error) => {
          const errorMessage = retrieveAxiosErrorMessage(error);
          displayErrorToast(errorMessage || t(I18nKey.ERROR$GENERIC));
        },
      },
    );
  };

  const isLoading = settingsLoading || skillsLoading || !settings;

  return (
    <div data-testid="skills-settings-screen" className="flex flex-col h-full">
      <div
        data-testid="skills-settings-description-badge"
        className="flex items-center gap-2 bg-[rgba(31,31,31,0.4)] border border-[#242424] rounded-full px-2.5 py-1 mt-4 mb-4 self-start"
      >
        <InfoCircleIcon width={12} height={12} className="text-[#8c8c8c]" />
        <Typography.Text className="text-[11px] font-medium text-[#8c8c8c] leading-5">
          {t(I18nKey.SETTINGS$SKILLS_DESCRIPTION)}
        </Typography.Text>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar-always">
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
          <div className="flex flex-col gap-4">
            {skills.map((skill) => (
              <div key={skill.name} className="flex flex-col gap-0.5">
                <SettingsSwitch
                  testId={`skill-toggle-${skill.name}`}
                  isToggled={!disabledSet.has(skill.name)}
                  onToggle={(enabled) => handleToggle(skill.name, enabled)}
                >
                  {skill.name}
                </SettingsSwitch>
                {skill.triggers && skill.triggers.length > 0 && (
                  <span className="text-xs text-neutral-500 ml-14">
                    {t(I18nKey.SETTINGS$SKILLS_TRIGGERS, {
                      triggers: skill.triggers.join(", "),
                      interpolation: { escapeValue: false },
                    })}
                  </span>
                )}
                <span className="text-xs text-neutral-500 ml-14">
                  {skill.source} / {skill.type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-6 p-6 justify-end">
        <BrandButton
          testId="skills-save-button"
          variant="primary"
          type="button"
          isDisabled={isPending || !hasChanges}
          onClick={handleSave}
        >
          {!isPending && t(I18nKey.SETTINGS$SAVE_CHANGES)}
          {isPending && t(I18nKey.SETTINGS$SAVING)}
        </BrandButton>
      </div>
    </div>
  );
}

export default SkillsSettingsScreen;
