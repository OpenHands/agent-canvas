import { useTranslation } from "react-i18next";
import { NavigationLink } from "#/components/shared/navigation-link";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { useSettings } from "#/hooks/query/use-settings";
import { ACP_PROVIDERS } from "#/constants/acp-providers";
import { cn } from "#/utils/utils";
import SkillsIcon from "#/icons/skills.svg?react";
import ServerProcessIcon from "#/icons/server-process.svg?react";
import { BackendSyncedSettingsBadge } from "#/components/features/settings/backend-synced-settings-badge";
import { I18nKey } from "#/i18n/declaration";

interface ExtensionNavItem {
  to: string;
  label: string;
  icon: React.ReactElement;
  end?: boolean;
  comingSoon?: boolean;
  /**
   * When true, this item greys out (and the /route's ``clientLoader``
   * bounces to ``/settings/agent``) while an ACP agent is active.
   * The ACP sub-agent manages its own MCP servers; the SDK rejects
   * ``mcp_config`` on ``ACPAgent`` init outright, so the OpenHands-
   * side editor would silently no-op against the running subprocess.
   */
  disabledByAcp?: boolean;
}

export const EXTENSIONS_NAV_ITEMS: ExtensionNavItem[] = [
  {
    to: "/skills",
    label: "Skills",
    icon: <SkillsIcon width={16} height={16} aria-hidden="true" />,
    end: true,
  },
  {
    to: "/mcp",
    label: "MCP Servers",
    icon: <ServerProcessIcon width={16} height={16} />,
    end: true,
    disabledByAcp: true,
  },
  {
    to: "/plugins",
    label: "Plugins",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        width={16}
        height={16}
        aria-hidden="true"
      >
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    ),
    end: true,
    comingSoon: true,
  },
];

export function ExtensionsNavigation() {
  const { t } = useTranslation("openhands");
  const { data: settings } = useSettings();
  const isAcpAgent = settings?.agent_settings?.agent_kind === "acp";
  const acpServerKey =
    typeof settings?.agent_settings?.acp_server === "string"
      ? settings.agent_settings.acp_server
      : undefined;
  const acpServerName = isAcpAgent
    ? (ACP_PROVIDERS.find(({ key }) => key === acpServerKey)?.display_name ??
      "ACP Agent")
    : undefined;

  return (
    <aside
      data-testid="extensions-navbar-desktop"
      className="hidden md:flex md:w-[260px] md:shrink-0 md:flex-col md:gap-2 md:sticky md:top-8 md:self-start md:pl-8"
    >
      <span className="px-2 text-sm font-normal text-white">
        {t(I18nKey.NAV$EXTENSIONS)}
      </span>
      <div className="flex flex-col gap-0.5 pt-0.5">
        {EXTENSIONS_NAV_ITEMS.map((item) => {
          const disabled = !!(isAcpAgent && item.disabledByAcp);
          const baseRow = (
            <span className="shrink-0 flex items-center justify-center">
              {item.icon}
            </span>
          );
          const label = <span className="truncate">{item.label}</span>;
          const comingSoonBadge = item.comingSoon && (
            <span className="ml-auto shrink-0 rounded-full border border-white/20 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-[var(--oh-text-dim)]">
              {t(I18nKey.NAV$COMING_SOON)}
            </span>
          );

          if (disabled) {
            // Render a non-clickable surrogate so the URL and a11y tree
            // both communicate "you can't go here right now," then wrap
            // in StyledTooltip for the why. Mirrors the SettingsNavLink
            // disabled rendering — same flag (``disabledByAcp``), same
            // explanatory tooltip ("Disabled while {agentName} is the
            // active agent"), same greyed styles.
            return (
              <StyledTooltip
                key={item.to}
                content={t(I18nKey.SETTINGS$AGENT_DISABLED_TOOLTIP, {
                  agentName: acpServerName,
                })}
                placement="right"
              >
                <span
                  aria-disabled="true"
                  data-testid={`sidebar-extensions-${item.to}`}
                  className="flex items-center gap-2 rounded-md text-sm leading-5 truncate px-2 py-2 w-full text-[var(--oh-muted)] opacity-50 cursor-not-allowed"
                >
                  {baseRow}
                  {label}
                  {comingSoonBadge}
                </span>
              </StyledTooltip>
            );
          }

          return (
            <NavigationLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={`sidebar-extensions-${item.to}`}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md transition-colors text-sm leading-5 truncate px-2 py-2 w-full",
                  isActive
                    ? "bg-tertiary text-white font-medium"
                    : "text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)]",
                )
              }
            >
              {baseRow}
              {label}
              {comingSoonBadge}
            </NavigationLink>
          );
        })}
      </div>
      <div className="px-2 pt-3">
        <BackendSyncedSettingsBadge />
      </div>
    </aside>
  );
}
