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
}

export function ConfigurationSection({
  automation,
}: ConfigurationSectionProps) {
  const { t } = useTranslation("openhands");

  let scheduleDisplay = automation.trigger.schedule ?? "";
  if (automation.trigger.schedule_human) {
    scheduleDisplay = automation.timezone
      ? `${automation.trigger.schedule_human} (${automation.timezone})`
      : automation.trigger.schedule_human;
  }

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
          {automation.llm_profile ?? "Active profile"}
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
