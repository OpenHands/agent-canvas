import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { OpenHandsLogoButton } from "#/components/shared/buttons/openhands-logo-button";
import { SidebarNavLink } from "./sidebar-nav-link";
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
import { SidebarCollapseContext } from "./sidebar-collapse-context";
import { useSidebarCollapsedState } from "#/hooks/use-sidebar-collapsed";
import MessageIcon from "#/icons/message.svg?react";
import AutomationsIcon from "#/icons/automations.svg?react";
import SparkleIcon from "#/icons/sparkle.svg?react";
import PuzzleIcon from "#/icons/puzzle.svg?react";
import CogIcon from "#/icons/cog.svg?react";

// The LLM settings modal is only mounted when the settings query 404s and
// LLM settings aren't hidden — keep it out of the sidebar's eager graph.
const SettingsModal = React.lazy(() =>
  import("#/components/shared/modals/settings/settings-modal").then((m) => ({
    default: m.SettingsModal,
  })),
);

const SETTINGS_NAV_ICON_BY_PATH = new Map(
  OSS_NAV_ITEMS.map((item) => [item.to, item.icon] as const),
);

const ICON_SIZE = 18;

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

  const [collapsed, setCollapsed] = useSidebarCollapsedState();
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

  // Floating panel rendered in the hover tooltip when the (collapsed)
  // Settings button is hovered: lists the same submenu the expanded variant
  // shows inline.
  const settingsHoverPanel = (
    <div
      data-testid="sidebar-settings-flyout"
      className="w-[220px] p-1 bg-[#1f2228] text-white rounded-md"
    >
      <div className="px-2 py-1 text-xs font-semibold text-[#A3A3A3] uppercase tracking-wider">
        {t(I18nKey.SIDEBAR$SETTINGS)}
      </div>
      <ul className="flex flex-col gap-0.5">
        {settingsNavItems.map((rendered) => {
          if (rendered.type !== "item") return null;
          const navIcon = SETTINGS_NAV_ICON_BY_PATH.get(rendered.item.to);
          return (
            <li key={rendered.item.to}>
              <SidebarNavLink
                to={rendered.item.to}
                label={t(rendered.item.text as I18nKey)}
                end
                testId={`sidebar-settings-flyout-${rendered.item.to}`}
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
            </li>
          );
        })}
      </ul>
    </div>
  );

  const collapseToggleLabel = t(
    collapsed ? I18nKey.SIDEBAR$EXPAND : I18nKey.SIDEBAR$COLLAPSE,
  );

  return (
    <SidebarCollapseContext.Provider value={collapsed}>
      <aside
        aria-label={t(I18nKey.SIDEBAR$NAVIGATION_LABEL)}
        data-collapsed={collapsed ? "true" : "false"}
        className={cn(
          "bg-base flex flex-col gap-3 transition-[width,min-width] duration-200",
          // Mobile: top bar; Desktop: vertical column. Width responds to
          // the collapsed state on md+ screens.
          "h-[54px] md:h-full",
          collapsed
            ? "md:w-[64px] md:min-w-[64px]"
            : "md:w-[300px] md:min-w-[300px]",
          collapsed ? "md:px-2 md:pt-4" : "px-3 py-2 md:px-3 md:pt-4",
          "flex-row md:flex-col",
          currentPath === "/" && "md:pt-6.5 md:pb-3",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 md:py-1",
            // Collapsed: stack the chevron beneath the logo so the 64px rail
            // doesn't need to grow to fit two controls in a row. Expanded:
            // chevron is right-aligned via ml-auto further down.
            collapsed ? "md:flex-col md:gap-2 md:px-0" : "md:pl-2 md:pr-0",
          )}
        >
          <OpenHandsLogoButton />
          {/* Desktop-only collapse toggle. Hidden on mobile (the sidebar
              there is the top bar and doesn't collapse). No tooltip — the
              chevron direction already conveys what the button does. */}
          <button
            type="button"
            data-testid="sidebar-collapse-toggle"
            aria-pressed={collapsed}
            aria-label={collapseToggleLabel}
            onClick={() => setCollapsed((prev) => !prev)}
            className={cn(
              "hidden md:inline-flex items-center justify-center shrink-0",
              "w-7 h-7 rounded-md text-[#8C8C8C] hover:text-white hover:bg-[#1f1f1f99]",
              "transition-colors cursor-pointer",
              collapsed
                ? "mx-auto"
                : // ml-auto right-aligns inside the header row; -mr-2 pulls
                  // past the header's own pr-0 + most of the aside's pr-3 so
                  // the caret sits flush against the right edge of the rail.
                  "ml-auto md:-mr-2",
            )}
          >
            {collapsed ? (
              <ChevronRight width={18} height={18} />
            ) : (
              <ChevronLeft width={18} height={18} />
            )}
          </button>
        </div>

        {/* Hide the backend selector when collapsed — it is a wide dropdown
            that doesn't compress meaningfully into a 56px rail. Users who
            want to switch backends can expand the sidebar first. */}
        {!collapsed && (
          <div className="hidden md:flex md:flex-col md:items-stretch">
            <BackendSelector />
          </div>
        )}

        <nav
          className={cn(
            "flex flex-row md:flex-col gap-1 md:gap-0.5 w-full md:shrink-0",
            collapsed
              ? "items-center md:items-center"
              : "items-center md:items-stretch",
          )}
        >
          <SidebarNavLink
            to="/conversations"
            label={t(I18nKey.SIDEBAR$CONVERSATIONS)}
            testId="sidebar-conversations-link"
            disabled={linkDisabled}
            collapsed={collapsed}
            icon={<MessageIcon width={ICON_SIZE} height={ICON_SIZE} />}
          />
          <SidebarNavLink
            to="/skills"
            label={t(I18nKey.SIDEBAR$SKILLS)}
            testId="sidebar-skills-link"
            disabled={linkDisabled}
            collapsed={collapsed}
            icon={<SparkleIcon width={ICON_SIZE} height={ICON_SIZE} />}
          />
          <SidebarNavLink
            to="/mcp"
            label={t(I18nKey.SIDEBAR$MCP_DIRECTORY)}
            testId="sidebar-mcp-link"
            disabled={linkDisabled}
            collapsed={collapsed}
            icon={<PuzzleIcon width={ICON_SIZE} height={ICON_SIZE} />}
          />
          <SidebarNavLink
            to="/automations"
            label={t(I18nKey.SIDEBAR$AUTOMATIONS)}
            testId="sidebar-automations-link"
            disabled={linkDisabled}
            collapsed={collapsed}
            icon={<AutomationsIcon width={ICON_SIZE} height={ICON_SIZE} />}
          />
          <div className="hidden md:flex flex-col gap-0.5">
            {collapsed ? (
              // Collapsed: render Settings as a single icon link to /settings
              // with a hover-flyout that lists the full submenu.
              <SidebarNavLink
                to="/settings"
                label={t(I18nKey.SIDEBAR$SETTINGS)}
                testId="sidebar-settings-link"
                disabled={linkDisabled}
                collapsed
                icon={<CogIcon width={ICON_SIZE} height={ICON_SIZE} />}
                hoverContent={settingsHoverPanel}
              />
            ) : (
              <>
                <button
                  type="button"
                  data-testid="sidebar-settings-toggle"
                  aria-expanded={settingsExpanded}
                  onClick={() => setSettingsExpanded((prev) => !prev)}
                  className={cn(
                    "flex items-center justify-between w-full text-sm leading-5 px-3 py-2 rounded-md transition-colors cursor-pointer",
                    isSettingsActive
                      ? "bg-[#1f1f1f99] text-white font-medium"
                      : "text-[#8C8C8C] hover:text-white hover:bg-[#1f1f1f99]",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <CogIcon width={ICON_SIZE} height={ICON_SIZE} />
                    {t(I18nKey.SIDEBAR$SETTINGS)}
                  </span>
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
              </>
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
        <React.Suspense fallback={null}>
          <SettingsModal
            settings={settings}
            onClose={() => setSettingsModalIsOpen(false)}
          />
        </React.Suspense>
      )}
    </SidebarCollapseContext.Provider>
  );
}
