import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { SecretsService } from "#/api/secrets-service";
import { CustomSecretWithoutValue } from "#/api/secrets-service.types";

export const useGetSecrets = () =>
  useQuery({
    queryKey: ["secrets"],
    queryFn: SecretsService.getSecrets,
  });

interface UseSearchSecretsOptions {
  nameContains?: string;
  enabled?: boolean;
}

/**
 * Hook for searching/filtering secrets.
 * Since the agent-server API doesn't support server-side filtering or pagination,
 * all filtering is done client-side.
 */
export const useSearchSecrets = (options: UseSearchSecretsOptions = {}) => {
  const { nameContains, enabled = true } = options;

  const query = useQuery<CustomSecretWithoutValue[], Error>({
    queryKey: ["secrets"],
    queryFn: SecretsService.getSecrets,
    enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
  });

  // Client-side filtering since agent-server doesn't support search params
  const filteredSecrets = useMemo(() => {
    if (!query.data) return [];
    if (!nameContains) return query.data;
    const lowerFilter = nameContains.toLowerCase();
    return query.data.filter((secret) =>
      secret.name.toLowerCase().includes(lowerFilter),
    );
  }, [query.data, nameContains]);

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
