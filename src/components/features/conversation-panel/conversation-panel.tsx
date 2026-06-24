import React from "react";
import { Search, X, Archive, ChevronDown, ChevronRight } from "lucide-react";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useNavigation } from "#/context/navigation-context";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { usePaginatedConversations } from "#/hooks/query/use-paginated-conversations";
import { useStartTasks } from "#/hooks/query/use-start-tasks";
import { useDeleteConversation } from "#/hooks/mutation/use-delete-conversation";
import { useUnifiedPauseConversation } from "#/hooks/mutation/use-unified-stop-conversation";
import { ConfirmDeleteModal } from "./confirm-delete-modal";
import { ConfirmStopModal } from "./confirm-stop-modal";
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
import {
  ConversationOwnership,
  type ProjectScope,
} from "#/utils/conversation-ownership";
import {
  Project,
  PROJECT_FILTER_ALL,
  type ProjectFilterOption,
} from "#/utils/project";
import { useProjectRegistryStore } from "#/stores/project-registry-store";
import { ConversationSearch } from "#/utils/conversation-search";
import { useCurrentUserEmail } from "#/hooks/use-current-user-email";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { ConversationCard } from "./conversation-card/conversation-card";
import { ConversationCardPreview } from "./conversation-card/conversation-card-preview";
import { StartTaskCard } from "./start-task-card/start-task-card";
import { ConversationCardSkeleton } from "./conversation-card/conversation-card-skeleton";
import { CompactConversationRow } from "./compact-conversation-row";
import { useConversationPanelPreferencesStore } from "#/stores/conversation-panel-preferences-store";
import { cn } from "#/utils/utils";
import { ConversationPanelFilterMenu } from "./conversation-panel-filter-menu";
import { ProjectManagerDialog } from "./project-manager-dialog";
import { ConversationPanelNewThreadPicker } from "./conversation-panel-new-thread-picker";
import { ConversationGroupFolderList } from "./conversation-group-folder-list";
import { ConversationPanelPinnedSection } from "./conversation-panel-pinned-section";
import { StatusBucketIcon } from "./status-bucket-icon";
import { ConductorNewWorkspaceMenu } from "./conductor-new-workspace-menu";
import {
  applyGroupFolderOrder,
  bucketConversationGroupsByStatus,
  bucketConversationsByStatus,
  deriveRepoFilterOptions,
  filterConversationsByRepo,
  filterOutPinnedConversations,
  groupConversations,
  partitionArchivedConversations,
  resolvePinnedConversations,
  sortConversationsByField,
  type ConversationGroupLaunch,
  type ConversationStatusBucketId,
  type StatusOverrideAccessor,
} from "./conversation-panel-list-helpers";
import { usePinnedConversationsStore } from "#/stores/pinned-conversations-store";
import { useMutedConversationsStore } from "#/stores/muted-conversations-store";
import { useArchivedConversationsStore } from "#/stores/archived-conversations-store";
import { useUnreadConversationsStore } from "#/stores/unread-conversations-store";
import { useConversationStatusOverrideStore } from "#/stores/conversation-status-override-store";

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

const EMPTY_PINNED_CONVERSATION_IDS: readonly string[] = [];
const EMPTY_CONVERSATION_IDS: readonly string[] = [];
const EMPTY_STATUS_OVERRIDES: Record<string, ConversationStatusBucketId> = {};
const EMPTY_PROJECTS: readonly Project[] = [];

const ONE_HOUR_MS = 60 * 60 * 1000;

const STATUS_BUCKET_LABEL_KEYS: Record<ConversationStatusBucketId, I18nKey> = {
  in_progress: I18nKey.CONVERSATION_PANEL$STATUS_IN_PROGRESS,
  in_review: I18nKey.CONVERSATION_PANEL$STATUS_IN_REVIEW,
  done: I18nKey.CONVERSATION_PANEL$STATUS_DONE,
};

