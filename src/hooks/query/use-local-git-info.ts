import { useQuery } from "@tanstack/react-query";

import { createRemoteWorkspace } from "#/api/typescript-client";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useRuntimeIsReady } from "#/hooks/use-runtime-is-ready";
import { Provider } from "#/types/settings";
import { parseGitRemoteUrl } from "#/utils/parse-git-remote-url";

export interface LocalGitInfo {
  repository: string | null;
  branch: string | null;
  provider: Provider | null;
  remoteUrl: string | null;
}

const EMPTY_LOCAL_GIT_INFO: LocalGitInfo = {
  repository: null,
  branch: null,
  provider: null,
  remoteUrl: null,
};

/**
 * For local-workspace conversations (no `selected_repository` recorded on the
 * conversation), shell out via the agent server's bash-execute endpoint to
 * read `git remote get-url origin` and the current branch from the
 * conversation's working directory.
 *
 * Returns `null` fields when the working dir is not a git checkout — callers
 * should treat that the same as "no repo detected".
 */
export const useLocalGitInfo = () => {
  const { data: conversation } = useActiveConversation();
  const runtimeIsReady = useRuntimeIsReady();

  const conversationId = conversation?.id;
  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const workingDir = conversation?.workspace?.working_dir?.trim();
  const hasConversationRepo = !!conversation?.selected_repository;

  return useQuery<LocalGitInfo>({
    queryKey: [
      "local-git-info",
      conversationId,
      conversationUrl,
      sessionApiKey,
      workingDir,
    ],
    queryFn: async () => {
      const workspace = createRemoteWorkspace({
        conversationUrl,
        sessionApiKey,
      });

      const [remoteResult, branchResult] = await Promise.all([
        workspace.executeCommand("git remote get-url origin", workingDir, 10),
        workspace.executeCommand(
          "git rev-parse --abbrev-ref HEAD",
          workingDir,
          10,
        ),
      ]);

      const remoteUrl =
        remoteResult.exit_code === 0 ? remoteResult.stdout.trim() : "";
      const rawBranch =
        branchResult.exit_code === 0 ? branchResult.stdout.trim() : "";
      const branch = rawBranch && rawBranch !== "HEAD" ? rawBranch : null;

      if (!remoteUrl && !branch) return EMPTY_LOCAL_GIT_INFO;

      const parsedRemote = parseGitRemoteUrl(remoteUrl);
      return {
        repository: parsedRemote?.repository ?? null,
        provider: parsedRemote?.provider ?? null,
        remoteUrl: remoteUrl || null,
        branch,
      };
    },
    enabled:
      runtimeIsReady &&
      !!conversationId &&
      !!workingDir &&
      !hasConversationRepo,
    retry: false,
    // Re-probe the workspace every 10s so the UI reflects branch/repo
    // changes (e.g. `git checkout`, adding a remote) without requiring a
    // manual refresh when there is no `selected_repository` recorded on
    // the conversation.
    staleTime: 10_000,
    refetchInterval: 10_000,
    gcTime: 1000 * 60 * 5,
    meta: { disableToast: true },
  });
};
