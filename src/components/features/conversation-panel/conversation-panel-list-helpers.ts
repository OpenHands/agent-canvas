import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import type { BackendKind } from "#/api/backend-registry/types";
import { ExecutionStatus } from "#/types/agent-server/core";
import type { Provider } from "#/types/settings";

export type ConversationSortField = "created" | "updated";
export type ThreadScope = "all" | "relevant";
export type OrganizeMode = "grouped" | "chronological";
export type ConversationStatusBucketId = "in_progress" | "in_review" | "done";

export const CONVERSATION_STATUS_BUCKET_ORDER: readonly ConversationStatusBucketId[] =
  ["in_progress", "in_review", "done"];

const STATUS_TAG_KEYS = ["status", "bucket"] as const;

const DONE_STATUS_TAG_VALUES = new Set([
  "done",
  "complete",
  "completed",
  "closed",
  "merged",
]);

const REVIEW_STATUS_TAG_VALUES = new Set([
  "review",
  "inreview",
  "readyforreview",
]);

const PROGRESS_STATUS_TAG_VALUES = new Set([
  "progress",
  "inprogress",
  "running",
]);

/** Max conversations shown under a workspace/repo folder before "View more". */
export const GROUP_CONVERSATIONS_PREVIEW_LIMIT = 5;

interface GroupConversationPreviewOptions {
  limit?: number;
  expanded: boolean;
  activeConversationId?: string | null;
}

export function getGroupConversationPreview(
  conversations: readonly AppConversation[],
  options: GroupConversationPreviewOptions,
): {
  visibleConversations: AppConversation[];
  isPreviewTruncated: boolean;
  isShowingAll: boolean;
} {
  const limit = options.limit ?? GROUP_CONVERSATIONS_PREVIEW_LIMIT;

  if (options.expanded || conversations.length <= limit) {
    return {
      visibleConversations: [...conversations],
      isPreviewTruncated: conversations.length > limit,
      isShowingAll: true,
    };
  }

  const activeIndex =
    options.activeConversationId != null
      ? conversations.findIndex((c) => c.id === options.activeConversationId)
      : -1;

  if (activeIndex >= limit) {
    const activeConversation = conversations[activeIndex];
    return {
      visibleConversations: [
        ...conversations.slice(0, limit - 1),
        activeConversation,
      ],
      isPreviewTruncated: true,
      isShowingAll: false,
    };
  }

  return {
    visibleConversations: conversations.slice(0, limit),
    isPreviewTruncated: conversations.length > limit,
    isShowingAll: false,
  };
}

function normalizeStatusTagValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getTaggedStatusBucket(
  tags: AppConversation["tags"],
): ConversationStatusBucketId | null {
  for (const key of STATUS_TAG_KEYS) {
    const value = tags?.[key];
    if (!value) continue;

    const normalized = normalizeStatusTagValue(value);
    if (DONE_STATUS_TAG_VALUES.has(normalized)) {
      return "done";
    }
    if (REVIEW_STATUS_TAG_VALUES.has(normalized)) {
      return "in_review";
    }
    if (PROGRESS_STATUS_TAG_VALUES.has(normalized)) {
      return "in_progress";
    }
  }

  return null;
}

/** Resolves a manual per-conversation status override, if any. */
export type StatusOverrideAccessor = (
  conversationId: string,
) => ConversationStatusBucketId | undefined;

export function getConversationStatusBucket(
  conversation: AppConversation,
  getOverride?: StatusOverrideAccessor,
): ConversationStatusBucketId {
  // A user-set override wins over computed status so conversations can be
  // moved between buckets manually.
  const override = getOverride?.(conversation.id);
  if (override) {
    return override;
  }

  const tagged = getTaggedStatusBucket(conversation.tags);
  if (tagged) {
    return tagged;
  }

  // A finished coding run is ready for human inspection, not automatically
  // complete. Explicit tags can move it to Done after review/merge.
  if (conversation.execution_status === ExecutionStatus.FINISHED) {
    return "in_review";
  }

  return "in_progress";
}

export function bucketConversationsByStatus(
  conversations: readonly AppConversation[],
  getOverride?: StatusOverrideAccessor,
): Array<{ id: ConversationStatusBucketId; conversations: AppConversation[] }> {
  const buckets = new Map<ConversationStatusBucketId, AppConversation[]>(
    CONVERSATION_STATUS_BUCKET_ORDER.map((id) => [id, []]),
  );

  for (const conversation of conversations) {
    buckets
      .get(getConversationStatusBucket(conversation, getOverride))
      ?.push(conversation);
  }

  return CONVERSATION_STATUS_BUCKET_ORDER.map((id) => ({
    id,
    conversations: buckets.get(id) ?? [],
  })).filter((bucket) => bucket.conversations.length > 0);
}

