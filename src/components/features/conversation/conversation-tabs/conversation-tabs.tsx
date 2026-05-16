import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import TerminalIcon from "#/icons/terminal.svg?react";
import GlobeIcon from "#/icons/globe.svg?react";
import DocumentIcon from "#/icons/document.svg?react";
import VSCodeIcon from "#/icons/vscode.svg?react";
import LessonPlanIcon from "#/icons/lesson-plan.svg?react";
import DoubleCheckIcon from "#/icons/double-check.svg?react";
import { EllipsisButton } from "#/components/features/conversation-panel/ellipsis-button";
import { cn } from "#/utils/utils";
import { useConversationLocalStorageState } from "#/utils/conversation-local-storage";
import { ConversationTabNav } from "./conversation-tab-nav";
import { ChatActionTooltip } from "../../chat/chat-action-tooltip";
import { I18nKey } from "#/i18n/declaration";
import { VSCodeTooltipContent } from "./vscode-tooltip-content";
import { useConversationStore } from "#/stores/conversation-store";
import { ConversationTabsContextMenu } from "./conversation-tabs-context-menu";
import { useConversationId } from "#/hooks/use-conversation-id";
import { useSelectConversationTab } from "#/hooks/use-select-conversation-tab";
import { useTaskList } from "#/hooks/use-task-list";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useHandleBuildPlanClick } from "#/hooks/use-handle-build-plan-click";
import { useAgentState } from "#/hooks/use-agent-state";
import { AgentState } from "#/types/agent-state";
import { Typography } from "#/ui/typography";

