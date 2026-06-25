import {
  WORK_MODE_TAG,
  WORK_MODE_TAG_VALUE,
  WORK_WORKSPACE_ID_TAG,
} from "#/types/work-manifest";

export function normalizeWorkWorkspaceTagId(id: string): string {
  return id.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function isWorkConversation(
  tags?: Record<string, string> | null,
): boolean {
  return tags?.[WORK_MODE_TAG] === WORK_MODE_TAG_VALUE;
}

export function getWorkWorkspaceIdFromTags(
  tags?: Record<string, string> | null,
): string | null {
  const value = tags?.[WORK_WORKSPACE_ID_TAG];
  return value && value.length > 0 ? value : null;
}

export function getConversationHref(
  conversationId: string,
  tags?: Record<string, string> | null,
): string {
  if (isWorkConversation(tags)) {
    return `/work/tasks/${conversationId}`;
  }
  return `/conversations/${conversationId}`;
}
