import React from "react";
import { useTranslation } from "react-i18next";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useSettings } from "#/hooks/query/use-settings";
import { useSkills } from "#/hooks/query/use-skills";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SkillCard } from "#/components/features/skills/skill-card";
import { SkillsToolbar } from "#/components/features/skills/skills-toolbar";
import type { SkillTypeFilter } from "#/components/features/skills/skill-type-filter";
import { I18nKey } from "#/i18n/declaration";
import { Typography } from "#/ui/typography";
import InfoCircleIcon from "#/icons/info-circle.svg?react";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import type { SkillInfo } from "#/types/settings";

function matchesSearch(skill: SkillInfo, query: string): boolean {
  if (!query) return true;
  const haystacks = [
    skill.name,
    skill.description ?? "",
    skill.license ?? "",
    skill.compatibility ?? "",
    ...(skill.triggers ?? []),
    ...(skill.allowed_tools ?? []),
  ];
  const lowered = query.toLowerCase();
  return haystacks.some((value) => value.toLowerCase().includes(lowered));
}

function SkillsSettingsScreen() {
  const { t } = useTranslation("openhands");

  const { mutate: saveSettings, isPending } = useSaveSettings();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: skills, isLoading: skillsLoading } = useSkills();

  const [disabledSet, setDisabledSet] = React.useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<SkillTypeFilter>("all");

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

  const sortedSkills = React.useMemo(() => {
    if (!skills) return [];
    return [...skills].sort((a, b) => a.name.localeCompare(b.name));
  }, [skills]);

  const filteredSkills = React.useMemo(
    () =>
      sortedSkills.filter((skill) => {
        const typeMatch = typeFilter === "all" || skill.type === typeFilter;
        return typeMatch && matchesSearch(skill, searchQuery.trim());
      }),
    [sortedSkills, searchQuery, typeFilter],
  );

  const totalSkills = sortedSkills.length;
  const shownSkills = filteredSkills.length;

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
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-32 rounded-2xl border border-border bg-surface-card animate-pulse"
              />
            ))}
          </div>
        )}

        {!isLoading && totalSkills === 0 && (
          <p className="text-sm text-content-muted">
            {t(I18nKey.SETTINGS$SKILLS_NO_SKILLS)}
          </p>
        )}

        {!isLoading && totalSkills > 0 && (
          <>
            <SkillsToolbar
              search={searchQuery}
              onSearchChange={setSearchQuery}
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
              shown={shownSkills}
              total={totalSkills}
            />

            {shownSkills === 0 ? (
              <p
                data-testid="skills-no-match"
                className="text-sm text-content-muted"
              >
                {t(I18nKey.SETTINGS$SKILLS_NO_MATCH)}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {filteredSkills.map((skill) => (
                  <SkillCard
                    key={skill.name}
                    skill={skill}
                    enabled={!disabledSet.has(skill.name)}
                    onToggle={(enabled) => handleToggle(skill.name, enabled)}
                  />
                ))}
              </div>
            )}
          </>
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
