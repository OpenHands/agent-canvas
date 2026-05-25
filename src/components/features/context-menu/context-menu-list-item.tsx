import { cn } from "#/utils/utils";

interface ContextMenuListItemProps {
  testId?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  isDisabled?: boolean;
  className?: string;
}

export function ContextMenuListItem({
  children,
  testId,
  onClick,
  isDisabled,
  className,
}: React.PropsWithChildren<ContextMenuListItemProps>) {
  return (
    <button
      data-testid={testId || "context-menu-list-item"}
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        "group w-full cursor-pointer rounded px-2 py-2 text-start text-nowrap text-sm font-normal",
        "text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)]",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
        className,
      )}
    >
      {children}
    </button>
  );
}
