import React from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Server,
  Settings,
  X,
} from "lucide-react";
import { OpenHandsLogoButton } from "#/components/shared/buttons/openhands-logo-button";
import { SidebarNavLink } from "./sidebar-nav-link";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { BackendSelector } from "#/components/features/backends/backend-selector";
import { BackendStatusDot } from "#/components/features/backends/backend-status-dot";
import { SidebarConversationList } from "./sidebar-conversation-list";
import AutomationsIcon from "#/icons/automations.svg?react";

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
      <div
        className={cn(
          "flex items-center gap-2 h-10 min-h-10 shrink-0",
          collapsed && showCollapseToggle && "md:h-auto md:min-h-0 md:py-2",
          collapsed && showCollapseToggle
            ? "md:flex-col md:gap-2 md:px-0"
            : "pl-2 pr-2",
        )}
      >
        {collapsed && showCollapseToggle ? (
          <div className="relative hidden md:block mx-auto">
            <div
              className={cn(
                "transition-opacity duration-150",
                showCollapsedExpandButton && "opacity-0",
              )}
            >
              <OpenHandsLogoButton
                logoWidth={SIDEBAR_LOGO_WIDTH}
                logoHeight={SIDEBAR_LOGO_HEIGHT}
                logoClassName="max-w-none"
                className="inline-flex h-10 w-10 items-center justify-center overflow-visible"
              />
            </div>
            <button
              type="button"
              data-testid="sidebar-collapse-toggle"
              aria-pressed={collapsed}
              aria-label={collapseToggleLabel}
              onClick={onExpand}
              className={cn(
                "absolute inset-0 hidden md:inline-flex items-center justify-center",
                "rounded-md text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)]",
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
            <OpenHandsLogoButton
              logoWidth={SIDEBAR_LOGO_WIDTH}
              logoHeight={SIDEBAR_LOGO_HEIGHT}
              logoClassName="max-w-none"
              className="inline-flex w-[18px] shrink-0 items-center justify-center overflow-visible"
            />
            {showCollapseToggle ? (
              <button
                type="button"
                data-testid="sidebar-collapse-toggle"
                aria-pressed={collapsed}
                aria-label={collapseToggleLabel}
                onClick={onCollapse}
                className={cn(
                  "hidden md:inline-flex items-center justify-center shrink-0",
                  "w-7 h-7 rounded-md text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)]",
                  "transition-colors cursor-pointer ml-auto",
                )}
              >
                <ChevronLeft width={18} height={18} />
              </button>
            ) : null}
            {showMobileCloseButton ? (
              <button
                type="button"
                data-testid="sidebar-mobile-drawer-close"
                onClick={onCloseMobile}
                aria-label={t(I18nKey.SIDEBAR$CLOSE_MENU)}
                className={cn(
                  "inline-flex items-center justify-center shrink-0 ml-auto",
                  "w-7 h-7 rounded-md text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)]",
                  "transition-colors cursor-pointer",
                )}
              >
                <X width={18} height={18} />
              </button>
            ) : null}
          </>
        )}
      </div>

      <nav
        className={cn(
          "flex flex-col gap-0.5 w-full shrink-0",
          collapsed ? "items-center" : "items-stretch pr-2",
        )}
      >
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
          to="/skills"
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
        <div className="hidden md:flex md:flex-col md:items-center mt-auto gap-2 pb-2 cursor-pointer">
          <StyledTooltip
            content={t(I18nKey.SIDEBAR$SETTINGS)}
            placement="right"
          >
            <button
              type="button"
              data-testid="collapsed-settings-link"
              aria-label={t(I18nKey.SIDEBAR$SETTINGS)}
              onClick={() => navigate("/settings")}
              className={cn(
                "inline-flex items-center justify-center w-10 h-10 p-0 mx-auto rounded-md transition-colors cursor-pointer",
                currentPath.startsWith("/settings")
                  ? "bg-tertiary text-white font-medium"
                  : "text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)]",
              )}
            >
              <Settings width={16} height={16} />
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
                "relative inline-flex items-center justify-center w-10 h-10 p-0 mx-auto rounded-md transition-colors",
                collapsedBackendPopoverOpen
                  ? "bg-tertiary text-white font-medium"
                  : "text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)]",
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
                className="absolute bottom-[-4px] left-full pl-2 z-40 w-[272px]"
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
        </div>
      ) : null}

      {!collapsed ? (
        <div
          className={cn(
            "flex flex-col items-stretch max-w-none box-border shrink-0",
            "-ml-2 w-[calc(100%+0.5rem)] border-t border-[var(--oh-border)] pt-2 px-2",
          )}
        >
          <BackendSelector openUpward />
        </div>
      ) : null}
    </div>
  );
}
