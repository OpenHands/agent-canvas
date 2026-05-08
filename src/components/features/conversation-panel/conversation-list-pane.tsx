import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { ConversationPanel } from "./conversation-panel";
import { NewConversationButton } from "./new-conversation-button";

interface ConversationListPaneProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function ConversationListPane({
  collapsed,
  onToggle,
}: ConversationListPaneProps) {
  const { t } = useTranslation("openhands");

  const expandLabel = t(I18nKey.SIDEBAR$EXPAND_CONVERSATIONS);
  const collapseLabel = t(I18nKey.SIDEBAR$COLLAPSE_CONVERSATIONS);
  const toggleLabel = collapsed ? expandLabel : collapseLabel;

  return (
    <aside
      data-testid="conversation-list-pane"
      aria-label={t(I18nKey.SIDEBAR$CONVERSATIONS)}
      className={cn(
        "h-full flex flex-col flex-shrink-0 transition-[width] duration-200 ease-in-out bg-[#13151a]",
        collapsed ? "w-[28px]" : "w-[320px]",
      )}
    >
      <div
        className={cn(
          "flex items-center p-2 gap-2",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <NewConversationButton />
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          data-testid="toggle-conversation-list"
          className="text-[#B1B9D3] hover:text-white p-1 rounded cursor-pointer shrink-0"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {collapsed ? (
              <polyline points="9 18 15 12 9 6" />
            ) : (
              <polyline points="15 18 9 12 15 6" />
            )}
          </svg>
        </button>
      </div>
      {!collapsed && (
        <div className="flex-1 min-h-0">
          <ConversationPanel />
        </div>
      )}
    </aside>
  );
}
