import { useTranslation } from "react-i18next";
import { cn } from "#/utils/utils";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { SettingsNavRenderedItem } from "#/hooks/use-settings-nav-items";
import { SidebarNavLink } from "#/components/features/sidebar/sidebar-nav-link";
import { BackendSyncedSettingsBadge } from "#/components/features/settings/backend-synced-settings-badge";
import { SettingsNavHeader } from "./settings-nav-header";
import { SettingsNavDivider } from "./settings-nav-divider";

interface SettingsDesktopSidebarProps {
  navigationItems: SettingsNavRenderedItem[];
  /** Heading above the nav (defaults to "Settings"). */
  title?: I18nKey;
}

/**
 * Desktop sidebar — sibling of the scrolling main column (same pattern as
 * {@link ExtensionsNavigation}). Mobile drawer stays `position: fixed` outside
 * this row in the layout. Renders grouped `header`/`divider` rows (used by the
 * Agents hub) the same way the mobile drawer does.
 */
export function SettingsDesktopSidebar({
  navigationItems,
  title = I18nKey.SETTINGS$TITLE,
}: SettingsDesktopSidebarProps) {
  const { t } = useTranslation("openhands");

  return (
    <aside
      data-testid="settings-navbar-desktop"
      className={cn(
        "hidden md:flex md:w-[260px] md:shrink-0 md:flex-col md:gap-2",
        "md:sticky md:top-8 md:self-start md:pl-8",
      )}
    >
      <Typography.Text className="px-2 text-sm font-normal text-white">
        {t(title)}
      </Typography.Text>
      <div className="flex flex-col gap-0.5 pt-0.5">
        {navigationItems.map((renderedItem, index) => {
          if (renderedItem.type === "header") {
            return (
              <SettingsNavHeader
                key={`header-${renderedItem.text}`}
                text={renderedItem.text}
                className={index === 0 ? undefined : "pt-3"}
              />
            );
          }
          if (renderedItem.type === "divider") {
            return <SettingsNavDivider key={`divider-${index}`} />;
          }
          return (
            <SidebarNavLink
              key={renderedItem.item.to}
              to={renderedItem.item.to}
              label={t(renderedItem.item.text as I18nKey)}
              end
              testId={`sidebar-settings-${renderedItem.item.to}`}
              icon={renderedItem.item.icon}
              disabled={renderedItem.disabled}
              disabledReason={
                renderedItem.disabled && renderedItem.disabledAgentName
                  ? t(I18nKey.SETTINGS$AGENT_DISABLED_TOOLTIP, {
                      agentName: renderedItem.disabledAgentName,
                    })
                  : undefined
              }
            />
          );
        })}
      </div>
      <div className="px-2 pt-3">
        <BackendSyncedSettingsBadge />
      </div>
    </aside>
  );
}
