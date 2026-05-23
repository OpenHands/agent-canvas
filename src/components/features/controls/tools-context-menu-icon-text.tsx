import { cn } from "#/utils/utils";
import { formControlTransitionClassName } from "#/utils/form-control-classes";

interface ToolsContextMenuIconTextProps {
  icon: React.ReactNode;
  text: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
}

export function ToolsContextMenuIconText({
  icon,
  text,
  rightIcon,
  className,
}: ToolsContextMenuIconTextProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 w-full items-center justify-between gap-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "flex shrink-0 items-center text-[var(--oh-muted)] group-hover:text-[var(--oh-foreground)] group-focus-visible:text-[var(--oh-foreground)] [&_svg]:text-current",
            formControlTransitionClassName,
          )}
          aria-hidden
        >
          {icon}
        </span>
        <span className="text-sm font-normal leading-5">{text}</span>
      </div>
      {rightIcon ? (
        <span
          className={cn(
            "flex shrink-0 items-center text-[var(--oh-muted)] group-hover:text-[var(--oh-foreground)] group-focus-visible:text-[var(--oh-foreground)] [&_svg]:text-current",
            formControlTransitionClassName,
          )}
          aria-hidden
        >
          {rightIcon}
        </span>
      ) : null}
    </div>
  );
}
