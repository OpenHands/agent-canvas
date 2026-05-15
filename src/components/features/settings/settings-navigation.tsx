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

interface SettingsNavigationProps {
  isMobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  navigationItems: SettingsNavRenderedItem[];
}

export function SettingsNavigation({
  isMobileMenuOpen,
  onCloseMobileMenu,
  navigationItems,
}: SettingsNavigationProps) {
  const { t } = useTranslation("openhands");
  const desktopNavItems = navigationItems.filter(
    (item): item is Extract<SettingsNavRenderedItem, { type: "item" }> =>
      item.type === "item",
  );

  return (
    <>
      <aside
        data-testid="settings-navbar-desktop"
        className="hidden md:flex md:w-[260px] md:shrink-0 md:flex-col md:gap-2"
      >
        <Typography.Text className="px-3 text-xs font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
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
            />
          ))}
        </div>
      </aside>

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
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
          <div className="flex items-center gap-2 ml-1 sm:ml-4.5">
            <SettingsIcon width={16} height={16} />
            <Typography.H2>{t(I18nKey.SETTINGS$TITLE)}</Typography.H2>
          </div>
          <button
            type="button"
            onClick={onCloseMobileMenu}
            className="md:hidden p-0.5 hover:bg-tertiary rounded-md transition-colors cursor-pointer"
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
              />
            );
          })}
        </div>
      </nav>
    </>
  );
}
