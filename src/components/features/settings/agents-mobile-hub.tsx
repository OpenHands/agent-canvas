import { useTranslation } from "react-i18next";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { SettingsNavRenderedItem } from "#/constants/settings-nav";
import { SidebarNavLink } from "#/components/features/sidebar/sidebar-nav-link";
import { BackendSyncedSettingsBadge } from "#/components/features/settings/backend-synced-settings-badge";

interface AgentsMobileHubProps {
  navigationItems: SettingsNavRenderedItem[];
}

/**
 * Mobile landing for the Agents hub. The desktop sidebar is `hidden md:flex`,
 * so on a phone the hub index renders this navigable section list instead of
 * redirecting straight into Profiles (which would strand the user with no way
 * to reach the other sections). Mirrors the former Settings mobile hub.
 */
export function AgentsMobileHub({ navigationItems }: AgentsMobileHubProps) {
  const { t } = useTranslation("openhands");

  const navItems = navigationItems.filter(
    (item): item is Extract<SettingsNavRenderedItem, { type: "item" }> =>
      item.type === "item",
  );

  return (
    <div
      data-testid="agents-mobile-hub"
      className="flex flex-col gap-4 px-4 py-2 md:hidden"
    >
      <Typography.H2>{t(I18nKey.NAV$AGENTS)}</Typography.H2>
      <nav className="flex flex-col gap-0.5">
        {navItems.map((renderedItem) => (
          <SidebarNavLink
            key={renderedItem.item.to}
            to={renderedItem.item.to}
            label={t(renderedItem.item.text as I18nKey)}
            end
            testId={`sidebar-agents-${renderedItem.item.to}`}
            icon={renderedItem.item.icon}
          />
        ))}
      </nav>
      <div className="pt-1">
        <BackendSyncedSettingsBadge />
      </div>
    </div>
  );
}
