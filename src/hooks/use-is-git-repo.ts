import { useActiveConversation } from "#/hooks/query/use-active-conversation";

/**
 * Returns whether the active conversation is working in an "existing git
 * repository" from the user's point of view — that is, one they explicitly
 * attached via the repo picker. We deliberately do *not* probe the
 * filesystem (the agent-server initialises every workspace as an internal
 * git worktree for change tracking, so a positive `git status` does not
 * mean the user is working on a real repo).
 */
export function useIsGitRepo(): {
  isGitRepo: boolean;
  isLoading: boolean;
} {
  const { data: conversation, isLoading } = useActiveConversation();
  return {
    isGitRepo: !!conversation?.selected_repository,
    isLoading,
  };
}
