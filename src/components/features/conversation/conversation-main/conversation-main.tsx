import React from "react";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  mobileTopBarIconButtonClassName,
  mobileTopBarIconClassName,
} from "#/utils/mobile-top-bar-icon-button-classes";
import { ChatInterfaceWrapper } from "./chat-interface-wrapper";
import { ConversationTabContent } from "../conversation-tabs/conversation-tab-content/conversation-tab-content";
import { ConversationNameWithStatus } from "../conversation-name-with-status";
import { ConversationTabs } from "../conversation-tabs/conversation-tabs";
import { ResizeHandle } from "../../../ui/resize-handle";
import { useResizablePanels } from "#/hooks/use-resizable-panels";
import { useConversationStore } from "#/stores/conversation-store";
import {
  useBreakpoint,
  SIDEBAR_RAIL_COLLAPSE_MAX_WIDTH,
} from "#/hooks/use-breakpoint";
import { SidebarMobileMenuToggle } from "#/components/features/sidebar/sidebar-mobile-menu-toggle";

function getDesktopTabPanelClass(isRightPanelShown: boolean) {
  return isRightPanelShown
    ? "translate-x-0 opacity-100"
    : "w-0 translate-x-full opacity-0";
}

export function ConversationMain() {
  const isMobile = useBreakpoint();
  const isSidebarRailHidden = useBreakpoint(SIDEBAR_RAIL_COLLAPSE_MAX_WIDTH);
  const { isRightPanelShown } = useConversationStore();

  const { leftWidth, rightWidth, isDragging, containerRef, handleMouseDown } =
    useResizablePanels({
      defaultLeftWidth: 50,
      minLeftWidth: 30,
      maxLeftWidth: 80,
      storageKey: "desktop-layout-panel-width",
    });

  return (
    <div
      className={cn(
        isMobile
          ? "relative flex-1 flex flex-col"
          : "h-full flex flex-col overflow-hidden",
      )}
    >
      <div
        ref={containerRef}
        className={cn(
          "flex flex-1 overflow-hidden",
          isMobile ? "flex-col" : "transition-all duration-300 ease-in-out",
        )}
        // transition toggled at runtime based on drag state
        style={
          !isMobile
            ? { transitionProperty: isDragging ? "none" : "all" }
            : undefined
        }
      >
        {/* Chat Panel - always mounted, styled differently for mobile/desktop.
            Owns its own header (name + status) and gets bottom padding so the
            chat input doesn't slam the floor. */}
        <div
          className={cn(
            "flex flex-col bg-base overflow-hidden",
            isMobile ? "flex-1" : "transition-all duration-300 ease-in-out",
          )}
          // panel width computed at runtime by resize hook; transition toggled by drag state
          style={
            !isMobile
              ? {
                  width: isRightPanelShown ? `${leftWidth}%` : "100%",
                  transitionProperty: isDragging ? "none" : "all",
                }
              : undefined
          }
        >
          <div
            data-testid="chat-pane-header"
            className={cn(
              "flex h-10 min-h-10 shrink-0 items-center",
              isSidebarRailHidden && "gap-2 pl-2.5",
            )}
          >
            {isSidebarRailHidden ? <SidebarMobileMenuToggle /> : null}
            <div className="min-w-0 flex-1">
              <ConversationNameWithStatus />
            </div>
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <ChatInterfaceWrapper
              isRightPanelShown={!isMobile && isRightPanelShown}
            />
          </div>
        </div>

        {/* Resize Handle - only shown on desktop when right panel is visible */}
        {!isMobile && isRightPanelShown && (
          <ResizeHandle onMouseDown={handleMouseDown} isDragging={isDragging} />
        )}

        {/* Right panel: desktop side drawer. Mobile opens Files/Tools via /panel route. */}
        {!isMobile && (
          <div
            className={cn(
              "transition-all duration-300 ease-in-out overflow-hidden",
              getDesktopTabPanelClass(isRightPanelShown),
            )}
            style={{
              width: isRightPanelShown ? `${rightWidth}%` : "0%",
              transitionProperty: isDragging ? "opacity, transform" : "all",
            }}
          >
            <div className="flex h-full w-full flex-col">
              <div className="flex flex-col flex-1 min-h-0 bg-[var(--oh-surface)] border-l border-[var(--oh-border)] overflow-hidden">
                <div
                  data-testid="tabs-pane-header"
                  className="flex shrink-0 flex-col border-b border-[var(--oh-border)]"
                >
                  <ConversationTabs />
                </div>
                <div className="flex-1 min-h-0 flex flex-col">
                  <ConversationTabContent />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ConversationMobilePanelPage({
  onNavigateBack,
}: {
  onNavigateBack: () => void;
}) {
  const { t } = useTranslation("openhands");
  const { setIsRightPanelShown, setHasRightPanelToggled, setSelectedTab } =
    useConversationStore();

  React.useLayoutEffect(() => {
    setIsRightPanelShown(true);
    setHasRightPanelToggled(true);
    const st = useConversationStore.getState();
    if (!st.selectedTab) {
      setSelectedTab("files");
    }
    return () => {
      setIsRightPanelShown(false);
      setHasRightPanelToggled(false);
    };
  }, [setIsRightPanelShown, setHasRightPanelToggled, setSelectedTab]);

  const handleBack = () => {
    onNavigateBack();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <div
        data-testid="conversation-mobile-panel-top"
        className="flex h-10 min-h-10 shrink-0 items-center gap-1.5 border-b border-[var(--oh-border)] pl-2.5"
      >
        <button
          type="button"
          data-testid="conversation-mobile-panel-back"
          onClick={handleBack}
          aria-label={t(I18nKey.COMMON$BACK)}
          className={mobileTopBarIconButtonClassName}
        >
          <ChevronLeft
            size={20}
            className={mobileTopBarIconClassName}
            aria-hidden
            strokeWidth={2}
          />
        </button>
        <div className="flex min-h-0 min-w-0 flex-1 items-center self-stretch">
          <div
            data-testid="tabs-pane-header"
            className="flex h-full min-h-0 w-full min-w-0 flex-col justify-center"
          >
            <ConversationTabs variant="compact" />
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-[var(--oh-surface)]">
        <ConversationTabContent />
      </div>
    </div>
  );
}
