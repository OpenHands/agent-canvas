import { StyledTooltip } from "./styled-tooltip";

interface TrajectoryActionButtonProps {
  testId?: string;
  onClick: () => void;
  icon: React.ReactNode;
  tooltip?: string;
}

export function TrajectoryActionButton({
  testId,
  onClick,
  icon,
  tooltip,
}: TrajectoryActionButtonProps) {
  const button = (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex items-center justify-center w-[26px] h-[26px] rounded-lg cursor-pointer bg-[var(--oh-surface)] hover:bg-tertiary"
    >
      {icon}
    </button>
  );

  if (tooltip) {
    return (
      <StyledTooltip
        closeDelay={100}
        content={tooltip}
        tooltipClassName="bg-white text-black hover:bg-transparent"
      >
        {button}
      </StyledTooltip>
    );
  }

  return button;
}
