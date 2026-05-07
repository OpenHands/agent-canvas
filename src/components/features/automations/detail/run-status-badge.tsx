import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import CheckCircleIcon from "#/icons/check-circle.svg?react";
import XCircleIcon from "#/icons/x-circle.svg?react";
import ClockIcon from "#/icons/clock.svg?react";
import { AutomationRunStatus } from "#/types/automation";

interface RunStatusBadgeProps {
  status: AutomationRunStatus;
}

const statusConfig: Record<
  AutomationRunStatus,
  { label: I18nKey; style: string }
> = {
  [AutomationRunStatus.COMPLETED]: {
    label: I18nKey.AUTOMATIONS$DETAIL$SUCCESSFUL,
    style: "border-success/50 bg-success/10 text-success",
  },
  [AutomationRunStatus.FAILED]: {
    label: I18nKey.AUTOMATIONS$DETAIL$FAILED,
    style: "border-red-500/50 bg-red-500/10 text-red-400",
  },
  [AutomationRunStatus.PENDING]: {
    label: I18nKey.AUTOMATIONS$DETAIL$PENDING,
    style: "border-neutral-600 bg-neutral-700 text-neutral-400",
  },
  [AutomationRunStatus.RUNNING]: {
    label: I18nKey.AUTOMATIONS$DETAIL$RUNNING,
    style: "border-neutral-600 bg-neutral-700 text-neutral-400",
  },
};

function StatusIcon({ status }: { status: AutomationRunStatus }) {
  switch (status) {
    case AutomationRunStatus.COMPLETED:
      return <CheckCircleIcon className="size-3.5" />;
    case AutomationRunStatus.FAILED:
      return <XCircleIcon className="size-3.5" />;
    default:
      return <ClockIcon className="size-3.5" />;
  }
}

export function RunStatusBadge({ status }: RunStatusBadgeProps) {
  const { t } = useTranslation("openhands");
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${config.style}`}
    >
      <StatusIcon status={status} />
      {t(config.label)}
    </span>
  );
}
