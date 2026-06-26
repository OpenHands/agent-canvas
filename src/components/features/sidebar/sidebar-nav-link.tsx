import React from "react";
import { NavigationLink } from "#/components/shared/navigation-link";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { useNavigation } from "#/context/navigation-context";
import { cn } from "#/utils/utils";
import { SidebarCollapsedIconSlot } from "./sidebar-collapsed-icon-slot";
import {
  SIDEBAR_ICON_SLOT_CLASS,
  SIDEBAR_ROW_INTERACTIVE_CLASS,
  sidebarNavLabelClassName,
  sidebarNavRowClassName,
} from "./sidebar-layout";

function isPathActive(currentPath: string, to: string, end: boolean) {
  if (to === "/") {
    return currentPath === to;
  }

  if (end) {
    return currentPath === to;
  }

  return currentPath === to || currentPath.startsWith(`${to}/`);
}

interface SidebarNavLinkProps {
  to: string;
  label: string;
  end?: boolean;
  indent?: boolean;
  testId?: string;
  disabled?: boolean;
  icon?: React.ReactElement;
  collapsed?: boolean;
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
  const { currentPath } = useNavigation();
  const active = forceActive || isPathActive(currentPath, to, end);

  const link = (
    <NavigationLink
      to={to}
      end={end}
      data-testid={testId}
      tabIndex={disabled ? -1 : 0}
      aria-label={collapsed ? label : undefined}
      // Announce the disabled state to assistive tech. Navigation is already
      // blocked by preventDefault below, and tabIndex=-1 + aria-disabled cover
      // keyboard/AT — so we do NOT need pointer-events-none for correctness.
      // Crucially, when there is a disabledReason tooltip, the link must keep
      // receiving pointer events or the hover tooltip (HeroUI, pointer-driven)
      // can never open — which is exactly why the "Disabled while {agent} is
      // active" hint never showed. So only suppress pointer events when there
      // is no reason to explain on hover.
      aria-disabled={disabled || undefined}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
        }
      }}
      className={cn(
        sidebarNavRowClassName({ indent, collapsed }),
        !collapsed &&
          (active
            ? SIDEBAR_ROW_INTERACTIVE_CLASS.active
            : SIDEBAR_ROW_INTERACTIVE_CLASS.idle),
        disabled && "opacity-50",
        disabled && !disabledReason && "pointer-events-none",
      )}
    >
      {icon ? (
        collapsed ? (
          <SidebarCollapsedIconSlot active={active}>
            {icon}
          </SidebarCollapsedIconSlot>
        ) : (
          <span className={SIDEBAR_ICON_SLOT_CLASS}>{icon}</span>
        )
      ) : null}
      <span className={sidebarNavLabelClassName(collapsed)}>{label}</span>
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
