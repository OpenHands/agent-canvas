import React from "react";
import { useTranslation } from "react-i18next";
import { OpenHandsLogoButton } from "#/components/shared/buttons/openhands-logo-button";
import { SidebarNavLink } from "./sidebar-nav-link";
import { SettingsModal } from "#/components/shared/modals/settings/settings-modal";
import { getErrorStatus, useSettings } from "#/hooks/query/use-settings";
import { useConfig } from "#/hooks/query/use-config";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";
import { useNavigation } from "#/context/navigation-context";
import { cn } from "#/utils/utils";
import { useSettingsNavItems } from "#/hooks/use-settings-nav-items";
import { BackendSelector } from "#/components/features/backends/backend-selector";
import { OSS_NAV_ITEMS } from "#/constants/settings-nav";
import { SidebarConversationList } from "./sidebar-conversation-list";

const SETTINGS_NAV_ICON_BY_PATH = new Map(
  OSS_NAV_ITEMS.map((item) => [item.to, item.icon] as const),
);

export function Sidebar() {
  const { t } = useTranslation("openhands");
  const { currentPath } = useNavigation();
  const { data: config } = useConfig();
  const {
    data: settings,
    error: settingsError,
    isError: settingsIsError,
    isFetching: isFetchingSettings,
  } = useSettings();
  const settingsNavItems = useSettingsNavItems();

  const [settingsModalIsOpen, setSettingsModalIsOpen] = React.useState(false);
  const settingsErrorStatus = getErrorStatus(settingsError);

  const isSettingsActive = currentPath.startsWith("/settings");
  const [settingsExpanded, setSettingsExpanded] =
    React.useState<boolean>(isSettingsActive);

  // Auto-expand the settings submenu whenever we navigate into /settings.
  React.useEffect(() => {
    if (isSettingsActive) {
      setSettingsExpanded(true);
    }
  }, [isSettingsActive]);

  React.useEffect(() => {
    if (currentPath === "/settings") {
      setSettingsModalIsOpen(false);
    } else if (
      !isFetchingSettings &&
      settingsIsError &&
      settingsErrorStatus !== 404
    ) {
      // We don't show toast errors for settings in the global error handler
      // because we have a special case for 404 errors
      displayErrorToast(
        "Something went wrong while fetching settings. Please reload the page.",
      );
    } else if (
      settingsErrorStatus === 404 &&
      !config?.feature_flags?.hide_llm_settings
    ) {
      setSettingsModalIsOpen(true);
    }
  }, [
    currentPath,
    isFetchingSettings,
    settingsIsError,
    settingsErrorStatus,
    config?.feature_flags?.hide_llm_settings,
  ]);

  const linkDisabled = settings?.email_verified === false;

  return (
    <>
      <aside
        aria-label={t(I18nKey.SIDEBAR$NAVIGATION_LABEL)}
        className={cn(
          "bg-base flex flex-col gap-3",
          // Mobile: top bar; Desktop: vertical column
          "h-[54px] md:h-full md:w-[300px] md:min-w-[300px]",
          "px-3 py-2 md:px-3 md:pt-4",
          "flex-row md:flex-col",
          (currentPath === "/" || currentPath.startsWith("/automations")) &&
            "md:pt-6.5 md:pb-3",
        )}
      >
        <div className="flex items-center md:px-2 md:py-1">
          <OpenHandsLogoButton />
        </div>

        <div className="hidden md:flex md:flex-col md:items-stretch">
          <BackendSelector />
        </div>

        <nav className="flex flex-row md:flex-col gap-1 md:gap-0.5 items-center md:items-stretch w-full md:shrink-0">
          <SidebarNavLink
            to="/conversations"
            label={t(I18nKey.SIDEBAR$CONVERSATIONS)}
            testId="sidebar-conversations-link"
            disabled={linkDisabled}
          />
          <SidebarNavLink
            to="/automations"
            label={t(I18nKey.SIDEBAR$AUTOMATIONS)}
            testId="sidebar-automations-link"
            disabled={linkDisabled}
          />
          <SidebarNavLink
            to="/skills"
            label={t(I18nKey.SIDEBAR$SKILLS)}
            testId="sidebar-skills-link"
            disabled={linkDisabled}
          />
          <SidebarNavLink
            to="/integrations"
            label={t(I18nKey.SIDEBAR$INTEGRATIONS)}
            testId="sidebar-integrations-link"
            disabled={linkDisabled}
          />
          <div className="hidden md:flex flex-col gap-0.5">
            <button
              type="button"
              data-testid="sidebar-settings-toggle"
              aria-expanded={settingsExpanded}
              onClick={() => setSettingsExpanded((prev) => !prev)}
              className={cn(
                "flex items-center justify-between w-full text-sm leading-5 px-3 py-2 rounded-md transition-colors cursor-pointer",
                isSettingsActive
                  ? "bg-[#1f1f1f99] text-white font-medium"
                  : "text-[#B1B9D3] hover:text-white hover:bg-[#1f1f1f99]",
              )}
            >
              <span>{t(I18nKey.SIDEBAR$SETTINGS)}</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={cn(
                  "transition-transform duration-150",
                  settingsExpanded ? "rotate-180" : "rotate-0",
                )}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {settingsExpanded && (
              <div className="flex flex-col gap-0.5 pt-0.5">
                {settingsNavItems.map((rendered) => {
                  if (rendered.type !== "item") return null;
                  const navIcon = SETTINGS_NAV_ICON_BY_PATH.get(
                    rendered.item.to,
                  );
                  return (
                    <SidebarNavLink
                      key={rendered.item.to}
                      to={rendered.item.to}
                      label={t(rendered.item.text as I18nKey)}
                      end
                      indent
                      testId={`sidebar-settings-${rendered.item.to}`}
                      disabled={linkDisabled}
                      icon={
                        navIcon
                          ? React.cloneElement(
                              navIcon as React.ReactElement<{
                                width?: number;
                                height?: number;
                              }>,
                              { width: 16, height: 16 },
                            )
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
          {/* Mobile: settings as a flat link, no submenu */}
          <div className="md:hidden">
            <SidebarNavLink
              to="/settings"
              label={t(I18nKey.SIDEBAR$SETTINGS)}
              testId="sidebar-settings-link-mobile"
              disabled={linkDisabled}
            />
          </div>
        </nav>

        <SidebarConversationList />
      </aside>

      {settingsModalIsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsModalIsOpen(false)}
        />
      )}
    </>
  );
}
