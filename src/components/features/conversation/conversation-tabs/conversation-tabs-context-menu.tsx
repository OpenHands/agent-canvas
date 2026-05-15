import { useTranslation } from "react-i18next";
import { ContextMenu } from "#/ui/context-menu";
import { ContextMenuListItem } from "../../context-menu/context-menu-list-item";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { useConversationId } from "#/hooks/use-conversation-id";
import { useConversationLocalStorageState } from "#/utils/conversation-local-storage";
import {
  useConversationStore,
  type ConversationTab,
} from "#/stores/conversation-store";
import { I18nKey } from "#/i18n/declaration";
import TerminalIcon from "#/icons/terminal.svg?react";
import GlobeIcon from "#/icons/globe.svg?react";
import DocumentIcon from "#/icons/document.svg?react";
import VSCodeIcon from "#/icons/vscode.svg?react";
import PillIcon from "#/icons/pill.svg?react";
import PillFillIcon from "#/icons/pill-fill.svg?react";
import LessonPlanIcon from "#/icons/lesson-plan.svg?react";
import DoubleCheckIcon from "#/icons/double-check.svg?react";
import { useTaskList } from "#/hooks/use-task-list";
import { useActiveBackend } from "#/contexts/active-backend-context";

interface ConversationTabsContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConversationTabsContextMenu({
  isOpen,
  onClose,
}: ConversationTabsContextMenuProps) {
  const ref = useClickOutsideElement<HTMLUListElement>(onClose);
  const { t } = useTranslation("openhands");
  const { conversationId } = useConversationId();
  const {
    state,
    setUnpinnedTabs,
    setSelectedTab: setPersistedSelectedTab,
  } = useConversationLocalStorageState(conversationId);
  const { selectedTab, isRightPanelShown, setSelectedTab } =
    useConversationStore();

  const { hasTaskList } = useTaskList();
  const { backend } = useActiveBackend();

  const tabConfig = [
    {
      tab: "planner",
      icon: LessonPlanIcon,
      i18nKey: I18nKey.COMMON$PLANNER,
    },
    { tab: "files", icon: DocumentIcon, i18nKey: I18nKey.COMMON$FILES },
    { tab: "vscode", icon: VSCodeIcon, i18nKey: I18nKey.COMMON$CODE },
    { tab: "terminal", icon: TerminalIcon, i18nKey: I18nKey.COMMON$TERMINAL },
    { tab: "browser", icon: GlobeIcon, i18nKey: I18nKey.COMMON$BROWSER },
  ];

  if (hasTaskList) {
    tabConfig.unshift({
      tab: "tasklist",
      icon: DoubleCheckIcon,
      i18nKey: I18nKey.COMMON$TASK_LIST,
    });
  }

  // Hide the VSCode pin/unpin entry on local backends, mirroring the tab bar.
  const visibleTabConfig = tabConfig.filter(
    ({ tab }) => tab !== "vscode" || backend.kind === "cloud",
  );

  if (!isOpen) return null;

  const handleTabClick = (tab: string) => {
    if (state.unpinnedTabs.includes(tab)) {
      // Re-pinning a tab
      setUnpinnedTabs(state.unpinnedTabs.filter((item) => item !== tab));
    } else {
      // Unpinning a tab
      const newUnpinnedTabs = [...state.unpinnedTabs, tab];
      setUnpinnedTabs(newUnpinnedTabs);

      // If we're unpinning the currently selected tab while the panel is open,
      // switch to another pinned tab instead of hiding the panel
      if (selectedTab === tab && isRightPanelShown) {
        // Find the first tab that will still be pinned after this unpin
        const nextPinnedTab = visibleTabConfig.find(
          ({ tab: tabKey }) =>
            tabKey !== tab && !newUnpinnedTabs.includes(tabKey),
        );

        if (nextPinnedTab) {
          // Switch to another pinned tab
          setSelectedTab(nextPinnedTab.tab as ConversationTab);
          setPersistedSelectedTab(nextPinnedTab.tab as ConversationTab);
        }
        // If no other tabs are pinned, the panel will still show the last tab's content
        // but the tab won't be highlighted (which is acceptable behavior)
      }
    }
  };

  return (
    <ContextMenu
      ref={ref}
      alignment="right"
      position="bottom"
      className="mt-2 w-fit z-[9999]"
    >
      {visibleTabConfig.map(({ tab, icon: Icon, i18nKey }) => {
        const pinned = !state.unpinnedTabs.includes(tab);
        return (
          <ContextMenuListItem
            key={tab}
            onClick={() => handleTabClick(tab)}
            className="flex items-center gap-2 p-2 hover:bg-[var(--oh-interactive-hover)] rounded h-[30px]"
          >
            <Icon className="w-4 h-4" />
            <span className="text-white text-sm">{t(i18nKey)}</span>
            {pinned ? (
              <PillFillIcon className="w-7 h-7 ml-auto -mr-[5px]" />
            ) : (
              <PillIcon className="w-4.5 h-4.5 ml-auto" />
            )}
          </ContextMenuListItem>
        );
      })}
    </ContextMenu>
  );
}
