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
    style:
      "border-status-success-border bg-status-success-bg text-status-success-text",
  },
  [AutomationRunStatus.FAILED]: {
    label: I18nKey.AUTOMATIONS$DETAIL$FAILED,
    style: "border-status-fail-border bg-status-fail-bg text-status-fail-text",
  },
  [AutomationRunStatus.PENDING]: {
    label: I18nKey.AUTOMATIONS$DETAIL$PENDING,
    style: "border-border bg-surface-elevated text-content-muted",
  },
  [AutomationRunStatus.RUNNING]: {
    label: I18nKey.AUTOMATIONS$DETAIL$RUNNING,
    style: "border-border bg-surface-elevated text-content-muted",
  },
};

function StatusIcon({ status }: { status: AutomationRunStatus }) {
  switch (status) {
    case AutomationRunStatus.COMPLETED:
      return (
        <CheckCircleIcon
          data-testid="run-status-icon-completed"
          className="size-3.5"
        />
      );
    case AutomationRunStatus.FAILED:
      return (
        <XCircleIcon
          data-testid="run-status-icon-failed"
          className="size-3.5"
        />
      );
    default:
      return (
        <ClockIcon data-testid="run-status-icon-pending" className="size-3.5" />
      );
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
