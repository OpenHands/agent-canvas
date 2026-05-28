import React from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

export const conversationPanelSearchIconButtonClassName = cn(
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
  "text-[var(--oh-muted)] transition-colors",
  "hover:bg-[var(--oh-surface-raised)] hover:text-white",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--oh-border)]",
);

interface ConversationPanelSearchButtonProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function ConversationPanelSearchButton({
  isOpen,
  onToggle,
}: ConversationPanelSearchButtonProps) {
  const { t } = useTranslation("openhands");

  return (
    <button
      type="button"
      className={cn(
        conversationPanelSearchIconButtonClassName,
        isOpen &&
          "bg-[var(--oh-surface-raised)] text-white hover:bg-[var(--oh-interactive-hover)]",
      )}
      aria-label={t(I18nKey.CONVERSATION_PANEL$SEARCH_ARIA)}
      aria-expanded={isOpen}
      aria-controls="conversation-panel-search-field"
      data-testid="conversation-panel-search-toggle"
      onClick={onToggle}
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
    </button>
  );
}

interface ConversationPanelSearchFieldProps {
  query: string;
  onQueryChange: (query: string) => void;
}

export function ConversationPanelSearchField({
  query,
  onQueryChange,
}: ConversationPanelSearchFieldProps) {
  const { t } = useTranslation("openhands");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="px-4 pb-2" data-testid="conversation-panel-search-panel">
      <div className="relative">
        <input
          ref={inputRef}
          id="conversation-panel-search-field"
          type="text"
          role="searchbox"
          inputMode="search"
          autoComplete="off"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t(I18nKey.CONVERSATION_PANEL$SEARCH_PLACEHOLDER)}
          data-testid="conversation-panel-search-input"
          className={cn(
            "h-9 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-deep)]",
            "px-3 pr-9 text-sm text-white placeholder:text-[var(--oh-text-dim)]",
            "outline-none transition-colors",
            "focus:border-[var(--oh-border-subtle)] focus:ring-1 focus:ring-[var(--oh-border-subtle)]",
          )}
        />
        {query ? (
          <button
            type="button"
            className={cn(
              "absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md",
              "text-[var(--oh-muted)] hover:bg-[var(--oh-surface-raised)] hover:text-white",
            )}
            aria-label={t(I18nKey.CONVERSATION_PANEL$SEARCH_CLEAR_ARIA)}
            data-testid="conversation-panel-search-clear"
            onClick={() => onQueryChange("")}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
