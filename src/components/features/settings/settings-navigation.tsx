import { useTranslation } from "react-i18next";
import { cn } from "#/utils/utils";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import SettingsIcon from "#/icons/settings-gear.svg?react";
import CloseIcon from "#/icons/close.svg?react";
import { SettingsNavRenderedItem } from "#/hooks/use-settings-nav-items";
import { SettingsNavHeader } from "./settings-nav-header";
import { SettingsNavDivider } from "./settings-nav-divider";
import { SettingsNavLink } from "./settings-nav-link";
import { SidebarNavLink } from "#/components/features/sidebar/sidebar-nav-link";
import { BackendSyncedSettingsBadge } from "#/components/features/settings/backend-synced-settings-badge";

interface SettingsNavigationProps {
  isMobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  navigationItems: SettingsNavRenderedItem[];
}

/**
 * Desktop sidebar — sibling of the scrolling main column (same pattern as
 * {@link ExtensionsNavigation}). Mobile drawer stays `position: fixed` outside
 * this row in the layout.
 */
export function SettingsDesktopSidebar({
  navigationItems,
}: Pick<SettingsNavigationProps, "navigationItems">) {
  const { t } = useTranslation("openhands");
  const desktopNavItems = navigationItems.filter(
    (item): item is Extract<SettingsNavRenderedItem, { type: "item" }> =>
      item.type === "item",
  );

  return (
    <aside
      data-testid="settings-navbar-desktop"
      className={cn(
        "hidden md:flex md:w-[260px] md:shrink-0 md:flex-col md:gap-2",
        "md:sticky md:top-8 md:self-start md:pl-8",
      )}
    >
      <Typography.Text className="px-2 text-sm font-normal text-white">
        {t(I18nKey.SETTINGS$TITLE)}
      </Typography.Text>
      <div className="flex flex-col gap-0.5 pt-0.5">
        {desktopNavItems.map((renderedItem) => (
          <SidebarNavLink
            key={renderedItem.item.to}
            to={renderedItem.item.to}
            label={t(renderedItem.item.text as I18nKey)}
            end
            testId={`sidebar-settings-${renderedItem.item.to}`}
            icon={renderedItem.item.icon}
            // Items marked ``disabledByAcp`` (LLM, Condenser, …) are greyed
            // out and un-clickable while an ACP agent is active — those
            // pages have nothing to configure while a separate sub-agent
            // owns the LLM/condenser/MCP layers. The mobile drawer below
            // already does this via ``SettingsNavLink``; do the same on
            // desktop. The clientLoader-side redirect in ``routes/
            // settings.tsx`` handles direct URL navigation.
            disabled={renderedItem.disabled}
            disabledReason={
              renderedItem.disabled && renderedItem.disabledAgentName
                ? t(I18nKey.SETTINGS$AGENT_DISABLED_TOOLTIP, {
                    agentName: renderedItem.disabledAgentName,
                  })
                : undefined
            }
          />
        ))}
      </div>
      <div className="px-2 pt-3">
        <BackendSyncedSettingsBadge />
      </div>
    </aside>
  );
}

/**
 * Mobile overlay + drawer. Rendered outside the scrolling flex row so `position:
 * fixed` does not interact with flex item sizing on desktop.
 */
export function SettingsMobileDrawer({
  isMobileMenuOpen,
  onCloseMobileMenu,
  navigationItems,
}: SettingsNavigationProps) {
  const { t } = useTranslation("openhands");

  return (
    <>
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 md:hidden"
          onClick={onCloseMobileMenu}
        />
      )}
      <nav
        data-testid="settings-navbar"
        className={cn(
          "flex flex-col gap-6 transition-transform duration-300 ease-in-out",
          "fixed inset-0 z-50 w-full bg-[var(--oh-surface-deep)] p-4 transform md:hidden",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="ml-1 flex items-center gap-2 sm:ml-4.5">
            <SettingsIcon width={16} height={16} />
            <Typography.H2>{t(I18nKey.SETTINGS$TITLE)}</Typography.H2>
          </div>
          <button
            type="button"
            onClick={onCloseMobileMenu}
            className="cursor-pointer rounded-md p-0.5 transition-colors hover:bg-tertiary md:hidden"
            aria-label="Close navigation menu"
          >
            <CloseIcon width={32} height={32} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {navigationItems.map((renderedItem, index) => {
            if (renderedItem.type === "header") {
              return (
                <SettingsNavHeader
                  key={`header-${renderedItem.text}`}
                  text={renderedItem.text}
                />
              );
            }

            if (renderedItem.type === "divider") {
              return <SettingsNavDivider key={`divider-${index}`} />;
            }

            return (
              <SettingsNavLink
                key={renderedItem.item.to}
                item={renderedItem.item}
                onClick={onCloseMobileMenu}
                disabled={renderedItem.disabled}
                disabledAgentName={renderedItem.disabledAgentName}
              />
            );
          })}
        </div>

        <div className="px-2 pt-3">
          <BackendSyncedSettingsBadge />
        </div>
      </nav>
    </>
  );
}

export function SettingsNavigation(props: SettingsNavigationProps) {
  return (
    <>
      <SettingsDesktopSidebar navigationItems={props.navigationItems} />
      <SettingsMobileDrawer {...props} />
    </>
  );
}
