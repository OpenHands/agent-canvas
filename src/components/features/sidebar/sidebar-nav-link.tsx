import React from "react";
import { NavigationLink } from "#/components/shared/navigation-link";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { cn } from "#/utils/utils";

interface SidebarNavLinkProps {
  to: string;
  label: string;
  end?: boolean;
  indent?: boolean;
  testId?: string;
  disabled?: boolean;
  icon?: React.ReactElement;
  /**
   * When true, render only the icon (label is shown via a hover tooltip
   * floating to the side). Used by the collapsed sidebar.
   */
  collapsed?: boolean;
  /**
   * Optional rich-content node shown in the hover tooltip instead of the
   * plain label. Useful for rendering an "expanded version" of the item
   * while the sidebar is collapsed.
   */
  hoverContent?: React.ReactNode;
}

function getLayoutClasses(collapsed: boolean, indent: boolean): string {
  if (collapsed) return "justify-center w-10 h-10 p-0 mx-auto";
  if (indent) return "pl-7 pr-3 py-1.5 w-full";
  return "px-3 py-2 w-full";
}

export function SidebarNavLink({
  to,
  label,
  end = false,
  indent = false,
  testId,
  disabled = false,
  icon,
  collapsed = false,
  hoverContent,
}: SidebarNavLinkProps) {
  const link = (
    <NavigationLink
      to={to}
      end={end}
      data-testid={testId}
      tabIndex={disabled ? -1 : 0}
      aria-label={collapsed ? label : undefined}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
        }
      }}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-md transition-colors",
          "text-sm leading-5 truncate",
          getLayoutClasses(collapsed, indent),
          isActive
            ? "bg-[#1f1f1f99] text-white font-medium"
            : "text-[#8C8C8C] hover:text-white hover:bg-[#1f1f1f99]",
          disabled && "pointer-events-none opacity-50",
        )
      }
    >
      {icon ? (
        <span className="shrink-0 flex items-center justify-center">
          {icon}
        </span>
      ) : null}
      {!collapsed && <span className="truncate">{label}</span>}
    </NavigationLink>
  );

  if (!collapsed) return link;

  return (
    <StyledTooltip
      content={hoverContent ?? label}
      placement="right"
      tooltipClassName={
        hoverContent ? "p-0 bg-[#1f2228] text-white" : undefined
      }
    >
      {link}
    </StyledTooltip>
  );
}
