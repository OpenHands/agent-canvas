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
import { SidebarCollapsedIconSlot } from "./sidebar-collapsed-icon-slot";
import { SidebarNavLink } from "./sidebar-nav-link";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { BackendSelector } from "#/components/features/backends/backend-selector";
import { BackendStatusDot } from "#/components/features/backends/backend-status-dot";
import { SidebarConversationList } from "./sidebar-conversation-list";
import AutomationsIcon from "#/icons/automations.svg?react";
import {
  SIDEBAR_COLLAPSE_TOGGLE_OVERLAY_CLASS,
  SIDEBAR_COLLAPSED_LOGO_WRAPPER_CLASS,
  SIDEBAR_ICON_BUTTON_CLASS,
  SIDEBAR_ICON_SLOT_CLASS,
  sidebarHeaderRowClassName,
  sidebarNavLabelClassName,
  sidebarNavListClassName,
  sidebarNavRowClassName,
} from "./sidebar-layout";

const ICON_SIZE = 18;
const SIDEBAR_LOGO_WIDTH = 34;
const SIDEBAR_LOGO_HEIGHT = Math.round((SIDEBAR_LOGO_WIDTH * 30) / 46);

export interface SidebarRailBodyProps {
  collapsed: boolean;
  showCollapseToggle: boolean;
  showMobileCloseButton?: boolean;
  onCloseMobile?: () => void;
  linkDisabled: boolean;
  collapseToggleLabel: string;
  onCollapse: () => void;
  onExpand: () => void;
  showCollapsedExpandButton: boolean;
  isExtensionsActive: boolean;
  currentPath: string;
  navigate: (path: string) => void;
  activeBackendHealth: { isConnected: boolean | null } | undefined;
  collapsedBackendPopoverOpen: boolean;
  setCollapsedBackendPopoverOpen: (open: boolean) => void;
  collapsedBackendPopoverRef: React.RefObject<HTMLDivElement | null>;
  collapsedBackendCloseTimer: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
  onOpenAddBackend: () => void;
  onOpenManageBackends: () => void;
}

