import React from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  CalendarArrowDown,
  Check,
  Clock3,
  ClockArrowDown,
  Eye,
  EyeOff,
  Folder,
  GitBranch,
  ListFilter,
  MessageCircle,
  Star,
  Trash2,
} from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import type { BackendKind } from "#/api/backend-registry/types";
import { Divider } from "#/ui/divider";
import { cn } from "#/utils/utils";
import type {
  ConversationSortField,
  OrganizeMode,
  ThreadScope,
} from "./conversation-panel-list-helpers";

const capitalizeLabel = (label: string) =>
  label.length > 0 ? label.charAt(0).toUpperCase() + label.slice(1) : label;

const MENU_SECTION_HEADING_PADDING = "px-2 pb-1 pt-1";
const MENU_SECTION_HEADING_TEXT =
  "text-[11px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]";

function MenuHeading({
  children,
  suffix,
}: {
  children: React.ReactNode;
  suffix?: React.ReactNode;
}) {
  if (suffix != null) {
    return (
      <div
        role="presentation"
        className={cn(
          "flex items-baseline justify-between gap-2",
          MENU_SECTION_HEADING_PADDING,
        )}
      >
        <span
          className={cn(
            "min-w-0 truncate text-left",
            MENU_SECTION_HEADING_TEXT,
          )}
        >
          {children}
        </span>
        {suffix}
      </div>
    );
  }

  return (
    <div
      role="presentation"
      className={cn(MENU_SECTION_HEADING_PADDING, MENU_SECTION_HEADING_TEXT)}
    >
      {children}
    </div>
  );
}

function MenuSeparator() {
  return <Divider inset="menu" />;
}

function MenuRow({
  icon: Icon,
  label,
  selected,
  onClick,
  testId,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  selected?: boolean;
  onClick: () => void;
  testId?: string;
  disabled?: boolean;
}) {
  // Rows that show a selection checkmark are toggleable preferences, so
  // they get `role="menuitemradio"` when they're part of a selectable
  // group and `role="menuitemcheckbox"` when they're a standalone toggle.
  // For simplicity we use `menuitemradio` whenever `selected` is provided
  // (every selectable row in this menu is part of a mutually exclusive
  // group in practice) and fall back to plain `menuitem` otherwise.
  const role = selected === undefined ? "menuitem" : "menuitemradio";
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected === undefined ? undefined : Boolean(selected)}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-[var(--oh-foreground)]",
        "hover:bg-[var(--oh-interactive-hover)] disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <Icon
        className="h-3.5 w-3.5 shrink-0 text-[var(--oh-muted)] transition-colors group-hover:text-[var(--oh-foreground)] group-focus-visible:text-[var(--oh-foreground)]"
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected ? (
        <Check
          className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--oh-foreground)]"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

export interface ConversationPanelFilterMenuProps {
  filterMenuOpen: boolean;
  setFilterMenuOpen: (open: boolean) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  backendKind: BackendKind;
  organizeMode: OrganizeMode;
  setOrganizeMode: (mode: OrganizeMode) => void;
  conversationSort: ConversationSortField;
  setConversationSort: (sort: ConversationSortField) => void;
  threadScope: ThreadScope;
  setThreadScope: (scope: ThreadScope) => void;
  showOlderConversations: boolean;
  toggleShowOlderConversations: () => void;
  showRepoBranchMetadata: boolean;
  toggleShowRepoBranchMetadata: () => void;
  showLlmProfiles: boolean;
  toggleShowLlmProfiles: () => void;
  totalConversationsCount: number;
  onRequestDeleteAll: () => void;
}

