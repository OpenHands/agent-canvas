import React from "react";
import { useQuery } from "@tanstack/react-query";
import AgentServerGitService from "#/api/git-service/agent-server-git-service.api";
import type { SandboxStatus } from "#/api/conversation-service/agent-server-conversation-service.types";
import { isArchivedSandboxStatus } from "#/utils/conversation-archive-status";
import { getGitPath } from "#/utils/get-git-path";

export interface ConversationDiffStat {
  additions: number;
  deletions: number;
}

interface UseConversationDiffStatParams {
  conversationId?: string;
  selectedRepository?: string | null;
  workingDir?: string | null;
  sandboxStatus?: SandboxStatus | null;
  /** Caller gate (e.g. only the expanded sidebar, not compact rows). */
  enabled?: boolean;
}

/**
 * Per-row git diff stat (summed additions/deletions) for a sidebar
 * conversation. Only fetches when the conversation still has a live runtime
 * (its sandbox isn't archived) — finished/reclaimed conversations have no
 * agent-server to answer `/git/changes`, so they simply show no chip.
 *
 * Returns null when counts are unavailable (no runtime, no changes, or a
 * pre-numstat agent-server image that doesn't emit line counts).
 */
export function useConversationDiffStat({
  conversationId,
  selectedRepository,
  workingDir,
  sandboxStatus,
  enabled = true,
}: UseConversationDiffStatParams): ConversationDiffStat | null {
  const gitPath = React.useMemo(
    () => getGitPath(selectedRepository, workingDir),
    [selectedRepository, workingDir],
  );

  const runtimeAlive = !isArchivedSandboxStatus(sandboxStatus);

  const query = useQuery({
    queryKey: ["conversation_diff_stat", conversationId, gitPath],
    queryFn: () => {
      if (!conversationId) throw new Error("No conversation ID");
      // Local mode resolves the shared agent-server from the active backend
      // (null url/key); cloud mode routes by conversationId.
      return AgentServerGitService.getGitChanges(
        conversationId,
        null,
        null,
        gitPath,
      );
    },
    enabled: enabled && runtimeAlive && !!conversationId,
    retry: false,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    meta: { disableToast: true },
  });

  return React.useMemo<ConversationDiffStat | null>(() => {
    const data = query.data;
    if (!data) return null;
    let additions = 0;
    let deletions = 0;
    let hasCounts = false;
    for (const change of data) {
      if (typeof change.additions === "number") {
        additions += change.additions;
        hasCounts = true;
      }
      if (typeof change.deletions === "number") {
        deletions += change.deletions;
        hasCounts = true;
      }
    }
    return hasCounts ? { additions, deletions } : null;
  }, [query.data]);
}
