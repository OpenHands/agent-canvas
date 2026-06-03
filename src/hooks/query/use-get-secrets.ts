import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { SecretsService } from "#/api/secrets-service";
import { CustomSecretWithoutValue } from "#/api/secrets-service.types";
import { isGitProviderSecretName } from "#/api/git-provider-secrets";
import { useActiveBackend } from "#/contexts/active-backend-context";

interface UseSearchSecretsOptions {
  nameContains?: string;
  enabled?: boolean;
  includeGitProviderSecrets?: boolean;
}

/**
 * Hook for searching/filtering secrets.
 * Since the agent-server API doesn't support server-side filtering or pagination,
 * all filtering is done client-side.
 */
export const useSearchSecrets = (options: UseSearchSecretsOptions = {}) => {
  const {
    nameContains,
    enabled = true,
    includeGitProviderSecrets = false,
  } = options;
  const active = useActiveBackend();

  const query = useQuery<CustomSecretWithoutValue[], Error>({
    queryKey: ["secrets", active.backend.id, active.orgId],
    queryFn: SecretsService.getSecrets,
    enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
  });

  // Client-side filtering since agent-server doesn't support search params
  const filteredSecrets = useMemo(() => {
    if (!query.data) return [];
    const baseSecrets = includeGitProviderSecrets
      ? query.data
      : query.data.filter((secret) => !isGitProviderSecretName(secret.name));
    if (!nameContains) return baseSecrets;
    const lowerFilter = nameContains.toLowerCase();
    return baseSecrets.filter((secret) =>
      secret.name.toLowerCase().includes(lowerFilter),
    );
  }, [query.data, nameContains, includeGitProviderSecrets]);

  return {
    data: filteredSecrets,
    isLoading: query.isLoading,
    isError: query.isError,
    // Agent-server API doesn't support pagination
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: () => {},
    onLoadMore: () => {},
    refetch: query.refetch,
  };
};