function getGroupStatusBucket(
  group: {
    conversations: readonly AppConversation[];
  },
  getOverride?: StatusOverrideAccessor,
): ConversationStatusBucketId {
  const bucketIds = new Set(
    group.conversations.map((conversation) =>
      getConversationStatusBucket(conversation, getOverride),
    ),
  );
  return (
    CONVERSATION_STATUS_BUCKET_ORDER.find((bucketId) =>
      bucketIds.has(bucketId),
    ) ?? "in_progress"
  );
}

export function bucketConversationGroupsByStatus<
  T extends { conversations: readonly AppConversation[] },
>(
  groups: readonly T[],
  getOverride?: StatusOverrideAccessor,
): Array<{ id: ConversationStatusBucketId; groups: T[] }> {
  const buckets = new Map<ConversationStatusBucketId, T[]>(
    CONVERSATION_STATUS_BUCKET_ORDER.map((id) => [id, []]),
  );

  for (const group of groups) {
    buckets.get(getGroupStatusBucket(group, getOverride))?.push(group);
  }

  return CONVERSATION_STATUS_BUCKET_ORDER.map((id) => ({
    id,
    groups: buckets.get(id) ?? [],
  })).filter((bucket) => bucket.groups.length > 0);
}

export function resolvePinnedConversations(
  pinnedIds: readonly string[],
  conversations: readonly AppConversation[],
): AppConversation[] {
  const byId = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );
  return pinnedIds
    .map((id) => byId.get(id))
    .filter(
      (conversation): conversation is AppConversation => conversation != null,
    );
}

export function filterOutPinnedConversations(
  conversations: readonly AppConversation[],
  pinnedIds: readonly string[],
): AppConversation[] {
  if (pinnedIds.length === 0) {
    return [...conversations];
  }

  const pinnedSet = new Set(pinnedIds);
  return conversations.filter(
    (conversation) => !pinnedSet.has(conversation.id),
  );
}

/** Splits the list into active (shown in buckets) and archived conversations. */
export function partitionArchivedConversations(
  conversations: readonly AppConversation[],
  archivedIds: readonly string[],
): { active: AppConversation[]; archived: AppConversation[] } {
  if (archivedIds.length === 0) {
    return { active: [...conversations], archived: [] };
  }

  const archivedSet = new Set(archivedIds);
  const active: AppConversation[] = [];
  const archived: AppConversation[] = [];
  for (const conversation of conversations) {
    if (archivedSet.has(conversation.id)) {
      archived.push(conversation);
    } else {
      active.push(conversation);
    }
  }
  return { active, archived };
}

/** Subset of `useCreateConversation` variables for launching from a group row */
export type ConversationGroupLaunch = {
  workingDir?: string;
  repository?: {
    name: string;
    gitProvider: Provider;
    branch?: string;
  };
};

function buildGroupLaunch(
  id: string,
  backendKind: BackendKind,
  conversations: AppConversation[],
): ConversationGroupLaunch {
  if (backendKind === "local") {
    if (id === "__none_workspace") {
      return {};
    }
    if (id.startsWith("ws:")) {
      return { workingDir: id.slice(3) };
    }
    return {};
  }

  if (id === "__none_repo") {
    return {};
  }
  if (id.startsWith("repo:")) {
    const name = id.slice(5);
    const sample = conversations[0];
    const gitProvider = (sample?.git_provider ?? "github") as Provider;
    const branch = sample?.selected_branch ?? "main";
    return {
      repository: {
        name,
        gitProvider,
        branch,
      },
    };
  }

  return {};
}

