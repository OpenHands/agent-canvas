import React from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Server,
  Settings,
} from "lucide-react";
import { OpenHandsLogoButton } from "#/components/shared/buttons/openhands-logo-button";
import { SidebarNavLink } from "./sidebar-nav-link";
import { getErrorStatus, useSettings } from "#/hooks/query/use-settings";
import { useConfig } from "#/hooks/query/use-config";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";
import { useNavigation } from "#/context/navigation-context";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { cn } from "#/utils/utils";
import { BackendSelector } from "#/components/features/backends/backend-selector";
import { BackendStatusDot } from "#/components/features/backends/backend-status-dot";
import { SidebarConversationList } from "./sidebar-conversation-list";
import { SidebarCollapseContext } from "./sidebar-collapse-context";
import { useSidebarCollapsedState } from "#/hooks/use-sidebar-collapsed";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { useBackendsHealth } from "#/hooks/query/use-backends-health";
import AutomationsIcon from "#/icons/automations.svg?react";

// The LLM settings modal is only mounted when the settings query 404s and
// LLM settings aren't hidden — keep it out of the sidebar's eager graph.
const SettingsModal = React.lazy(() =>
  import("#/components/shared/modals/settings/settings-modal").then((m) => ({
    default: m.SettingsModal,
  })),
);

// Add/Manage backend modals are lifted into the sidebar (instead of living
// inside BackendSelector) so they survive the collapsed popover unmounting
// when the user moves the cursor out of the popover toward the modal.
const AddBackendModal = React.lazy(() =>
  import("#/components/features/backends/add-backend-modal").then((m) => ({
    default: m.AddBackendModal,
  })),
);
const ManageBackendsModal = React.lazy(() =>
  import("#/components/features/backends/manage-backends-modal").then((m) => ({
    default: m.ManageBackendsModal,
  })),
);

const ICON_SIZE = 18;

