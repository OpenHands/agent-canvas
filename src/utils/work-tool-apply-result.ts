import type { WorkConversationToolsUpdateResult } from "#/api/conversation-service/agent-server-conversation-service.api";
import { getConversationHref } from "#/utils/work-conversations";

export function getWorkToolsNavigationTarget(
  result: WorkConversationToolsUpdateResult,
  sourceConversationId: string,
  tags?: Record<string, string> | null,
): string | null {
  if (!result.toolsApplied || result.conversationId === sourceConversationId) {
    return null;
  }

  return getConversationHref(result.conversationId, tags ?? undefined);
}

export function shouldSendWorkToolApprovalMessage(
  result: WorkConversationToolsUpdateResult,
): boolean {
  return (
    result.toolsApplied &&
    (result.appliedVia === "switch_tools" || result.appliedVia === "fork")
  );
}
