import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { cn } from "#/utils/utils";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";

interface ConversationStatusDotProps {
  executionStatus: ExecutionStatus | null | undefined;
}

const labelKeyFor = (status: ExecutionStatus | null | undefined): string => {
  switch (status) {
    case ExecutionStatus.RUNNING:
    case ExecutionStatus.IDLE:
    case ExecutionStatus.WAITING_FOR_CONFIRMATION:
    case ExecutionStatus.FINISHED:
      return "COMMON$RUNNING";
    case ExecutionStatus.PAUSED:
      return "COMMON$PAUSED";
    case ExecutionStatus.ERROR:
    case ExecutionStatus.STUCK:
      return "COMMON$STOPPED";
    default:
      return "COMMON$STOPPED";
  }
};

export function ConversationStatusDot({
  executionStatus,
}: ConversationStatusDotProps) {
  const { t } = useTranslation("openhands");

  const backgroundColor = useMemo(() => {
    switch (executionStatus) {
      case ExecutionStatus.RUNNING:
      case ExecutionStatus.IDLE:
      case ExecutionStatus.WAITING_FOR_CONFIRMATION:
      case ExecutionStatus.FINISHED:
        return "bg-[#1FBD53]";
      case ExecutionStatus.PAUSED:
        return "bg-[#A3A3A3]";
      case ExecutionStatus.ERROR:
      case ExecutionStatus.STUCK:
        return "bg-[#A3A3A3]";
      default:
        return "bg-[#3C3C49]";
    }
  }, [executionStatus]);

  const label = t(labelKeyFor(executionStatus));

  return (
    <StyledTooltip
      content={label}
      placement="right"
      showArrow
      tooltipClassName="bg-[#1a1a1a] text-white text-xs shadow-lg"
    >
      <div className={cn("w-1.5 h-1.5 rounded-full", backgroundColor)} />
    </StyledTooltip>
  );
}
