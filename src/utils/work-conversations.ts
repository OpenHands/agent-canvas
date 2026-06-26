import {
  WORK_MODE_TAG,
  WORK_MODE_TAG_VALUE,
  WORK_WORKSPACE_ID_TAG,
} from "#/types/work-manifest";
import {
  parseWorkOptionalToolIds,
  serializeWorkOptionalToolIds,
  WORK_ENABLED_TOOLS_TAG,
} from "#/types/work-tools";
import type { WorkOptionalToolId } from "#/types/work-tools";

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

export function getWorkEnabledOptionalToolIds(
  tags?: Record<string, string> | null,
): WorkOptionalToolId[] {
  return parseWorkOptionalToolIds(tags?.[WORK_ENABLED_TOOLS_TAG]);
}

export function withWorkEnabledOptionalToolIds(
  tags: Record<string, string> | null | undefined,
  enabledOptionalToolIds: WorkOptionalToolId[],
): Record<string, string> {
  return {
    ...(tags ?? {}),
    [WORK_ENABLED_TOOLS_TAG]: serializeWorkOptionalToolIds(
      enabledOptionalToolIds,
    ),
  };
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
