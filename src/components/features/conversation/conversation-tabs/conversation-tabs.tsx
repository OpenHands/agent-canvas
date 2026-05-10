import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import TerminalIcon from "#/icons/terminal.svg?react";
import GlobeIcon from "#/icons/globe.svg?react";
import DocumentIcon from "#/icons/document.svg?react";
import VSCodeIcon from "#/icons/vscode.svg?react";
import ThreeDotsVerticalIcon from "#/icons/three-dots-vertical.svg?react";
import LessonPlanIcon from "#/icons/lesson-plan.svg?react";
import DoubleCheckIcon from "#/icons/double-check.svg?react";
import RefreshIcon from "#/icons/u-refresh.svg?react";
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
import { useUnifiedGetGitChanges } from "#/hooks/query/use-unified-get-git-changes";
import { useHandleBuildPlanClick } from "#/hooks/use-handle-build-plan-click";
import { useAgentState } from "#/hooks/use-agent-state";
import { AgentState } from "#/types/agent-state";
import { Typography } from "#/ui/typography";

export function ConversationTabs() {
  const { conversationId } = useConversationId();
  const { setHasRightPanelToggled, setSelectedTab, planContent } =
    useConversationStore();

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const { state: persistedState } =
    useConversationLocalStorageState(conversationId);

  const { hasTaskList } = useTaskList();
  const { backend } = useActiveBackend();

  const { refetch: refetchGitChanges, isFetching: isFetchingGitChanges } =
    useUnifiedGetGitChanges();
  const { handleBuildPlanClick } = useHandleBuildPlanClick();
  const { curAgentState } = useAgentState();

  const {
    selectTab,
    isTabActive,
    onTabChange,
    selectedTab,
    isRightPanelShown,
  } = useSelectConversationTab();

  // Initialize Zustand state from localStorage on component mount
  useEffect(() => {
    // Initialize selectedTab from localStorage if available
    setSelectedTab(persistedState.selectedTab);
    setHasRightPanelToggled(persistedState.rightPanelShown);
  }, [
    setSelectedTab,
    setHasRightPanelToggled,
    persistedState.selectedTab,
    persistedState.rightPanelShown,
  ]);

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

  const { t } = useTranslation("openhands");

  const tabs = [
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
      tabValue: "files",
      isActive: isTabActive("files"),
      icon: DocumentIcon,
      onClick: () => selectTab("files"),
      tooltipContent: t(I18nKey.COMMON$FILES),
      tooltipAriaLabel: t(I18nKey.COMMON$FILES),
      label: t(I18nKey.COMMON$FILES),
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
    tabs.unshift({
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

  const isAgentRunning =
    curAgentState === AgentState.RUNNING ||
    curAgentState === AgentState.LOADING;
  const isBuildDisabled = isAgentRunning || !planContent;

  return (
    <div
      className={cn(
        "relative w-full",
        "flex flex-row justify-start lg:justify-end items-center gap-4.5 flex-wrap",
      )}
    >
      {visibleTabs.map(
        (
          {
            tabValue,
            icon,
            onClick,
            isActive,
            tooltipContent,
            tooltipAriaLabel,
            label,
            className,
          },
          index,
        ) => (
          <ChatActionTooltip
            key={index}
            tooltip={tooltipContent}
            ariaLabel={tooltipAriaLabel}
          >
            <ConversationTabNav
              tabValue={tabValue}
              icon={icon}
              onClick={onClick}
              isActive={isActive}
              label={label}
              className={className}
            />
          </ChatActionTooltip>
        ),
      )}
      {isTabActive("files") && (
        <button
          type="button"
          className="flex w-[26px] py-1 justify-center items-center gap-[10px] rounded-[7px] hover:enabled:bg-[#474A54] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => refetchGitChanges()}
          disabled={isFetchingGitChanges}
          aria-label={t(I18nKey.COMMON$FILES)}
        >
          <RefreshIcon
            width={12.75}
            height={15}
            color="#ffffff"
            className={isFetchingGitChanges ? "animate-spin" : ""}
          />
        </button>
      )}
      {isTabActive("planner") && (
        <button
          type="button"
          onClick={handleBuildPlanClick}
          disabled={isBuildDisabled}
          className={cn(
            "flex items-center justify-center h-5 min-w-17 px-2 rounded bg-white transition-opacity",
            isBuildDisabled
              ? "opacity-50 cursor-not-allowed"
              : "hover:opacity-90 cursor-pointer",
          )}
          data-testid="planner-tab-build-button"
        >
          <Typography.Text className="text-black text-[11px] font-medium leading-5">
            {/* eslint-disable-next-line i18next/no-literal-string */}
            {t(I18nKey.COMMON$BUILD)} ⌘↩
          </Typography.Text>
        </button>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={cn(
            "p-1 pl-0 rounded-md cursor-pointer",
            "text-[#9299AA] bg-transparent hover:text-white",
          )}
          aria-label={t(I18nKey.COMMON$MORE_OPTIONS)}
        >
          <ThreeDotsVerticalIcon className={cn("w-5 h-5 text-inherit")} />
        </button>
        <ConversationTabsContextMenu
          isOpen={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
        />
      </div>
    </div>
  );
}