export function Sidebar() {
  const { t } = useTranslation("openhands");
  const { currentPath, navigate } = useNavigation();
  const { data: config } = useConfig();
  const {
    data: settings,
    error: settingsError,
    isError: settingsIsError,
    isFetching: isFetchingSettings,
  } = useSettings();
  const { backends, active } = useActiveBackendContext();
  const healthByBackendId = useBackendsHealth(backends);
  const activeBackendHealth = healthByBackendId[active.backend.id];
  const [collapsed, setCollapsed] = useSidebarCollapsedState();
  const [settingsModalIsOpen, setSettingsModalIsOpen] = React.useState(false);
  const [collapsedBackendPopoverOpen, setCollapsedBackendPopoverOpen] =
    React.useState(false);
  const collapsedBackendCloseTimer = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  // Lifted out of BackendSelector so opening these modals from the
  // collapsed-sidebar popover doesn't lose state when the popover unmounts
  // (cursor moving toward the modal triggers onMouseLeave -> close).
  const [addBackendModalOpen, setAddBackendModalOpen] = React.useState(false);
  const [manageBackendsModalOpen, setManageBackendsModalOpen] =
    React.useState(false);
  const [collapsedRailHovered, setCollapsedRailHovered] = React.useState(false);
  const collapsedBackendPopoverRef = useClickOutsideElement<HTMLDivElement>(
    () => setCollapsedBackendPopoverOpen(false),
  );
  const settingsErrorStatus = getErrorStatus(settingsError);

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

  const collapseToggleLabel = t(
    collapsed ? I18nKey.SIDEBAR$EXPAND : I18nKey.SIDEBAR$COLLAPSE,
  );
  const handleCollapsedRailClick = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!collapsed) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      // Keep existing behavior for explicit controls/links and only use
      // this as a convenience hit-area for empty collapsed-rail space.
      if (
        target.closest(
          "a,button,input,textarea,select,[role='button'],[role='link']",
        )
      ) {
        return;
      }

      setCollapsed(false);
    },
    [collapsed, setCollapsed],
  );
  const showCollapsedExpandButton = collapsed && collapsedRailHovered;

  const isExtensionsActive =
    currentPath.startsWith("/skills") ||
    currentPath === "/plugins" ||
    currentPath === "/mcp";

  return (
    <SidebarCollapseContext.Provider value={collapsed}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the aside acts as a hit-area for the collapsed rail; nested controls handle their own keyboard interactions. */}
      <aside
        aria-label={t(I18nKey.SIDEBAR$NAVIGATION_LABEL)}
        data-collapsed={collapsed ? "true" : "false"}
        onClick={handleCollapsedRailClick}
        onMouseEnter={() => {
          if (collapsed) {
            setCollapsedRailHovered(true);
          }
        }}
        onMouseLeave={() => {
          setCollapsedRailHovered(false);
        }}
        className={cn(
          "bg-base flex flex-col transition-[width,min-width] duration-200",
          "md:border-r md:border-[#242424]",
          // Mobile: top bar; Desktop: vertical column. Width responds to
          // the collapsed state on md+ screens.
          "h-[54px] md:h-full",
          collapsed
            ? "md:w-[64px] md:min-w-[64px]"
            : "md:w-[300px] md:min-w-[300px]",
          collapsed ? "md:px-2 md:pt-4" : "px-2 py-2 md:px-2 md:pt-4",
          "flex-row md:flex-col",
          currentPath === "/" && "md:pt-6.5 md:pb-3",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 md:py-1 md:pb-3",
            // Collapsed: stack the chevron beneath the logo so the 64px rail
            // doesn't need to grow to fit two controls in a row. Expanded:
            // chevron is right-aligned via ml-auto further down.
            collapsed ? "md:flex-col md:gap-2 md:px-0" : "md:pl-0 md:pr-0",
          )}
        >
          {collapsed ? (
            <div className="relative hidden md:block mx-auto">
              <div
                className={cn(
                  "transition-opacity duration-150",
                  showCollapsedExpandButton && "opacity-0",
                )}
              >
                <OpenHandsLogoButton />
              </div>
              <button
                type="button"
                data-testid="sidebar-collapse-toggle"
                aria-pressed={collapsed}
                aria-label={collapseToggleLabel}
                onClick={() => setCollapsed(false)}
                className={cn(
                  "absolute inset-0 hidden md:inline-flex items-center justify-center",
                  "rounded-md text-[#8C8C8C] hover:text-white hover:bg-[#1f1f1f99]",
                  "transition-colors cursor-pointer",
                  showCollapsedExpandButton
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none",
                )}
              >
                <ChevronRight width={18} height={18} />
              </button>
            </div>
          ) : (
            <>
              <OpenHandsLogoButton />
              {/* Desktop-only collapse toggle. Hidden on mobile (the sidebar
                  there is the top bar and doesn't collapse). No tooltip —
                  the chevron direction already conveys what the button does. */}
              <button
                type="button"
                data-testid="sidebar-collapse-toggle"
                aria-pressed={collapsed}
                aria-label={collapseToggleLabel}
                onClick={() => setCollapsed(true)}
                className={cn(
                  "hidden md:inline-flex items-center justify-center shrink-0",
                  "w-7 h-7 rounded-md text-[#8C8C8C] hover:text-white hover:bg-[#1f1f1f99]",
                  "transition-colors cursor-pointer",
                  // Keep the collapse button right-aligned while preserving a
                  // small gutter from the rail edge.
                  "ml-auto",
                )}
              >
                <ChevronLeft width={18} height={18} />
              </button>
            </>
          )}
        </div>

        {/*
          Temporarily hide the dedicated New Conversation button and surface
          creation via the first nav entry instead.
        */}

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
            end
            label="New"
            testId="sidebar-conversations-link"
            disabled={linkDisabled}
            collapsed={collapsed}
            icon={<Plus width={ICON_SIZE} height={ICON_SIZE} />}
          />
          <SidebarNavLink
            to="/skills"
            label="Extensions"
            testId="sidebar-skills-link"
            disabled={linkDisabled}
            collapsed={collapsed}
            forceActive={isExtensionsActive}
            icon={
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={ICON_SIZE}
                height={ICON_SIZE}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" />
                <path d="m7 16.5-4.74-2.85" />
                <path d="m7 16.5 5-3" />
                <path d="M7 16.5v5.17" />
                <path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" />
                <path d="m17 16.5-5-3" />
                <path d="m17 16.5 4.74-2.85" />
                <path d="M17 16.5v5.17" />
                <path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" />
                <path d="M12 8 7.26 5.15" />
                <path d="m12 8 4.74-2.85" />
                <path d="M12 13.5V8" />
              </svg>
            }
          />
          <SidebarNavLink
            to="/automations"
            label={t(I18nKey.SIDEBAR$AUTOMATIONS)}
            testId="sidebar-automations-link"
            disabled={linkDisabled}
            collapsed={collapsed}
            icon={<AutomationsIcon width={ICON_SIZE} height={ICON_SIZE} />}
          />
        </nav>

        <SidebarConversationList />

        {collapsed && (
          <div className="hidden md:flex md:flex-col md:items-center mt-auto gap-2 pb-2">
            <button
              type="button"
              data-testid="collapsed-settings-link"
              aria-label={t(I18nKey.SIDEBAR$SETTINGS)}
              onClick={() => navigate("/settings")}
              className={cn(
                "inline-flex items-center justify-center w-10 h-10 p-0 mx-auto rounded-md transition-colors",
                currentPath.startsWith("/settings")
                  ? "bg-[#1f1f1f99] text-white font-medium"
                  : "text-[#8C8C8C] hover:text-white hover:bg-[#1f1f1f99]",
              )}
            >
              <Settings width={16} height={16} />
            </button>
            <div
              className="relative"
              ref={collapsedBackendPopoverRef}
              onMouseEnter={() => {
                if (collapsedBackendCloseTimer.current) {
                  clearTimeout(collapsedBackendCloseTimer.current);
                  collapsedBackendCloseTimer.current = null;
                }
                setCollapsedBackendPopoverOpen(true);
              }}
              onMouseLeave={() => {
                collapsedBackendCloseTimer.current = setTimeout(
                  () => setCollapsedBackendPopoverOpen(false),
                  150,
                );
              }}
            >
              <button
                type="button"
                data-testid="collapsed-backend-selector-link"
                aria-label={t(I18nKey.BACKEND$MANAGE)}
                aria-expanded={collapsedBackendPopoverOpen}
                className={cn(
                  "relative inline-flex items-center justify-center w-10 h-10 p-0 mx-auto rounded-md transition-colors",
                  collapsedBackendPopoverOpen
                    ? "bg-[#1f1f1f99] text-white font-medium"
                    : "text-[#8C8C8C] hover:text-white hover:bg-[#1f1f1f99]",
                )}
              >
                <BackendStatusDot
                  isConnected={activeBackendHealth?.isConnected ?? null}
                  className="absolute top-1 left-1 pointer-events-none"
                />
                <Server width={16} height={16} />
              </button>
              {collapsedBackendPopoverOpen ? (
                <div
                  className="absolute bottom-0 left-full pl-2 z-40 w-[272px]"
                  // Stop click propagation so dropdown option clicks
                  // (rendered as <li role="option">, which the rail's
                  // collapse handler does not match against `button/a`)
                  // don't bubble up to the aside and accidentally expand
                  // the sidebar mid-selection.
                  onClick={(event) => event.stopPropagation()}
                >
                  <BackendSelector
                    hideTrigger
                    defaultOpen
                    openUpward
                    onSelectOption={() => setCollapsedBackendPopoverOpen(false)}
                    onOpenAddBackend={() => setAddBackendModalOpen(true)}
                    onOpenManageBackends={() =>
                      setManageBackendsModalOpen(true)
                    }
                  />
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Sidebar footer: keep backend selector pinned to the bottom with a
            visual separator above it. Hidden in collapsed mode because the
            control needs full-width space. */}
        {!collapsed && (
          <div className="hidden md:flex md:flex-col md:items-stretch pt-2 border-t border-[#242424] md:-mx-2 md:px-2">
            <BackendSelector openUpward />
          </div>
        )}
      </aside>

      {settingsModalIsOpen && (
        <React.Suspense fallback={null}>
          <SettingsModal
            settings={settings}
            onClose={() => setSettingsModalIsOpen(false)}
          />
        </React.Suspense>
      )}
      {addBackendModalOpen && (
        <React.Suspense fallback={null}>
          <AddBackendModal onClose={() => setAddBackendModalOpen(false)} />
        </React.Suspense>
      )}
      {manageBackendsModalOpen && (
        <React.Suspense fallback={null}>
          <ManageBackendsModal
            onClose={() => setManageBackendsModalOpen(false)}
          />
        </React.Suspense>
      )}
    </SidebarCollapseContext.Provider>
  );
}
