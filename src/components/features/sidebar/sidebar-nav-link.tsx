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
  /**
   * Pre-formatted human-readable reason for the disabled state, shown
   * as a hover tooltip. The component is i18n-agnostic — the caller
   * formats the string (typically via ``t(SETTINGS$AGENT_DISABLED_TOOLTIP,
   * { agentName })``) and passes it in. Only rendered when ``disabled``
   * is also true. Mirrors the mobile ``SettingsNavLink`` tooltip so the
   * disabled-state UX is consistent across surfaces.
   */
  disabledReason?: string;
  /**
   * When true, forces the active style regardless of the current path.
   * Useful for links that should appear active for multiple related routes
   * (e.g. the Extensions link being active on /mcp and /plugins too).
   */
  forceActive?: boolean;
}

function getLayoutClasses(collapsed: boolean, indent: boolean): string {
  if (collapsed) return "justify-center w-10 h-10 p-0 mx-auto";
  if (indent) return "pl-7 pr-2 py-1.5 w-full";
  return "px-2 py-2 w-full";
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
  disabledReason,
  forceActive = false,
}: SidebarNavLinkProps) {
  const link = (
    <NavigationLink
      to={to}
      end={end}
      data-testid={testId}
      tabIndex={disabled ? -1 : 0}
      aria-label={collapsed ? label : undefined}
      // Announce the disabled state to assistive tech. The visual disable
      // (opacity + pointer-events) plus tabIndex=-1 + preventDefault gives
      // sighted/keyboard users the right behaviour already; this closes
      // the screen-reader gap so the link doesn't sound "actionable."
      aria-disabled={disabled || undefined}
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
          isActive || forceActive
            ? "bg-tertiary text-white font-medium"
            : "text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)]",
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

  // Disabled-with-reason: wrap with a tooltip explaining *why* (e.g.
  // "Disabled while Claude Code is active"). Mirrors the mobile
  // ``SettingsNavLink`` UX so users get the same explanation on both
  // surfaces. We use ``StyledTooltip`` regardless of the collapsed
  // state — without it, desktop users see a greyed-out link with no
  // hint about why their click didn't work.
  if (disabled && disabledReason) {
    return (
      <StyledTooltip content={disabledReason} placement="right">
        {link}
      </StyledTooltip>
    );
  }

  if (!collapsed) return link;

  return (
    <StyledTooltip
      content={hoverContent ?? label}
      placement="right"
      tooltipClassName={hoverContent ? "p-0 bg-tertiary text-white" : undefined}
    >
      {link}
    </StyledTooltip>
  );
}
