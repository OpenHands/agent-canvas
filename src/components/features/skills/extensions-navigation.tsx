import { useTranslation } from "react-i18next";
import { NavigationLink } from "#/components/shared/navigation-link";
import { cn } from "#/utils/utils";
import ServerProcessIcon from "#/icons/server-process.svg?react";
import { BackendSyncedSettingsBadge } from "#/components/features/settings/backend-synced-settings-badge";
import { I18nKey } from "#/i18n/declaration";

interface ExtensionNavItem {
  to: string;
  label: string;
  icon: React.ReactElement;
  end?: boolean;
  comingSoon?: boolean;
}

const EXTENSIONS_NAV_ITEMS: ExtensionNavItem[] = [
  {
    to: "/skills",
    label: "Skills",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 19.13 24.62"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        width={16}
        height={16}
        aria-hidden="true"
      >
        <path d="M.86,7.26l5.74,3.3,11.68-6.6" />
        <path d="M6.6,17.15v-6.6" />
        <path d="M1.32,14.34l4.62,2.64c.41.24.91.24,1.32,0l10.56-5.94" />
        <path d="M.66,20c0,.47.25.91.66,1.14l4.62,2.64c.41.24.91.24,1.32,0l10.56-5.94c.41-.24.66-.67.66-1.14V4.62c0-.47-.25-.91-.66-1.14L13.2.84c-.41-.24-.91-.24-1.32,0L1.32,6.78c-.41.24-.66.67-.66,1.14v12.08Z" />
        <path d="M.86,14.06l5.74,3.3,11.68-6.6" />
        <path d="M6.6,23.96v-6.6" />
      </svg>
    ),
    end: true,
  },
  {
    to: "/mcp",
    label: "MCP Servers",
    icon: <ServerProcessIcon width={16} height={16} />,
    end: true,
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

  return (
    <aside
      data-testid="extensions-navbar-desktop"
      className="hidden md:flex md:w-[260px] md:shrink-0 md:flex-col md:gap-2 md:sticky md:top-8 md:self-start md:pl-[14px]"
    >
      <span className="px-3 text-xs font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
        {t(I18nKey.NAV$EXTENSIONS)}
      </span>
      <div className="flex flex-col gap-0.5 pt-0.5">
        {EXTENSIONS_NAV_ITEMS.map((item) => (
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
            <span className="shrink-0 flex items-center justify-center">
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
            {item.comingSoon && (
              <span className="ml-auto shrink-0 rounded-full border border-white/20 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-[var(--oh-text-dim)]">
                {t(I18nKey.NAV$COMING_SOON)}
              </span>
            )}
          </NavigationLink>
        ))}
      </div>
      <div className="px-2 pt-3">
        <BackendSyncedSettingsBadge />
      </div>
    </aside>
  );
}