export function SidebarRailBody({
  collapsed,
  showCollapseToggle,
  showMobileCloseButton = false,
  onCloseMobile,
  linkDisabled,
  collapseToggleLabel,
  onCollapse,
  onExpand,
  showCollapsedExpandButton,
  isExtensionsActive,
  currentPath,
  navigate,
  activeBackendHealth,
  collapsedBackendPopoverOpen,
  setCollapsedBackendPopoverOpen,
  collapsedBackendPopoverRef,
  collapsedBackendCloseTimer,
  onOpenAddBackend,
  onOpenManageBackends,
}: SidebarRailBodyProps) {
  const { t } = useTranslation("openhands");
  const backendCloseTimerRef = collapsedBackendCloseTimer;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sidebarHeaderRowClassName(collapsed)}>
        {collapsed && showCollapseToggle ? (
          <div className={SIDEBAR_COLLAPSED_LOGO_WRAPPER_CLASS}>
            <div
              className={cn(
                "flex h-full w-full items-center justify-start pl-2.5 transition-opacity duration-150",
                showCollapsedExpandButton && "opacity-0",
              )}
            >
              <OpenHandsLogoButton
                logoWidth={SIDEBAR_LOGO_WIDTH}
                logoHeight={SIDEBAR_LOGO_HEIGHT}
                logoClassName="max-w-none"
                className={cn(SIDEBAR_ICON_SLOT_CLASS, "overflow-visible")}
              />
            </div>
            <button
              type="button"
              data-testid="sidebar-collapse-toggle"
              aria-pressed={collapsed}
              aria-label={collapseToggleLabel}
              onClick={onExpand}
              className={cn(
                SIDEBAR_COLLAPSE_TOGGLE_OVERLAY_CLASS,
                showCollapsedExpandButton
                  ? "opacity-100 pointer-events-auto"
                  : "opacity-0 pointer-events-none",
              )}
            >
              <ChevronRight width={16} height={16} />
            </button>
          </div>
        ) : (
          <>
            <OpenHandsLogoButton
              logoWidth={SIDEBAR_LOGO_WIDTH}
              logoHeight={SIDEBAR_LOGO_HEIGHT}
              logoClassName="max-w-none"
              className={cn(SIDEBAR_ICON_SLOT_CLASS, "overflow-visible")}
            />
            {showCollapseToggle ? (
              <button
                type="button"
                data-testid="sidebar-collapse-toggle"
                aria-pressed={collapsed}
                aria-label={collapseToggleLabel}
                onClick={onCollapse}
                className={cn(
                  "hidden md:inline-flex ml-auto",
                  SIDEBAR_ICON_BUTTON_CLASS,
                  "text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)]",
                )}
              >
                <ChevronLeft width={16} height={16} />
              </button>
            ) : null}
            {showMobileCloseButton ? (
              <button
                type="button"
                data-testid="sidebar-mobile-drawer-close"
                onClick={onCloseMobile}
                aria-label={t(I18nKey.SIDEBAR$CLOSE_MENU)}
                className={cn(
                  "inline-flex ml-auto",
                  SIDEBAR_ICON_BUTTON_CLASS,
                  "text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)]",
                )}
              >
                <ChevronLeft width={16} height={16} />
              </button>
            ) : null}
          </>
        )}
      </div>

      <nav className={sidebarNavListClassName(collapsed)}>
        <SidebarNavLink
          to="/conversations"
          end
          label="New Chat"
          testId="sidebar-conversations-link"
          disabled={linkDisabled}
          collapsed={collapsed}
          icon={<Plus width={ICON_SIZE} height={ICON_SIZE} />}
        />
        <SidebarNavLink
          to="/customize"
          label="Customize"
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
              <path d="m17 16.5v5.17" />
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

      {collapsed && showCollapseToggle ? (
        <nav
          className={cn(
            sidebarNavListClassName(collapsed),
            "mt-auto pb-2 cursor-pointer",
          )}
        >
          <StyledTooltip
            content={t(I18nKey.SIDEBAR$SETTINGS)}
            placement="right"
          >
            <button
              type="button"
              data-testid="collapsed-settings-link"
              aria-label={t(I18nKey.SIDEBAR$SETTINGS)}
              onClick={() => navigate("/settings")}
              className={sidebarNavRowClassName({ collapsed: true })}
            >
              <SidebarCollapsedIconSlot
                active={currentPath.startsWith("/settings")}
              >
                <Settings width={ICON_SIZE} height={ICON_SIZE} />
              </SidebarCollapsedIconSlot>
              <span className={sidebarNavLabelClassName(true)}>
                {t(I18nKey.SIDEBAR$SETTINGS)}
              </span>
            </button>
          </StyledTooltip>
          <div
            className="relative"
            ref={collapsedBackendPopoverRef}
            onMouseEnter={() => {
              if (backendCloseTimerRef.current) {
                clearTimeout(backendCloseTimerRef.current);
                backendCloseTimerRef.current = null;
              }
              setCollapsedBackendPopoverOpen(true);
            }}
            onMouseLeave={() => {
              backendCloseTimerRef.current = setTimeout(
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
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onMouseUp={(event) => event.stopPropagation()}
              className={cn(
                sidebarNavRowClassName({ collapsed: true }),
                "relative",
              )}
            >
              <SidebarCollapsedIconSlot active={collapsedBackendPopoverOpen}>
                <span className="relative inline-flex size-[18px] shrink-0 items-center justify-center">
                  <BackendStatusDot
                    isConnected={activeBackendHealth?.isConnected ?? null}
                    className="absolute -left-0.5 -top-0.5 z-[1] pointer-events-none"
                  />
                  <Server width={ICON_SIZE} height={ICON_SIZE} />
                </span>
              </SidebarCollapsedIconSlot>
              <span className={sidebarNavLabelClassName(true)}>
                {t(I18nKey.BACKEND$MANAGE)}
              </span>
            </button>
            {collapsedBackendPopoverOpen ? (
              <div
                className="absolute bottom-[-4px] left-full pl-2.5 z-40 w-[272px]"
                onClick={(event) => event.stopPropagation()}
              >
                <BackendSelector
                  hideTrigger
                  defaultOpen
                  openUpward
                  onSelectOption={() => setCollapsedBackendPopoverOpen(false)}
                  onOpenAddBackend={onOpenAddBackend}
                  onOpenManageBackends={onOpenManageBackends}
                />
              </div>
            ) : null}
          </div>
        </nav>
      ) : null}

      {!collapsed ? (
        <div
          className={cn(
            "flex flex-col items-stretch max-w-none box-border shrink-0",
            "-ml-2.5 w-[calc(100%+0.625rem)] border-t border-[var(--oh-border)] pt-2 px-2.5",
          )}
        >
          <BackendSelector openUpward />
        </div>
      ) : null}
    </div>
  );
}
