import { cn } from "#/utils/utils";

interface ContextMenuIconTextProps {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  className?: string;
  iconClassName?: string;
}

export function ContextMenuIconText({
  icon: Icon,
  text,
  className,
  iconClassName,
}: ContextMenuIconTextProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 text-[var(--oh-muted)] transition-colors group-hover:text-[var(--oh-foreground)] group-focus-visible:text-[var(--oh-foreground)]",
          iconClassName,
        )}
      />
      <span className="min-w-0 flex-1 leading-5">{text}</span>
    </div>
  );
}
