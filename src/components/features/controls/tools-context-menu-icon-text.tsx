import { cn } from "#/utils/utils";

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
        "flex items-center justify-between p-2 hover:bg-[var(--oh-interactive-hover)] rounded",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-normal leading-5">{text}</span>
      </div>
      {rightIcon && <div className="flex items-center">{rightIcon}</div>}
    </div>
  );
}
