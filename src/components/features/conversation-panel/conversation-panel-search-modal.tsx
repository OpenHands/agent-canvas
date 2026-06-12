import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  modalWidthClassName,
} from "#/components/shared/modals/modal-body";
import { cn } from "#/utils/utils";
import { formatTimeDelta } from "#/utils/format-time-delta";
import { filterConversationsByQuery } from "./filter-conversations-by-query";
import { HighlightSearchMatch } from "./highlight-search-match";
import { ConversationPanelSearchInput } from "./conversation-panel-search-toggle";

function getConversationContextLabel(
  conversation: AppConversation,
): string | null {
  if (conversation.selected_repository) {
    const parts = conversation.selected_repository.split("/");
    return parts[parts.length - 1] ?? conversation.selected_repository;
  }

  const workspacePath =
    conversation.selected_workspace ?? conversation.workspace?.working_dir;
  if (!workspacePath) {
    return null;
  }

  const segments = workspacePath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? workspacePath;
}

interface ConversationPanelSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: readonly AppConversation[];
  onSelectConversation: (conversationId: string) => void;
}

export function ConversationPanelSearchModal({
  isOpen,
  onClose,
  conversations,
  onSelectConversation,
}: ConversationPanelSearchModalProps) {
  const { t } = useTranslation("openhands");
  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const filteredConversations = React.useMemo(
    () => filterConversationsByQuery(conversations, query),
    [conversations, query],
  );

  React.useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  React.useEffect(() => {
    const selectedItem = itemRefs.current[selectedIndex];
    if (typeof selectedItem?.scrollIntoView === "function") {
      selectedItem.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, filteredConversations.length]);

  const handleClose = React.useCallback(() => {
    setQuery("");
    setSelectedIndex(0);
    onClose();
  }, [onClose]);

  const handleSelect = React.useCallback(
    (conversationId: string) => {
      onSelectConversation(conversationId);
      handleClose();
    },
    [handleClose, onSelectConversation],
  );

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredConversations.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredConversations.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex(
        (prev) =>
          (prev - 1 + filteredConversations.length) %
          filteredConversations.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selected = filteredConversations[selectedIndex];
      if (selected) {
        handleSelect(selected.id);
      }
    }
  };

  if (!isOpen) {
    return null;
  }

  const showMostRecentLabel = !query.trim();

  return (
    <ModalBackdrop
      onClose={handleClose}
      aria-label={t(I18nKey.CONVERSATION_PANEL$SEARCH_ARIA)}
    >
      <div
        data-testid="conversation-panel-search-modal"
        className={cn(
          "flex max-h-[min(420px,60vh)] flex-col overflow-hidden rounded-xl",
          "border border-[var(--oh-border)] bg-base-secondary shadow-xl",
          modalWidthClassName("md"),
          MODAL_MAX_WIDTH_VIEWPORT,
        )}
      >
        <div className="border-b border-[var(--oh-border)] p-1">
          <ConversationPanelSearchInput
            query={query}
            onQueryChange={setQuery}
            onKeyDown={handleInputKeyDown}
            shouldFocusOnMount
            variant="plain"
          />
        </div>

        <div
          role="listbox"
          aria-label={t(I18nKey.CONVERSATION_PANEL$SEARCH_ARIA)}
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar-always"
        >
          {showMostRecentLabel ? (
            <div
              data-testid="conversation-panel-search-section-label"
              className="px-2 pb-1 pt-3 text-xs text-[var(--oh-text-dim)]"
            >
              {t(I18nKey.COMMON$MOST_RECENT)}
            </div>
          ) : null}

          {query.trim() && filteredConversations.length === 0 ? (
            <p
              data-testid="conversation-panel-search-no-results"
              className="px-2 py-6 text-center text-xs text-[var(--oh-muted)]"
            >
              {t(I18nKey.CONVERSATION_PANEL$SEARCH_NO_RESULTS)}
            </p>
          ) : (
            filteredConversations.map((conversation, index) => {
              const title = conversation.title?.trim() || conversation.id;
              const contextLabel = getConversationContextLabel(conversation);
              const timestamp =
                conversation.updated_at ?? conversation.created_at;
              const isSelected = index === selectedIndex;

              return (
                <button
                  key={conversation.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  data-testid="conversation-panel-search-result"
                  data-conversation-id={conversation.id}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    "text-sm text-[var(--oh-muted)] hover:bg-[var(--oh-surface-raised)] hover:text-white",
                    isSelected && "bg-[var(--oh-surface-raised)] text-white",
                  )}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => handleSelect(conversation.id)}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    <HighlightSearchMatch text={title} query={query} />
                  </span>
                  {contextLabel ? (
                    <span className="shrink-0 truncate text-xs text-[var(--oh-text-dim)]">
                      {contextLabel}
                    </span>
                  ) : null}
                  {timestamp ? (
                    <time
                      dateTime={timestamp}
                      data-testid="conversation-panel-search-result-timestamp"
                      className="ml-auto shrink-0 text-xs text-[var(--oh-muted)] whitespace-nowrap"
                    >
                      {formatTimeDelta(timestamp)}
                    </time>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
