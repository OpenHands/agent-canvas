import { useMutation, useQueryClient } from "@tanstack/react-query";

import LocalGithubRepositoryService from "#/api/git-service/local-github-repository-service";
import { LOCAL_WORKSPACES_QUERY_KEYS } from "#/hooks/query/query-keys";
import { Branch, GitRepository } from "#/types/git";

interface CloneLocalGithubRepositoryVariables {
  repository: GitRepository;
  branch?: Branch | null;
}

export function useCloneLocalGithubRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ repository, branch }: CloneLocalGithubRepositoryVariables) =>
      LocalGithubRepositoryService.cloneRepository(repository, branch),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: LOCAL_WORKSPACES_QUERY_KEYS.all,
      });
      queryClient.invalidateQueries({ queryKey: ["file", "search_subdirs"] });
    },
  });
}
