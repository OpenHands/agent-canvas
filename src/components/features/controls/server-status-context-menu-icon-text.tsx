import { ContextMenuListItem } from "#/components/features/context-menu/context-menu-list-item";
import { formControlTransitionClassName } from "#/utils/form-control-classes";
import { cn } from "#/utils/utils";

interface ServerStatusContextMenuIconTextProps {
  icon: React.ReactNode;
  text: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  testId?: string;
}

export function ServerStatusContextMenuIconText({
  icon,
  text,
  onClick,
  testId,
}: ServerStatusContextMenuIconTextProps) {
  return (
    <ContextMenuListItem testId={testId} onClick={onClick}>
      <div className="flex min-w-0 w-full items-center justify-between gap-2">
        <span className="min-w-0 truncate">{text}</span>
        <span
          className={cn(
            "flex shrink-0 items-center text-[var(--oh-muted)] group-hover:text-[var(--oh-foreground)] group-focus-visible:text-[var(--oh-foreground)] [&_svg]:text-current",
            formControlTransitionClassName,
          )}
          aria-hidden
        >
          {icon}
        </span>
      </div>
    </ContextMenuListItem>
  );
}