export function parseConversationTimeMs(iso: string | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export function sortConversationsByField(
  items: readonly AppConversation[],
  field: ConversationSortField,
): AppConversation[] {
  const key = field === "created" ? "created_at" : "updated_at";
  return [...items].sort(
    (a, b) => parseConversationTimeMs(b[key]) - parseConversationTimeMs(a[key]),
  );
}

function workspaceGroup(conversation: AppConversation): {
  id: string;
  label: string;
} {
  // Group by the user-selected workspace (a stable identifier shared by
  // every conversation launched from the same picker selection), not
  // `workspace.working_dir` — that field holds the per-conversation
  // worktree path the agent-server creates, which is unique per
  // conversation and would fragment the grouping.
  //
  // Normalize first, then check emptiness: inputs like "/", "///", or
  // "   ///" trim+strip to "" and must fall back to the "no workspace"
  // bucket rather than producing a stray `ws:` group with no label.
  const normalized = conversation.selected_workspace
    ?.trim()
    .replace(/\/+$/, "");
  if (!normalized) {
    return { id: "__none_workspace", label: "" };
  }
  const label = normalized.split("/").filter(Boolean).pop() ?? normalized;
  return { id: `ws:${normalized}`, label };
}

function repositoryGroup(conversation: AppConversation): {
  id: string;
  label: string;
} {
  // Mirror `workspaceGroup`'s normalize-then-check order so "/", "///",
  // and trailing-slash variants of the same repo all collapse to one
  // group instead of producing a stray `repo:/` bucket.
  const normalized = conversation.selected_repository
    ?.trim()
    .replace(/\/+$/, "");
  if (!normalized) {
    return { id: "__none_repo", label: "" };
  }
  const parts = normalized.split("/").filter(Boolean);
  const label = parts.length
    ? (parts[parts.length - 1] ?? normalized).replace(/\.git$/, "")
    : normalized.replace(/\.git$/, "");
  return { id: `repo:${normalized}`, label };
}

export function groupConversations(
  items: readonly AppConversation[],
  backendKind: BackendKind,
  sortField: ConversationSortField,
  labels: { emptyWorkspace: string; emptyRepository: string },
): {
  id: string;
  label: string;
  conversations: AppConversation[];
  launch: ConversationGroupLaunch;
}[] {
  const byId = new Map<
    string,
    { label: string; conversations: AppConversation[] }
  >();

  for (const c of items) {
    const { id, label: rawLabel } =
      backendKind === "local" ? workspaceGroup(c) : repositoryGroup(c);
    const label =
      id === "__none_workspace"
        ? labels.emptyWorkspace
        : id === "__none_repo"
          ? labels.emptyRepository
          : rawLabel;
    const bucket = byId.get(id);
    if (bucket) {
      bucket.conversations.push(c);
    } else {
      byId.set(id, { label, conversations: [c] });
    }
  }

  const groups = [...byId.entries()].map(([id, g]) => {
    const conversations = sortConversationsByField(g.conversations, sortField);
    return {
      id,
      label: g.label,
      conversations,
      launch: buildGroupLaunch(id, backendKind, conversations),
    };
  });

  // Use reduce instead of `Math.max(...arr)` — the spread form would push
  // every conversation onto the call stack as a separate argument, which
  // hits JS engines' ~100k-arg limit on very large buckets.
  const groupOrderKey = (g: (typeof groups)[number]) =>
    g.conversations.reduce(
      (max, c) =>
        Math.max(
          max,
          parseConversationTimeMs(
            sortField === "created" ? c.created_at : c.updated_at,
          ),
        ),
      0,
    );

  groups.sort((a, b) => groupOrderKey(b) - groupOrderKey(a));
  return groups;
}

/** Stable repo/workspace identifier used to group and filter a conversation. */
export function getConversationRepoId(
  conversation: AppConversation,
  backendKind: BackendKind,
): string {
  return backendKind === "local"
    ? workspaceGroup(conversation).id
    : repositoryGroup(conversation).id;
}

export const REPO_FILTER_ALL = "all";

export interface RepoFilterOption {
  id: string;
  label: string;
  count: number;
}

/** Distinct repos/workspaces present in the list, for the "Repo" filter. */
export function deriveRepoFilterOptions(
  conversations: readonly AppConversation[],
  backendKind: BackendKind,
  labels: { emptyWorkspace: string; emptyRepository: string },
): RepoFilterOption[] {
  return groupConversations(conversations, backendKind, "updated", labels).map(
    (group) => ({
      id: group.id,
      label: group.label,
      count: group.conversations.length,
    }),
  );
}

export function filterConversationsByRepo(
  conversations: readonly AppConversation[],
  backendKind: BackendKind,
  repoFilter: string,
): AppConversation[] {
  if (repoFilter === REPO_FILTER_ALL) {
    return [...conversations];
  }
  return conversations.filter(
    (conversation) =>
      getConversationRepoId(conversation, backendKind) === repoFilter,
  );
}

export function applyGroupFolderOrder<T extends { id: string }>(
  groups: readonly T[],
  order: readonly string[],
): T[] {
  if (order.length === 0) {
    return [...groups];
  }

  const byId = new Map(groups.map((group) => [group.id, group]));
  const ordered: T[] = [];
  const seen = new Set<string>();

  for (const id of order) {
    const group = byId.get(id);
    if (group) {
      ordered.push(group);
      seen.add(id);
    }
  }

  for (const group of groups) {
    if (!seen.has(group.id)) {
      ordered.push(group);
    }
  }

  return ordered;
}

export type GroupFolderDropPosition = "before" | "after";

export function moveGroupFolderOrder(
  order: readonly string[],
  groupIds: readonly string[],
  activeGroupId: string,
  targetGroupId: string,
  position: GroupFolderDropPosition = "after",
): string[] {
  if (activeGroupId === targetGroupId) {
    return [...order];
  }

  const effectiveOrder = applyGroupFolderOrder(
    groupIds.map((id) => ({ id })),
    order,
  ).map((group) => group.id);
  const fromIndex = effectiveOrder.indexOf(activeGroupId);
  const toIndex = effectiveOrder.indexOf(targetGroupId);
  if (fromIndex < 0 || toIndex < 0) {
    return [...order];
  }

  const nextOrder = [...effectiveOrder];
  nextOrder.splice(fromIndex, 1);
  const adjustedTargetIndex = nextOrder.indexOf(targetGroupId);
  const insertIndex =
    position === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1;
  nextOrder.splice(insertIndex, 0, activeGroupId);
  return nextOrder;
}
