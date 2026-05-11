import React from "react";
import { useQuery } from "@tanstack/react-query";
import AgentServerGitService from "#/api/git-service/agent-server-git-service.api";
import { useConversationId } from "#/hooks/use-conversation-id";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { getGitPath } from "#/utils/get-git-path";
import { GitChangeStatus } from "#/api/open-hands.types";

type UseUnifiedGitDiffConfig = {
  filePath: string;
  type: GitChangeStatus;
  enabled: boolean;
};

export const useUnifiedGitDiff = (config: UseUnifiedGitDiffConfig) => {
  const { conversationId } = useConversationId();
  const { data: conversation } = useActiveConversation();

  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const selectedRepository = conversation?.selected_repository;
  const workingDir = conversation?.workspace?.working_dir?.trim();

  const absoluteFilePath = React.useMemo(() => {
    const gitPath = getGitPath(selectedRepository, workingDir);
    return `${gitPath}/${config.filePath}`;
  }, [selectedRepository, config.filePath, workingDir]);

  // Deleted files no longer exist on disk, so the agent server's
  // `/api/git/diff` endpoint returns a `GitPathError` (HTTP 400) for them.
  // Skip the request entirely and let the UI render a "file deleted"
  // placeholder instead of triggering an error toast.
  const isDeleted = config.type === "D";

  return useQuery({
    queryKey: [
      "file_diff",
      conversationId,
      conversationUrl,
      sessionApiKey,
      absoluteFilePath,
    ],
    queryFn: async () => {
      if (!conversationId) throw new Error("No conversation ID");

      return AgentServerGitService.getGitChangeDiff(
        conversationUrl,
        sessionApiKey,
        absoluteFilePath,
      );
    },
    enabled: config.enabled && !isDeleted,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15, // 15 minutes
  });
};
