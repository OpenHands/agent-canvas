import type { ReactNode } from "react";
import type { McpCatalogEntry } from "@openhands/extensions/mcps";
import { MCP_FALLBACK_LOGO, MCP_LOGOS } from "@openhands/extensions/mcps/logos";
import { cn } from "#/utils/utils";

type McpLogoEntry = Pick<
  McpCatalogEntry,
  "id" | "name" | "iconBg" | "iconColor"
>;

export type { McpLogoEntry };

interface McpLogoBadgeProps {
  entry?: McpLogoEntry | null;
  size?: "xs" | "sm" | "md";
  className?: string;
  fallback?: ReactNode;
  testId?: string;
}

const sizeClassNames = {
  xs: "h-4 w-4 rounded [&>svg]:h-2.5 [&>svg]:w-2.5",
  sm: "h-5 w-5 rounded-md [&>svg]:h-3 [&>svg]:w-3",
  md: "h-10 w-10 rounded-lg [&>svg]:h-5 [&>svg]:w-5",
};

export function McpLogoBadge({
  entry,
  size = "md",
  className,
  fallback,
  testId,
}: McpLogoBadgeProps) {
  return (
    <span
      aria-hidden="true"
      title={entry?.name}
      data-testid={testId}
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
      {entry
        ? (MCP_LOGOS[entry.id] ?? fallback ?? MCP_FALLBACK_LOGO)
        : (fallback ?? MCP_FALLBACK_LOGO)}
    </span>
  );
}
