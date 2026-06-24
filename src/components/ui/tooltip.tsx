"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type React from "react";
import { cn } from "#/utils/utils";

// Thin wrapper over Base UI's Tooltip primitive, adapted from the coss/ui
// registry component (coss.com/ui) to this repo's `cn` and token conventions.
// Replaces the previous @heroui/react Tooltip. Styling is left to callers
// (see StyledTooltip) so the existing per-tooltip look is preserved.

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;

export type TooltipSide = NonNullable<
  TooltipPrimitive.Positioner.Props["side"]
>;
export type TooltipAlign = NonNullable<
  TooltipPrimitive.Positioner.Props["align"]
>;

export function TooltipTrigger(
  props: TooltipPrimitive.Trigger.Props,
): React.ReactElement {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

export function TooltipPopup({
  className,
  side = "top",
  align = "center",
  sideOffset = 4,
  showArrow = false,
  children,
  portalProps,
  ...props
}: TooltipPrimitive.Popup.Props & {
  side?: TooltipSide;
  align?: TooltipAlign;
  sideOffset?: number;
  showArrow?: boolean;
  portalProps?: TooltipPrimitive.Portal.Props;
}): React.ReactElement {
  return (
    <TooltipPrimitive.Portal {...portalProps}>
      <TooltipPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        className="z-[9999]"
        data-slot="tooltip-positioner"
      >
        <TooltipPrimitive.Popup
          className={cn(
            "origin-(--transform-origin) rounded-md text-xs shadow-md transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0",
            className,
          )}
          data-slot="tooltip-popup"
          {...props}
        >
          {showArrow && (
            // Inherits the popup's resolved background so solid-color tooltips
            // get a matching arrow without threading a separate color prop.
            <TooltipPrimitive.Arrow
              data-slot="tooltip-arrow"
              className="size-2 rotate-45 rounded-[1px] bg-inherit data-[side=bottom]:-top-1 data-[side=top]:-bottom-1 data-[side=left]:-right-1 data-[side=right]:-left-1"
            />
          )}
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
