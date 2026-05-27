import { cn } from "#/utils/utils";
import { formControlTransitionClassName } from "#/utils/form-control-classes";

interface ConversationNameContextMenuIconTextProps {
  icon: React.ReactNode;
  text: string;
  className?: string;
}

export function ConversationNameContextMenuIconText({
  icon,
  text,
  className,
}: ConversationNameContextMenuIconTextProps) {
  return (
    <div className={cn("flex min-w-0 w-full items-center gap-2", className)}>
      <span
        className={cn(
          "flex shrink-0 items-center text-[var(--oh-muted)] group-hover:text-[var(--oh-foreground)] group-focus-visible:text-[var(--oh-foreground)] [&_svg]:text-current",
          formControlTransitionClassName,
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
    </div>
  );
}
