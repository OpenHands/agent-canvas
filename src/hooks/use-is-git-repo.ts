import { AxiosError } from "axios";

import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useUnifiedGetGitChanges } from "#/hooks/query/use-unified-get-git-changes";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

const NOT_A_GIT_REPO_PATTERN = /not a git repository/i;

/**
 * Returns whether the active conversation's working directory is a git
 * repository. A conversation that was started against an explicit
 * `selected_repository` is considered a git repo unconditionally; otherwise
 * we look at the response from the git-changes endpoint:
 *
 *   - Success → it's a repo.
 *   - "not a git repository" error → it's not a repo.
 *   - Anything else / not loaded yet → unknown.
 */
export function useIsGitRepo(): {
  isGitRepo: boolean;
  isLoading: boolean;
} {
  const { data: conversation } = useActiveConversation();
  const gitChanges = useUnifiedGetGitChanges();

  if (conversation?.selected_repository) {
    return { isGitRepo: true, isLoading: false };
  }

  if (gitChanges.isSuccess) {
    return { isGitRepo: true, isLoading: false };
  }

  if (gitChanges.isError) {
    const { error } = gitChanges;
    const message =
      error instanceof AxiosError
        ? (retrieveAxiosErrorMessage(error) ?? "")
        : ((error as Error | null)?.message ?? "");
    if (NOT_A_GIT_REPO_PATTERN.test(message)) {
      return { isGitRepo: false, isLoading: false };
    }
    // Some other runtime error — we can't tell, default to "not a repo".
    return { isGitRepo: false, isLoading: false };
  }

  return { isGitRepo: false, isLoading: gitChanges.isLoading };
}