export function ConversationPanelFilterMenu({
  filterMenuOpen,
  setFilterMenuOpen,
  menuRef,
  backendKind,
  organizeMode,
  setOrganizeMode,
  conversationSort,
  setConversationSort,
  threadScope,
  setThreadScope,
  showOlderConversations,
  toggleShowOlderConversations,
  showRepoBranchMetadata,
  toggleShowRepoBranchMetadata,
  showLlmProfiles,
  toggleShowLlmProfiles,
  totalConversationsCount,
  onRequestDeleteAll,
}: ConversationPanelFilterMenuProps) {
  const { t } = useTranslation("openhands");

  const groupedLabel =
    backendKind === "local"
      ? t(I18nKey.CONVERSATION_PANEL$BY_WORKSPACE)
      : t(I18nKey.CONVERSATION_PANEL$BY_REPOSITORY);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuContentRef = React.useRef<HTMLDivElement>(null);

  // When the menu opens, move keyboard focus into it so screen-reader /
  // keyboard-only users can interact with the options immediately. When
  // it closes, return focus to the trigger so Tab order picks up where
  // the user left off.
  const wasOpenRef = React.useRef(filterMenuOpen);
  React.useEffect(() => {
    if (filterMenuOpen) {
      const firstItem =
        menuContentRef.current?.querySelector<HTMLButtonElement>(
          '[role="menuitem"], [role="menuitemradio"]',
        );
      firstItem?.focus();
    } else if (wasOpenRef.current) {
      // Only return focus on a real open→close transition (not the
      // mount-with-open=false case).
      triggerRef.current?.focus();
    }
    wasOpenRef.current = filterMenuOpen;
  }, [filterMenuOpen]);

  // Roving Arrow Up/Down + Escape across the menu items. Tab still works
  // natively; Escape closes the menu and returns focus to the trigger
  // (via the effect above).
  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setFilterMenuOpen(false);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const container = menuContentRef.current;
    if (!container) return;
    const items = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"], [role="menuitemradio"]',
      ),
    ).filter((el) => !el.disabled);
    if (items.length === 0) return;
    const currentIdx = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const start = currentIdx === -1 ? 0 : currentIdx;
    const nextIdx = (start + delta + items.length) % items.length;
    event.preventDefault();
    items[nextIdx]?.focus();
  };

  return (
    <div ref={menuRef} className="relative shrink-0 pr-0.5">
      <button
        ref={triggerRef}
        type="button"
        data-testid="older-conversations-filter-toggle"
        aria-label={t(I18nKey.CONVERSATION_PANEL$FILTER_LABEL)}
        aria-haspopup="menu"
        aria-expanded={filterMenuOpen}
        onClick={() => setFilterMenuOpen(!filterMenuOpen)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)] transition-colors"
      >
        <ListFilter
          className="lucide lucide-list-filter shrink-0"
          width={14}
          height={14}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      {filterMenuOpen ? (
        <div
          ref={menuContentRef}
          role="menu"
          aria-orientation="vertical"
          aria-label={t(I18nKey.CONVERSATION_PANEL$FILTER_LABEL)}
          // `role="menu"` is an interactive ARIA role, so the container
          // must be focusable to satisfy jsx-a11y. `-1` keeps it out of
          // the natural Tab order (the menu items themselves are
          // `<button>`s and tabbable on their own) but still allows the
          // open-effect to focus it / its children programmatically.
          tabIndex={-1}
          data-testid="older-conversations-filter-menu"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full z-50 mt-0 w-64 rounded-md border border-[var(--oh-border-subtle)] bg-tertiary px-1 py-1 text-[var(--oh-foreground)] shadow-lg"
        >
          <MenuHeading>{t(I18nKey.CONVERSATION_PANEL$ORGANIZE)}</MenuHeading>
          <MenuRow
            icon={Folder}
            label={groupedLabel}
            selected={organizeMode === "grouped"}
            onClick={() => {
              setOrganizeMode("grouped");
              setFilterMenuOpen(false);
            }}
          />
          <MenuRow
            icon={Clock3}
            label={t(I18nKey.CONVERSATION_PANEL$CHRONOLOGICAL)}
            selected={organizeMode === "chronological"}
            onClick={() => {
              setOrganizeMode("chronological");
              setFilterMenuOpen(false);
            }}
          />

          <MenuSeparator />
          <MenuHeading>{t(I18nKey.CONVERSATION_PANEL$SORT_BY)}</MenuHeading>
          <MenuRow
            icon={CalendarArrowDown}
            label={t(I18nKey.CONVERSATION_PANEL$SORT_CREATED)}
            selected={conversationSort === "created"}
            onClick={() => {
              setConversationSort("created");
              setFilterMenuOpen(false);
            }}
          />
          <MenuRow
            icon={ClockArrowDown}
            label={t(I18nKey.CONVERSATION_PANEL$SORT_UPDATED)}
            selected={conversationSort === "updated"}
            onClick={() => {
              setConversationSort("updated");
              setFilterMenuOpen(false);
            }}
          />

          <MenuSeparator />
          <MenuHeading>{t(I18nKey.CONVERSATION_PANEL$SHOW)}</MenuHeading>
          <MenuRow
            icon={MessageCircle}
            label={t(I18nKey.CONVERSATION_PANEL$ALL_THREADS)}
            selected={threadScope === "all"}
            onClick={() => {
              setThreadScope("all");
              setFilterMenuOpen(false);
            }}
          />
          <MenuRow
            icon={Star}
            label={t(I18nKey.CONVERSATION_PANEL$RELEVANT_THREADS)}
            selected={threadScope === "relevant"}
            onClick={() => {
              setThreadScope("relevant");
              setFilterMenuOpen(false);
            }}
          />

          <MenuSeparator />
          <MenuHeading>{t(I18nKey.CONVERSATION_PANEL$METADATA)}</MenuHeading>
          <MenuRow
            icon={Bot}
            label={t(I18nKey.CONVERSATION_PANEL$LLM_MODEL)}
            selected={showLlmProfiles}
            testId="toggle-llm-profiles"
            onClick={() => {
              toggleShowLlmProfiles();
              setFilterMenuOpen(false);
            }}
          />
          <MenuRow
            icon={GitBranch}
            label={t(I18nKey.CONVERSATION_PANEL$REPO_BRANCH)}
            selected={showRepoBranchMetadata}
            testId="toggle-repo-branch-metadata"
            onClick={() => {
              toggleShowRepoBranchMetadata();
              setFilterMenuOpen(false);
            }}
          />

          <MenuSeparator />
          <MenuHeading
            suffix={
              <span className="shrink-0 text-right text-[10px] font-medium normal-case tracking-normal text-[var(--oh-muted)]/70">
                {t(I18nKey.CONVERSATION_PANEL$OLDER_OVER_ONE_HOUR)}
              </span>
            }
          >
            {t(I18nKey.CONVERSATION_PANEL$OLDER_SECTION)}
          </MenuHeading>
          <MenuRow
            testId="toggle-older-conversations"
            icon={showOlderConversations ? EyeOff : Eye}
            label={
              showOlderConversations
                ? capitalizeLabel(t(I18nKey.CONVERSATION$HIDE))
                : capitalizeLabel(t(I18nKey.CONVERSATION$SHOW_ALL))
            }
            onClick={() => {
              toggleShowOlderConversations();
              setFilterMenuOpen(false);
            }}
          />

          <MenuSeparator />
          <MenuRow
            testId="delete-all-conversations"
            icon={Trash2}
            label={capitalizeLabel(t(I18nKey.CONVERSATION$DELETE_ALL))}
            disabled={totalConversationsCount === 0}
            onClick={() => {
              if (totalConversationsCount === 0) return;
              onRequestDeleteAll();
              setFilterMenuOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
