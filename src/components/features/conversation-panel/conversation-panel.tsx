import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Folder } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { useNavigation } from "#/context/navigation-context";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { usePaginatedConversations } from "#/hooks/query/use-paginated-conversations";
import { useStartTasks } from "#/hooks/query/use-start-tasks";
import { useDeleteConversation } from "#/hooks/mutation/use-delete-conversation";
import { useUnifiedPauseConversation } from "#/hooks/mutation/use-unified-stop-conversation";
import { ConfirmDeleteModal } from "./confirm-delete-modal";
import { ConfirmStopModal } from "./confirm-stop-modal";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { NavigationLink } from "#/components/shared/navigation-link";
import { ExitConversationModal } from "./exit-conversation-modal";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { Provider } from "#/types/settings";
import { useUpdateConversation } from "#/hooks/mutation/use-update-conversation";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { isExecutionActive } from "#/utils/status";
import { ConversationCard } from "./conversation-card/conversation-card";
import { StartTaskCard } from "./start-task-card/start-task-card";
import { ConversationCardSkeleton } from "./conversation-card/conversation-card-skeleton";
import { CompactConversationRow } from "./compact-conversation-row";
import { useConversationPanelPreferencesStore } from "#/stores/conversation-panel-preferences-store";
import { cn } from "#/utils/utils";
import { ConversationPanelFilterMenu } from "./conversation-panel-filter-menu";
import {
  groupConversations,
  sortConversationsByField,
} from "./conversation-panel-list-helpers";

interface ConversationPanelProps {
  onClose?: () => void;
  /**
   * Render a minimal icon-only variant of each conversation row (used by the
   * collapsed sidebar). Each row is a single status dot with a hover preview
   * containing the full card content.
   */
  compact?: boolean;
}

const noop = () => {};

const ONE_HOUR_MS = 60 * 60 * 1000;

const partitionByCutoff = <T extends { updated_at: string }>(
  items: readonly T[],
): { recent: T[]; older: T[] } => {
  // The cutoff is intentionally relative to "now" each time the list is
  // recomputed, so conversations naturally age into the older bucket as the
  // conversations query refreshes.
  const cutoff = Date.now() - ONE_HOUR_MS;
  const recent: T[] = [];
  const older: T[] = [];
  for (const item of items) {
    const updatedAt = item.updated_at ? Date.parse(item.updated_at) : NaN;
    // Missing or unparseable timestamps stay in the "recent" bucket so we
    // do not accidentally hide them behind the older-conversations toggle.
    if (Number.isFinite(updatedAt) && updatedAt < cutoff) {
      older.push(item);
    } else {
      recent.push(item);
    }
  }
  return { recent, older };
};

