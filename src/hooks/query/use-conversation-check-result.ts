import { useQuery } from "@tanstack/react-query";

import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import type { SandboxStatus } from "#/api/conversation-service/agent-server-conversation-service.types";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { CHECK_RESULT_QUERY_KEYS } from "#/hooks/query/query-keys";
import { CHECK_RESULT_PATH, CheckResult } from "#/utils/check-result";
import { isArchivedSandboxStatus } from "#/utils/conversation-archive-status";

interface UseConversationCheckResultParams {
  conversationId?: string;
  conversationUrl?: string | null;
  sessionApiKey?: string | null;
  executionStatus?: ExecutionStatus | null;
  sandboxStatus?: SandboxStatus | null;
  enabled?: boolean;
}

const CHECK_RESULT_READABLE_STATUSES = new Set<ExecutionStatus>([
  ExecutionStatus.IDLE,
  ExecutionStatus.FINISHED,
  ExecutionStatus.ERROR,
  ExecutionStatus.STUCK,
]);

function canReadCheckResult(
  executionStatus: ExecutionStatus | null | undefined,
  sandboxStatus: SandboxStatus | null | undefined,
): boolean {
  if (!executionStatus) return false;
  if (isArchivedSandboxStatus(sandboxStatus)) return false;
  return CHECK_RESULT_READABLE_STATUSES.has(executionStatus);
}

function decodeUtf8(buffer: ArrayBuffer): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

/**
 * Reads the advisory verification verdict written by the agent to
 * `.checks/result.json` for a sidebar conversation row.
 *
 * Missing/unreadable files are silent (no toast, no retry): most conversations
 * either predate verification or have not finished yet. The row only needs a
 * compact trust signal when a valid verdict exists.
 */
export function useConversationCheckResult({
  conversationId,
  conversationUrl,
  sessionApiKey,
  executionStatus,
  sandboxStatus,
  enabled = true,
}: UseConversationCheckResultParams) {
  return useQuery({
    queryKey: CHECK_RESULT_QUERY_KEYS.byConversation(
      conversationId,
      conversationUrl,
      sessionApiKey,
    ),
    queryFn: async () => {
      if (!conversationId) throw new Error("No conversation ID");
      const buffer = await AgentServerRuntimeService.downloadFile(
        conversationUrl,
        sessionApiKey,
        CHECK_RESULT_PATH,
      );
      return CheckResult.parse(decodeUtf8(buffer));
    },
    enabled:
      enabled &&
      !!conversationId &&
      canReadCheckResult(executionStatus, sandboxStatus),
    retry: false,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    meta: { disableToast: true },
  });
}
