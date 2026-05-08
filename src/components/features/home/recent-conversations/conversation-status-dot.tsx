import { useTranslation } from "react-i18next";
import { V1ExecutionStatus } from "#/types/v1/core/base/common";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";

interface ConversationStatusDotProps {
  executionStatus: V1ExecutionStatus | null | undefined;
}

type Visual = "check" | "working" | "paused" | "error" | "unknown";

const FINISHED_GREEN = "#1FBD53";
const WORKING_GREEN = "#1FBD53";
const PAUSED_GRAY = "#A3A3A3";
const ERROR_RED = "#FF684E";
const UNKNOWN_GRAY = "#3C3C49";

const visualFor = (status: V1ExecutionStatus | null | undefined): Visual => {
  switch (status) {
    case V1ExecutionStatus.FINISHED:
      return "check";
    case V1ExecutionStatus.RUNNING:
      return "working";
    case V1ExecutionStatus.PAUSED:
    case V1ExecutionStatus.IDLE:
    case V1ExecutionStatus.WAITING_FOR_CONFIRMATION:
      return "paused";
    case V1ExecutionStatus.ERROR:
    case V1ExecutionStatus.STUCK:
      return "error";
    default:
      return "unknown";
  }
};

const labelKeyFor = (visual: Visual): string => {
  switch (visual) {
    case "check":
      return "COMMON$FINISHED";
    case "working":
      return "COMMON$WORKING";
    case "paused":
      return "COMMON$PAUSED";
    case "error":
      return "COMMON$ERROR";
    default:
      return "COMMON$STOPPED";
  }
};

export function ConversationStatusDot({
  executionStatus,
}: ConversationStatusDotProps) {
  const { t } = useTranslation("openhands");

  const visual = visualFor(executionStatus);
  const label = t(labelKeyFor(visual));

  // Fixed 10x10 box so all variants share the same footprint and avoid layout
  // shift when the agent transitions between states.
  const indicator = (() => {
    switch (visual) {
      case "check":
        return (
          <svg
            data-testid="conversation-status-check"
            viewBox="0 0 12 12"
            className="w-2.5 h-2.5"
            fill="none"
            stroke={FINISHED_GREEN}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2.5 6.5 5 9l4.5-5.5" />
          </svg>
        );
      case "working":
        return (
          <span
            data-testid="conversation-status-working"
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: WORKING_GREEN }}
          />
        );
      case "paused":
        return (
          <span
            data-testid="conversation-status-paused"
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: PAUSED_GRAY }}
          />
        );
      case "error":
        return (
          <span
            data-testid="conversation-status-error"
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: ERROR_RED }}
          />
        );
      default:
        return (
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: UNKNOWN_GRAY }}
          />
        );
    }
  })();

  return (
    <StyledTooltip
      content={label}
      placement="right"
      showArrow
      tooltipClassName="bg-[#1a1a1a] text-white text-xs shadow-lg"
    >
      <div className="w-2.5 h-2.5 flex items-center justify-center shrink-0">
        {indicator}
      </div>
    </StyledTooltip>
  );
}
