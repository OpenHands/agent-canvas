import React from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  CalendarArrowDown,
  Check,
  Clock3,
  ClockArrowDown,
  Folder,
  GitBranch,
  ListFilter,
  MessageCircle,
  Star,
} from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import type { BackendKind } from "#/api/backend-registry/types";
import { cn } from "#/utils/utils";
import type {
  ConversationSortField,
  OrganizeMode,
  ThreadScope,
} from "./conversation-panel-list-helpers";

const capitalizeLabel = (label: string) =>
  label.length > 0 ? label.charAt(0).toUpperCase() + label.slice(1) : label;

function MenuHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
      {children}
    </div>
  );
}

function MenuSeparator() {
  return (
    <div
      className="-mx-1 my-1 h-px shrink-0 bg-[var(--oh-border)]"
      role="separator"
    />
  );
}

function MenuRow({
  icon: Icon,
  label,
  selected,
  onClick,
  testId,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  selected?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-white",
        "hover:bg-[var(--oh-interactive-hover)]",
      )}
    >
      <Icon
        className="h-3.5 w-3.5 shrink-0 text-[var(--oh-muted)]"
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected ? (
        <Check className="ml-auto h-3.5 w-3.5 shrink-0" aria-hidden />
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

  return (
    <div ref={menuRef} className="relative shrink-0 pr-0.5">
      <button
        type="button"
        data-testid="older-conversations-filter-toggle"
        aria-label={t(I18nKey.CONVERSATION_PANEL$FILTER_LABEL)}
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
          data-testid="older-conversations-filter-menu"
          className="absolute right-0 top-full z-50 mt-0 w-64 rounded-md border border-[var(--oh-border-subtle)] bg-tertiary px-1 py-1 text-white shadow-lg"
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
          <div className="flex items-baseline justify-between gap-2 px-2 py-1">
            <span className="min-w-0 truncate text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
              {t(I18nKey.CONVERSATION_PANEL$OLDER_SECTION)}
            </span>
            <span className="shrink-0 text-right text-[10px] font-medium normal-case tracking-normal text-[var(--oh-muted)]/70">
              {t(I18nKey.CONVERSATION_PANEL$OLDER_OVER_ONE_HOUR)}
            </span>
          </div>
          <button
            type="button"
            data-testid="toggle-older-conversations"
            onClick={() => {
              toggleShowOlderConversations();
              setFilterMenuOpen(false);
            }}
            className="block w-full rounded px-2 py-2 text-left text-sm text-white hover:bg-[var(--oh-interactive-hover)]"
          >
            {showOlderConversations
              ? capitalizeLabel(t(I18nKey.CONVERSATION$HIDE))
              : capitalizeLabel(t(I18nKey.CONVERSATION$SHOW_ALL))}
          </button>

          <MenuSeparator />
          <button
            type="button"
            data-testid="delete-all-conversations"
            disabled={totalConversationsCount === 0}
            onClick={() => {
              if (totalConversationsCount === 0) return;
              onRequestDeleteAll();
              setFilterMenuOpen(false);
            }}
            className={cn(
              "block w-full rounded px-2 py-2 text-left text-sm hover:bg-[var(--oh-interactive-hover)]",
              totalConversationsCount === 0
                ? "cursor-not-allowed text-[var(--oh-muted)]"
                : "text-danger",
            )}
          >
            {capitalizeLabel(t(I18nKey.CONVERSATION$DELETE_ALL))}
          </button>
        </div>
      ) : null}
    </div>
  );
}
