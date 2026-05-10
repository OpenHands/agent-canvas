import { useTranslation } from "react-i18next";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";

interface ConversationStatusDotProps {
  executionStatus: ExecutionStatus | null | undefined;
  /**
   * Wrap the dot in a tooltip showing the human-readable status label.
   * Disable this when the dot is already nested inside a larger tooltip
   * (e.g. the collapsed-sidebar conversation preview) so the smaller
   * tooltip doesn't intercept the hover.
   */
  showTooltip?: boolean;
}

type Visual = "check" | "working" | "paused" | "error" | "unknown";

const SUCCESS_GREEN = "#1FBD53";
const PAUSED_GRAY = "#A3A3A3";
const ERROR_RED = "#FF684E";
const UNKNOWN_GRAY = "#3C3C49";

const visualFor = (status: ExecutionStatus | null | undefined): Visual => {
  switch (status) {
    case ExecutionStatus.FINISHED:
      return "check";
    case ExecutionStatus.RUNNING:
      return "working";
    case ExecutionStatus.PAUSED:
    case ExecutionStatus.IDLE:
    case ExecutionStatus.WAITING_FOR_CONFIRMATION:
      return "paused";
    case ExecutionStatus.ERROR:
    case ExecutionStatus.STUCK:
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

function renderIndicator(visual: Visual) {
  switch (visual) {
    case "check":
      return (
        <svg
          data-testid="conversation-status-check"
          viewBox="0 0 12 12"
          className="w-2.5 h-2.5"
          fill="none"
          stroke={SUCCESS_GREEN}
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
          style={{ backgroundColor: SUCCESS_GREEN }}
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
          data-testid="conversation-status-unknown"
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: UNKNOWN_GRAY }}
        />
      );
  }
}

export function ConversationStatusDot({
  executionStatus,
  showTooltip = true,
}: ConversationStatusDotProps) {
  const { t } = useTranslation("openhands");

  const visual = visualFor(executionStatus);
  const label = t(labelKeyFor(visual));
  const indicator = renderIndicator(visual);

  const dot = (
    <div className="w-2.5 h-2.5 flex items-center justify-center shrink-0">
      {indicator}
    </div>
  );

  if (!showTooltip) return dot;

  return (
    <StyledTooltip
      content={label}
      placement="right"
      showArrow
      tooltipClassName="bg-[#1a1a1a] text-white text-xs shadow-lg"
    >
      {dot}
    </StyledTooltip>
  );
}
