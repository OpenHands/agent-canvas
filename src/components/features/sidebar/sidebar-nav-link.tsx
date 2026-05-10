import React from "react";
import { NavigationLink } from "#/components/shared/navigation-link";
import { cn } from "#/utils/utils";

interface SidebarNavLinkProps {
  to: string;
  label: string;
  end?: boolean;
  indent?: boolean;
  testId?: string;
  disabled?: boolean;
  icon?: React.ReactElement;
}

export function SidebarNavLink({
  to,
  label,
  end = false,
  indent = false,
  testId,
  disabled = false,
  icon,
}: SidebarNavLinkProps) {
  return (
    <NavigationLink
      to={to}
      end={end}
      data-testid={testId}
      tabIndex={disabled ? -1 : 0}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
        }
      }}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 w-full rounded-md transition-colors",
          "text-sm leading-5 truncate",
          indent ? "pl-7 pr-3 py-1.5" : "px-3 py-2",
          isActive
            ? "bg-[#1f1f1f99] text-white font-medium"
            : "text-[#8C8C8C] hover:text-white hover:bg-[#1f1f1f99]",
          disabled && "pointer-events-none opacity-50",
        )
      }
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="truncate">{label}</span>
    </NavigationLink>
  );
}