const getStatusBucketTestId = (bucketId: ConversationStatusBucketId) =>
  `conversation-status-bucket-${bucketId.replace(/_/g, "-")}`;

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
  const [confirmDeleteAllVisible, setConfirmDeleteAllVisible] =
    React.useState(false);
  const [projectManagerOpen, setProjectManagerOpen] = React.useState(false);
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
  const showHoverMetadata = useConversationPanelPreferencesStore(
    (state) => state.showHoverMetadata,
  );
  const toggleShowHoverMetadata = useConversationPanelPreferencesStore(
    (state) => state.toggleShowHoverMetadata,
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
  const repoFilter = useConversationPanelPreferencesStore(
    (state) => state.repoFilter,
  );
  const setRepoFilter = useConversationPanelPreferencesStore(
    (state) => state.setRepoFilter,
  );
  const projectFilter = useConversationPanelPreferencesStore(
    (state) => state.projectFilter,
  );
  const setProjectFilter = useConversationPanelPreferencesStore(
    (state) => state.setProjectFilter,
  );
  const threadScope = useConversationPanelPreferencesStore(
    (state) => state.threadScope,
  );
  const setThreadScope = useConversationPanelPreferencesStore(
    (state) => state.setThreadScope,
  );
  const ownerScope = useConversationPanelPreferencesStore(
    (state) => state.ownerScope,
  );
  const setOwnerScope = useConversationPanelPreferencesStore(
    (state) => state.setOwnerScope,
  );
  const sourceScope = useConversationPanelPreferencesStore(
    (state) => state.sourceScope,
  );
  const setSourceScope = useConversationPanelPreferencesStore(
    (state) => state.setSourceScope,
  );
  const currentUserEmail = useCurrentUserEmail();
  // Force "all" when we have no identity so a persisted "mine" can't strand the
  // list empty with no visible toggle (the owner facet is hidden in that case).
  const effectiveOwnerScope = currentUserEmail ? ownerScope : "all";
  const groupFolderOrder = useConversationPanelPreferencesStore(
    (state) => state.groupFolderOrder,
  );
  const setGroupFolderOrder = useConversationPanelPreferencesStore(
    (state) => state.setGroupFolderOrder,
  );
  const [filterMenuOpen, setFilterMenuOpen] = React.useState(false);
  const [isListScrolled, setIsListScrolled] = React.useState(false);
  // Transient (not persisted) — search is a per-visit lens over loaded pages.
  const [searchQuery, setSearchQuery] = React.useState("");
  const filterMenuRef = useClickOutsideElement<HTMLDivElement>(() => {
    setFilterMenuOpen(false);
  });
  const [collapsedGroupIds, setCollapsedGroupIds] = React.useState<
    ReadonlySet<string>
  >(() => new Set());
  const [expandedGroupPreviewIds, setExpandedGroupPreviewIds] = React.useState<
    ReadonlySet<string>
  >(() => new Set());
  const [expandedPinnedPreview, setExpandedPinnedPreview] =
    React.useState(false);
  const [archivedSectionExpanded, setArchivedSectionExpanded] =
    React.useState(false);

  const pinnedIds = usePinnedConversationsStore(
    (state) =>
      state.pinsByBackendId[activeBackend.id] ?? EMPTY_PINNED_CONVERSATION_IDS,
  );
  const togglePin = usePinnedConversationsStore((state) => state.togglePin);
  const pruneMissingPinnedConversations = usePinnedConversationsStore(
    (state) => state.pruneMissingConversations,
  );

  const mutedIds = useMutedConversationsStore(
    (state) =>
      state.mutedByBackendId[activeBackend.id] ?? EMPTY_CONVERSATION_IDS,
  );
  const toggleMute = useMutedConversationsStore((state) => state.toggleMute);
  const pruneMissingMuted = useMutedConversationsStore(
    (state) => state.pruneMissingConversations,
  );

  const registryProjects = useProjectRegistryStore(
    (state) => state.projectsByBackendId[activeBackend.id] ?? EMPTY_PROJECTS,
  );
  const upsertProject = useProjectRegistryStore((state) => state.upsertProject);
  const removeProject = useProjectRegistryStore((state) => state.removeProject);

  const archivedIds = useArchivedConversationsStore(
    (state) =>
      state.archivedByBackendId[activeBackend.id] ?? EMPTY_CONVERSATION_IDS,
  );
  const toggleArchive = useArchivedConversationsStore(
    (state) => state.toggleArchive,
  );
  const pruneMissingArchived = useArchivedConversationsStore(
    (state) => state.pruneMissingConversations,
  );

  const unreadIds = useUnreadConversationsStore(
    (state) =>
      state.unreadByBackendId[activeBackend.id] ?? EMPTY_CONVERSATION_IDS,
  );
  const toggleUnread = useUnreadConversationsStore(
    (state) => state.toggleUnread,
  );
  const markRead = useUnreadConversationsStore((state) => state.markRead);
  const pruneMissingUnread = useUnreadConversationsStore(
    (state) => state.pruneMissingConversations,
  );

  const statusOverrides = useConversationStatusOverrideStore(
    (state) =>
      state.overridesByBackendId[activeBackend.id] ?? EMPTY_STATUS_OVERRIDES,
  );
  const setStatusOverride = useConversationStatusOverrideStore(
    (state) => state.setStatus,
  );
  const clearStatusOverride = useConversationStatusOverrideStore(
    (state) => state.clearStatus,
  );
  const pruneMissingStatusOverrides = useConversationStatusOverrideStore(
    (state) => state.pruneMissingConversations,
  );

  const getStatusOverride = React.useCallback<StatusOverrideAccessor>(
    (conversationId) => statusOverrides[conversationId],
    [statusOverrides],
  );

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

  const toggleGroupPreviewExpanded = React.useCallback((groupId: string) => {
    setExpandedGroupPreviewIds((prev) => {
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
      setExpandedGroupPreviewIds(new Set());
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

  const {
    data,
    isLoading,
    isFetched,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
  } = usePaginatedConversations();

  // Fetch in-progress start tasks
  const { data: startTasks } = useStartTasks();

  const conversations = React.useMemo(() => {
    const all = data?.pages.flatMap((page) => page.items) ?? [];
    // The 10s background refetch re-fetches every loaded page with the
    // `UPDATED_AT_DESC` cursor. If a conversation's `updated_at` shifts between
    // page fetches, a later page can overlap an earlier one and surface the
    // same conversation twice. Dedupe by id (keeping the first/freshest copy)
    // so the rendered count reflects real growth and React keys stay unique.
    const seen = new Set<string>();
    return all.filter((conversation) => {
      if (seen.has(conversation.id)) {
        return false;
      }
      seen.add(conversation.id);
      return true;
    });
  }, [data]);

  // Archived conversations are pulled out of the bucketed/pinned lists and
  // shown in a dedicated collapsible section at the bottom.
  const { active: activeConversations, archived: archivedConversations } =
    React.useMemo(
      () => partitionArchivedConversations(conversations, archivedIds),
      [conversations, archivedIds],
    );

  // Client-side search lens over the active set, before the list splits into
  // pinned/scoped so search narrows every view consistently.
  const searchedConversations = React.useMemo(
    () => ConversationSearch.filter(activeConversations, searchQuery),
    [activeConversations, searchQuery],
  );

  // The "Repo" filter narrows the searched list to one workspace/repo. Options
  // derive from the unfiltered active set so every repo stays selectable.
  const repoVisibleConversations = React.useMemo(
    () =>
      filterConversationsByRepo(
        searchedConversations,
        activeBackend.kind,
        repoFilter,
      ),
    [searchedConversations, activeBackend.kind, repoFilter],
  );

  const pinnedConversations = React.useMemo(
    () => resolvePinnedConversations(pinnedIds, repoVisibleConversations),
    [repoVisibleConversations, pinnedIds],
  );

  // Only offer the source facet when Hermes-launched sessions are actually
  // present; force "all" otherwise so a persisted scope can't strand the list.
  const hasHermesConversations = React.useMemo(
    () => conversations.some((c) => ConversationOwnership.isHermes(c)),
    [conversations],
  );
  const effectiveSourceScope = hasHermesConversations ? sourceScope : "all";

  // The project facet narrows the list to one project, and the same selection
  // seeds new launches (see `getActiveProjectSlug`). Options union the local
  // registry with any slug present on the active conversations, so a freshly
  // created (empty) project and a Hermes-stamped foreign slug are both
  // selectable. Mirrors owner/source: hidden + forced "all" when there are no
  // projects so a persisted scope can't strand the list.
  const projectOptions = React.useMemo<ProjectFilterOption[]>(
    () => Project.deriveFilterOptions(registryProjects, activeConversations),
    [registryProjects, activeConversations],
  );
  const hasProjects = projectOptions.length > 0;
  const effectiveProjectFilter = hasProjects
    ? projectFilter
    : PROJECT_FILTER_ALL;
  // Memoized (keyed on the flat filter string) so the object identity is
  // stable across renders and doesn't defeat the `scopedConversations` memo.
  const projectScope = React.useMemo<ProjectScope>(
    () =>
      effectiveProjectFilter === PROJECT_FILTER_ALL
        ? "all"
        : { slug: effectiveProjectFilter },
    [effectiveProjectFilter],
  );
  const projectNameBySlug = React.useMemo(
    () => new Map(registryProjects.map((p) => [p.slug, p.name])),
    [registryProjects],
  );

  // Drop a project filter that no longer matches any registry row or
  // conversation (deleted project, backend switch) so the list can't silently
  // render empty. Gated on `isFetched`: a foreign/Hermes slug only appears in
  // `projectOptions` once the conversation carrying it loads, so resetting in
  // the pre-fetch empty window would wrongly clear a persisted selection (and
  // its launch seed) before that conversation arrives.
  React.useEffect(() => {
    if (!isFetched) {
      return;
    }
    if (
      projectFilter !== PROJECT_FILTER_ALL &&
      !projectOptions.some((option) => option.slug === projectFilter)
    ) {
      setProjectFilter(PROJECT_FILTER_ALL);
    }
  }, [isFetched, projectFilter, projectOptions, setProjectFilter]);

  React.useEffect(() => {
    if (!isFetched) {
      return;
    }
    const existingIds = conversations.map((conversation) => conversation.id);
    pruneMissingPinnedConversations(activeBackend.id, existingIds);
    pruneMissingArchived(activeBackend.id, existingIds);
    pruneMissingUnread(activeBackend.id, existingIds);
    pruneMissingMuted(activeBackend.id, existingIds);
    pruneMissingStatusOverrides(activeBackend.id, existingIds);
  }, [
    activeBackend.id,
    conversations,
    isFetched,
    pruneMissingPinnedConversations,
    pruneMissingArchived,
    pruneMissingUnread,
    pruneMissingMuted,
    pruneMissingStatusOverrides,
  ]);

  React.useEffect(() => {
    if (pinnedIds.length === 0) {
      setExpandedPinnedPreview(false);
    }
  }, [pinnedIds.length]);

  const scopedConversations = React.useMemo(() => {
    const ownerFiltered = ConversationOwnership.filter(
      repoVisibleConversations,
      {
        ownerScope: effectiveOwnerScope,
        sourceScope: effectiveSourceScope,
        currentUserEmail,
        projectScope,
      },
    );

    const scopeFiltered =
      threadScope === "relevant"
        ? ownerFiltered.filter((c) => isExecutionActive(c.execution_status))
        : ownerFiltered;

    // In the expanded panel, pinned conversations should only appear inside
    // the dedicated pinned section (not duplicated in grouped/flat lists).
    if (compact) {
      return scopeFiltered;
    }

    return filterOutPinnedConversations(scopeFiltered, pinnedIds);
  }, [
    compact,
    repoVisibleConversations,
    pinnedIds,
    threadScope,
    effectiveOwnerScope,
    effectiveSourceScope,
    currentUserEmail,
    projectScope,
  ]);

  const { recent: recentScoped, older: olderScoped } = React.useMemo(
    () => partitionByCutoff(scopedConversations),
    [scopedConversations],
  );

  // Sort the full visible set as one list. The recent/older partition is
  // still computed (it gates the "Show older" toggle and "Load more"
  // visibility), but the rendering must not use it as a visual boundary —
  // when sorting by `created`, a stale-but-recently-touched conversation
  // would otherwise land in `recent` and render above an actually-newer-
  // by-`created_at` conversation sitting in `older`.
  const sortedVisibleConversations = React.useMemo(() => {
    const visible = showOlderConversations
      ? [...recentScoped, ...olderScoped]
      : recentScoped;
    return sortConversationsByField(visible, conversationSort);
  }, [recentScoped, olderScoped, showOlderConversations, conversationSort]);

  const groupLabels = React.useMemo(
    () => ({
      emptyWorkspace: t(I18nKey.CONVERSATION_PANEL$NO_WORKSPACE),
      emptyRepository: t(I18nKey.CONVERSATION_PANEL$NO_REPOSITORY),
    }),
    [t],
  );

  const repoOptions = React.useMemo(
    () =>
      deriveRepoFilterOptions(
        activeConversations,
        activeBackend.kind,
        groupLabels,
      ),
    [activeConversations, activeBackend.kind, groupLabels],
  );

  // If the selected repo filter no longer matches any conversation (its
  // conversations were deleted/archived, or the backend switched), fall back
  // to "all" so the list doesn't silently render empty.
  React.useEffect(() => {
    if (
      repoFilter !== "all" &&
      !repoOptions.some((option) => option.id === repoFilter)
    ) {
      setRepoFilter("all");
    }
  }, [repoFilter, repoOptions, setRepoFilter]);

  const conversationGroups = React.useMemo(() => {
    if (compact || organizeMode !== "grouped") {
      return null;
    }
    // Use the unsorted partitions: groupConversations sorts each bucket
    // internally by `sortField`, so pre-sorting the merged input is wasted
    // work in grouped mode (the per-group sort overrides any global order).
    const merged = [
      ...recentScoped,
      ...(showOlderConversations ? olderScoped : []),
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
    olderScoped,
    organizeMode,
    recentScoped,
    showOlderConversations,
  ]);

  const orderedConversationGroups = React.useMemo(() => {
    if (!conversationGroups) {
      return null;
    }
    return applyGroupFolderOrder(conversationGroups, groupFolderOrder);
  }, [conversationGroups, groupFolderOrder]);

  const groupedStatusBuckets = React.useMemo(() => {
    if (!orderedConversationGroups) {
      return null;
    }
    return bucketConversationGroupsByStatus(
      orderedConversationGroups,
      getStatusOverride,
    );
  }, [orderedConversationGroups, getStatusOverride]);

  const chronologicalStatusBuckets = React.useMemo(
    () =>
      bucketConversationsByStatus(
        sortedVisibleConversations,
        getStatusOverride,
      ),
    [sortedVisibleConversations, getStatusOverride],
  );

  const conversationGroupIds = React.useMemo(
    () => conversationGroups?.map((group) => group.id) ?? [],
    [conversationGroups],
  );

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

  const visibleFlatCount = sortedVisibleConversations.length;

  const visibleGroupedCount = React.useMemo(() => {
    if (!orderedConversationGroups) {
      return 0;
    }
    return orderedConversationGroups.reduce(
      (n, g) => n + g.conversations.length,
      0,
    );
  }, [orderedConversationGroups]);

  const listIsEffectivelyEmpty =
    organizeMode === "grouped" && !compact
      ? visibleGroupedCount === 0
      : visibleFlatCount === 0;

  // Number of conversations actually rendered in the list right now, in the
  // current organize mode. "Load more" succeeds only when this number grows.
  const visibleCount =
    organizeMode === "grouped" && !compact
      ? visibleGroupedCount
      : visibleFlatCount;

  // KNOWN ISSUE (unresolved as of 2026-05-29): users still report that the
  // sidebar "Load more" sometimes requires two clicks before new conversations
  // appear. The mitigation below (dedupe by id in `conversations`, plus the
  // floor-tracking driver that keeps fetching until the visible count grows)
  // reduced but did NOT fully eliminate the symptom in manual testing. Likely
  // remaining suspects to investigate next: the agent-server cursor pagination
  // returning an overlapping/short page under `UPDATED_AT_DESC` while the 10s
  // `refetchInterval` reorders pages (see `usePaginatedConversations`), or a
  // React Query state lag where `hasNextPage`/`isFetching` settle a render
  // after the click. If you pick this up, reproduce against a backend with
  // >40 conversations and watch the `/api/conversations/search` cursors.
  //
  // Robust "Load more" driver. A single click can fail to surface new rows for
  // two reasons: (1) `fetchNextPage()` is silently dropped while the 10s
  // background refetch is in flight, and (2) a fetched page can yield zero
  // *visible* rows (filtered out by the active scope, or deduped as overlap),
  // so the list does not appear to grow. We capture the visible count at click
  // time and keep fetching pages — once the query is idle — until the visible
  // count actually increases or there are no more pages.
  const [loadMoreFloor, setLoadMoreFloor] = React.useState<number | null>(null);
  const visibleCountRef = React.useRef(visibleCount);
  visibleCountRef.current = visibleCount;

  const requestLoadMore = React.useCallback(() => {
    if (hasNextPage) {
      setLoadMoreFloor(visibleCountRef.current);
    }
  }, [hasNextPage]);

  React.useEffect(() => {
    if (loadMoreFloor === null) {
      return;
    }
    // Goal met: the visible list grew past where it was when the user clicked.
    if (visibleCount > loadMoreFloor) {
      setLoadMoreFloor(null);
      return;
    }
    // Nothing more to fetch — stop waiting even if the list did not grow.
    if (!hasNextPage) {
      setLoadMoreFloor(null);
      return;
    }
    // Wait for any in-flight fetch (including the background refetch) to settle
    // before requesting the next page, otherwise the request is dropped.
    if (isFetching || isFetchingNextPage) {
      return;
    }
    fetchNextPage();
  }, [
    loadMoreFloor,
    visibleCount,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  const isLoadingMore = loadMoreFloor !== null || isFetchingNextPage;

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
  // Do not show when the visible list is empty (e.g. filters hide every
  // loaded conversation) — that state already shows "No conversations found".
  const showLoadMore =
    !!hasNextPage && !olderHidden && !compact && !listIsEffectivelyEmpty;

  const { mutate: createConversation } = useCreateConversation();
  const isCreatingConversationFlow = useIsCreatingConversation();

  const launchFromGroup = React.useCallback(
    (launch: ConversationGroupLaunch) => {
      if (isCreatingConversationFlow) return;
      createConversation(
        {
          workingDir: launch.workingDir,
          repository: launch.repository,
        },
        {
          onSuccess: (data) => {
            navigate(`/conversations/${data.conversation_id}`);
          },
        },
      );
    },
    [createConversation, isCreatingConversationFlow, navigate],
  );

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

  const handleConfirmDeleteAll = async () => {
    const idsToDelete = conversations.map((c) => c.id);
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
    (
      conversation: (typeof conversations)[number],
      options?: { inPinnedSection?: boolean },
    ) => {
      const isPinned = pinnedIds.includes(conversation.id);
      const isArchived = archivedIds.includes(conversation.id);
      const isUnread = unreadIds.includes(conversation.id);
      const isMuted = mutedIds.includes(conversation.id);
      const statusOverride = statusOverrides[conversation.id] ?? null;
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
            sandboxStatus={conversation.sandbox_status}
            lastUpdatedAt={conversation.updated_at}
            createdAt={conversation.created_at}
            workspaceWorkingDir={
              conversation.selected_workspace ??
              conversation.workspace?.working_dir
            }
            isActive={conversation.id === currentConversationId}
            onClose={onClose}
            showRepositoryMetadata={showRepoBranchMetadata}
            llmModel={conversation.llm_model}
            showLlmProfiles={showLlmProfiles}
            agentKind={conversation.agent_kind}
            acpServer={conversation.acp_server}
          />
        );
      }
      return (
        <StyledTooltip
          key={conversation.id}
          placement="right-start"
          delay={1000}
          closeDelay={100}
          disabled={!showHoverMetadata || openContextMenuId === conversation.id}
          tooltipClassName="rounded-xl border border-[var(--oh-border)] bg-base-secondary p-0 text-foreground shadow-xl"
          content={
            <ConversationCardPreview
              title={conversation.title ?? ""}
              executionStatus={conversation.execution_status}
              sandboxStatus={conversation.sandbox_status}
              selectedRepository={{
                selected_repository: conversation.selected_repository,
                selected_branch: conversation.selected_branch,
                git_provider: conversation.git_provider as Provider,
              }}
              workspaceWorkingDir={
                conversation.selected_workspace ??
                conversation.workspace?.working_dir
              }
              llmModel={conversation.llm_model}
              createdAt={conversation.created_at}
            />
          }
        >
          <NavigationLink
            to={`/conversations/${conversation.id}`}
            onClick={() => {
              if (isUnread) markRead(activeBackend.id, conversation.id);
              onClose?.();
            }}
            className={cn(
              "block rounded-md transition-colors",
              openContextMenuId !== conversation.id &&
                "hover:bg-[var(--oh-surface)]",
              (conversation.id === currentConversationId ||
                openContextMenuId === conversation.id) &&
                "bg-[var(--oh-surface)]",
            )}
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
              sandboxStatus={conversation.sandbox_status}
              conversationId={conversation.id}
              contextMenuOpen={openContextMenuId === conversation.id}
              onContextMenuToggle={(isOpen) =>
                setOpenContextMenuId(isOpen ? conversation.id : null)
              }
              isActive={conversation.id === currentConversationId}
              workspaceWorkingDir={
                conversation.selected_workspace ??
                conversation.workspace?.working_dir
              }
              showRepositoryMetadata={showRepoBranchMetadata}
              llmModel={conversation.llm_model}
              showLlmProfiles={showLlmProfiles}
              agentKind={conversation.agent_kind}
              acpServer={conversation.acp_server}
              isHermes={ConversationOwnership.isHermes(conversation)}
              projectLabel={
                conversation.project
                  ? (projectNameBySlug.get(conversation.project) ??
                    conversation.project)
                  : null
              }
              ownerLabel={ConversationOwnership.peerOwner(
                conversation,
                currentUserEmail,
              )}
              tags={conversation.tags}
              isPinned={isPinned}
              onTogglePin={() => togglePin(activeBackend.id, conversation.id)}
              isMuted={isMuted}
              onToggleMute={() => toggleMute(activeBackend.id, conversation.id)}
              alwaysShowPinIcon={isPinned && !options?.inPinnedSection}
              isUnread={isUnread}
              onToggleUnread={() =>
                toggleUnread(activeBackend.id, conversation.id)
              }
              isArchived={isArchived}
              onToggleArchive={() =>
                toggleArchive(activeBackend.id, conversation.id)
              }
              statusOverride={statusOverride}
              onSetStatus={(bucket) =>
                setStatusOverride(activeBackend.id, conversation.id, bucket)
              }
              onClearStatus={() =>
                clearStatusOverride(activeBackend.id, conversation.id)
              }
            />
          </NavigationLink>
        </StyledTooltip>
      );
    },
    [
      activeBackend.id,
      compact,
      currentConversationId,
      handleConversationTitleChange,
      handleDeleteProject,
      handleStopConversation,
      onClose,
      openContextMenuId,
      pinnedIds,
      archivedIds,
      unreadIds,
      mutedIds,
      statusOverrides,
      showRepoBranchMetadata,
      showLlmProfiles,
      showHoverMetadata,
      projectNameBySlug,
      currentUserEmail,
      togglePin,
      toggleMute,
      toggleArchive,
      toggleUnread,
      markRead,
      setStatusOverride,
      clearStatusOverride,
    ],
  );

  // Standard layout: panel fills its slot in the sidebar; the inner scroll
  // child fills the panel and scrolls when its content overflows. Modals are
  // siblings of the scroll element and are `position: fixed`, so they don't
  // participate in the panel's scroll geometry.
  // Gate on `isLoading` / `!isFetched` (true only until the first fetch settles),
  // not `isFetching` — the latter flips back to true on every 10s background
  // refetch, causing the skeleton/empty-state to flicker when the list is empty.
  const showInitialSkeleton = isLoading || !isFetched;
  const showPinnedSection =
    !compact && !showInitialSkeleton && pinnedConversations.length > 0;
  const showEmptyState =
    isFetched &&
    !isLoading &&
    !compact &&
    listIsEffectivelyEmpty &&
    !showPinnedSection &&
    !startTasks?.length;

  const showConversationHeader = !compact;

  const renderStatusBucketHeader = React.useCallback(
    (bucketId: ConversationStatusBucketId, count: number) => (
      <div
        data-testid={getStatusBucketTestId(bucketId)}
        className="flex items-center gap-2 px-2 pb-1 pt-3 text-xs font-semibold text-[var(--oh-muted)]"
      >
        <StatusBucketIcon bucketId={bucketId} />
        <span>{t(STATUS_BUCKET_LABEL_KEYS[bucketId])}</span>
        <span className="rounded-full bg-[var(--oh-surface-raised)] px-1.5 py-px text-[10px] leading-4 text-[var(--oh-muted)]">
          {count}
        </span>
      </div>
    ),
    [t],
  );

  return (
    <div
      ref={ref}
      data-testid="conversation-panel"
      className="flex h-full min-h-0 w-full flex-col"
    >
      {showConversationHeader && (
        <div
          className={cn(
            // Pull flush to the sidebar edges: `-ml-2.5` matches aside `pl-2.5`;
            // width extends by that inset on the right now that aside is `pr-0`.
            "-ml-2.5 w-[calc(100%+0.625rem)] max-w-none box-border border-b",
            isListScrolled ? "border-[var(--oh-border)]" : "border-transparent",
          )}
        >
          <div
            data-testid="older-conversations-summary"
            className="flex min-w-0 flex-nowrap items-center gap-x-2 py-2 pl-4 pr-2.5 text-[var(--oh-muted)]"
          >
            <span className="min-w-0 truncate text-sm font-medium text-[var(--oh-muted)]">
              {t(I18nKey.SIDEBAR$CONVERSATIONS)}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              {activeBackend.kind === "local" && <ConductorNewWorkspaceMenu />}
              <ConversationPanelNewThreadPicker
                backendKind={activeBackend.kind}
              />
              <ConversationPanelFilterMenu
                filterMenuOpen={filterMenuOpen}
                setFilterMenuOpen={setFilterMenuOpen}
                menuRef={filterMenuRef}
                backendKind={activeBackend.kind}
                organizeMode={organizeMode}
                setOrganizeMode={setOrganizeMode}
                conversationSort={conversationSort}
                setConversationSort={setConversationSort}
                repoFilter={repoFilter}
                setRepoFilter={setRepoFilter}
                repoOptions={repoOptions}
                projectFilter={effectiveProjectFilter}
                setProjectFilter={setProjectFilter}
                projectOptions={projectOptions}
                showProjectScope={hasProjects}
                onManageProjects={() => setProjectManagerOpen(true)}
                threadScope={threadScope}
                setThreadScope={setThreadScope}
                ownerScope={ownerScope}
                setOwnerScope={setOwnerScope}
                showOwnerScope={currentUserEmail != null}
                sourceScope={sourceScope}
                setSourceScope={setSourceScope}
                showSourceScope={hasHermesConversations}
                showOlderConversations={showOlderConversations}
                toggleShowOlderConversations={toggleShowOlderConversations}
                showRepoBranchMetadata={showRepoBranchMetadata}
                toggleShowRepoBranchMetadata={toggleShowRepoBranchMetadata}
                showLlmProfiles={showLlmProfiles}
                toggleShowLlmProfiles={toggleShowLlmProfiles}
                showHoverMetadata={showHoverMetadata}
                toggleShowHoverMetadata={toggleShowHoverMetadata}
                totalConversationsCount={conversations.length}
                onRequestDeleteAll={() => setConfirmDeleteAllVisible(true)}
              />
            </div>
          </div>
          <div className="px-4 pb-2">
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--oh-muted)]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t(I18nKey.CONVERSATION_PANEL$SEARCH_PLACEHOLDER)}
                aria-label={t(I18nKey.CONVERSATION_PANEL$SEARCH_PLACEHOLDER)}
                data-testid="conversation-search-input"
                className="w-full rounded-md border border-[var(--oh-border)] bg-transparent py-1 pl-7 pr-7 text-sm text-white placeholder:text-[var(--oh-muted)] focus:border-white/30 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label={t(I18nKey.CONVERSATION_PANEL$SEARCH_CLEAR)}
                  data-testid="conversation-search-clear"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--oh-muted)] hover:text-white"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        data-testid="conversation-panel-list-scroll"
        onScroll={(event) => {
          setIsListScrolled(event.currentTarget.scrollTop > 0);
        }}
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar-always",
          !compact && "conversation-panel-list-scroll",
        )}
      >
        {showInitialSkeleton && <ConversationCardSkeleton compact={compact} />}

        {!compact && showEmptyState && (
          <div
            data-testid="conversation-panel-empty-state"
            className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8"
          >
            <p className="text-xs text-[var(--oh-muted)]">
              {t(I18nKey.CONVERSATION$NO_CONVERSATIONS)}
            </p>
          </div>
        )}

        {showPinnedSection ? (
          <ConversationPanelPinnedSection
            pinnedConversations={pinnedConversations}
            isPreviewExpanded={expandedPinnedPreview}
            onTogglePreviewExpanded={() =>
              setExpandedPinnedPreview((current) => !current)
            }
            activeConversationId={currentConversationId}
            showDivider={!compact && organizeMode === "chronological"}
            renderConversationCard={(conversation) =>
              renderConversationCard(conversation, { inPinnedSection: true })
            }
          />
        ) : null}

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
          ? compactVisibleConversations.map((conversation) =>
              renderConversationCard(conversation),
            )
          : null}

        {!showInitialSkeleton &&
        !compact &&
        organizeMode === "grouped" &&
        groupedStatusBuckets &&
        groupedStatusBuckets.length > 0 ? (
          <div className="space-y-2 pb-1">
            {groupedStatusBuckets.map((bucket) => (
              <section key={bucket.id}>
                {renderStatusBucketHeader(bucket.id, bucket.groups.length)}
                <ConversationGroupFolderList
                  groups={bucket.groups}
                  groupIds={conversationGroupIds}
                  groupFolderOrder={groupFolderOrder}
                  setGroupFolderOrder={setGroupFolderOrder}
                  collapsedGroupIds={collapsedGroupIds}
                  expandedGroupPreviewIds={expandedGroupPreviewIds}
                  onToggleGroupCollapsed={toggleGroupCollapsed}
                  onToggleGroupPreviewExpanded={toggleGroupPreviewExpanded}
                  isCreatingConversationFlow={isCreatingConversationFlow}
                  activeConversationId={currentConversationId}
                  onLaunchFromGroup={launchFromGroup}
                  renderConversationCard={(conversation) =>
                    renderConversationCard(conversation)
                  }
                />
              </section>
            ))}
          </div>
        ) : null}

        {!showInitialSkeleton &&
        !compact &&
        organizeMode === "chronological" ? (
          <div className="space-y-2 pb-1">
            {chronologicalStatusBuckets.map((bucket) => (
              <section key={bucket.id}>
                {renderStatusBucketHeader(
                  bucket.id,
                  bucket.conversations.length,
                )}
                <div className="space-y-0.5">
                  {bucket.conversations.map((conversation) =>
                    renderConversationCard(conversation),
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {!showInitialSkeleton &&
        !compact &&
        archivedConversations.length > 0 ? (
          <section data-testid="conversation-panel-archived-section">
            <button
              type="button"
              data-testid="conversation-panel-archived-toggle"
              aria-expanded={archivedSectionExpanded}
              onClick={() => setArchivedSectionExpanded((v) => !v)}
              className="flex w-full items-center gap-2 px-2 pb-1 pt-3 text-xs font-semibold text-[var(--oh-muted)] hover:text-foreground"
            >
              {archivedSectionExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{t(I18nKey.CONVERSATION_PANEL$ARCHIVED_SECTION)}</span>
              <span className="rounded-full bg-[var(--oh-surface-raised)] px-1.5 py-px text-[10px] leading-4 text-[var(--oh-muted)]">
                {archivedConversations.length}
              </span>
            </button>
            {archivedSectionExpanded ? (
              <div className="space-y-0.5">
                {archivedConversations.map((conversation) =>
                  renderConversationCard(conversation),
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Explicit "Load more" trigger. Only shown when more pages exist
            *and* the older list is currently visible (or there are no older
            conversations to begin with) — otherwise the next page would be
            populated mostly with conversations the user has chosen to hide. */}
        {showLoadMore &&
          (isLoadingMore ? (
            <div className="py-1">
              <ConversationCardSkeleton compact={compact} />
            </div>
          ) : (
            <div className="flex justify-center py-4">
              <button
                type="button"
                data-testid="load-more-conversations"
                onClick={requestLoadMore}
                className="text-xs text-[var(--oh-muted)] hover:text-foreground"
              >
                {t(I18nKey.CONVERSATION$LOAD_MORE)}
              </button>
            </div>
          ))}
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

      {projectManagerOpen && (
        <ProjectManagerDialog
          projects={registryProjects}
          onCreate={(input) => upsertProject(activeBackend.id, input)}
          onRemove={(slug) => removeProject(activeBackend.id, slug)}
          onActivate={(slug) => setProjectFilter(slug)}
          currentUserEmail={currentUserEmail}
          onClose={() => setProjectManagerOpen(false)}
        />
      )}

      {confirmDeleteAllVisible && (
        <ConfirmDeleteModal
          title={t(I18nKey.CONVERSATION$CONFIRM_DELETE_ALL_TITLE)}
          description={t(I18nKey.CONVERSATION$CONFIRM_DELETE_ALL_DESC, {
            count: conversations.length,
          })}
          onConfirm={async () => {
            await handleConfirmDeleteAll();
            setConfirmDeleteAllVisible(false);
          }}
          onCancel={() => setConfirmDeleteAllVisible(false)}
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
