import { Tooltip, type TooltipContentProps } from "@heroui/react";
import React, { ReactNode } from "react";
import { cn } from "#/utils/utils";

export interface StyledTooltipProps {
  children: ReactNode;
  content: string | ReactNode;
  tooltipClassName?: React.HTMLAttributes<HTMLDivElement>["className"];
  placement?: TooltipContentProps["placement"];
  showArrow?: boolean;
  closeDelay?: number;
}

export function StyledTooltip({
  children,
  content,
  tooltipClassName,
  placement = "right",
  showArrow = false,
  closeDelay = 100,
}: StyledTooltipProps) {
  return (
    <Tooltip closeDelay={closeDelay}>
      <Tooltip.Trigger className="inline-flex">{children}</Tooltip.Trigger>
      <Tooltip.Content
        className={cn("bg-white text-black", tooltipClassName)}
        placement={placement}
        showArrow={showArrow}
      >
        {content}
      </Tooltip.Content>
    </Tooltip>
  );
}
