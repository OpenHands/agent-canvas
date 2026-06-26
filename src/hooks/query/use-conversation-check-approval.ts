import { useQuery } from "@tanstack/react-query";

import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import type { SandboxStatus } from "#/api/conversation-service/agent-server-conversation-service.types";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { CHECK_APPROVAL_QUERY_KEYS } from "#/hooks/query/query-keys";
import { CHECK_APPROVAL_PATH, CheckApproval } from "#/utils/check-approval";
import { canReadCheckResult } from "#/hooks/query/use-conversation-check-result";
import { useWorkspaceMutationCounter } from "#/stores/use-workspace-mutation-counter";

interface UseConversationCheckApprovalParams {
  conversationId?: string;
  conversationUrl?: string | null;
  sessionApiKey?: string | null;
  executionStatus?: ExecutionStatus | null;
  sandboxStatus?: SandboxStatus | null;
  enabled?: boolean;
}

function decodeUtf8(buffer: ArrayBuffer): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

/** Reads the operator approval that promotes passed check evidence from
 * advisory to trusted. Missing/unreadable files are silent: approval is absent
 * until a human explicitly records it. */
export function useConversationCheckApproval({
  conversationId,
  conversationUrl,
  sessionApiKey,
  executionStatus,
  sandboxStatus,
  enabled = true,
}: UseConversationCheckApprovalParams) {
  const workspaceMutationCount = useWorkspaceMutationCounter(
    (state) => state.count,
  );

  return useQuery({
    queryKey: CHECK_APPROVAL_QUERY_KEYS.byConversation(
      conversationId,
      conversationUrl,
      sessionApiKey,
      workspaceMutationCount,
    ),
    queryFn: async () => {
      if (!conversationId) throw new Error("No conversation ID");
      const buffer = await AgentServerRuntimeService.downloadFile(
        conversationUrl,
        sessionApiKey,
        CHECK_APPROVAL_PATH,
      );
      return CheckApproval.parse(decodeUtf8(buffer));
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
