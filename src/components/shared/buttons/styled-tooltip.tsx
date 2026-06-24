import React, { ReactNode } from "react";
import { cn } from "#/utils/utils";
import {
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
  type TooltipSide,
  type TooltipAlign,
} from "#/components/ui/tooltip";

type TooltipPlacement =
  | TooltipSide
  | `${TooltipSide}-start`
  | `${TooltipSide}-end`;

export interface StyledTooltipProps {
  children: ReactNode;
  content: string | ReactNode;
  tooltipClassName?: React.HTMLAttributes<HTMLDivElement>["className"];
  placement?: TooltipPlacement;
  showArrow?: boolean;
  /** Delay before opening, in ms. */
  delay?: number;
  /** Delay before closing, in ms. */
  closeDelay?: number;
  offset?: number;
  /** When true, the tooltip never opens. */
  disabled?: boolean;
  /**
   * Accepted for source compatibility with the previous HeroUI API. Base UI's
   * positioner flips automatically on collision, so this is a no-op.
   */
  shouldFlip?: boolean;
}

// Base UI's Positioner takes a `side` + `align` rather than HeroUI's combined
// `placement` string ("right-start", "top-end", …). Split it back apart.
function parsePlacement(placement: TooltipPlacement): {
  side: TooltipSide;
  align: TooltipAlign;
} {
  const [side, suffix] = placement.split("-") as [
    TooltipSide,
    "start" | "end" | undefined,
  ];
  if (suffix === "start") return { side, align: "start" };
  if (suffix === "end") return { side, align: "end" };
  return { side, align: "center" };
}

function getTooltipTriggerChild(children: ReactNode) {
  if (React.Children.count(children) === 1 && React.isValidElement(children)) {
    return children;
  }
  return <span className="inline-flex">{children}</span>;
}

export function StyledTooltip({
  children,
  content,
  tooltipClassName,
  placement = "right",
  showArrow = false,
  delay,
  closeDelay = 100,
  offset = 7,
  disabled,
}: StyledTooltipProps) {
  const { side, align } = parsePlacement(placement);

  return (
    <Tooltip disabled={disabled}>
      <TooltipTrigger
        delay={delay}
        closeDelay={closeDelay}
        render={getTooltipTriggerChild(children)}
      />
      <TooltipPopup
        side={side}
        align={align}
        sideOffset={offset}
        showArrow={showArrow}
        className={cn(
          "px-2 py-1 font-medium bg-white text-black",
          tooltipClassName,
        )}
      >
        {content}
      </TooltipPopup>
    </Tooltip>
  );
}
