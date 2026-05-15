import React from "react";
import { cn } from "#/utils/utils";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";

interface ContextMenuContainerProps {
  children: React.ReactNode;
  onClose: () => void;
  testId?: string;
  className?: string;
}

export function ContextMenuContainer({
  children,
  onClose,
  testId,
  className,
}: ContextMenuContainerProps) {
  const ref = useClickOutsideElement<HTMLDivElement>(onClose);

  return (
    <div
      ref={ref}
      data-testid={testId}
      className={cn(
        // Base styling
        "absolute rounded-[12px] p-[25px]",
        "bg-[var(--oh-surface-deep)] border border-[var(--oh-border-subtle)]",
        "text-white overflow-hidden z-[9999]",
        "context-menu-box-shadow",
        // Positioning
        "right-0 md:right-auto md:left-full md:bottom-0",
        "w-fit",
        className,
      )}
    >
      <div className="flex flex-row gap-4 items-stretch">{children}</div>
    </div>
  );
}
