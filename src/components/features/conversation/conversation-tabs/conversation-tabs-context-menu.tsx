import React from "react";
import { useTranslation } from "react-i18next";
import { ContextMenu } from "#/ui/context-menu";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { useConversationId } from "#/hooks/use-conversation-id";
import { useConversationLocalStorageState } from "#/utils/conversation-local-storage";
import {
  useConversationStore,
  type ConversationTab,
} from "#/stores/conversation-store";
import { I18nKey } from "#/i18n/declaration";
import { Globe, ListTodo, SquareChevronRight } from "lucide-react";
import DocumentIcon from "#/icons/document.svg?react";
import PillIcon from "#/icons/pill.svg?react";
import PillFillIcon from "#/icons/pill-fill.svg?react";
import DoubleCheckIcon from "#/icons/double-check.svg?react";
import { useTaskList } from "#/hooks/use-task-list";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useSelectConversationTab } from "#/hooks/use-select-conversation-tab";
import { useIsArchivedConversation } from "#/hooks/use-is-archived-conversation";
import { ArchivedDisabledTooltip } from "../../context-menu/archived-disabled-tooltip";
import { cn } from "#/utils/utils";
import {
  dropdownInstantColorClassName,
  dropdownMenuRowIconWrapperClassName,
} from "#/utils/dropdown-classes";

interface ConversationTabsContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  ignoreOutsideClickRef?: React.RefObject<HTMLElement | null>;
}

export function ConversationTabsContextMenu({
  isOpen,
  onClose,
  ignoreOutsideClickRef,
}: ConversationTabsContextMenuProps) {
  const ref = useClickOutsideElement<HTMLUListElement>(
    onClose,
    ignoreOutsideClickRef,
  );
  const { t } = useTranslation("openhands");
  const { conversationId } = useConversationId();
  const {
    state,
    setUnpinnedTabs,
    setSelectedTab: setPersistedSelectedTab,
  } = useConversationLocalStorageState(conversationId);
  const { selectedTab, isRightPanelShown, setSelectedTab } =
    useConversationStore();

  const { navigateToTab } = useSelectConversationTab();

  const { hasTaskList } = useTaskList();
  const { backend } = useActiveBackend();
  const isArchivedConversation = useIsArchivedConversation();

  const tabConfig = [
    {
      tab: "planner",
      icon: ListTodo,
      i18nKey: I18nKey.COMMON$PLANNER,
    },
    { tab: "files", icon: DocumentIcon, i18nKey: I18nKey.COMMON$FILES },
    {
      tab: "terminal",
      icon: SquareChevronRight,
      i18nKey: I18nKey.COMMON$TERMINAL,
    },
    { tab: "browser", icon: Globe, i18nKey: I18nKey.COMMON$BROWSER },
  ];

  if (hasTaskList) {
    tabConfig.unshift({
      tab: "tasklist",
      icon: DoubleCheckIcon,
      i18nKey: I18nKey.COMMON$TASK_LIST,
    });
  }

  const visibleTabConfig = tabConfig.filter(
    ({ tab }) => tab !== "planner" || backend.kind === "cloud",
  );

  if (!isOpen) return null;

  const handleOpenTab = (tab: string) => {
    if (isArchivedConversation) {
      return;
    }
    navigateToTab(tab as ConversationTab);
    onClose();
  };

  const handlePinToggle = (tab: string, e: React.MouseEvent) => {
    if (isArchivedConversation) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (state.unpinnedTabs.includes(tab)) {
      setUnpinnedTabs(state.unpinnedTabs.filter((item) => item !== tab));
    } else {
      const newUnpinnedTabs = [...state.unpinnedTabs, tab];
      setUnpinnedTabs(newUnpinnedTabs);

      if (selectedTab === tab && isRightPanelShown) {
        const nextPinnedTab = visibleTabConfig.find(
          ({ tab: tabKey }) =>
            tabKey !== tab && !newUnpinnedTabs.includes(tabKey),
        );

        if (nextPinnedTab) {
          setSelectedTab(nextPinnedTab.tab as ConversationTab);
          setPersistedSelectedTab(nextPinnedTab.tab as ConversationTab);
        }
      }
    }
  };

  return (
    <ContextMenu
      ref={ref}
      alignment="right"
      position="bottom"
      className="z-[9999] mt-2 w-fit"
    >
      {visibleTabConfig.map(({ tab, icon: Icon, i18nKey }) => {
        const pinned = !state.unpinnedTabs.includes(tab);
        return (
          <li key={tab} className="list-none">
            <ArchivedDisabledTooltip isDisabled={isArchivedConversation}>
              <div
                className={cn(
                  "group flex h-[30px] w-full min-w-0 items-stretch rounded",
                  !isArchivedConversation &&
                    "hover:bg-[var(--oh-interactive-hover)]",
                  isArchivedConversation && "opacity-50",
                )}
              >
                <button
                  type="button"
                  data-testid={`conversation-tabs-menu-open-${tab}`}
                  disabled={isArchivedConversation}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-l p-2 text-start text-white",
                    dropdownInstantColorClassName,
                    isArchivedConversation
                      ? "cursor-not-allowed"
                      : "cursor-pointer",
                  )}
                  onClick={() => handleOpenTab(tab)}
                >
                  <span
                    className={dropdownMenuRowIconWrapperClassName}
                    aria-hidden
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm">{t(i18nKey)}</span>
                </button>
                <button
                  type="button"
                  data-testid={`conversation-tabs-menu-pin-${tab}`}
                  disabled={isArchivedConversation}
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-r px-2 text-white",
                    dropdownInstantColorClassName,
                    isArchivedConversation
                      ? "cursor-not-allowed"
                      : "cursor-pointer hover:bg-white/10",
                  )}
                  aria-pressed={pinned}
                  aria-label={pinned ? "Unpin tab from bar" : "Pin tab to bar"}
                  onClick={(e) => handlePinToggle(tab, e)}
                >
                  {pinned ? (
                    <span
                      className={cn(
                        "-mr-[5px] ml-auto",
                        dropdownMenuRowIconWrapperClassName,
                      )}
                      aria-hidden
                    >
                      <PillFillIcon className="h-7 w-7" />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "ml-auto",
                        dropdownMenuRowIconWrapperClassName,
                      )}
                      aria-hidden
                    >
                      <PillIcon className="h-4.5 w-4.5" />
                    </span>
                  )}
                </button>
              </div>
            </ArchivedDisabledTooltip>
          </li>
        );
      })}
    </ContextMenu>
  );
}
