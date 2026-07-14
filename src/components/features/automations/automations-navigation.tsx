import { useTranslation } from "react-i18next";
import { NavigationLink } from "#/components/shared/navigation-link";
import { cn } from "#/utils/utils";
import { LayoutDashboard, GitFork, Clock, Zap, Compass } from "lucide-react";
import { BackendSyncedSettingsBadge } from "#/components/features/settings/backend-synced-settings-badge";
import {
  SIDEBAR_ROW_INTERACTIVE_CLASS,
  sidebarNavRowClassName,
} from "#/components/features/sidebar/sidebar-layout";
import { I18nKey } from "#/i18n/declaration";

interface AutomationsNavItem {
  to: string;
  label: string;
  icon: React.ReactElement;
  end?: boolean;
}

export const AUTOMATIONS_NAV_ITEMS = (
  t: (key: string) => string,
): AutomationsNavItem[] => [
  {
    to: "/automations/dashboard",
    label: t(I18nKey.AUTOMATIONS$DASHBOARD_TITLE),
    icon: <LayoutDashboard className="size-4" aria-hidden="true" />,
    end: true,
  },
  {
    to: "/automations/workflows",
    label: t(I18nKey.AUTOMATIONS$WORKFLOWS_TITLE),
    icon: <GitFork className="size-4" aria-hidden="true" />,
    end: true,
  },
  {
    to: "/automations/routines",
    label: t(I18nKey.AUTOMATIONS$ROUTINES_TITLE),
    icon: <Clock className="size-4" aria-hidden="true" />,
    end: true,
  },
  {
    to: "/automations/responders",
    label: t(I18nKey.AUTOMATIONS$RESPONDERS_TITLE),
    icon: <Zap className="size-4" aria-hidden="true" />,
    end: true,
  },
  {
    to: "/automations/templates",
    label: t(I18nKey.AUTOMATIONS$TEMPLATES_TITLE),
    icon: <Compass className="size-4" aria-hidden="true" />,
    end: true,
  },
];

export function AutomationsNavigation() {
  const { t } = useTranslation("openhands");
  const navItems = AUTOMATIONS_NAV_ITEMS(t);

  return (
    <aside
      data-testid="automations-navbar-desktop"
      className="hidden md:flex md:w-[260px] md:shrink-0 md:flex-col md:gap-2 md:sticky md:top-8 md:self-start"
    >
      <span className="px-2 text-sm font-normal text-white">
        {t(I18nKey.SIDEBAR$AUTOMATIONS)}
      </span>
      <div className="flex flex-col gap-0.5 pt-0.5">
        {navItems.map((item) => {
          const baseRow = (
            <span className="shrink-0 flex items-center justify-center">
              {item.icon}
            </span>
          );
          const label = <span className="truncate">{item.label}</span>;

          return (
            <NavigationLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={`sidebar-automations-${item.to}`}
              className={({ isActive }) =>
                cn(
                  sidebarNavRowClassName(),
                  "truncate",
                  isActive
                    ? SIDEBAR_ROW_INTERACTIVE_CLASS.active
                    : SIDEBAR_ROW_INTERACTIVE_CLASS.idle,
                )
              }
            >
              {baseRow}
              {label}
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