export function ConversationPanel({
  onClose,
  compact = false,
}: ConversationPanelProps) {
  const { t } = useTranslation("openhands");
  const { conversationId: currentConversationId, navigate } = useNavigation();
  const { backend: activeBackend } = useActiveBackend();
  // Click-outside is only relevant in the legacy drawer mode where an
  // onClose handler is provided. When the panel is rendered inline (e.g.
  // as the always-visible conversation list pane), clicking outside should
  // not dismiss the list, so we pass a no-op callback in that case.
  const ref = useClickOutsideElement<HTMLDivElement>(onClose ?? noop);

  const [confirmDeleteModalVisible, setConfirmDeleteModalVisible] =
    React.useState(false);
  const [confirmStopModalVisible, setConfirmStopModalVisible] =
    React.useState(false);
  const [
    confirmExitConversationModalVisible,
    setConfirmExitConversationModalVisible,
  ] = React.useState(false);
  const [confirmDeleteOlderVisible, setConfirmDeleteOlderVisible] =
    React.useState(false);
  const showOlderConversations = useConversationPanelPreferencesStore(
    (state) => state.showOlderConversations,
  );
  const toggleShowOlderConversations = useConversationPanelPreferencesStore(
    (state) => state.toggleShowOlderConversations,
  );
  const showRepoBranchMetadata = useConversationPanelPreferencesStore(
    (state) => state.showRepoBranchMetadata,
  );
  const toggleShowRepoBranchMetadata = useConversationPanelPreferencesStore(
    (state) => state.toggleShowRepoBranchMetadata,
  );
  const showLlmProfiles = useConversationPanelPreferencesStore(
    (state) => state.showLlmProfiles,
  );
  const toggleShowLlmProfiles = useConversationPanelPreferencesStore(
    (state) => state.toggleShowLlmProfiles,
  );
  const organizeMode = useConversationPanelPreferencesStore(
    (state) => state.organizeMode,
  );
  const setOrganizeMode = useConversationPanelPreferencesStore(
    (state) => state.setOrganizeMode,
  );
  const conversationSort = useConversationPanelPreferencesStore(
    (state) => state.conversationSort,
  );
  const setConversationSort = useConversationPanelPreferencesStore(
    (state) => state.setConversationSort,
  );
  const threadScope = useConversationPanelPreferencesStore(
    (state) => state.threadScope,
  );
  const setThreadScope = useConversationPanelPreferencesStore(
    (state) => state.setThreadScope,
  );
  const [filterMenuOpen, setFilterMenuOpen] = React.useState(false);
  const [isListScrolled, setIsListScrolled] = React.useState(false);
  const filterMenuRef = useClickOutsideElement<HTMLDivElement>(() => {
    setFilterMenuOpen(false);
  });
  const [collapsedGroupIds, setCollapsedGroupIds] = React.useState<
    ReadonlySet<string>
  >(() => new Set());

  const toggleGroupCollapsed = React.useCallback((groupId: string) => {
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    if (organizeMode !== "grouped") {
      setCollapsedGroupIds(new Set());
    }
  }, [organizeMode]);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [selectedConversationId, setSelectedConversationId] = React.useState<
    string | null
  >(null);
  const [selectedConversationTitle, setSelectedConversationTitle] =
    React.useState<string | null>(null);
  const [openContextMenuId, setOpenContextMenuId] = React.useState<
    string | null
  >(null);

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePaginatedConversations();

  // Fetch in-progress start tasks
  const { data: startTasks } = useStartTasks();

  const conversations = React.useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const scopedConversations = React.useMemo(() => {
    if (threadScope === "relevant") {
      return conversations.filter((c) => isExecutionActive(c.execution_status));
    }
    return conversations;
  }, [conversations, threadScope]);

  const { recent: recentScoped, older: olderScoped } = React.useMemo(
    () => partitionByCutoff(scopedConversations),
    [scopedConversations],
  );

  const sortedRecent = React.useMemo(
    () => sortConversationsByField(recentScoped, conversationSort),
    [recentScoped, conversationSort],
  );

  const sortedOlder = React.useMemo(
    () => sortConversationsByField(olderScoped, conversationSort),
    [olderScoped, conversationSort],
  );

  const groupLabels = React.useMemo(
    () => ({
      emptyWorkspace: t(I18nKey.CONVERSATION_PANEL$NO_WORKSPACE),
      emptyRepository: t(I18nKey.CONVERSATION_PANEL$NO_REPOSITORY),
    }),
    [t],
  );

  const conversationGroups = React.useMemo(() => {
    if (compact || organizeMode !== "grouped") {
      return null;
    }
    const merged = [
      ...sortedRecent,
      ...(showOlderConversations ? sortedOlder : []),
    ];
    return groupConversations(
      merged,
      activeBackend.kind,
      conversationSort,
      groupLabels,
    );
  }, [
    activeBackend.kind,
    compact,
    conversationSort,
    groupLabels,
    organizeMode,
    showOlderConversations,
    sortedOlder,
    sortedRecent,
  ]);

  const compactVisibleConversations = React.useMemo(
    () =>
      sortConversationsByField(
        recentScoped.filter((conversation) =>
          isExecutionActive(conversation.execution_status),
        ),
        conversationSort,
      ),
    [conversationSort, recentScoped],
  );

  const visibleFlatCount =
    sortedRecent.length +
    (!compact && showOlderConversations ? sortedOlder.length : 0);

  const visibleGroupedCount = React.useMemo(() => {
    if (!conversationGroups) {
      return 0;
    }
    return conversationGroups.reduce((n, g) => n + g.conversations.length, 0);
  }, [conversationGroups]);

  const { mutate: deleteConversation, mutateAsync: deleteConversationAsync } =
    useDeleteConversation();
  const { mutate: pauseConversation } = useUnifiedPauseConversation();
  const { mutate: updateConversation } = useUpdateConversation();

  // The next page of conversations is loaded only via the explicit "Load
  // more" link rendered at the end of the list — there is no scroll-driven
  // pagination, which previously caused the panel to feel like it had stray
  // scrollable space at the bottom.
  const olderHidden = olderScoped.length > 0 && !showOlderConversations;
  // Compact mode also hides "Load more" — paginating into archived
  // conversations contradicts the "active only" intent of the icon rail.
  const showLoadMore = !!hasNextPage && !olderHidden && !compact;

  const handleDeleteProject = React.useCallback(
    (conversationId: string, title: string) => {
      setConfirmDeleteModalVisible(true);
      setSelectedConversationId(conversationId);
      setSelectedConversationTitle(title);
    },
    [],
  );

  const handleStopConversation = React.useCallback((conversationId: string) => {
    setConfirmStopModalVisible(true);
    setSelectedConversationId(conversationId);
  }, []);

  const handleConversationTitleChange = React.useCallback(
    (conversationId: string, newTitle: string) => {
      updateConversation(
        { conversationId, newTitle },
        {
          onSuccess: () => {
            displaySuccessToast(t(I18nKey.CONVERSATION$TITLE_UPDATED));
          },
        },
      );
    },
    [t, updateConversation],
  );

  const handleConfirmDelete = () => {
    if (selectedConversationId) {
      deleteConversation(
        { conversationId: selectedConversationId },
        {
          onSuccess: () => {
            if (selectedConversationId === currentConversationId) {
              navigate("/conversations");
            }
          },
        },
      );
    }
  };

  const handleConfirmStop = () => {
    if (selectedConversationId) {
      pauseConversation({
        conversationId: selectedConversationId,
      });
    }
  };

  const handleConfirmDeleteOlder = async () => {
    const idsToDelete = olderScoped.map((c) => c.id);
    const results = await Promise.allSettled(
      idsToDelete.map((conversationId) =>
        deleteConversationAsync({ conversationId }),
      ),
    );

    const deletedIds = results.flatMap((result, index) =>
      result.status === "fulfilled" ? [idsToDelete[index]] : [],
    );
    const failedCount = results.length - deletedIds.length;

    if (
      currentConversationId !== null &&
      deletedIds.includes(currentConversationId)
    ) {
      navigate("/conversations");
    }

    if (failedCount > 0) {
      displayErrorToast(
        `${failedCount} conversation${failedCount === 1 ? "" : "s"} could not be deleted.`,
      );
    }
  };

  const renderConversationCard = React.useCallback(
    (conversation: (typeof conversations)[number]) => {
      if (compact) {
        return (
          <CompactConversationRow
            key={conversation.id}
            conversationId={conversation.id}
            title={conversation.title ?? ""}
            selectedRepository={{
              selected_repository: conversation.selected_repository,
              selected_branch: conversation.selected_branch,
              git_provider: conversation.git_provider as Provider,
            }}
            executionStatus={conversation.execution_status}
            lastUpdatedAt={conversation.updated_at}
            createdAt={conversation.created_at}
            workspaceWorkingDir={conversation.workspace?.working_dir}
            isActive={conversation.id === currentConversationId}
            onClose={onClose}
            showRepositoryMetadata={showRepoBranchMetadata}
            llmModel={conversation.llm_model}
            showLlmProfiles={showLlmProfiles}
          />
        );
      }
      return (
        <NavigationLink
          key={conversation.id}
          to={`/conversations/${conversation.id}`}
          onClick={onClose}
          className="block px-2 py-0.5"
        >
          <ConversationCard
            onDelete={() =>
              handleDeleteProject(conversation.id, conversation.title ?? "")
            }
            onStop={() => handleStopConversation(conversation.id)}
            onChangeTitle={(title) =>
              handleConversationTitleChange(conversation.id, title)
            }
            title={conversation.title ?? ""}
            selectedRepository={{
              selected_repository: conversation.selected_repository,
              selected_branch: conversation.selected_branch,
              git_provider: conversation.git_provider as Provider,
            }}
            lastUpdatedAt={conversation.updated_at}
            createdAt={conversation.created_at}
            executionStatus={conversation.execution_status}
            conversationId={conversation.id}
            contextMenuOpen={openContextMenuId === conversation.id}
            onContextMenuToggle={(isOpen) =>
              setOpenContextMenuId(isOpen ? conversation.id : null)
            }
            isActive={conversation.id === currentConversationId}
            workspaceWorkingDir={conversation.workspace?.working_dir}
            showRepositoryMetadata={showRepoBranchMetadata}
            llmModel={conversation.llm_model}
            showLlmProfiles={showLlmProfiles}
          />
        </NavigationLink>
      );
    },
    [
      compact,
      currentConversationId,
      handleConversationTitleChange,
      handleDeleteProject,
      handleStopConversation,
      onClose,
      openContextMenuId,
      showRepoBranchMetadata,
      showLlmProfiles,
    ],
  );

  // Standard layout: panel fills its slot in the sidebar; the inner scroll
  // child fills the panel and scrolls when its content overflows. Modals are
  // siblings of the scroll element and are `position: fixed`, so they don't
  // participate in the panel's scroll geometry.
  // Gate on `isLoading` (true only during the first fetch with no cached
  // data), not `isFetching` — the latter flips back to true on every 10s
  // background refetch, causing the skeleton/empty-state to flicker when
  // the list is empty.
  const showInitialSkeleton = isLoading;
  const listIsEffectivelyEmpty =
    organizeMode === "grouped" && !compact
      ? visibleGroupedCount === 0
      : visibleFlatCount === 0;
  const showEmptyState =
    !isLoading && !compact && listIsEffectivelyEmpty && !startTasks?.length;

  const showConversationHeader = !compact;

  return (
    <div
      ref={ref}
      data-testid="conversation-panel"
      className="w-full h-full flex flex-col"
    >
      {showConversationHeader && (
        <div
          data-testid="older-conversations-summary"
          className={cn(
            "pl-4 pr-3 py-2 text-[var(--oh-muted)] flex flex-wrap items-center gap-x-2 gap-y-1",
            isListScrolled && "border-b border-[var(--oh-border-subtle)]",
          )}
        >
          <span className="text-sm font-medium text-[var(--oh-muted)]">
            {t(I18nKey.SIDEBAR$CONVERSATIONS)}
          </span>
          <ConversationPanelFilterMenu
            filterMenuOpen={filterMenuOpen}
            setFilterMenuOpen={setFilterMenuOpen}
            menuRef={filterMenuRef}
            backendKind={activeBackend.kind}
            organizeMode={organizeMode}
            setOrganizeMode={setOrganizeMode}
            conversationSort={conversationSort}
            setConversationSort={setConversationSort}
            threadScope={threadScope}
            setThreadScope={setThreadScope}
            showOlderConversations={showOlderConversations}
            toggleShowOlderConversations={toggleShowOlderConversations}
            showRepoBranchMetadata={showRepoBranchMetadata}
            toggleShowRepoBranchMetadata={toggleShowRepoBranchMetadata}
            showLlmProfiles={showLlmProfiles}
            toggleShowLlmProfiles={toggleShowLlmProfiles}
            olderConversationsCount={olderScoped.length}
            onRequestDeleteOlder={() => setConfirmDeleteOlderVisible(true)}
          />
        </div>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={(event) => {
          setIsListScrolled(event.currentTarget.scrollTop > 0);
        }}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar-always"
      >
        {showInitialSkeleton && (
          <div>
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className={compact ? "" : "block px-2 py-0.5"}>
                <ConversationCardSkeleton compact={compact} />
              </div>
            ))}
          </div>
        )}

        {!compact && showEmptyState && (
          <div className="flex flex-col items-center justify-center h-full">
            <p className="text-[var(--oh-muted)]">
              {t(I18nKey.CONVERSATION$NO_CONVERSATIONS)}
            </p>
          </div>
        )}

        {/* Render in-progress start tasks first (skipped in compact mode —
            their rich card layout doesn't fit in the icon rail). */}
        {!compact &&
          startTasks?.map((task) => (
            <NavigationLink
              key={task.id}
              to={`/conversations/task-${task.id}`}
              onClick={onClose}
              className="block"
            >
              <StartTaskCard task={task} />
            </NavigationLink>
          ))}

        {!showInitialSkeleton && compact
          ? compactVisibleConversations.map(renderConversationCard)
          : null}

        {!showInitialSkeleton &&
        !compact &&
        organizeMode === "grouped" &&
        conversationGroups ? (
          <nav
            aria-label={t(I18nKey.SIDEBAR$CONVERSATIONS)}
            className="space-y-1 px-1 pb-1"
          >
            {conversationGroups.map((group) => {
              const headingId = `thread-folder-${group.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
              const expanded = !collapsedGroupIds.has(group.id);
              return (
                <section key={group.id} aria-labelledby={headingId}>
                  <button
                    type="button"
                    id={headingId}
                    aria-expanded={expanded}
                    onClick={() => toggleGroupCollapsed(group.id)}
                    className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-left text-sm font-medium text-[var(--oh-muted)] outline-none transition-colors hover:bg-[var(--oh-surface-raised)] hover:text-white focus-visible:ring-1 focus-visible:ring-[var(--oh-border)]"
                  >
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        !expanded && "-rotate-90",
                      )}
                    />
                    <Folder className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{group.label}</span>
                  </button>
                  {expanded ? (
                    <div className="mt-0.5 space-y-0.5">
                      {group.conversations.map(renderConversationCard)}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </nav>
        ) : null}

        {!showInitialSkeleton &&
        !compact &&
        organizeMode === "chronological" ? (
          <>
            {sortedRecent.map(renderConversationCard)}
            {showOlderConversations
              ? sortedOlder.map(renderConversationCard)
              : null}
          </>
        ) : null}

        {/* Explicit "Load more" trigger. Only shown when more pages exist
            *and* the older list is currently visible (or there are no older
            conversations to begin with) — otherwise the next page would be
            populated mostly with conversations the user has chosen to hide. */}
        {showLoadMore && (
          <div className="flex justify-center py-4">
            {isFetchingNextPage ? (
              <LoadingSpinner size="small" />
            ) : (
              <button
                type="button"
                data-testid="load-more-conversations"
                onClick={() => fetchNextPage()}
                className="text-xs text-[var(--oh-muted)] hover:text-white"
              >
                {t(I18nKey.CONVERSATION$LOAD_MORE)}
              </button>
            )}
          </div>
        )}
      </div>

      {confirmDeleteModalVisible && (
        <ConfirmDeleteModal
          onConfirm={() => {
            handleConfirmDelete();
            setConfirmDeleteModalVisible(false);
            setSelectedConversationTitle(null);
          }}
          onCancel={() => {
            setConfirmDeleteModalVisible(false);
            setSelectedConversationTitle(null);
          }}
          conversationTitle={selectedConversationTitle ?? undefined}
        />
      )}

      {confirmDeleteOlderVisible && (
        <ConfirmDeleteModal
          title={t(I18nKey.CONVERSATION$CONFIRM_DELETE_OLDER_TITLE)}
          description={t(I18nKey.CONVERSATION$CONFIRM_DELETE_OLDER_DESC, {
            count: olderScoped.length,
          })}
          onConfirm={async () => {
            await handleConfirmDeleteOlder();
            setConfirmDeleteOlderVisible(false);
          }}
          onCancel={() => setConfirmDeleteOlderVisible(false)}
        />
      )}

      {confirmStopModalVisible && (
        <ConfirmStopModal
          onConfirm={() => {
            handleConfirmStop();
            setConfirmStopModalVisible(false);
          }}
          onCancel={() => setConfirmStopModalVisible(false)}
        />
      )}

      {confirmExitConversationModalVisible && (
        <ExitConversationModal
          onConfirm={() => {
            onClose?.();
          }}
          onClose={() => setConfirmExitConversationModalVisible(false)}
          onCancel={() => setConfirmExitConversationModalVisible(false)}
        />
      )}
    </div>
  );
}