export function ConversationTabs() {
  const { conversationId } = useConversationId();
  const { setSelectedTab, planContent } = useConversationStore();

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const { state: persistedState } =
    useConversationLocalStorageState(conversationId);

  const { hasTaskList } = useTaskList();
  const { backend } = useActiveBackend();

  const { handleBuildPlanClick } = useHandleBuildPlanClick();
  const { curAgentState } = useAgentState();

  const {
    selectTab,
    isTabActive,
    onTabChange,
    selectedTab,
    isRightPanelShown,
  } = useSelectConversationTab();

  // Restore the most-recently-used tab from localStorage so users don't
  // lose their tab selection across reloads.
  //
  // Note: we deliberately do NOT mirror `rightPanelShown` from
  // localStorage. The drawer's open/closed state is session-only — see
  // the comment in `useConversationStore` and the schema note in
  // `conversation-local-storage.ts` for the rationale.
  useEffect(() => {
    setSelectedTab(persistedState.selectedTab);
  }, [setSelectedTab, persistedState.selectedTab]);

  useEffect(() => {
    const handlePanelVisibilityChange = () => {
      if (isRightPanelShown) {
        // If no tab is selected, default to files tab
        if (!selectedTab) {
          onTabChange("files");
        }
      }
    };

    handlePanelVisibilityChange();
  }, [isRightPanelShown, selectedTab, onTabChange]);

  const { t, i18n } = useTranslation("openhands");

  // `files` is intentionally the leftmost tab — it's the primary entry
  // point for inspecting agent output (workspace files + git diff).
  const tabs = [
    {
      tabValue: "files",
      isActive: isTabActive("files"),
      icon: DocumentIcon,
      onClick: () => selectTab("files"),
      tooltipContent: t(I18nKey.COMMON$FILES),
      tooltipAriaLabel: t(I18nKey.COMMON$FILES),
      label: t(I18nKey.COMMON$FILES),
    },
    {
      tabValue: "planner",
      isActive: isTabActive("planner"),
      icon: LessonPlanIcon,
      onClick: () => selectTab("planner"),
      tooltipContent: t(I18nKey.COMMON$PLANNER),
      tooltipAriaLabel: t(I18nKey.COMMON$PLANNER),
      label: t(I18nKey.COMMON$PLANNER),
    },
    {
      tabValue: "vscode",
      isActive: isTabActive("vscode"),
      icon: VSCodeIcon,
      onClick: () => selectTab("vscode"),
      tooltipContent: <VSCodeTooltipContent />,
      tooltipAriaLabel: t(I18nKey.COMMON$CODE),
      label: t(I18nKey.COMMON$CODE),
    },
    {
      tabValue: "terminal",
      isActive: isTabActive("terminal"),
      icon: TerminalIcon,
      onClick: () => selectTab("terminal"),
      tooltipContent: t(I18nKey.COMMON$TERMINAL),
      tooltipAriaLabel: t(I18nKey.COMMON$TERMINAL),
      label: t(I18nKey.COMMON$TERMINAL),
      className: "pl-2",
    },
    {
      tabValue: "browser",
      isActive: isTabActive("browser"),
      icon: GlobeIcon,
      onClick: () => selectTab("browser"),
      tooltipContent: t(I18nKey.COMMON$BROWSER),
      tooltipAriaLabel: t(I18nKey.COMMON$BROWSER),
      label: t(I18nKey.COMMON$BROWSER),
    },
  ];

  if (hasTaskList) {
    // Insert after `files` so the leftmost slot stays Files.
    tabs.splice(1, 0, {
      tabValue: "tasklist",
      isActive: isTabActive("tasklist"),
      icon: DoubleCheckIcon,
      onClick: () => selectTab("tasklist"),
      tooltipContent: t(I18nKey.COMMON$TASK_LIST),
      tooltipAriaLabel: t(I18nKey.COMMON$TASK_LIST),
      label: t(I18nKey.COMMON$TASK_LIST),
    });
  }

  // Filter out unpinned tabs, and hide the VSCode tab on local backends
  // (the agent-server's VSCode URL is only reachable in cloud deployments).
  const visibleTabs = tabs.filter((tab) => {
    if (tab.tabValue === "vscode" && backend.kind !== "cloud") return false;
    return !persistedState.unpinnedTabs.includes(tab.tabValue);
  });

  const unpinnedSignature = persistedState.unpinnedTabs.join(",");

  const isAgentRunning =
    curAgentState === AgentState.RUNNING ||
    curAgentState === AgentState.LOADING;
  const isBuildDisabled = isAgentRunning || !planContent;

  const tabsRowInnerRef = useRef<HTMLDivElement>(null);
  const measureRowRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [inlineTabCount, setInlineTabCount] = useState(visibleTabs.length);

  useLayoutEffect(() => {
    const rowInner = tabsRowInnerRef.current;
    const measureRow = measureRowRef.current;
    const menuEl = menuRef.current;
    if (!rowInner || !measureRow || !menuEl) return undefined;

    const measure = () => {
      const measureButtons = measureRow.querySelectorAll<HTMLButtonElement>(
        '[data-tab-measure="true"]',
      );
      const tabCount = measureButtons.length;

      const rowWidth = rowInner.getBoundingClientRect().width;
      if (rowWidth === 0) {
        setInlineTabCount(tabCount);
        return;
      }

      const widths = Array.from(measureButtons).map(
        (button) => button.getBoundingClientRect().width,
      );

      if (widths.length !== tabCount || tabCount === 0) {
        setInlineTabCount(Math.max(0, tabCount));
        return;
      }

      const menuWidth = menuEl.getBoundingClientRect().width;
      const gapCss =
        getComputedStyle(rowInner).columnGap || getComputedStyle(rowInner).gap;
      const gapPx = parseFloat(gapCss) || 6;

      let nextCount = 0;
      for (let k = tabCount; k >= 0; k -= 1) {
        let total = menuWidth;
        for (let i = 0; i < k; i += 1) {
          total += widths[i] ?? 0;
        }
        if (k > 0) {
          total += k * gapPx;
        }
        if (total <= rowWidth + 0.5) {
          nextCount = k;
          break;
        }
      }

      setInlineTabCount((prev) => (prev === nextCount ? prev : nextCount));
    };

    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(rowInner);
    return () => ro.disconnect();
  }, [
    unpinnedSignature,
    visibleTabs.length,
    hasTaskList,
    backend.kind,
    selectedTab,
    isRightPanelShown,
    i18n.language,
  ]);

  const safeInlineTabCount = Math.min(inlineTabCount, visibleTabs.length);

  return (
    <>
      <div className="relative min-h-10 w-full min-w-0 p-1">
        <div
          ref={measureRowRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-[-10000px] flex flex-nowrap items-center gap-1.5"
        >
          {visibleTabs.map(
            (
              {
                tabValue,
                icon,
                isActive,
                tooltipContent,
                tooltipAriaLabel,
                label,
                className: tabClassName,
              },
              index,
            ) => (
              <ChatActionTooltip
                key={`measure-${tabValue}-${index}`}
                tooltip={tooltipContent}
                ariaLabel={tooltipAriaLabel}
              >
                <ConversationTabNav
                  tabValue={tabValue}
                  icon={icon}
                  onClick={() => {}}
                  isActive={isActive}
                  label={label}
                  className={cn(tabClassName, "shrink-0")}
                  measureOnly
                />
              </ChatActionTooltip>
            ),
          )}
        </div>
        <div
          ref={tabsRowInnerRef}
          className="flex w-full min-w-0 flex-nowrap justify-start"
        >
          <div className="flex w-fit max-w-full min-w-0 flex-nowrap items-center gap-1.5">
            <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-hidden">
              {visibleTabs
                .slice(0, safeInlineTabCount)
                .map(
                  (
                    {
                      tabValue,
                      icon,
                      onClick,
                      isActive,
                      tooltipContent,
                      tooltipAriaLabel,
                      label,
                      className: tabClassName,
                    },
                    index,
                  ) => (
                    <ChatActionTooltip
                      key={`${tabValue}-${index}`}
                      tooltip={tooltipContent}
                      ariaLabel={tooltipAriaLabel}
                    >
                      <ConversationTabNav
                        tabValue={tabValue}
                        icon={icon}
                        onClick={onClick}
                        isActive={isActive}
                        label={label}
                        className={cn(tabClassName, "shrink-0")}
                      />
                    </ChatActionTooltip>
                  ),
                )}
            </div>
            <div ref={menuRef} className="relative shrink-0">
              <EllipsisButton
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                ariaLabel={t(I18nKey.COMMON$MORE_OPTIONS)}
              />
              <ConversationTabsContextMenu
                isOpen={isMenuOpen}
                onClose={() => setIsMenuOpen(false)}
              />
            </div>
          </div>
        </div>
      </div>
      {isTabActive("planner") && (
        <div
          className={cn(
            "flex h-10 min-h-10 shrink-0 items-center border-t border-[var(--oh-border)] pl-[10px] pr-1",
          )}
        >
          <button
            type="button"
            onClick={handleBuildPlanClick}
            disabled={isBuildDisabled}
            className={cn(
              "flex h-5 min-w-17 items-center justify-center rounded bg-white px-2 transition-opacity",
              isBuildDisabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:opacity-90",
            )}
            data-testid="planner-tab-build-button"
          >
            <Typography.Text className="text-[11px] font-medium leading-5 text-black">
              {/* eslint-disable-next-line i18next/no-literal-string */}
              {t(I18nKey.COMMON$BUILD)} ⌘↩
            </Typography.Text>
          </button>
        </div>
      )}
    </>
  );
}
