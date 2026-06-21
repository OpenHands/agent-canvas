import { useQuery } from "@tanstack/react-query";

import LocalGithubRepositoryService from "#/api/git-service/local-github-repository-service";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { Branch, GitRepository } from "#/types/git";

export const LOCAL_GITHUB_REPOSITORY_QUERY_KEYS = {
  all: ["local-github-repositories"] as const,
  branches: (fullName: string | null | undefined) =>
    ["local-github-repository-branches", fullName ?? ""] as const,
} as const;

export function useLocalGithubRepositories(options?: { enabled?: boolean }) {
  const { backend } = useActiveBackend();
  const enabled = (options?.enabled ?? true) && backend.kind === "local";

  return useQuery<GitRepository[]>({
    queryKey: LOCAL_GITHUB_REPOSITORY_QUERY_KEYS.all,
    queryFn: () => LocalGithubRepositoryService.listRepositories(),
    enabled,
    retry: false,
    staleTime: 60_000,
    meta: { disableToast: true },
  });
}

export function useLocalGithubBranches(
  fullName: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { backend } = useActiveBackend();
  const enabled =
    (options?.enabled ?? true) && backend.kind === "local" && !!fullName;

  return useQuery<Branch[]>({
    queryKey: LOCAL_GITHUB_REPOSITORY_QUERY_KEYS.branches(fullName),
    queryFn: () => LocalGithubRepositoryService.listBranches(fullName!),
    enabled,
    retry: false,
    staleTime: 60_000,
    meta: { disableToast: true },
  });
}
