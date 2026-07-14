import { useTranslation } from "react-i18next";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { SidebarNavLink } from "#/components/features/sidebar/sidebar-nav-link";
import { BackendSyncedSettingsBadge } from "#/components/features/settings/backend-synced-settings-badge";
import { AUTOMATIONS_NAV_ITEMS } from "./automations-navigation";

export function AutomationsMobileHub() {
  const { t } = useTranslation("openhands");
  const navItems = AUTOMATIONS_NAV_ITEMS(t);

  return (
    <div
      data-testid="automations-mobile-hub"
      className="flex flex-col gap-4 px-4 py-2 md:hidden"
    >
      <Typography.H2>{t(I18nKey.SIDEBAR$AUTOMATIONS)}</Typography.H2>
      <nav className="flex flex-col gap-0.5">
        {navItems.map((item) => (
          <SidebarNavLink
            key={item.to}
            to={item.to}
            label={item.label}
            end={item.end}
            testId={`sidebar-automations-${item.to}`}
            icon={item.icon}
          />
        ))}
      </nav>
      <div className="pt-1">
        <BackendSyncedSettingsBadge />
      </div>
    </div>
  );
}
