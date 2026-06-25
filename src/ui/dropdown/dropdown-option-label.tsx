import React from "react";
import { cn } from "#/utils/utils";
import { HoverMarqueeLabel } from "#/ui/dropdown/hover-marquee-label";
import type { DropdownOption } from "#/ui/dropdown/types";

interface DropdownOptionLabelProps {
  option: Pick<DropdownOption, "label" | "displayLabel" | "suffix">;
  className?: string;
  marqueeClassName?: string;
  suffixClassName?: string;
  marqueeProps?: React.HTMLAttributes<HTMLSpanElement>;
}

export function DropdownOptionLabel({
  option,
  className,
  marqueeClassName,
  suffixClassName,
  marqueeProps,
}: DropdownOptionLabelProps) {
  const marqueeText = option.displayLabel ?? option.label;

  return (
    <span className={cn("flex min-w-0 flex-1 items-center gap-1.5", className)}>
      <HoverMarqueeLabel
        className={cn("min-w-0", marqueeClassName)}
        {...marqueeProps}
      >
        {marqueeText}
      </HoverMarqueeLabel>
      {option.suffix ? (
        <span className={cn("shrink-0", suffixClassName)}>{option.suffix}</span>
      ) : null}
    </span>
  );
}
