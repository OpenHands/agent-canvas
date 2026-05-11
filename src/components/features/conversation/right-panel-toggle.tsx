import { useTranslation } from "react-i18next";
import { useConversationId } from "#/hooks/use-conversation-id";
import { useConversationLocalStorageState } from "#/utils/conversation-local-storage";
import { useConversationStore } from "#/stores/conversation-store";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import BlockDrawerLeftIcon from "#/icons/block-drawer-left.svg?react";
import { ChatActionTooltip } from "../chat/chat-action-tooltip";

interface RightPanelToggleProps {
  className?: string;
}

/**
 * Toggle button for showing/hiding the right panel.
 * This component is placed in the chat header so users can always
 * restore the panel, even when it's hidden.
 */
export function RightPanelToggle({ className }: RightPanelToggleProps) {
  const { t } = useTranslation("openhands");
  const { conversationId } = useConversationId();
  const { setRightPanelShown } =
    useConversationLocalStorageState(conversationId);
  const { isRightPanelShown, setHasRightPanelToggled, setSelectedTab } =
    useConversationStore();

  const handleToggle = () => {
    const newState = !isRightPanelShown;
    setHasRightPanelToggled(newState);
    setRightPanelShown(newState);

    // If opening the panel and no tab is selected, default to files
    if (newState) {
      const { selectedTab } = useConversationStore.getState();
      if (!selectedTab) {
        setSelectedTab("files");
      }
    }
  };

  const tooltipText = isRightPanelShown
    ? t(I18nKey.COMMON$HIDE_PANEL)
    : t(I18nKey.COMMON$SHOW_PANEL);

  return (
    <ChatActionTooltip tooltip={tooltipText} ariaLabel={tooltipText}>
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "p-1 rounded-md cursor-pointer transition-colors",
          "text-[#9299AA] hover:text-white hover:bg-white/10",
          isRightPanelShown && "text-white bg-white/10",
          className,
        )}
        aria-label={tooltipText}
        aria-pressed={isRightPanelShown}
        data-testid="right-panel-toggle"
      >
        <BlockDrawerLeftIcon className="w-5 h-5" />
      </button>
    </ChatActionTooltip>
  );
}
