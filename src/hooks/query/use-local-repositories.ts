import { useQuery } from "@tanstack/react-query";
import {
  listLocalRepositories,
  listLocalBranches,
  LocalRepo,
} from "#/api/git-service/local-repo-listing";

export function useLocalRepositories(enabled: boolean) {
  return useQuery<LocalRepo[]>({
    queryKey: ["local-repositories"],
    queryFn: listLocalRepositories,
    enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
    retry: false,
  });
}

export function useLocalRepoBranches(fullName: string | null) {
  return useQuery<string[]>({
    queryKey: ["local-repo-branches", fullName],
    queryFn: () => listLocalBranches(fullName as string),
    enabled: !!fullName,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
    retry: false,
  });
}
