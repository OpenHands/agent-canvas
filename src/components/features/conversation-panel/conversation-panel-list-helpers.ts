import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import type { BackendKind } from "#/api/backend-registry/types";

export type ConversationSortField = "created" | "updated";
export type ThreadScope = "all" | "relevant";
export type OrganizeMode = "grouped" | "chronological";

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
  const dir = conversation.workspace?.working_dir;
  if (!dir?.trim()) {
    return { id: "__none_workspace", label: "" };
  }
  const normalized = dir.replace(/\/+$/, "");
  const label = normalized.split("/").filter(Boolean).pop() ?? normalized;
  return { id: `ws:${normalized}`, label };
}

function repositoryGroup(conversation: AppConversation): {
  id: string;
  label: string;
} {
  const repo = conversation.selected_repository;
  if (!repo?.trim()) {
    return { id: "__none_repo", label: "" };
  }
  const s = repo.trim();
  const parts = s.split("/").filter(Boolean);
  const label = parts.length
    ? (parts[parts.length - 1] ?? s).replace(/\.git$/, "")
    : s.replace(/\.git$/, "");
  return { id: `repo:${s}`, label };
}

export function groupConversations(
  items: readonly AppConversation[],
  backendKind: BackendKind,
  sortField: ConversationSortField,
  labels: { emptyWorkspace: string; emptyRepository: string },
): { id: string; label: string; conversations: AppConversation[] }[] {
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

  const groups = [...byId.entries()].map(([id, g]) => ({
    id,
    label: g.label,
    conversations: sortConversationsByField(g.conversations, sortField),
  }));

  const groupOrderKey = (g: (typeof groups)[number]) =>
    Math.max(
      ...g.conversations.map((c) =>
        parseConversationTimeMs(
          sortField === "created" ? c.created_at : c.updated_at,
        ),
      ),
      0,
    );

  groups.sort((a, b) => groupOrderKey(b) - groupOrderKey(a));
  return groups;
}
