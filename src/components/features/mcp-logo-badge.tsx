import type { ReactNode } from "react";
import { Puzzle } from "lucide-react";
import type { MarketplaceEntry } from "#/constants/mcp-marketplace";
import { cn } from "#/utils/utils";

type McpLogoEntry = Pick<
  MarketplaceEntry,
  "name" | "logo" | "iconBg" | "iconColor"
>;

interface McpLogoBadgeProps {
  entry?: McpLogoEntry | null;
  size?: "sm" | "md";
  className?: string;
  fallback?: ReactNode;
}

const sizeClassNames = {
  sm: "h-5 w-5 rounded-md [&>svg]:h-3 [&>svg]:w-3",
  md: "h-10 w-10 rounded-lg [&>svg]:h-5 [&>svg]:w-5",
};

export function McpLogoBadge({
  entry,
  size = "md",
  className,
  fallback,
}: McpLogoBadgeProps) {
  return (
    <span
      aria-hidden="true"
      title={entry?.name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        "border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
        sizeClassNames[size],
        className,
      )}
      style={{
        backgroundColor: entry?.iconBg ?? "var(--oh-color-tertiary)",
        color: entry?.iconColor ?? "#FFFFFF",
      }}
    >
      {entry?.logo ?? fallback ?? <Puzzle strokeWidth={2.25} />}
    </span>
  );
}
