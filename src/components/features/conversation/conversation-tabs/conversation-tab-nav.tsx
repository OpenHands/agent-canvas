import { ComponentType } from "react";
import { cn } from "#/utils/utils";

type ConversationTabNavProps = {
  tabValue: string;
  icon: ComponentType<{ className: string }>;
  onClick(): void;
  isActive?: boolean;
  label?: string;
  className?: string;
  /** Omit test id (e.g. offscreen width measurement clones). */
  measureOnly?: boolean;
};

export function ConversationTabNav({
  tabValue,
  icon: Icon,
  onClick,
  isActive,
  label,
  className,
  measureOnly,
}: ConversationTabNavProps) {
  return (
    <button
      type="button"
      onClick={() => {
        onClick();
      }}
      {...(measureOnly
        ? {}
        : { "data-testid": `conversation-tab-${tabValue}` as const })}
      data-tab-measure={measureOnly ? "true" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md cursor-pointer",
        "pl-1.5 pr-2 py-1 lg:py-1.5",
        "text-[var(--oh-muted)] bg-transparent",
        isActive && "bg-[var(--oh-interactive-active)] text-white",
        isActive
          ? "hover:text-white hover:bg-[var(--oh-interactive-hover)]"
          : "hover:text-white hover:bg-white/5",
        isActive
          ? "focus-within:text-white"
          : "focus-within:text-[var(--oh-muted)]",
        className,
      )}
    >
      <Icon className={cn("w-5 h-5 text-inherit flex-shrink-0")} />
      {isActive && label && (
        <span className="text-sm font-medium whitespace-nowrap">{label}</span>
      )}
    </button>
  );
}
