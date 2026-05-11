import { useQuery } from "@tanstack/react-query";

import { createRemoteWorkspace } from "#/api/typescript-client";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useRuntimeIsReady } from "#/hooks/use-runtime-is-ready";

/**
 * Probes whether the conversation's working-directory git repository has
 * at least one commit reachable from HEAD.
 *
 * Used by the Files tab to decide whether the diff view is a sensible
 * default: an attached repo with zero commits (e.g. a brand-new empty
 * GitHub repo, or a freshly `git init`-ed workspace) has no diff base to
 * compare against, so the file viewer is a better landing experience.
 *
 * Returns `hasCommits: null` while the probe is in-flight so callers can
 * distinguish "still loading" from a definitive "no commits".
 */
export function useHasGitCommits(options?: { enabled?: boolean }): {
  hasCommits: boolean | null;
  isLoading: boolean;
} {
  const { data: conversation } = useActiveConversation();
  const runtimeIsReady = useRuntimeIsReady();

  const conversationId = conversation?.id;
  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const workingDir = conversation?.workspace?.working_dir?.trim();

  const enabled =
    (options?.enabled ?? true) &&
    runtimeIsReady &&
    !!conversationId &&
    !!workingDir;

  const query = useQuery<boolean>({
    queryKey: [
      "has-git-commits",
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

      // `git rev-parse --verify HEAD` exits 0 iff HEAD resolves to a real
      // commit. On an unborn branch (`git init` with no commits) it exits
      // non-zero. Equally returns non-zero outside a git repo, but
      // callers gate this hook on the repo-is-attached signal.
      const result = await workspace.executeCommand(
        "git rev-parse --verify HEAD",
        workingDir,
        10,
      );
      return result.exit_code === 0;
    },
    enabled,
    retry: false,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    meta: { disableToast: true },
  });

  return {
    hasCommits: query.data ?? null,
    isLoading: query.isLoading,
  };
}
