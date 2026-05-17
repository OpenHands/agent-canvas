import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { Automation } from "#/types/automation";
import CogIcon from "#/icons/cog.svg?react";
import GitBranchIcon from "#/icons/git-branch.svg?react";
import CheckCircleIcon from "#/icons/check-circle.svg?react";
import CalendarIcon from "#/icons/calendar.svg?react";
import SparkleIcon from "#/icons/sparkle.svg?react";
import BellIcon from "#/icons/bell.svg?react";
import { SectionCard } from "./section-card";
import { ConfigField } from "./config-field";
import { BranchBadge } from "./branch-badge";

interface ConfigurationSectionProps {
  automation: Automation;
  llmProfiles?: { name: string; model?: string | null }[];
  isUpdatingLlmProfile?: boolean;
  onLlmProfileChange?: (profileName: string | null) => void;
}

export function ConfigurationSection({
  automation,
  llmProfiles = [],
  isUpdatingLlmProfile = false,
  onLlmProfileChange,
}: ConfigurationSectionProps) {
  const { t } = useTranslation("openhands");

  let scheduleDisplay = automation.trigger.schedule ?? "";
  if (automation.trigger.schedule_human) {
    scheduleDisplay = automation.timezone
      ? `${automation.trigger.schedule_human} (${automation.timezone})`
      : automation.trigger.schedule_human;
  }

  const selectedLlmProfile = automation.llm_profile ?? "";
  const profileOptions = selectedLlmProfile
    ? [
        ...llmProfiles,
        ...(llmProfiles.some((profile) => profile.name === selectedLlmProfile)
          ? []
          : [{ name: selectedLlmProfile, model: automation.model }]),
      ]
    : llmProfiles;
  const [llmProfileDraft, setLlmProfileDraft] = useState(selectedLlmProfile);
  const profileInputListId = `automation-llm-profiles-${automation.id}`;

  useEffect(() => {
    setLlmProfileDraft(selectedLlmProfile);
  }, [selectedLlmProfile]);

  const saveLlmProfileDraft = () => {
    const nextProfile = llmProfileDraft.trim() || null;
    if ((nextProfile ?? "") !== selectedLlmProfile) {
      onLlmProfileChange?.(nextProfile);
    }
  };

  const triggerDisplay =
    automation.trigger.type === "cron" ? "Schedule" : automation.trigger.type;

  return (
    <SectionCard
      icon={<CogIcon className="size-4" />}
      title={t(I18nKey.AUTOMATIONS$DETAIL$CONFIGURATION)}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        {automation.repository && (
          <ConfigField
            icon={<GitBranchIcon className="size-3.5" />}
            label={t(I18nKey.AUTOMATIONS$DETAIL$REPOSITORIES)}
          >
            <span className="flex items-center gap-1">
              {automation.repository}
              {automation.branch && <BranchBadge branch={automation.branch} />}
            </span>
          </ConfigField>
        )}

        <ConfigField
          icon={<CheckCircleIcon className="size-3.5" />}
          label={t(I18nKey.AUTOMATIONS$DETAIL$TRIGGER)}
        >
          {triggerDisplay}
        </ConfigField>

        <ConfigField
          icon={<CalendarIcon className="size-3.5" />}
          label={t(I18nKey.AUTOMATIONS$DETAIL$SCHEDULE)}
        >
          {scheduleDisplay}
        </ConfigField>

        <ConfigField
          icon={<SparkleIcon className="size-3.5" />}
          label={t(I18nKey.AUTOMATIONS$DETAIL$MODEL)}
        >
          {onLlmProfileChange ? (
            <div className="flex flex-col gap-1">
              <input
                aria-label="Automation LLM profile"
                className="w-full rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-2 py-1 text-sm text-content disabled:opacity-60"
                disabled={isUpdatingLlmProfile}
                list={profileInputListId}
                placeholder="Default profile"
                value={llmProfileDraft}
                onBlur={saveLlmProfileDraft}
                onChange={(event) => setLlmProfileDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
              <datalist id={profileInputListId}>
                {profileOptions.map((profile) => (
                  <option key={profile.name} value={profile.name}>
                    {profile.model ?? profile.name}
                  </option>
                ))}
              </datalist>
              {automation.model && !automation.llm_profile && (
                <span className="text-xs text-muted">
                  {`Default: ${automation.model}`}
                </span>
              )}
            </div>
          ) : (
            (automation.llm_profile ?? automation.model ?? "Default profile")
          )}
        </ConfigField>

        {automation.notification && (
          <ConfigField
            icon={<BellIcon className="size-3.5" />}
            label={t(I18nKey.AUTOMATIONS$DETAIL$NOTIFICATION)}
          >
            {automation.notification}
          </ConfigField>
        )}
      </div>
    </SectionCard>
  );
}
